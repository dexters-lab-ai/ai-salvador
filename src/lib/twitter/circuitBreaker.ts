import { TwitterRateLimitError } from './types';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED',    // Normal operation, requests allowed
  OPEN = 'OPEN',        // Circuit is open, all requests fail fast
  HALF_OPEN = 'HALF_OPEN' // Test state to check if service has recovered
}

/**
 * Circuit breaker configuration
 */
export interface CircuitBreakerConfig {
  /** Number of failures before opening the circuit */
  failureThreshold: number;
  
  /** Time in ms after which to attempt closing the circuit */
  resetTimeout: number;
  
  /** Number of successful calls in HALF_OPEN state to close the circuit */
  successThreshold: number;
}

const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,    // 5 failures will open the circuit
  resetTimeout: 30000,    // 30 seconds before attempting to close
  successThreshold: 3     // 3 successful calls to close the circuit
};

/**
 * Tracks the state of the circuit breaker for a specific endpoint
 */
class CircuitBreakerState {
  public failures: number = 0;
  public successes: number = 0;
  public lastFailureTime: number = 0;
  public state: CircuitState = CircuitState.CLOSED;
  
  constructor(public readonly config: CircuitBreakerConfig) {}

  /**
   * Record a successful operation
   */
  public recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successes++;
      
      if (this.successes >= this.config.successThreshold) {
        this.close();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in CLOSED state
      this.failures = Math.max(0, this.failures - 1);
    }
  }

  /**
   * Record a failed operation
   */
  public recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.config.failureThreshold) {
      this.open();
    }
  }

  /**
   * Open the circuit
   */
  public open(): void {
    this.state = CircuitState.OPEN;
    this.successes = 0;
    // Schedule an attempt to close the circuit
    setTimeout(() => {
      this.halfOpen();
    }, this.config.resetTimeout);
  }

  /**
   * Move to half-open state to test if the service has recovered
   */
  public halfOpen(): void {
    this.state = CircuitState.HALF_OPEN;
    this.failures = 0;
  }

  /**
   * Close the circuit (back to normal operation)
   */
  public close(): void {
    this.state = CircuitState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = 0;
  }

  /**
   * Check if a request is allowed
   */
  public isRequestAllowed(): boolean {
    // Always allow in CLOSED state
    if (this.state === CircuitState.CLOSED) {
      return true;
    }
    
    // In HALF_OPEN state, allow with probability that increases with successes
    if (this.state === CircuitState.HALF_OPEN) {
      const probability = this.successes / this.config.successThreshold;
      return Math.random() < probability;
    }
    
    // In OPEN state, check if reset timeout has passed
    if (this.state === CircuitState.OPEN) {
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      return timeSinceLastFailure >= this.config.resetTimeout;
    }
    
    return false;
  }
}

/**
 * Circuit breaker implementation for Twitter API requests
 */
export class TwitterCircuitBreaker {
  private circuits: Map<string, CircuitBreakerState> = new Map();

  constructor(private readonly config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG) {}

  /**
   * Execute a request with circuit breaker protection
   */
  public async execute<T>(
    endpoint: string,
    requestFn: () => Promise<T>
  ): Promise<T> {
    const circuit = this.getOrCreateCircuit(endpoint);
    
    // Check if request is allowed
    if (!circuit.isRequestAllowed()) {
      throw new TwitterRateLimitError(
        `Circuit breaker is ${circuit.state} for ${endpoint}`,
        503,
        undefined,
        circuit.state
      );
    }

    try {
      const result = await requestFn();
      circuit.recordSuccess();
      return result;
    } catch (error) {
      // Only record failures for server errors and rate limits
      if (error instanceof TwitterRateLimitError || (error as any).status >= 500) {
        circuit.recordFailure();
      }
      throw error;
    }
  }

  /**
   * Get the current state of a circuit
   */
  public getCircuitState(endpoint: string): CircuitState | undefined {
    return this.circuits.get(endpoint)?.state;
  }

  /**
   * Manually reset a circuit
   */
  public resetCircuit(endpoint: string): void {
    const circuit = this.circuits.get(endpoint);
    if (circuit) {
      circuit.close();
    }
  }

  private getOrCreateCircuit(endpoint: string): CircuitBreakerState {
    if (!this.circuits.has(endpoint)) {
      this.circuits.set(endpoint, new CircuitBreakerState(this.config));
    }
    return this.circuits.get(endpoint)!;
  }
}
