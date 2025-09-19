import { TwitterClient } from '../client';
import { TwitterRateLimitError } from '../types';
import { jest, describe, beforeEach, it, expect } from '@jest/globals';

// Mock fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

const mockResponse = (status: number, data: any, headers: Record<string, string> = {}) => {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers({
      'content-type': 'application/json',
      ...headers,
    }),
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
};

describe('TwitterClient', () => {
  let client: TwitterClient;
  const mockBearerToken = 'test-bearer-token';

  beforeEach(() => {
    jest.clearAllMocks();
    client = new TwitterClient({
      bearerToken: mockBearerToken,
      maxRetries: 2,
      retryDelay: 10, // Shorter delay for tests
    });
    // Ensure we use real timers unless a specific test opts into fake timers.
    jest.useRealTimers();
  });

  describe('request', () => {
    it('should make a successful GET request', async () => {
      const mockData = { data: { id: '123', text: 'Test tweet' } };
      // Fix: Use mockImplementationOnce because mockResponse returns a Promise. mockResolvedValue would create a nested Promise.
      mockFetch.mockImplementationOnce(() => mockResponse(200, mockData));

      const result = await client.get('/tweets/123');
      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.twitter.com/2/tweets/123',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockBearerToken}`,
          }),
        }),
      );
    });

    it('should handle rate limiting with retry', async () => {
      const mockData = { data: { id: '456' } };
      const resetTime = Math.floor(Date.now() / 1000) + 1;

      // Fix: Use mockImplementationOnce because mockResponse returns a Promise. mockResolvedValue would create a nested Promise.
      mockFetch.mockImplementationOnce(() =>
        mockResponse(
          429,
          { title: 'Too Many Requests' },
          { 'retry-after': '0.02', 'x-rate-limit-reset': String(resetTime) },
        ),
      );
      // Fix: Use mockImplementationOnce because mockResponse returns a Promise. mockResolvedValue would create a nested Promise.
      mockFetch.mockImplementationOnce(() => mockResponse(200, mockData));

      const result = await client.get('/tweets/456');

      expect(result).toEqual(mockData);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      const resetTime = Math.floor(Date.now() / 1000) + 1;
      mockFetch.mockImplementation(() =>
        mockResponse(
          429,
          { title: 'Too Many Requests' },
          { 'retry-after': '0.01', 'x-rate-limit-reset': String(resetTime) },
        ),
      );

      await expect(client.get('/tweets/789')).rejects.toThrow(TwitterRateLimitError);
      // 1 initial call + 2 retries
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('circuit breaker', () => {
    it('should open circuit after threshold is reached', async () => {
      const clientWithBreaker = new TwitterClient({
        bearerToken: mockBearerToken,
        maxRetries: 0,
        enableCircuitBreaker: true,
        circuitBreakerThreshold: 2,
        circuitBreakerTimeout: 2000,
      });

      // Fix: Use mockImplementation because mockResponse returns a Promise and this mock is used for multiple calls.
      mockFetch.mockImplementation(() => mockResponse(500, { detail: 'Internal Server Error' }));

      await expect(clientWithBreaker.get('/tweets/fail1')).rejects.toThrow();
      await expect(clientWithBreaker.get('/tweets/fail2')).rejects.toThrow();

      // Now circuit should be open and fail fast without a network request.
      await expect(clientWithBreaker.get('/tweets/blocked')).rejects.toThrow(
        'Circuit breaker is open',
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should close circuit after timeout', async () => {
      jest.useFakeTimers();
      const clientWithBreaker = new TwitterClient({
        bearerToken: mockBearerToken,
        maxRetries: 0,
        enableCircuitBreaker: true,
        circuitBreakerThreshold: 1, // Open after 1 failure
        circuitBreakerTimeout: 1000, // 1s timeout
      });

      // 1. Open the circuit with one failure
      // Fix: Use mockImplementationOnce because mockResponse returns a Promise. mockResolvedValue would create a nested Promise.
      mockFetch.mockImplementationOnce(() => mockResponse(500, { detail: 'Internal Server Error' }));
      await expect(clientWithBreaker.get('/tweets/fail')).rejects.toThrow();

      // 2. It should now be open, and fail fast
      await expect(clientWithBreaker.get('/tweets/blocked')).rejects.toThrow('Circuit breaker is open');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // 3. Wait for timeout to pass, so it becomes half-open
      jest.advanceTimersByTime(1001);

      // 4. This request should go through (half-open) and succeed
      const mockData = { data: { id: '456' } };
      // Fix: Use mockImplementationOnce because mockResponse returns a Promise. mockResolvedValue would create a nested Promise.
      mockFetch.mockImplementationOnce(() => mockResponse(200, mockData));
      const result = await clientWithBreaker.get('/tweets/half-open-success');
      expect(result).toEqual(mockData);

      // 5. The next request should also succeed, showing the circuit is now closed
      const mockData2 = { data: { id: '789' } };
      // Fix: Use mockImplementationOnce because mockResponse returns a Promise. mockResolvedValue would create a nested Promise.
      mockFetch.mockImplementationOnce(() => mockResponse(200, mockData2));
      const result2 = await clientWithBreaker.get('/tweets/closed-success');
      expect(result2).toEqual(mockData2);
      expect(mockFetch).toHaveBeenCalledTimes(3);

      jest.useRealTimers();
    });
  });
});