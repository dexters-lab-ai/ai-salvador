import { TwitterRateLimitError, RateLimitInfo } from './twitter.types';
import { TwitterCache, CacheStore, MemoryCache } from './cache';
import { MetricsCollector, DefaultMetricsCollector } from './metrics';

export interface TwitterClientOptions {
  /** Base URL for Twitter API */
  baseUrl?: string;
  /** Bearer token for authentication */
  bearerToken: string;
  /** Maximum number of retries for rate-limited requests */
  maxRetries?: number;
  /** Base delay between retries in milliseconds */
  retryDelay?: number;
  /** Maximum delay between retries in milliseconds */
  maxRetryDelay?: number;
  /** Whether to enable circuit breaker */
  enableCircuitBreaker?: boolean;
  /** Number of failures before opening the circuit */
  circuitBreakerThreshold?: number;
  /** Time in ms to keep circuit open */
  circuitBreakerTimeout?: number;
  /** Metrics collector implementation */
  metrics?: MetricsCollector;
  /** Cache configuration */
  cache?: {
    /** Whether to enable caching (default: true) */
    enabled?: boolean;
    /** Custom cache store implementation */
    store?: CacheStore<any>;
    /** Default TTL in milliseconds (default: 5 minutes) */
    defaultTtl?: number;
    /** Function to determine if a response should be cached */
    shouldCacheResponse?: (response: Response) => boolean;
    /** Function to determine cache TTL for a response */
    getTtlForResponse?: (response: Response) => number | undefined;
  };
}

export class TwitterClient {
  private options: {
    baseUrl: string;
    maxRetries: number;
    retryDelay: number;
    maxRetryDelay: number;
    enableCircuitBreaker: boolean;
    circuitBreakerThreshold: number;
    circuitBreakerTimeout: number;
    bearerToken: string;
    cache: {
      enabled: boolean;
      store: CacheStore<any>;
      defaultTtl: number;
      shouldCacheResponse: (response: Response) => boolean;
      getTtlForResponse: (response: Response) => number | undefined;
    };
  };
  
  private rateLimitState = new Map<string, RateLimitInfo>();
  private circuitState: 'closed' | 'open' | 'half-open' = 'closed';
  private circuitFailures = 0;
  private lastFailureTime = 0;
  private cache: TwitterCache;
  private metrics: MetricsCollector;

  constructor(options: TwitterClientOptions) {
    const {
      cache = {},
      metrics = new DefaultMetricsCollector(),
      baseUrl = 'https://api.twitter.com/2',
      maxRetries = 3,
      retryDelay = 1000,
      maxRetryDelay = 30000,
      enableCircuitBreaker = true,
      circuitBreakerThreshold = 5,
      circuitBreakerTimeout = 30000,
      bearerToken
    } = options;

    this.options = {
      baseUrl,
      maxRetries,
      retryDelay,
      maxRetryDelay,
      enableCircuitBreaker,
      circuitBreakerThreshold,
      circuitBreakerTimeout,
      bearerToken,
      cache: {
        enabled: cache.enabled !== false,
        store: cache.store || new MemoryCache(),
        defaultTtl: cache.defaultTtl || 5 * 60 * 1000, // 5 minutes
        shouldCacheResponse: cache.shouldCacheResponse || ((response) => response.ok),
        getTtlForResponse: cache.getTtlForResponse || ((response) => {
          const reset = response.headers.get('x-rate-limit-reset');
          if (reset) {
            const resetTime = parseInt(reset, 10) * 1000;
            const now = Date.now();
            return Math.max(0, resetTime - now);
          }
          return undefined;
        })
      }
    };

    this.metrics = metrics;
    this.cache = new TwitterCache(this.options.cache);
  }

  /**
   * Make a request to the Twitter API with automatic retry and rate limit handling
   */
  /**
   * Get the metrics collector instance
   */
  getMetrics(): MetricsCollector {
    return this.metrics;
  }

  /**
   * Reset all metrics
   */
  resetMetrics(): void {
    this.metrics.reset();
  }

  /**
   * Get metrics for all endpoints
   */
  getAllMetrics() {
    return this.metrics.getAllMetrics();
  }

  /**
   * Get metrics for a specific endpoint
   */
  getEndpointMetrics(method: string, endpoint: string) {
    return this.metrics.getEndpointMetrics(method, endpoint);
  }

  /**
   * Get global metrics
   */
  getGlobalMetrics() {
    return this.metrics.getGlobalMetrics();
  }

  async request<T = any>(
    method: string,
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    body?: any,
    retryCount = 0,
    skipCache = false
  ): Promise<T> {
    // Generate cache key for GET requests
    const cacheKey = method.toUpperCase() === 'GET' 
      ? this.cache.generateKey(method, endpoint, params)
      : null;

    // Try to get from cache for GET requests
    if (cacheKey && !skipCache && this.options.cache.enabled) {
      const cached = this.cache.get<T>(cacheKey);
      if (cached !== undefined) {
        this.metrics.recordCacheHit(method, endpoint);
        return cached;
      }
      this.metrics.recordCacheMiss(method, endpoint);
    }

    // Invalidate cache for non-GET requests that modify data
    if (method !== 'GET' && this.options.cache.enabled) {
      // Invalidate all cached responses for the same endpoint
      // This is a simplified approach - in a real app, you might want to be more specific
      this.invalidateCacheForEndpoint(endpoint);
    }
    // Check circuit breaker state
    if (this.shouldOpenCircuit()) {
      this.metrics.recordCircuitBreakerTrip();
      const resetTime = Math.floor((Date.now() + this.options.circuitBreakerTimeout) / 1000);
      throw new TwitterRateLimitError('Circuit breaker is open', 429, {
        limit: 0, // No requests allowed when circuit is open
        remaining: 0, // No requests remaining
        reset: resetTime,
        retryAfter: Math.ceil(this.options.circuitBreakerTimeout / 1000),
      });
    }

    // Start request timing
    const endTiming = this.metrics.recordRequestStart(method, endpoint);

    const url = this.buildUrl(endpoint, params);
    const headers = this.getHeaders();

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Update rate limit information from response headers
      this.updateRateLimitState(endpoint, response);

      // Handle rate limiting (429)
      if (response.status === 429) {
        return this.handleRateLimit(method, endpoint, params, body, retryCount, response);
      }

      // Handle other errors
      if (!response.ok) {
        const errorData = await this.parseErrorResponse(response);
        throw new Error(`Twitter API error: ${errorData.detail || response.statusText}`);
      }

      // Parse response
      const data = await response.json();
      
      // Cache successful GET responses
      const fromCache = false; // This is a fresh response
      if (cacheKey && this.options.cache.enabled && this.cache.shouldCacheResponse(response)) {
        this.cache.set(cacheKey, data, response);
      }
      
      // Record successful request
      const rateLimit = this.extractRateLimit(response);
      this.metrics.recordSuccess(method, endpoint, response.status, fromCache, rateLimit);
      
      // Reset circuit breaker on successful request
      this.resetCircuit();
      
      // End timing
      if (endTiming) endTiming();
      
      return data;
    } catch (error) {
      // Record failure for circuit breaker and metrics
      this.recordFailure();
      
      // Record failed request in metrics
      if (error instanceof TwitterRateLimitError) {
        this.metrics.recordRateLimit(method, endpoint, error.rateLimitInfo?.retryAfter || 0);
      }
      
      if (error instanceof Error) {
        this.metrics.recordFailure(
          method, 
          endpoint, 
          error instanceof TwitterRateLimitError ? error.status || 500 : 500,
          error
        );
      }
      
      // End timing if not already ended
      if (endTiming) endTiming();
      
      throw error;
    }
  }

  /**
   * Handle rate-limited requests with exponential backoff
   */
  private async handleRateLimit<T>(
    method: string,
    endpoint: string,
    params: Record<string, string | number | boolean | undefined> | undefined,
    body: any,
    retryCount: number,
    response: Response
  ): Promise<T> {
    const rateLimitInfo = this.getRateLimitInfo(endpoint, response) || {
      limit: 0,
      remaining: 0,
      reset: Math.floor(Date.now() / 1000) + 60, // Default to 60 seconds from now
      retryAfter: 60
    };

    // Get the reset time and error message
    const now = Date.now();
    const resetTime = rateLimitInfo.reset;
    const errorMessage = 'Rate limit exceeded';
    
    // Log the rate limit status
    const resetDate = new Date(resetTime);
    console.warn(`Rate limit reached. Resets at: ${resetDate.toISOString()}`);
    
    if (retryCount >= this.options.maxRetries) {
      throw new TwitterRateLimitError(
        `${errorMessage}. Max retries (${this.options.maxRetries}) exceeded`,
        429,
        rateLimitInfo
      );
    }

    // Calculate backoff with jitter, using the appropriate reset time
    const backoff = this.calculateBackoff(retryCount, {
      ...rateLimitInfo,
      reset: resetTime
    });
    
    // Log the backoff delay
    console.log(`Rate limited. Waiting ${Math.ceil(backoff / 1000)} seconds before retry...`);
    
    // Wait before retrying
    await new Promise(resolve => setTimeout(resolve, backoff));

    // Retry the request
    return this.request<T>(method, endpoint, params, body, retryCount + 1);
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(endpoint: string, params?: Record<string, string | number | boolean | undefined>): string {
    const url = new URL(endpoint.startsWith('http') ? endpoint : `${this.options.baseUrl}${endpoint}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.append(key, String(value));
        }
      });
    }
    
    return url.toString();
  }

  /**
   * Get request headers with authentication
   */
  private getHeaders(): HeadersInit {
    return {
      'Authorization': `Bearer ${this.options.bearerToken}`,
      'Content-Type': 'application/json',
      'User-Agent': 'ai-salvador/1.0',
    };
  }

  /**
   * Parse error response from Twitter API
   */
  private async parseErrorResponse(response: Response): Promise<{ detail: string }> {
    try {
      return await response.json();
    } catch {
      return { detail: response.statusText };
    }
  }

  /**
   * Update rate limit information from response headers
   */
  private updateRateLimitState(endpoint: string, response: Response): void {
    const limit = response.headers.get('x-rate-limit-limit');
    const remaining = response.headers.get('x-rate-limit-remaining');
    const reset = response.headers.get('x-rate-limit-reset');

    if (limit && remaining && reset) {
      this.rateLimitState.set(endpoint, {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10),
      });
    }
  }

  /**
   * Extract rate limit information from response headers
   */
  private extractRateLimit(response: Response): RateLimitInfo | undefined {
    const limit = response.headers.get('x-rate-limit-limit');
    const remaining = response.headers.get('x-rate-limit-remaining');
    const reset = response.headers.get('x-rate-limit-reset');
    const retryAfter = response.headers.get('retry-after');

    if (limit && remaining && reset) {
      const rateLimit: RateLimitInfo = {
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10) * 1000, // Convert to milliseconds
      };
      
      if (retryAfter) {
        rateLimit.retryAfter = parseInt(retryAfter, 10) * 1000; // Convert to milliseconds
      }
      
      return rateLimit;
    }
    return undefined;
  }

  /**
   * Get rate limit information for an endpoint
   */
  getRateLimitInfo(endpoint: string, response: Response): RateLimitInfo | undefined {
    const headers = response.headers;
    
    // Standard rate limit headers
    const limit = headers.get('x-rate-limit-limit');
    const remaining = headers.get('x-rate-limit-remaining');
    const reset = headers.get('x-rate-limit-reset');
    const retryAfter = headers.get('retry-after');

    if (!limit || !remaining || !reset) {
      return undefined;
    }
    
    const rateLimit: RateLimitInfo = {
      limit: parseInt(limit, 10),
      remaining: parseInt(remaining, 10),
      reset: parseInt(reset, 10) * 1000, // Convert to milliseconds
    };
    
    if (retryAfter) {
      rateLimit.retryAfter = parseInt(retryAfter, 10) * 1000; // Convert to milliseconds
    }
    
    return rateLimit;
  }

  /**
   * Calculate backoff time with exponential backoff and jitter
   */
  private calculateBackoff(
    retryCount: number,
    rateLimitInfo: RateLimitInfo
  ): number {
    const now = Date.now();
    
    // If we have a retryAfter value, use that
    if (rateLimitInfo.retryAfter) {
      return rateLimitInfo.retryAfter;
    }
    
    // Check standard rate limit
    if (rateLimitInfo.remaining <= 0 && rateLimitInfo.reset > now) {
      // Add some jitter (10-30% of remaining time)
      const jitter = 1.1 + (Math.random() * 0.2); // 1.1 to 1.3
      return Math.floor((rateLimitInfo.reset - now) * jitter);
    }
    
    // Fall back to exponential backoff with jitter
    const baseDelay = Math.min(
      this.options.retryDelay * Math.pow(2, retryCount),
      this.options.maxRetryDelay
    );
    
    // Add jitter (0.5 to 1.5 of the base delay)
    const jitter = 0.5 + Math.random();
    return Math.min(
      Math.floor(baseDelay * jitter),
      this.options.maxRetryDelay
    );
  }

  /**
   * Check if circuit breaker should be opened
   */
  private shouldOpenCircuit(): boolean {
    if (!this.options.enableCircuitBreaker) return false;
    
    // If circuit is already open, check if we should try to close it
    if (this.circuitState === 'open') {
      const timeSinceFailure = Date.now() - this.lastFailureTime;
      if (timeSinceFailure > this.options.circuitBreakerTimeout!) {
        // Move to half-open state to test if the service has recovered
        this.circuitState = 'half-open';
        this.lastFailureTime = 0; // Reset failure time in half-open state
        return false;
      }
      return true; // Stay in open state
    }

    // In half-open state, we allow one request to test the service
    if (this.circuitState === 'half-open') {
      // This request will be the test request - let it through
      return false;
    }

    // Closed state - check if we should open the circuit
    if (this.circuitFailures >= this.options.circuitBreakerThreshold!) {
      this.circuitState = 'open';
      this.lastFailureTime = Date.now();
      return true;
    }

    return false; // Stay in closed state
  }

  /**
   * Record a failure for circuit breaker
   */
  private recordFailure(): void {
    if (!this.options.enableCircuitBreaker) return;
    
    this.circuitFailures++;
    this.lastFailureTime = Date.now();
    
    if (this.circuitState === 'half-open') {
      // If we get a failure in half-open state, go back to open state
      this.circuitState = 'open';
      this.lastFailureTime = Date.now(); // Reset the failure time
    }
  }

  /**
   * Reset the circuit breaker state
   */
  private resetCircuit(): void {
    if (!this.options.enableCircuitBreaker) return;
    
    // Reset the circuit to closed state
    this.circuitState = 'closed';
    this.circuitFailures = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Invalidate cache entries for a specific endpoint
   */
  private invalidateCacheForEndpoint(endpoint: string): void {
    if (!this.options.cache.enabled || !this.cache) return;
    
    try {
      // Get all cache keys for this endpoint
      const cacheKeys: string[] = [];
      const cacheStore = this.options.cache.store;
      
      // Handle cache stores that implement the keys() method
      if (typeof (cacheStore as any).keys === 'function') {
        const keys = (cacheStore as any).keys() as string[];
        cacheKeys.push(...keys.filter(key => key.includes(endpoint)));
      } 
      // Handle Map-like stores
      else if (typeof (cacheStore as any).forEach === 'function') {
        (cacheStore as any).forEach((_: any, key: string) => {
          if (key.includes(endpoint)) {
            cacheKeys.push(key);
          }
        });
      }
      
      // Delete matching cache entries if the store supports delete
      if (typeof cacheStore.delete === 'function') {
        cacheKeys.forEach(key => cacheStore.delete(key));
      }
    } catch (error) {
      console.error('Error invalidating cache:', error);
    }
  }

  /**
   * Convenience methods for common HTTP methods
   */
  get<T = any>(
    endpoint: string, 
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>('GET', endpoint, params);
  }

  post<T = any>(
    endpoint: string, 
    body: any, 
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>('POST', endpoint, params, body);
  }

  put<T = any>(
    endpoint: string, 
    body: any, 
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>('PUT', endpoint, params, body);
  }

  delete<T = any>(
    endpoint: string, 
    params?: Record<string, string | number | boolean | undefined>
  ): Promise<T> {
    return this.request<T>('DELETE', endpoint, params);
  }

  /**
   * Get current rate limit information for an endpoint
   */
  getRateLimit(endpoint: string): RateLimitInfo | undefined {
    return this.rateLimitState.get(endpoint);
  }

  /**
   * Public method to invalidate cache for a specific endpoint
   */
  public invalidateEndpointCache(endpoint: string): void {
    this.invalidateCacheForEndpoint(endpoint);
  }

  /**
   * Clear the entire cache
   */
  clearCache(): void {
    if (this.options.cache.enabled) {
      this.cache.clear();
    }
  }

  /**
   * Force refresh a cached resource
   */
  async refresh<T = any>(
    method: string,
    endpoint: string,
    params?: Record<string, string | number | boolean | undefined>,
    body?: any
  ): Promise<T> {
    return this.request<T>(method, endpoint, params, body, 0, true);
  }
}
