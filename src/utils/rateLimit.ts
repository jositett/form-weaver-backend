/**
 * Rate limiting utilities for Cloudflare Workers using KV storage
 */

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  reset: number; // Unix timestamp in seconds
  retryAfter?: number; // Seconds until next request
}

export interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
}

/**
 * Default rate limit configuration for form submissions
 * 10 submissions per 10 minutes per IP
 */
export const FORM_SUBMISSION_RATE_LIMIT: RateLimitConfig = {
  windowMs: 10 * 60 * 1000, // 10 minutes
  maxRequests: 10,
};

/**
 * Check rate limit for a given key using KV storage
 * @param kv - KV namespace for rate limiting
 * @param key - Rate limit key (e.g., IP address)
 * @param config - Rate limit configuration
 * @returns Rate limit result with allowed status and headers
 */
export async function checkRateLimit(
  kv: KVNamespace,
  key: string,
  config: RateLimitConfig = FORM_SUBMISSION_RATE_LIMIT
): Promise<RateLimitResult> {
  const now = Date.now();
  const windowStart = Math.floor(now / config.windowMs) * config.windowMs;
  const resetTime = windowStart + config.windowMs;

  // Create a composite key with timestamp for automatic cleanup
  const kvKey = `ratelimit:${key}:${windowStart}`;

  try {
    // Get current count from KV
    const countStr = await kv.get(kvKey);
    const count = countStr ? parseInt(countStr, 10) : 0;

    // Calculate remaining requests
    const remaining = Math.max(0, config.maxRequests - count - 1);

    // Check if limit exceeded
    const allowed = count < config.maxRequests;

    // Reset time is the end of current window
    const reset = Math.floor(resetTime / 1000); // Unix timestamp in seconds

    if (!allowed) {
      // Calculate retry after in seconds
      const retryAfter = Math.ceil((resetTime - now) / 1000);
      return { allowed: false, remaining: 0, reset, retryAfter };
    }

    // Increment counter and set TTL to end of current window
    const newCount = count + 1;
    const ttl = Math.ceil((resetTime - now) / 1000); // TTL in seconds

    await kv.put(kvKey, newCount.toString(), { expirationTtl: ttl });

    return { allowed: true, remaining, reset };

  } catch (error) {
    console.error('[Rate Limit Error]', error);
    // If KV operation fails, allow request to prevent blocking legitimate users
    return { allowed: true, remaining: config.maxRequests - 1, reset: Math.floor((now + config.windowMs) / 1000) };
  }
}

/**
 * Get IP address from Cloudflare request headers
 * @param request - Hono request object
 * @returns IP address or fallback
 */
export function getClientIP(request: Request): string {
  // Cloudflare provides CF-Connecting-IP header
  const cfIP = request.headers.get('CF-Connecting-IP');
  if (cfIP) return cfIP;

  // Fallback to X-Forwarded-For (first IP in comma-separated list)
  const xff = request.headers.get('X-Forwarded-For');
  if (xff) {
    return xff.split(',')[0].trim();
  }

  // Last resort fallback
  return 'unknown';
}

/**
 * Standard HTTP rate limit headers for response
 * @param result - Rate limit result
 * @returns Headers object
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': FORM_SUBMISSION_RATE_LIMIT.maxRequests.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toString(),
  };

  if (result.retryAfter) {
    headers['Retry-After'] = result.retryAfter.toString();
  }

  return headers;
}
