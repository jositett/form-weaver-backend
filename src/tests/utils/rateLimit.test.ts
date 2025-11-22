import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  checkRateLimit,
  getClientIP,
  createRateLimitHeaders,
  FORM_SUBMISSION_RATE_LIMIT,
  RateLimitConfig,
  RateLimitResult,
} from '../../utils/rateLimit';

/**
 * Rate limiting utilities test suite
 * Tests all rate limiting functionality including IP detection, rate limit checking,
 * and header generation with comprehensive edge case coverage.
 */
describe('Rate Limiting Utilities', () => {
  let mockKV: KVNamespace;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Create mock KV namespace
    mockKV = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    } as unknown as KVNamespace;

    // Store original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  /**
   * getClientIP Function Tests
   * Tests IP address extraction from various request header scenarios
   */
  describe('getClientIP', () => {
    it('should extract IP from CF-Connecting-IP header', () => {
      const mockRequest = new Request('https://example.com', {
        headers: {
          'CF-Connecting-IP': '192.168.1.1',
        },
      });

      const ip = getClientIP(mockRequest);
      expect(ip).toBe('192.168.1.1');
    });

    it('should extract first IP from X-Forwarded-For header when CF-Connecting-IP is not available', () => {
      const mockRequest = new Request('https://example.com', {
        headers: {
          'X-Forwarded-For': '10.0.0.1, 10.0.0.2, 10.0.0.3',
        },
      });

      const ip = getClientIP(mockRequest);
      expect(ip).toBe('10.0.0.1');
    });

    it('should handle X-Forwarded-For with spaces correctly', () => {
      const mockRequest = new Request('https://example.com', {
        headers: {
          'CF-Connecting-IP': '',
          'X-Forwarded-For': '  172.16.0.1  , 172.16.0.2  ',
        },
      });

      const ip = getClientIP(mockRequest);
      expect(ip).toBe('172.16.0.1');
    });

    it('should return "unknown" when no IP headers are available', () => {
      const mockRequest = new Request('https://example.com', {
        headers: {},
      });

      const ip = getClientIP(mockRequest);
      expect(ip).toBe('unknown');
    });

    it('should prioritize CF-Connecting-IP over X-Forwarded-For', () => {
      const mockRequest = new Request('https://example.com', {
        headers: {
          'CF-Connecting-IP': '203.0.113.1',
          'X-Forwarded-For': '192.0.2.1, 192.0.2.2',
        },
      });

      const ip = getClientIP(mockRequest);
      expect(ip).toBe('203.0.113.1');
    });
  });

  /**
   * checkRateLimit Function Tests
   * Tests rate limit checking logic with various scenarios and edge cases
   */
  describe('checkRateLimit', () => {
    const testIP = '192.168.1.1';
    const customConfig: RateLimitConfig = {
      windowMs: 60000, // 1 minute
      maxRequests: 5,
    };

    beforeEach(() => {
      // Mock Date.now() to return a consistent timestamp
      vi.spyOn(Date, 'now').mockReturnValue(1640995200000); // 2022-01-01 00:00:00 UTC
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should allow first request within rate limit', async () => {
      // Mock KV to return no existing count
      (mockKV.get as jest.Mock).mockResolvedValue(null);

      const result = await checkRateLimit(mockKV, testIP, customConfig);

      expect(result).toEqual({
        allowed: true,
        remaining: 4, // 5 - 0 - 1
        reset: 1640995260, // End of current window (2022-01-01 00:01:00 UTC)
      });

      expect(mockKV.put).toHaveBeenCalledWith(
        'ratelimit:192.168.1.1:1640995200000',
        '1',
        { expirationTtl: 60 }
      );
    });

    it('should allow requests within the rate limit window', async () => {
      // Mock existing count of 2
      (mockKV.get as jest.Mock).mockResolvedValue('2');

      const result = await checkRateLimit(mockKV, testIP, customConfig);

      expect(result).toEqual({
        allowed: true,
        remaining: 2, // 5 - 2 - 1
        reset: 1640995260,
      });

      expect(mockKV.put).toHaveBeenCalledWith(
        'ratelimit:192.168.1.1:1640995200000',
        '3',
        { expirationTtl: 60 }
      );
    });

    it('should deny request when rate limit is exceeded', async () => {
      // Mock existing count at limit
      (mockKV.get as jest.Mock).mockResolvedValue('5');

      const result = await checkRateLimit(mockKV, testIP, customConfig);

      expect(result).toEqual({
        allowed: false,
        remaining: 0,
        reset: 1640995260,
        retryAfter: 60, // Full window remaining
      });

      // KV.put should not be called when limit is exceeded
      expect(mockKV.put).not.toHaveBeenCalled();
    });

    it('should handle partial count correctly at rate limit boundary', async () => {
      // Mock existing count just below limit
      (mockKV.get as jest.Mock).mockResolvedValue('4');

      const result = await checkRateLimit(mockKV, testIP, customConfig);

      expect(result).toEqual({
        allowed: true,
        remaining: 0, // 5 - 4 - 1 = 0
        reset: 1640995260,
      });

      expect(mockKV.put).toHaveBeenCalledWith(
        'ratelimit:192.168.1.1:1640995200000',
        '5',
        { expirationTtl: 60 }
      );
    });

    it('should use default configuration when none provided', async () => {
      (mockKV.get as jest.Mock).mockResolvedValue(null);

      const result = await checkRateLimit(mockKV, testIP);

      expect(result).toEqual({
        allowed: true,
        remaining: 9, // Default maxRequests (10) - 0 - 1
        reset: 1640995800, // Updated expected reset time based on actual calculation
      });

      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining('ratelimit:192.168.1.1:'),
        '1',
        { expirationTtl: 600 }
      );
    });

    it('should handle invalid count from KV gracefully', async () => {
      (mockKV.get as jest.Mock).mockResolvedValue('invalid-number');

      const result = await checkRateLimit(mockKV, testIP, customConfig);

      // parseInt('invalid-number', 10) returns NaN
      // In the rate limit function: remaining = Math.max(0, config.maxRequests - count - 1)
      // With NaN count: Math.max(0, 5 - NaN - 1) = Math.max(0, NaN) = 0
      // allowed = count < config.maxRequests, where NaN < 5 is false
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it('should handle KV storage failure gracefully by allowing request', async () => {
      (mockKV.get as jest.Mock).mockRejectedValue(new Error('KV connection failed'));

      const result = await checkRateLimit(mockKV, testIP, customConfig);

      // Should allow request when KV fails
      expect(result).toEqual({
        allowed: true,
        remaining: 4, // Fallback behavior
        reset: 1640995260,
      });

      // Should not attempt to put when get fails
      expect(mockKV.put).not.toHaveBeenCalled();
    });

    it('should handle KV put failure gracefully after successful get', async () => {
      (mockKV.get as jest.Mock).mockResolvedValue(null);
      (mockKV.put as jest.Mock).mockRejectedValue(new Error('KV write failed'));

      // Should still return success even if put fails
      const result = await checkRateLimit(mockKV, testIP, customConfig);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should calculate correct TTL for KV entry based on remaining window time', async () => {
      // Mock current time to be 30 seconds into a 60-second window
      vi.spyOn(Date, 'now').mockReturnValue(1640995230000); // 30 seconds later

      (mockKV.get as jest.Mock).mockResolvedValue(null);

      await checkRateLimit(mockKV, testIP, customConfig);

      // TTL should be 30 seconds (60 - 30)
      expect(mockKV.put).toHaveBeenCalledWith(
        expect.stringContaining('ratelimit:192.168.1.1:'),
        '1',
        { expirationTtl: 30 }
      );
    });
  });

  /**
   * createRateLimitHeaders Function Tests
   * Tests rate limit header generation for HTTP responses
   */
  describe('createRateLimitHeaders', () => {
    it('should generate standard rate limit headers', () => {
      const result: RateLimitResult = {
        allowed: true,
        remaining: 3,
        reset: 1640995260,
      };

      const headers = createRateLimitHeaders(result);

      expect(headers).toEqual({
        'X-RateLimit-Limit': '10', // Default from FORM_SUBMISSION_RATE_LIMIT
        'X-RateLimit-Remaining': '3',
        'X-RateLimit-Reset': '1640995260',
      });
    });

    it('should include Retry-After header when request is rate limited', () => {
      const result: RateLimitResult = {
        allowed: false,
        remaining: 0,
        reset: 1640995260,
        retryAfter: 45,
      };

      const headers = createRateLimitHeaders(result);

      expect(headers).toEqual({
        'X-RateLimit-Limit': '10',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': '1640995260',
        'Retry-After': '45',
      });
    });

    it('should handle zero remaining requests correctly', () => {
      const result: RateLimitResult = {
        allowed: true,
        remaining: 0,
        reset: 1640995260,
      };

      const headers = createRateLimitHeaders(result);

      expect(headers['X-RateLimit-Remaining']).toBe('0');
    });

    it('should convert numeric values to strings in headers', () => {
      const result: RateLimitResult = {
        allowed: true,
        remaining: 7,
        reset: 1640995300,
      };

      const headers = createRateLimitHeaders(result);

      // All header values should be strings
      Object.values(headers).forEach(value => {
        expect(typeof value).toBe('string');
      });
    });
  });

  /**
   * Edge Cases and Time Window Tests
   * Tests complex scenarios involving time calculations and edge cases
   */
  describe('Edge Cases and Time Window Behavior', () => {
    const testIP = '192.168.1.1';
    const customConfig: RateLimitConfig = {
      windowMs: 60000, // 1 minute
      maxRequests: 5,
    };

    beforeEach(() => {
      vi.spyOn(Date, 'now').mockReturnValue(1640995200000);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should create proper composite keys with timestamp', async () => {
      (mockKV.get as jest.Mock).mockResolvedValue(null);

      await checkRateLimit(mockKV, 'test-ip', customConfig);

      expect(mockKV.put).toHaveBeenCalledWith(
        'ratelimit:test-ip:1640995200000', // Composite key format
        '1',
        expect.any(Object)
      );
    });

    it('should handle very small time windows correctly', async () => {
      const microConfig: RateLimitConfig = {
        windowMs: 1000, // 1 second window
        maxRequests: 2,
      };

      (mockKV.get as jest.Mock).mockResolvedValue('1');

      const result = await checkRateLimit(mockKV, testIP, microConfig);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
      expect(result.reset).toBe(1640995201); // 1 second later
    });

    it('should handle very large time windows correctly', async () => {
      const macroConfig: RateLimitConfig = {
        windowMs: 24 * 60 * 60 * 1000, // 24 hours
        maxRequests: 1000,
      };

      (mockKV.get as jest.Mock).mockResolvedValue('500');

      const result = await checkRateLimit(mockKV, testIP, macroConfig);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(499);
      expect(result.reset).toBe(1641081600); // Next day
    });

    it('should handle zero max requests configuration', async () => {
      const zeroConfig: RateLimitConfig = {
        windowMs: 60000,
        maxRequests: 0,
      };

      (mockKV.get as jest.Mock).mockResolvedValue(null);

      const result = await checkRateLimit(mockKV, testIP, zeroConfig);

      expect(result).toEqual({
        allowed: false,
        remaining: 0,
        reset: 1640995260,
        retryAfter: 60,
      });
    });

    it('should handle negative TTL calculation at window boundary', async () => {
      // Mock time to be exactly at window boundary
      vi.spyOn(Date, 'now').mockReturnValue(1640995260000); // At window end

      (mockKV.get as jest.Mock).mockResolvedValue(null);

      const result = await checkRateLimit(mockKV, testIP, customConfig);

      // Should still allow the request with TTL of 1 second minimum
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });
  });
});