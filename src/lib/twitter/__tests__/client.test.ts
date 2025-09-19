import { TwitterClient } from '../client';
// No need to import TwitterRateLimitError as we're not using it directly

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as jest.Mock;

describe('TwitterClient', () => {
  let client: TwitterClient;
  const mockBearerToken = 'test-bearer-token';
  const mockResponse = (status: number, data: any, headers: Record<string, string> = {}) => {
    return Promise.resolve({
      status,
      ok: status >= 200 && status < 300,
      headers: new Headers({
        'content-type': 'application/json',
        ...headers,
      }),
      json: () => Promise.resolve(data),
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    client = new TwitterClient({
      bearerToken: mockBearerToken,
      maxRetries: 2,
      retryDelay: 10, // Shorter delay for tests
    });
  });

  describe('request', () => {
    // Increase test timeout to 10 seconds
    jest.setTimeout(10000);
    it('should make a successful GET request', async () => {
      const mockData = { id: '123', text: 'Test tweet' };
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers({
          'x-rate-limit-limit': '15',
          'x-rate-limit-remaining': '14',
          'x-rate-limit-reset': '1620000000',
        }),
        json: () => Promise.resolve(mockData),
      });

      const result = await client.get('/tweets/123');

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.twitter.com/2/tweets/123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Authorization': `Bearer ${mockBearerToken}`,
            'Content-Type': 'application/json',
            'User-Agent': expect.any(String)
          }),
        })
      );
    });

    it('should handle rate limiting with retry', async () => {
      const mockData = { id: '123', text: 'Test tweet' };
      const resetTime = Math.floor(Date.now() / 1000) + 60; // 1 minute from now
      
      // First request: rate limited
      mockFetch.mockResolvedValueOnce({
        status: 429,
        ok: false,
        headers: new Headers({
          'retry-after': '1', // Shorter delay for testing
          'x-rate-limit-limit': '15',
          'x-rate-limit-remaining': '0',
          'x-rate-limit-reset': String(resetTime),
        }),
        json: () => Promise.resolve({
          title: 'Too Many Requests',
          detail: 'Too Many Requests',
          type: 'about:blank',
          status: 429,
        }),
      });
      
      // Second request: success (after rate limit)
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers({
          'x-rate-limit-limit': '15',
          'x-rate-limit-remaining': '14',
          'x-rate-limit-reset': String(resetTime + 60),
        }),
        json: () => Promise.resolve(mockData)
      });

      const result = await client.get('/tweets/123');
      
      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 60;
      
      // Mock rate limited responses for maxRetries + 1 times
      for (let i = 0; i < 3; i++) {
        mockFetch.mockImplementationOnce(() => ({
          status: 429,
          ok: false,
          headers: new Headers({
            'retry-after': '1', // Shorter delay for testing
            'x-rate-limit-limit': '15',
            'x-rate-limit-remaining': '0',
            'x-rate-limit-reset': String(resetTime + (i * 10)),
          }),
          json: () => Promise.resolve({
            title: 'Too Many Requests',
            detail: 'Too Many Requests',
            type: 'about:blank',
            status: 429,
          }),
        }));
      }

      await expect(client.get('/tweets/123')).rejects.toThrow(
        /Max retries \(2\) exceeded/
      );
      
      // Should be initial request + maxRetries
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('circuit breaker', () => {
    it('should open circuit after threshold is reached', async () => {
      const clientWithCircuitBreaker = new TwitterClient({
        bearerToken: mockBearerToken,
        enableCircuitBreaker: true,
        circuitBreakerThreshold: 1, // Lower threshold to 1 for testing
        circuitBreakerTimeout: 1000,
        maxRetries: 0, // Disable retries for this test
      });

      // Mock a failing request
      mockFetch.mockRejectedValueOnce(new Error('API Error'));
      
      // First request fails, opening circuit
      await expect(clientWithCircuitBreaker.get('/tweets/123')).rejects.toThrow('API Error');
      
      // Second request - should be blocked by circuit breaker
      await expect(clientWithCircuitBreaker.get('/tweets/123')).rejects.toThrow('Circuit breaker is open');
      
      // Verify fetch was only called once (second request was blocked by circuit breaker)
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should close circuit after timeout', async () => {
      // Use a shorter timeout for testing
      const circuitBreakerTimeout = 100; // 100ms for testing
      
      const clientWithCircuitBreaker = new TwitterClient({
        bearerToken: mockBearerToken,
        enableCircuitBreaker: true,
        circuitBreakerThreshold: 1,
        circuitBreakerTimeout,
        maxRetries: 0, // Disable retries for this test
      });

      // First request fails, opening circuit
      mockFetch.mockRejectedValueOnce(new Error('API Error'));
      await expect(clientWithCircuitBreaker.get('/tweets/123')).rejects.toThrow('API Error');
      
      // Verify circuit is open
      mockFetch.mockClear();
      await expect(clientWithCircuitBreaker.get('/tweets/123')).rejects.toThrow('Circuit breaker is open');
      expect(mockFetch).not.toHaveBeenCalled();
      
      // Wait for circuit to move to half-open state
      await new Promise(resolve => setTimeout(resolve, circuitBreakerTimeout + 10));
      
      // Next request should go through (half-open state)
      const mockData = { id: '123' };
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers({
          'x-rate-limit-limit': '15',
          'x-rate-limit-remaining': '14',
          'x-rate-limit-reset': String(Math.floor(Date.now() / 1000) + 300),
        }),
        json: () => Promise.resolve(mockData)
      });
      
      const result = await clientWithCircuitBreaker.get('/tweets/123');
      expect(result).toEqual(mockData);
      
      // Circuit should now be closed after successful request in half-open state
      // Make another request to verify circuit is closed
      const secondMockData = { id: '456' };
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers({
          'x-rate-limit-limit': '15',
          'x-rate-limit-remaining': '13',
          'x-rate-limit-reset': String(Math.floor(Date.now() / 1000) + 300),
        }),
        json: () => Promise.resolve(secondMockData)
      });
      
      const secondResult = await clientWithCircuitBreaker.get('/tweets/456');
      expect(secondResult).toEqual(secondMockData);
      
      // Should have made 3 calls: first failure, half-open success, closed state success
      expect(mockFetch).toHaveBeenCalledTimes(2); // First call was the initial failure, then we cleared mocks
      
      // Verify circuit is closed by making another request that would fail if circuit was open
      mockFetch.mockResolvedValueOnce({
        status: 200,
        ok: true,
        headers: new Headers({
          'x-rate-limit-limit': '15',
          'x-rate-limit-remaining': '12',
          'x-rate-limit-reset': String(Math.floor(Date.now() / 1000) + 300),
        }),
        json: () => Promise.resolve({ id: '789' })
      });
      
      const thirdResult = await clientWithCircuitBreaker.get('/tweets/789');
      expect(thirdResult).toEqual({ id: '789' });
    });
  });
});
