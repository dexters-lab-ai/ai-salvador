import { RateLimitInfo } from './twitter.types';

export interface RequestMetrics {
  /** Total number of requests made */
  totalRequests: number;
  /** Number of successful requests (2xx) */
  successfulRequests: number;
  /** Number of failed requests (4xx, 5xx) */
  failedRequests: number;
  /** Number of rate limited requests (429) */
  rateLimitedRequests: number;
  /** Total time spent waiting due to rate limits (ms) */
  totalRateLimitWaitTime: number;
  /** Number of cache hits */
  cacheHits: number;
  /** Number of cache misses */
  cacheMisses: number;
  /** Number of circuit breaker trips */
  circuitBreakerTrips: number;
  /** Timestamp of the last request */
  lastRequestTime?: number;
  /** Timestamp of the last error */
  lastErrorTime?: number;
  /** Last error message */
  lastError?: string;
  /** Last error status code */
  lastErrorStatus?: number;
}

export interface EndpointMetrics extends RequestMetrics {
  /** Endpoint path */
  endpoint: string;
  /** HTTP method */
  method: string;
  /** Current rate limit information */
  rateLimit?: RateLimitInfo;
  /** Average request duration (ms) */
  averageDuration: number;
  /** Total duration of all requests (ms) */
  totalDuration: number;
  /** Number of requests used for average calculation */
  durationCount: number;
}

export interface MetricsCollector {
  /** Record a request start */
  recordRequestStart(method: string, endpoint: string): () => void;
  
  /** Record a successful response */
  recordSuccess(
    method: string, 
    endpoint: string, 
    status: number, 
    fromCache: boolean,
    rateLimit?: RateLimitInfo
  ): void;
  
  /** Record a failed response */
  recordFailure(
    method: string, 
    endpoint: string, 
    status: number, 
    error: Error,
    rateLimit?: RateLimitInfo
  ): void;
  
  /** Record a rate limit hit */
  recordRateLimit(method: string, endpoint: string, waitTime: number): void;
  
  /** Record a cache hit */
  recordCacheHit(method: string, endpoint: string): void;
  
  /** Record a cache miss */
  recordCacheMiss(method: string, endpoint: string): void;
  
  /** Record a circuit breaker trip */
  recordCircuitBreakerTrip(): void;
  
  /** Get metrics for all endpoints */
  getAllMetrics(): EndpointMetrics[];
  
  /** Get metrics for a specific endpoint */
  getEndpointMetrics(method: string, endpoint: string): EndpointMetrics;
  
  /** Get global metrics */
  getGlobalMetrics(): RequestMetrics;
  
  /** Reset all metrics */
  reset(): void;
}

export class DefaultMetricsCollector implements MetricsCollector {
  private metrics = new Map<string, EndpointMetrics>();
  private globalMetrics: RequestMetrics = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    rateLimitedRequests: 0,
    totalRateLimitWaitTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    circuitBreakerTrips: 0,
  };
  
  private getMetricsKey(method: string, endpoint: string): string {
    return `${method.toUpperCase()}:${endpoint}`;
  }
  
  private getOrCreateEndpointMetrics(method: string, endpoint: string): EndpointMetrics {
    const key = this.getMetricsKey(method, endpoint);
    
    if (!this.metrics.has(key)) {
      this.metrics.set(key, {
        method: method.toUpperCase(),
        endpoint,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        rateLimitedRequests: 0,
        totalRateLimitWaitTime: 0,
        cacheHits: 0,
        cacheMisses: 0,
        circuitBreakerTrips: 0,
        averageDuration: 0,
        totalDuration: 0,
        durationCount: 0,
      });
    }
    
    return this.metrics.get(key)!;
  }
  
  recordRequestStart(method: string, endpoint: string): () => void {
    const metrics = this.getOrCreateEndpointMetrics(method, endpoint);
    const startTime = Date.now();
    
    // Return a function to be called when the request completes
    return () => {
      const duration = Date.now() - startTime;
      metrics.totalDuration += duration;
      metrics.durationCount++;
      metrics.averageDuration = metrics.totalDuration / metrics.durationCount;
    };
  }
  
  recordSuccess(
    method: string,
    endpoint: string,
    status: number,
    fromCache: boolean,
    rateLimit?: RateLimitInfo
  ): void {
    const metrics = this.getOrCreateEndpointMetrics(method, endpoint);
    
    metrics.totalRequests++;
    metrics.successfulRequests++;
    metrics.lastRequestTime = Date.now();
    
    if (fromCache) {
      metrics.cacheHits++;
      this.globalMetrics.cacheHits++;
    } else {
      metrics.cacheMisses++;
      this.globalMetrics.cacheMisses++;
    }
    
    if (rateLimit) {
      metrics.rateLimit = { ...rateLimit };
    }
    
    this.globalMetrics.totalRequests++;
    this.globalMetrics.successfulRequests++;
    this.globalMetrics.lastRequestTime = metrics.lastRequestTime;
  }
  
  recordFailure(
    method: string,
    endpoint: string,
    status: number,
    error: Error,
    rateLimit?: RateLimitInfo
  ): void {
    const metrics = this.getOrCreateEndpointMetrics(method, endpoint);
    
    metrics.totalRequests++;
    metrics.failedRequests++;
    metrics.lastRequestTime = Date.now();
    metrics.lastErrorTime = Date.now();
    metrics.lastError = error.message;
    metrics.lastErrorStatus = status;
    
    if (status === 429) {
      metrics.rateLimitedRequests++;
      this.globalMetrics.rateLimitedRequests++;
    }
    
    if (rateLimit) {
      metrics.rateLimit = { ...rateLimit };
    }
    
    this.globalMetrics.totalRequests++;
    this.globalMetrics.failedRequests++;
    this.globalMetrics.lastRequestTime = metrics.lastRequestTime;
    this.globalMetrics.lastErrorTime = metrics.lastErrorTime;
    this.globalMetrics.lastError = metrics.lastError;
    this.globalMetrics.lastErrorStatus = metrics.lastErrorStatus;
  }
  
  recordRateLimit(method: string, endpoint: string, waitTime: number): void {
    const metrics = this.getOrCreateEndpointMetrics(method, endpoint);
    metrics.totalRateLimitWaitTime += waitTime;
    this.globalMetrics.totalRateLimitWaitTime += waitTime;
  }
  
  recordCacheHit(method: string, endpoint: string): void {
    const metrics = this.getOrCreateEndpointMetrics(method, endpoint);
    metrics.cacheHits++;
    this.globalMetrics.cacheHits++;
  }
  
  recordCacheMiss(method: string, endpoint: string): void {
    const metrics = this.getOrCreateEndpointMetrics(method, endpoint);
    metrics.cacheMisses++;
    this.globalMetrics.cacheMisses++;
  }
  
  recordCircuitBreakerTrip(): void {
    this.globalMetrics.circuitBreakerTrips++;
  }
  
  getAllMetrics(): EndpointMetrics[] {
    return Array.from(this.metrics.values());
  }
  
  getEndpointMetrics(method: string, endpoint: string): EndpointMetrics {
    return this.getOrCreateEndpointMetrics(method, endpoint);
  }
  
  getGlobalMetrics(): RequestMetrics {
    return { ...this.globalMetrics };
  }
  
  reset(): void {
    this.metrics.clear();
    this.globalMetrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      rateLimitedRequests: 0,
      totalRateLimitWaitTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      circuitBreakerTrips: 0,
    };
  }
}
