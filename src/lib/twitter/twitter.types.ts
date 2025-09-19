/**
 * Rate limit information from Twitter API
 */
export interface RateLimitInfo {
  /** Maximum number of requests allowed in the current window */
  limit: number;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Timestamp (in seconds) when the current rate limit window resets */
  reset: number;
  /** Number of seconds to wait before retrying (from Retry-After header) */
  retryAfter?: number;
}

/**
 * Extended error class for Twitter API rate limit errors
 */
export class TwitterRateLimitError extends Error {
  public readonly status: number;
  public readonly rateLimitInfo?: RateLimitInfo;
  
  constructor(message: string, status: number, rateLimitInfo?: RateLimitInfo) {
    super(message);
    this.name = 'TwitterRateLimitError';
    this.status = status;
    this.rateLimitInfo = rateLimitInfo;
    
    // Maintain proper prototype chain
    Object.setPrototypeOf(this, TwitterRateLimitError.prototype);
  }
}

/**
 * Options for configuring the Twitter client
 */
export interface TwitterClientOptions {
  /** Base URL for Twitter API (default: 'https://api.twitter.com/2') */
  baseUrl?: string;
  
  /** Bearer token for authentication (required) */
  bearerToken: string;
  
  /** Maximum number of retries for rate-limited requests (default: 3) */
  maxRetries?: number;
  
  /** Base delay between retries in milliseconds (default: 1000) */
  retryDelay?: number;
  
  /** Maximum delay between retries in milliseconds (default: 60000) */
  maxRetryDelay?: number;
  
  /** Whether to enable circuit breaker (default: true) */
  enableCircuitBreaker?: boolean;
  
  /** Number of failures before opening the circuit (default: 5) */
  circuitBreakerThreshold?: number;
  
  /** Time in ms to keep circuit open (default: 30000) */
  circuitBreakerTimeout?: number;
}
