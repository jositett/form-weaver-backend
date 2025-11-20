import type { Env } from '../types';

/**
 * Returns the D1 database instance from the environment bindings.
 * @param env The Hono environment bindings.
 * @returns The D1 database instance.
 */
export function getDb(env: Env): D1Database {
  return env.DB;
}