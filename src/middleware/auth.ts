import { createMiddleware } from 'hono/factory';
import { verifyToken } from '../utils/jwt';
import type { HonoContext } from '../types/index';

/**
 * Authentication middleware for protected routes
 * Extracts and verifies JWT token from Authorization header
 * Sets user context variables on the request
 */
export const authMiddleware = createMiddleware<{
  Bindings: {
    JWT_SECRET: string;
  };
  Variables: HonoContext;
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (!authHeader) {
    return c.json({
      success: false,
      error: 'Missing authorization header',
    }, 401);
  }

  if (!authHeader.startsWith('Bearer ')) {
    return c.json({
      success: false,
      error: 'Invalid authorization header format',
    }, 401);
  }

  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

  try {
    const payload = await verifyToken(token, c.env.JWT_SECRET);

    // Verify it's an access token
    if (payload.type !== 'access') {
      return c.json({
        success: false,
        error: 'Invalid token type',
      }, 401);
    }

    // Set user context
    c.set('userId', payload.sub);
    c.set('workspaceId', payload.workspaceId);
    c.set('userRole', payload.role);

    await next();
  } catch (error) {
    return c.json({
      success: false,
      error: 'Invalid or expired token',
    }, 401);
  }
});

/**
 * Optional authentication middleware for routes that work with or without auth
 * Does not return error on missing token, just continues without user context
 */
export const optionalAuthMiddleware = createMiddleware<{
  Bindings: {
    JWT_SECRET: string;
  };
  Variables: HonoContext;
}>(async (c, next) => {
  const authHeader = c.req.header('Authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);

    try {
      const payload = await verifyToken(token, c.env.JWT_SECRET);

      if (payload.type === 'access') {
        c.set('userId', payload.sub);
        c.set('workspaceId', payload.workspaceId);
        c.set('userRole', payload.role);
      }
    } catch (error) {
      // Silently ignore invalid tokens for optional auth
    }
  }

  await next();
});
