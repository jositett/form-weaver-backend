import { createMiddleware } from 'hono/factory';
import { checkRateLimit, getClientIP, createRateLimitHeaders, RateLimitConfig } from '../utils/rateLimit';
import type { Env, HonoContext } from '../types';

/**
 * Rate limit configurations for different endpoint types
 */
export const RATE_LIMITS = {
  // Public endpoints: 10 requests per minute per IP
  PUBLIC: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
  } as RateLimitConfig,

  // Authenticated endpoints: 100 requests per minute per user
  AUTHENTICATED: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
  } as RateLimitConfig,

  // File upload: 5 requests per minute per IP
  FILE_UPLOAD: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
  } as RateLimitConfig,

  // Form submission: 10 submissions per 10 minutes per IP
  FORM_SUBMISSION: {
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 10,
  } as RateLimitConfig,
};

/**
 * Create rate limiting middleware
 * @param config - Rate limit configuration
 * @param keyPrefix - Prefix for rate limit key (e.g., 'api', 'upload')
 */
export function rateLimitMiddleware(
  config: RateLimitConfig = RATE_LIMITS.PUBLIC,
  keyPrefix: string = 'api'
) {
  return createMiddleware<{
    Bindings: Env;
    Variables: HonoContext;
  }>(async (c, next) => {
    const clientIP = getClientIP(c.req.raw);
    const userId = c.get('userId');
    
    // Use userId if authenticated, otherwise use IP
    const identifier = userId || clientIP;
    const rateLimitKey = `${keyPrefix}:${identifier}`;

    const result = await checkRateLimit(c.env.RATE_LIMIT, rateLimitKey, config);

    // Add rate limit headers to response
    const headers = createRateLimitHeaders(result);
    Object.entries(headers).forEach(([key, value]) => {
      c.header(key, value);
    });

    if (!result.allowed) {
      return c.json(
        {
          error: 'Too many requests',
          message: 'Rate limit exceeded. Please try again later.',
          retryAfter: result.retryAfter,
        },
        429
      );
    }

    await next();
  });
}

/**
 * Public endpoint rate limiter (10 req/min per IP)
 */
export const publicRateLimit = rateLimitMiddleware(RATE_LIMITS.PUBLIC, 'public');

/**
 * Authenticated endpoint rate limiter (100 req/min per user)
 */
export const authenticatedRateLimit = rateLimitMiddleware(RATE_LIMITS.AUTHENTICATED, 'auth');

/**
 * File upload rate limiter (5 req/min per IP)
 */
export const fileUploadRateLimit = rateLimitMiddleware(RATE_LIMITS.FILE_UPLOAD, 'upload');

/**
 * Form submission rate limiter (10 req/10min per IP)
 */
export const formSubmissionRateLimit = rateLimitMiddleware(RATE_LIMITS.FORM_SUBMISSION, 'submission');
