/**
 * Middleware Test Suite
 * Comprehensive tests for authentication middleware, workspace authorization,
 * and rate limiting middleware
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { authMiddleware, optionalAuthMiddleware, workspaceAuthMiddleware } from '../src/middleware/auth';
import { checkRateLimit, getClientIP } from '../src/utils/rateLimit';

describe('Authentication Middleware', () => {
  let app: Hono;
  let mockEnv: any;
  let mockContext: any;

  beforeEach(() => {
    mockEnv = {
      JWT_SECRET: 'test-jwt-secret-key-for-testing-only',
      DB: {
        prepare: vi.fn(),
      },
    };

    mockContext = {
      get: vi.fn(),
      set: vi.fn(),
      json: vi.fn(),
      req: {
        raw: {
          headers: new Headers(),
        },
      },
    };

    app = new Hono();
  });

  describe('authMiddleware', () => {
    it('should successfully authenticate valid JWT token', async () => {
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
        workspaceId: 'test-workspace-id',
        role: 'admin',
        type: 'access',
      };

      vi.doMock('../src/utils/jwt', () => ({
        verifyToken: vi.fn().mockResolvedValue(mockPayload),
      }));

      const testRoute = app.use('*', authMiddleware, async (c) => {
        return c.json({
          success: true,
          userId: c.get('userId'),
          workspaceId: c.get('workspaceId'),
          userRole: c.get('userRole'),
        });
      });

      mockContext.req.raw.headers.set('Authorization', 'Bearer valid-jwt-token');

      const response = await app.request('/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid-jwt-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.userId).toBe('test-user-id');
      expect(data.workspaceId).toBe('test-workspace-id');
      expect(data.userRole).toBe('admin');
    });

    it('should reject request without authorization header', async () => {
      const testRoute = app.use('*', authMiddleware, async (c) => {
        return c.json({ success: true });
      });

      const response = await app.request('/', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Missing authorization header');
    });

    it('should reject request with invalid authorization header format', async () => {
      const testRoute = app.use('*', authMiddleware, async (c) => {
        return c.json({ success: true });
      });

      const response = await app.request('/', {
        method: 'GET',
        headers: { 'Authorization': 'InvalidFormat token' },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid authorization header format');
    });

    it('should reject request with invalid token', async () => {
      vi.doMock('../src/utils/jwt', () => ({
        verifyToken: vi.fn().mockRejectedValue(new Error('Invalid token')),
      }));

      const testRoute = app.use('*', authMiddleware, async (c) => {
        return c.json({ success: true });
      });

      const response = await app.request('/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer invalid-token' },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid or expired token');
    });

    it('should reject request with refresh token instead of access token', async () => {
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
        workspaceId: 'test-workspace-id',
        role: 'admin',
        type: 'refresh', // Wrong token type
      };

      vi.doMock('../src/utils/jwt', () => ({
        verifyToken: vi.fn().mockResolvedValue(mockPayload),
      }));

      const testRoute = app.use('*', authMiddleware, async (c) => {
        return c.json({ success: true });
      });

      const response = await app.request('/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer refresh-token' },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid token type');
    });

    it('should handle token verification errors gracefully', async () => {
      vi.doMock('../src/utils/jwt', () => ({
        verifyToken: vi.fn().mockImplementation(() => {
          throw new Error('Token verification failed');
        }),
      }));

      const testRoute = app.use('*', authMiddleware, async (c) => {
        return c.json({ success: true });
      });

      const response = await app.request('/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer error-token' },
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Invalid or expired token');
    });
  });

  describe('optionalAuthMiddleware', () => {
    it('should authenticate valid token and continue', async () => {
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
        workspaceId: 'test-workspace-id',
        role: 'admin',
        type: 'access',
      };

      vi.doMock('../src/utils/jwt', () => ({
        verifyToken: vi.fn().mockResolvedValue(mockPayload),
      }));

      const testRoute = app.use('*', optionalAuthMiddleware, async (c) => {
        return c.json({
          success: true,
          userId: c.get('userId'),
          workspaceId: c.get('workspaceId'),
          userRole: c.get('userRole'),
        });
      });

      const response = await app.request('/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid-jwt-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.userId).toBe('test-user-id');
    });

    it('should continue without authentication when no token provided', async () => {
      const testRoute = app.use('*', optionalAuthMiddleware, async (c) => {
        return c.json({
          success: true,
          userId: c.get('userId'),
          workspaceId: c.get('workspaceId'),
          userRole: c.get('userRole'),
        });
      });

      const response = await app.request('/', {
        method: 'GET',
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.userId).toBeUndefined();
      expect(data.workspaceId).toBeUndefined();
      expect(data.userRole).toBeUndefined();
    });

    it('should silently ignore invalid tokens', async () => {
      vi.doMock('../src/utils/jwt', () => ({
        verifyToken: vi.fn().mockRejectedValue(new Error('Invalid token')),
      }));

      const testRoute = app.use('*', optionalAuthMiddleware, async (c) => {
        return c.json({
          success: true,
          userId: c.get('userId'),
        });
      });

      const response = await app.request('/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer invalid-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.userId).toBeUndefined();
    });

    it('should silently ignore invalid token types', async () => {
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
        workspaceId: 'test-workspace-id',
        role: 'admin',
        type: 'refresh', // Wrong token type
      };

      vi.doMock('../src/utils/jwt', () => ({
        verifyToken: vi.fn().mockResolvedValue(mockPayload),
      }));

      const testRoute = app.use('*', optionalAuthMiddleware, async (c) => {
        return c.json({
          success: true,
          userId: c.get('userId'),
        });
      });

      const response = await app.request('/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer refresh-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.userId).toBeUndefined();
    });
  });

  describe('workspaceAuthMiddleware', () => {
    it('should successfully authenticate user with workspace access', async () => {
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
        workspaceId: 'test-workspace-id',
        role: 'admin',
        type: 'access',
      };

      vi.doMock('../src/utils/jwt', () => ({
        verifyToken: vi.fn().mockResolvedValue(mockPayload),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            role: 'admin',
          }),
        }),
      });

      const testRoute = app.use('*', workspaceAuthMiddleware(['admin', 'owner']), async (c) => {
        return c.json({
          success: true,
          userId: c.get('userId'),
          workspaceId: c.get('workspaceId'),
          userRole: c.get('userRole'),
        });
      });

      const response = await app.request('/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid-jwt-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.userId).toBe('test-user-id');
      expect(data.workspaceId).toBe('test-workspace-id');
      expect(data.userRole).toBe('admin');
    });

    it('should reject user without required role permissions', async () => {
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
        workspaceId: 'test-workspace-id',
        role: 'member', // Doesn't have required role
        type: 'access',
      };

      vi.doMock('../src/utils/jwt', () => ({
        verifyToken: vi.fn().mockResolvedValue(mockPayload),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            role: 'member',
          }),
        }),
      });

      const testRoute = app.use('*', workspaceAuthMiddleware(['owner']), async (c) => {
        return c.json({ success: true });
      });

      const response = await app.request('/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid-jwt-token' },
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Insufficient permissions. Required: owner, Current: member');
    });

    it('should reject user who is not a workspace member', async () => {
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
        workspaceId: 'test-workspace-id',
        role: 'admin',
        type: 'access',
      };

      vi.doMock('../src/utils/jwt', () => ({
        verifyToken: vi.fn().mockResolvedValue(mockPayload),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue(null), // Not a member
        }),
      });

      const testRoute = app.use('*', workspaceAuthMiddleware(['admin']), async (c) => {
        return c.json({ success: true });
      });

      const response = await app.request('/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid-jwt-token' },
      });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Access denied: not a member of this workspace');
    });

    it('should reject user with missing authorization', async () => {
      const testRoute = app.use('*', workspaceAuthMiddleware(['admin']), async (c) => {
        return c.json({ success: true });
      });

      const response = await app.request('/', {
        method: 'GET',
      });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Missing authorization header');
    });

    it('should allow any authenticated workspace member when no role requirements', async () => {
      const mockPayload = {
        sub: 'test-user-id',
        email: 'test@example.com',
        workspaceId: 'test-workspace-id',
        role: 'member', // Any role should work
        type: 'access',
      };

      vi.doMock('../src/utils/jwt', () => ({
        verifyToken: vi.fn().mockResolvedValue(mockPayload),
      }));

      mockEnv.DB.prepare = vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            role: 'member',
          }),
        }),
      });

      const testRoute = app.use('*', workspaceAuthMiddleware(), async (c) => {
        return c.json({
          success: true,
          userId: c.get('userId'),
          userRole: c.get('userRole'),
        });
      });

      const response = await app.request('/', {
        method: 'GET',
        headers: { 'Authorization': 'Bearer valid-jwt-token' },
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.userId).toBe('test-user-id');
      expect(data.userRole).toBe('member');
    });
  });
});

describe('Rate Limiting Middleware', () => {
  let mockEnv: any;

  beforeEach(() => {
    mockEnv = {
      RATE_LIMIT: {
        fetch: vi.fn(),
      },
    };
  });

  describe('checkRateLimit', () => {
    it('should allow request within rate limit', async () => {
      mockEnv.RATE_LIMIT.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          allowed: true,
          limit: 100,
          remaining: 99,
          reset: Date.now() + 3600000,
        }))
      );

      const result = await checkRateLimit(
        mockEnv.RATE_LIMIT,
        'test-key',
        { requests: 100, windowMs: 900000 }
      );

      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(99);
      expect(result.reset).toBeDefined();
    });

    it('should reject request when rate limit exceeded', async () => {
      mockEnv.RATE_LIMIT.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          allowed: false,
          limit: 100,
          remaining: 0,
          reset: Date.now() + 3600000,
          retryAfter: 3600,
        }))
      );

      const result = await checkRateLimit(
        mockEnv.RATE_LIMIT,
        'test-key',
        { requests: 100, windowMs: 900000 }
      );

      expect(result.allowed).toBe(false);
      expect(result.limit).toBe(100);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBe(3600);
    });

    it('should handle rate limit service errors', async () => {
      mockEnv.RATE_LIMIT.fetch = vi.fn().mockRejectedValue(
        new Error('Rate limit service unavailable')
      );

      const result = await checkRateLimit(
        mockEnv.RATE_LIMIT,
        'test-key',
        { requests: 100, windowMs: 900000 }
      );

      expect(result.allowed).toBe(true); // Fail open for resilience
      expect(result.limit).toBeUndefined();
      expect(result.remaining).toBeUndefined();
    });

    it('should handle invalid rate limit response', async () => {
      mockEnv.RATE_LIMIT.fetch = vi.fn().mockResolvedValue(
        new Response('Invalid JSON', { status: 500 })
      );

      const result = await checkRateLimit(
        mockEnv.RATE_LIMIT,
        'test-key',
        { requests: 100, windowMs: 900000 }
      );

      expect(result.allowed).toBe(true); // Fail open for resilience
    });
  });

  describe('getClientIP', () => {
    it('should extract IP from CF-Connecting-IP header', () => {
      const mockRequest = {
        headers: new Headers({
          'CF-Connecting-IP': '203.0.113.1',
        }),
      };

      const ip = getClientIP(mockRequest);
      expect(ip).toBe('203.0.113.1');
    });

    it('should extract IP from X-Forwarded-For header when CF-Connecting-IP not available', () => {
      const mockRequest = {
        headers: new Headers({
          'X-Forwarded-For': '192.0.2.1, 10.0.0.1',
        }),
      };

      const ip = getClientIP(mockRequest);
      expect(ip).toBe('192.0.2.1'); // First IP in the list
    });

    it('should extract IP from X-Real-IP header as fallback', () => {
      const mockRequest = {
        headers: new Headers({
          'X-Real-IP': '198.51.100.1',
        }),
      };

      const ip = getClientIP(mockRequest);
      expect(ip).toBe('198.51.100.1');
    });

    it('should return localhost when no IP headers available', () => {
      const mockRequest = {
        headers: new Headers(),
      };

      const ip = getClientIP(mockRequest);
      expect(ip).toBe('127.0.0.1');
    });

    it('should handle malformed X-Forwarded-For header', () => {
      const mockRequest = {
        headers: new Headers({
          'X-Forwarded-For': 'invalid-ip, 192.0.2.1',
        }),
      };

      const ip = getClientIP(mockRequest);
      expect(ip).toBe('192.0.2.1'); // Should parse valid IP from list
    });
  });

  describe('Rate Limiting Integration', () => {
    it('should apply different rate limits for different endpoints', async () => {
      const rateLimitConfigs = {
        signup: { requests: 5, windowMs: 900000 }, // 5 per 15 minutes
        login: { requests: 10, windowMs: 900000 }, // 10 per 15 minutes
        passwordReset: { requests: 3, windowMs: 3600000 }, // 3 per hour
        profileUpdate: { requests: 20, windowMs: 900000 }, // 20 per 15 minutes
      };

      // Mock different responses for different rate limit checks
      let callCount = 0;
      mockEnv.RATE_LIMIT.fetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Signup limit exceeded
          return Promise.resolve(new Response(JSON.stringify({
            allowed: false,
            retryAfter: 3600,
          })));
        } else {
          // Other limits allowed
          return Promise.resolve(new Response(JSON.stringify({
            allowed: true,
            remaining: 10,
          })));
        }
      });

      // Test signup rate limit
      const signupResult = await checkRateLimit(
        mockEnv.RATE_LIMIT,
        'signup:127.0.0.1',
        rateLimitConfigs.signup
      );
      expect(signupResult.allowed).toBe(false);
      expect(signupResult.retryAfter).toBe(3600);

      // Test login rate limit
      const loginResult = await checkRateLimit(
        mockEnv.RATE_LIMIT,
        'login:127.0.0.1',
        rateLimitConfigs.login
      );
      expect(loginResult.allowed).toBe(true);
    });

    it('should handle rate limiting for different IP addresses separately', async () => {
      mockEnv.RATE_LIMIT.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          allowed: true,
          remaining: 5,
        }))
      );

      const result1 = await checkRateLimit(
        mockEnv.RATE_LIMIT,
        'signup:192.0.2.1',
        { requests: 10, windowMs: 900000 }
      );

      const result2 = await checkRateLimit(
        mockEnv.RATE_LIMIT,
        'signup:198.51.100.1',
        { requests: 10, windowMs: 900000 }
      );

      expect(result1.allowed).toBe(true);
      expect(result2.allowed).toBe(true);
      expect(mockEnv.RATE_LIMIT.fetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('Middleware Error Handling', () => {
  it('should handle JWT service unavailability', async () => {
    vi.doMock('../src/utils/jwt', () => ({
      verifyToken: vi.fn().mockRejectedValue(new Error('JWT service unavailable')),
    }));

    const app = new Hono();

    const testRoute = app.use('*', authMiddleware, async (c) => {
      return c.json({ success: true });
    });

    const response = await app.request('/', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer test-token' },
    });

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid or expired token');
  });

  it('should handle database connection errors in workspace auth', async () => {
    const mockPayload = {
      sub: 'test-user-id',
      email: 'test@example.com',
      workspaceId: 'test-workspace-id',
      role: 'admin',
      type: 'access',
    };

    vi.doMock('../src/utils/jwt', () => ({
      verifyToken: vi.fn().mockResolvedValue(mockPayload),
    }));

    const mockEnv = {
      DB: {
        prepare: vi.fn().mockReturnValue({
          bind: vi.fn().mockReturnValue({
            first: vi.fn().mockRejectedValue(new Error('Database connection failed')),
          }),
        }),
      },
    };

    const app = new Hono();

    const testRoute = app.use('*', workspaceAuthMiddleware(['admin']), async (c) => {
      return c.json({ success: true });
    });

    // Mock the environment to be available in the request context
    const response = await app.request('/', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer test-token' },
      // In a real implementation, env would be passed through the context
    });

    // The middleware should handle database errors gracefully
    expect(response.status).toBe(500);
  });

  it('should handle malformed JWT tokens', async () => {
    vi.doMock('../src/utils/jwt', () => ({
      verifyToken: vi.fn().mockImplementation(() => {
        throw new Error('malformed token');
      }),
    }));

    const app = new Hono();

    const testRoute = app.use('*', authMiddleware, async (c) => {
      return c.json({ success: true });
    });

    const response = await app.request('/', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer malformed.token' },
    });

    expect(response.status).toBe(401);
    const data = await response.json();
    expect(data.success).toBe(false);
    expect(data.error).toBe('Invalid or expired token');
  });
});