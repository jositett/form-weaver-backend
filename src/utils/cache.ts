/**
 * Cache utilities for setting appropriate cache headers
 */

import { Context } from 'hono';

export interface CacheConfig {
  maxAge?: number; // Cache-Control max-age in seconds
  sMaxAge?: number; // Cache-Control s-maxage in seconds (CDN cache)
  staleWhileRevalidate?: number; // stale-while-revalidate in seconds
  mustRevalidate?: boolean; // Cache-Control must-revalidate
  noCache?: boolean; // Cache-Control no-cache
  noStore?: boolean; // Cache-Control no-store
  public?: boolean; // Cache-Control public/private
}

/**
 * Set cache headers on response
 */
export function setCacheHeaders(c: Context, config: CacheConfig): void {
  const cacheDirectives: string[] = [];

  if (config.noStore) {
    cacheDirectives.push('no-store');
  } else if (config.noCache) {
    cacheDirectives.push('no-cache');
  } else {
    // Set visibility
    if (config.public !== false) {
      cacheDirectives.push('public');
    } else {
      cacheDirectives.push('private');
    }

    // Set max-age
    if (config.maxAge !== undefined) {
      cacheDirectives.push(`max-age=${config.maxAge}`);
    }

    // Set s-maxage for CDN
    if (config.sMaxAge !== undefined) {
      cacheDirectives.push(`s-maxage=${config.sMaxAge}`);
    }

    // Set stale-while-revalidate
    if (config.staleWhileRevalidate !== undefined) {
      cacheDirectives.push(`stale-while-revalidate=${config.staleWhileRevalidate}`);
    }

    // Set must-revalidate
    if (config.mustRevalidate) {
      cacheDirectives.push('must-revalidate');
    }
  }

  if (cacheDirectives.length > 0) {
    c.header('Cache-Control', cacheDirectives.join(', '));
  }

  // Set ETag for better caching
  if (!config.noStore && !config.noCache) {
    const etag = generateETag(c.req.url);
    c.header('ETag', etag);
  }
}

/**
 * Generate ETag based on URL and timestamp
 */
function generateETag(url: string): string {
  const hash = simpleHash(url + Date.now().toString());
  return `"${hash}"`;
}

/**
 * Simple hash function for ETag generation
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Predefined cache configurations
 */
export const CACHE_CONFIGS = {
  // Public forms - cache for 5 minutes, CDN for 1 hour
  PUBLIC_FORM: {
    maxAge: 300, // 5 minutes
    sMaxAge: 3600, // 1 hour
    staleWhileRevalidate: 600, // 10 minutes
    public: true,
  } as CacheConfig,

  // Analytics data - cache for 10 minutes, CDN for 30 minutes
  ANALYTICS: {
    maxAge: 600, // 10 minutes
    sMaxAge: 1800, // 30 minutes
    staleWhileRevalidate: 300, // 5 minutes
    public: false,
  } as CacheConfig,

  // Static assets - cache for 1 day, CDN for 1 week
  STATIC_ASSETS: {
    maxAge: 86400, // 1 day
    sMaxAge: 604800, // 1 week
    public: true,
  } as CacheConfig,

  // API responses - no cache by default
  API_NO_CACHE: {
    noCache: true,
    mustRevalidate: true,
  } as CacheConfig,

  // Sensitive data - no store
  SENSITIVE: {
    noStore: true,
    public: false,
  } as CacheConfig,
};