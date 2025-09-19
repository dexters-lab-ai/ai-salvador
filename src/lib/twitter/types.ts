/**
 * Circuit breaker state types
 */
export type CircuitState = 'OPEN' | 'HALF_OPEN' | 'CLOSED';

/**
 * Twitter API Rate Limit Headers
 * @see https://developer.twitter.com/en/docs/twitter-api/rate-limits
 */
export interface RateLimitHeaders {
  'x-rate-limit-limit'?: string;
  'x-rate-limit-remaining'?: string;
  'x-rate-limit-reset'?: string;
  'retry-after'?: string;
}

/**
 * Standardized error response from Twitter API
 */
export interface TwitterErrorResponse {
  errors: Array<{
    code: number;
    message: string;
    label?: string;
  }>;
  title?: string;
  detail?: string;
  type?: string;
  status?: number;
}

/**
 * Rate limit information extracted from response headers
 */
export interface RateLimitInfo {
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp in seconds
  retryAfter?: number; // In seconds
}

/**
 * Extended error class for Twitter API rate limit errors
 */
export class TwitterRateLimitError extends Error {
  public readonly status: number;
  public readonly rateLimitInfo?: RateLimitInfo;
  public readonly retryAfter: number;
  public readonly circuitState?: CircuitState;

  constructor(
    message: string, 
    status: number, 
    rateLimitInfo?: RateLimitInfo,
    circuitState?: CircuitState
  ) {
    super(message);
    this.name = 'TwitterRateLimitError';
    this.status = status;
    this.rateLimitInfo = rateLimitInfo;
    this.retryAfter = rateLimitInfo?.retryAfter || 60; // Default 60 seconds
    this.circuitState = circuitState;
    
    // Maintain proper prototype chain
    Object.setPrototypeOf(this, TwitterRateLimitError.prototype);
  }
}

/**
 * Configuration for Twitter client
 */
export interface TwitterClientConfig {
  /** Maximum number of retry attempts for failed requests */
  maxRetries?: number;
  
  /** Base delay between retries in milliseconds */
  defaultRetryDelay?: number;
  
  /** Maximum delay between retries in milliseconds */
  maxRetryDelay?: number;
  
  /** Multiplier for exponential backoff */
  backoffFactor?: number;
  
  /** Whether to enable jitter in retry delays */
  enableJitter?: boolean;
  
  /** Custom user agent string */
  userAgent?: string;
  
  /** Whether to respect the Retry-After header from Twitter */
  respectRetryAfter?: boolean;
}
