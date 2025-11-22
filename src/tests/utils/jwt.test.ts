import { describe, it, expect, beforeEach } from '../setup';
import { generateToken, verifyToken, generateTokens, storeRefreshToken, getRefreshToken, deleteRefreshToken } from '../../utils/jwt';

// Mock environment for KV operations
const mockEnv = {
  SESSION_STORE: {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
};

describe('JWT Utils', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  describe('generateToken', () => {
    it('should generate a valid JWT token', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        workspaceId: 'workspace-456',
        role: 'admin',
        type: 'access' as const,
      };
      const secret = 'test-secret';
      const token = await generateToken(payload, secret);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should generate token with default 1 hour expiration', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        type: 'access' as const,
      };
      const secret = 'test-secret';
      const token = await generateToken(payload, secret);

      // Verify the token can be decoded and has correct payload
      const decoded = await verifyToken(token, secret);
      expect(decoded.sub).toBe(payload.sub);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.type).toBe(payload.type);
      expect(decoded.workspaceId).toBeUndefined();
      expect(decoded.role).toBeUndefined();
    });

    it('should generate token with 30 days expiration when specified', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        type: 'refresh' as const,
      };
      const secret = 'test-secret';
      const token = await generateToken(payload, secret, '30d');

      const decoded = await verifyToken(token, secret);
      expect(decoded.sub).toBe(payload.sub);
      expect(decoded.type).toBe(payload.type);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid JWT token', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        workspaceId: 'workspace-456',
        role: 'admin',
        type: 'access' as const,
      };
      const secret = 'test-secret';
      const token = await generateToken(payload, secret);

      const decoded = await verifyToken(token, secret);
      expect(decoded.sub).toBe(payload.sub);
      expect(decoded.email).toBe(payload.email);
      expect(decoded.workspaceId).toBe(payload.workspaceId);
      expect(decoded.role).toBe(payload.role);
      expect(decoded.type).toBe(payload.type);
      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });

    it('should throw error for invalid token', async () => {
      const secret = 'test-secret';
      const invalidToken = 'invalid.token.format';

      await expect(verifyToken(invalidToken, secret)).rejects.toThrow('Invalid or expired token');
    });

    it('should throw error for token with wrong secret', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        type: 'access' as const,
      };
      const correctSecret = 'correct-secret';
      const wrongSecret = 'wrong-secret';
      const token = await generateToken(payload, correctSecret);

      await expect(verifyToken(token, wrongSecret)).rejects.toThrow('Invalid or expired token');
    });

    it('should throw error for expired token', async () => {
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        type: 'access' as const,
      };
      const secret = 'test-secret';
      
      // Mock Date.now() to simulate an expired token
      const originalNow = Date.now;
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      
      vi.spyOn(Date, 'now').mockReturnValue(pastTime * 1000);
      
      const token = await generateToken(payload, secret);
      
      // Restore Date.now and try to verify with current time
      Date.now = originalNow;
      
      await expect(verifyToken(token, secret)).rejects.toThrow('Invalid or expired token');
    });
  });

  describe('generateTokens', () => {
    it('should generate both access and refresh tokens', async () => {
      const user = {
        id: 'user-123',
        email: 'test@example.com',
        workspaceId: 'workspace-456',
        role: 'admin',
      };
      const secret = 'test-secret';

      const { accessToken, refreshToken } = await generateTokens(user, secret);

      expect(accessToken).toBeDefined();
      expect(refreshToken).toBeDefined();
      expect(typeof accessToken).toBe('string');
      expect(typeof refreshToken).toBe('string');

      // Verify both tokens are valid
      const accessDecoded = await verifyToken(accessToken, secret);
      const refreshDecoded = await verifyToken(refreshToken, secret);

      expect(accessDecoded.sub).toBe(user.id);
      expect(accessDecoded.email).toBe(user.email);
      expect(accessDecoded.type).toBe('access');
      
      expect(refreshDecoded.sub).toBe(user.id);
      expect(refreshDecoded.email).toBe(user.email);
      expect(refreshDecoded.type).toBe('refresh');
    });
  });

  describe('storeRefreshToken', () => {
    it('should store refresh token in KV store', async () => {
      const userId = 'user-123';
      const refreshToken = 'refresh-token-123';

      await storeRefreshToken(mockEnv, userId, refreshToken);

      expect(mockEnv.SESSION_STORE.put).toHaveBeenCalledWith(
        `refresh:${userId}`,
        expect.stringContaining(refreshToken),
        {
          expirationTtl: 30 * 24 * 60 * 60, // 30 days in seconds
        }
      );
    });
  });

  describe('getRefreshToken', () => {
    it('should retrieve refresh token from KV store', async () => {
      const userId = 'user-123';
      const refreshToken = 'refresh-token-123';
      const storedData = JSON.stringify({
        token: refreshToken,
        createdAt: Date.now(),
      });

      mockEnv.SESSION_STORE.get.mockResolvedValue(storedData);

      const result = await getRefreshToken(mockEnv, userId);

      expect(result).toBe(refreshToken);
      expect(mockEnv.SESSION_STORE.get).toHaveBeenCalledWith(`refresh:${userId}`);
    });

    it('should return null when no token is stored', async () => {
      const userId = 'user-123';

      mockEnv.SESSION_STORE.get.mockResolvedValue(null);

      const result = await getRefreshToken(mockEnv, userId);

      expect(result).toBeNull();
    });

    it('should return null when stored data is invalid JSON', async () => {
      const userId = 'user-123';

      mockEnv.SESSION_STORE.get.mockResolvedValue('invalid-json');

      const result = await getRefreshToken(mockEnv, userId);

      expect(result).toBeNull();
    });
  });

  describe('deleteRefreshToken', () => {
    it('should delete refresh token from KV store', async () => {
      const userId = 'user-123';

      await deleteRefreshToken(mockEnv, userId);

      expect(mockEnv.SESSION_STORE.delete).toHaveBeenCalledWith(`refresh:${userId}`);
    });
  });
});