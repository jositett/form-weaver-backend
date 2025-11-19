import { SignJWT, jwtVerify } from 'jose';

export interface JWTPayload {
  sub: string; // userId
  email: string;
  workspaceId?: string;
  role?: string;
  type: 'access' | 'refresh';
  iat?: number;
  exp?: number;
}

/**
 * Generate a JWT token
 */
export const generateToken = async (
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
  expiresIn: string = '1h'
): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const expirationTime = expiresIn === '30d'
    ? now + (30 * 24 * 60 * 60) // 30 days
    : now + (1 * 60 * 60); // 1 hour

  const jwt = await new SignJWT({
    sub: payload.sub,
    email: payload.email,
    workspaceId: payload.workspaceId,
    role: payload.role,
    type: payload.type,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(expirationTime)
    .sign(new TextEncoder().encode(secret));

  return jwt;
};

/**
 * Verify and decode a JWT token
 */
export const verifyToken = async (
  token: string,
  secret: string
): Promise<JWTPayload> => {
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(secret)
    );

    return {
      sub: payload.sub as string,
      email: payload.email as string,
      workspaceId: payload.workspaceId as string | undefined,
      role: payload.role as string | undefined,
      type: payload.type as 'access' | 'refresh',
      iat: payload.iat,
      exp: payload.exp,
    };
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

/**
 * Generate both access and refresh tokens
 */
export const generateTokens = async (
  user: {
    id: string;
    email: string;
    workspaceId?: string;
    role?: string;
  },
  secret: string
): Promise<{
  accessToken: string;
  refreshToken: string;
}> => {
  const [accessToken, refreshToken] = await Promise.all([
    generateToken({
      sub: user.id,
      email: user.email,
      workspaceId: user.workspaceId,
      role: user.role,
      type: 'access',
    }, secret, '1h'),
    generateToken({
      sub: user.id,
      email: user.email,
      workspaceId: user.workspaceId,
      role: user.role,
      type: 'refresh',
    }, secret, '30d'),
  ]);

  return { accessToken, refreshToken };
};

/**
 * Store refresh token in KV store
 */
export const storeRefreshToken = async (
  env: any,
  userId: string,
  refreshToken: string
): Promise<void> => {
  // Store refresh token with user ID as key, make it expire in 30 days
  await env.SESSION_STORE.put(
    `refresh:${userId}`,
    JSON.stringify({
      token: refreshToken,
      createdAt: Date.now(),
    }),
    {
      expirationTtl: 30 * 24 * 60 * 60, // 30 days in seconds
    }
  );
};

/**
 * Get refresh token from KV store
 */
export const getRefreshToken = async (
  env: any,
  userId: string
): Promise<string | null> => {
  try {
    const stored = await env.SESSION_STORE.get(`refresh:${userId}`);
    if (!stored) return null;

    const data = JSON.parse(stored);
    return data.token;
  } catch (error) {
    return null;
  }
};

/**
 * Delete refresh token from KV store
 */
export const deleteRefreshToken = async (
  env: any,
  userId: string
): Promise<void> => {
  await env.SESSION_STORE.delete(`refresh:${userId}`);
};
