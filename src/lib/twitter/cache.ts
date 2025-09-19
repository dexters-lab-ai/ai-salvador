import { RateLimitInfo } from './twitter.types';

/**
 * Interface for cache storage
 */
export interface CacheStore<T> {
  get(key: string): T | undefined;
  set(key: string, value: T, ttl?: number): void;
  delete(key: string): void;
  clear(): void;
  has(key: string): boolean;
  keys(): string[];
}

/**
 * In-memory cache implementation
 */
export class MemoryCache<T> implements CacheStore<T> {
  private store: Map<string, { value: T; expiresAt?: number }> = new Map();

  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    
    // Check if entry has expired
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    
    return entry.value;
  }

  set(key: string, value: T, ttl?: number): void {
    const expiresAt = ttl ? Date.now() + ttl : undefined;
    this.store.set(key, { value, expiresAt });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  keys(): string[] {
    const now = Date.now();
    const keys: string[] = [];
    
    // Only return keys for non-expired entries
    for (const [key, entry] of this.store.entries()) {
      if (!entry.expiresAt || entry.expiresAt > now) {
        keys.push(key);
      } else {
        // Clean up expired entries
        this.store.delete(key);
      }
    }
    
    return keys;
  }
}

/**
 * Cache key generator for Twitter API requests
 */
function generateCacheKey(method: string, url: string, params?: Record<string, any>): string {
  const normalizedUrl = url.startsWith('http') ? url : `https://api.twitter.com/2${url}`;
  const searchParams = new URLSearchParams();
  
  // Sort params for consistent cache keys
  if (params) {
    Object.entries(params)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.append(key, String(value));
        }
      });
  }
  
  const queryString = searchParams.toString();
  return `${method.toUpperCase()}:${normalizedUrl}${queryString ? `?${queryString}` : ''}`;
}

/**
 * Cache configuration options
 */
export interface CacheOptions {
  /** Default TTL in milliseconds (default: 5 minutes) */
  defaultTtl?: number;
  
  /** Whether to enable cache (default: true) */
  enabled?: boolean;
  
  /** Custom cache store implementation */
  store?: CacheStore<any>;
  
  /** Function to determine if a response should be cached */
  shouldCacheResponse?: (response: Response) => boolean;
  
  /** Function to determine cache TTL for a response */
  getTtlForResponse?: (response: Response) => number | undefined;
}

/**
 * Default cache options
 */
const DEFAULT_CACHE_OPTIONS: Required<Omit<CacheOptions, 'store'>> & { store: CacheStore<any> } = {
  defaultTtl: 5 * 60 * 1000, // 5 minutes
  enabled: true,
  store: new MemoryCache<any>(),
  
  shouldCacheResponse(response: Response) {
    return response.ok && response.type === 'basic';
  },
  
  getTtlForResponse(response) {
    const reset = response.headers.get('x-rate-limit-reset');
    if (reset) {
      const resetTime = parseInt(reset, 10) * 1000;
      const now = Date.now();
      return Math.max(0, resetTime - now);
    }
    return undefined;
  }
};

/**
 * Cache middleware for Twitter client
 */
export class TwitterCache {
  private options: Required<Omit<CacheOptions, 'store'>> & { store: CacheStore<any> };
  private cache: CacheStore<any>;

  constructor(options: CacheOptions = {}) {
    this.options = {
      ...DEFAULT_CACHE_OPTIONS,
      ...options,
      store: options.store || new MemoryCache<any>(),
    };
    this.cache = this.options.store;
  }

  /**
   * Get a cached response if available
   */
  get<T = any>(key: string): T | undefined {
    if (!this.options.enabled) return undefined;
    return this.cache.get(key);
  }

  /**
   * Set a response in cache
   */
  set<T = any>(
    key: string,
    value: T,
    response?: Response
  ): void {
    if (!this.options.enabled) return;
    
    let ttl = this.options.defaultTtl;
    
    // Calculate TTL based on response if available
    if (response && this.options.getTtlForResponse) {
      const responseTtl = this.options.getTtlForResponse(response);
      if (responseTtl !== undefined) {
        ttl = responseTtl;
      }
    }
    
    this.cache.set(key, value, ttl);
  }

  /**
   * Generate a cache key for a request
   */
  generateKey(
    method: string,
    url: string,
    params?: Record<string, any>
  ): string {
    return generateCacheKey(method, url, params);
  }

  /**
   * Check if a response should be cached
   */
  shouldCacheResponse(response: Response): boolean {
    return this.options.shouldCacheResponse
      ? this.options.shouldCacheResponse(response)
      : DEFAULT_CACHE_OPTIONS.shouldCacheResponse!(response);
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Delete a specific cache entry
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Check if a key exists in cache
   */
  has(key: string): boolean {
    return this.cache.has(key);
  }
}
