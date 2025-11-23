# FormWeaver KV Cache Optimization Plan

Based on analysis of the current implementation and Cloudflare Workers KV best practices, this document provides comprehensive optimization strategies for all 5 KV namespaces.

## Current State Analysis

### Existing KV Namespaces

1. **FORM_CACHE**: Forms data (10-minute TTL)
2. **ANALYTICS_CACHE**: Analytics data (1-hour TTL)
3. **SESSION_STORE**: Refresh tokens (30-day TTL)
4. **EMAIL_TOKENS**: Email verification/reset tokens (1-24 hour TTLs)
5. **RATE_LIMIT**: Rate limiting counters (dynamic TTL)

### Current Cache Patterns

- **Cache-Aside Pattern**: Used for forms and analytics
- **TTL-based Expiration**: Manual expiration management
- **Individual Key Operations**: Single get/put operations
- **Basic Cache Invalidation**: Manual deletion on updates

## Optimization Strategies

### 1. TTL Strategy Optimizations

#### FORM_CACHE Optimization

```typescript
// Current: 10 minutes fixed
expirationTtl: 600

// Optimized: Dynamic TTL based on form status and usage
const getFormCacheTTL = (form: FormData): number => {
  if (form.status === 'published' && form.isPopular) {
    return 1800; // 30 minutes for popular published forms
  }
  if (form.status === 'published') {
    return 900; // 15 minutes for regular published forms
  }
  if (form.status === 'draft') {
    return 300; // 5 minutes for draft forms (frequent changes)
  }
  return 600; // 10 minutes default
};
```

#### ANALYTICS_CACHE Optimization

```typescript
// Current: 1 hour fixed for all analytics
expirationTtl: 3600

// Optimized: Tiered TTL based on data type and recency
const getAnalyticsCacheTTL = (dataType: string, dateRange: DateRange): number => {
  // Real-time metrics (last 24h): 5 minutes
  if (dateRange.to && Date.now() - dateRange.to < 86400000) {
    return 300;
  }
  // Recent analytics (last 7 days): 15 minutes  
  if (dateRange.to && Date.now() - dateRange.to < 604800000) {
    return 900;
  }
  // Historical data: 1 hour
  return 3600;
};
```

#### SESSION_STORE Optimization

```typescript
// Current: 30 days fixed
expirationTtl: 2592000

// Optimized: Sliding expiration with activity tracking
const getSessionTTL = (lastActivity: number): number => {
  const daysSinceActivity = (Date.now() - lastActivity) / 86400000;
  if (daysSinceActivity < 7) return 2592000; // 30 days
  if (daysSinceActivity < 14) return 1296000; // 15 days
  return 604800; // 7 days for inactive sessions
};
```

### 2. Enhanced Cache Invalidation Patterns

#### Smart Cache Invalidation Strategy

```typescript
interface CacheInvalidationStrategy {
  immediate?: string[]; // Keys to invalidate immediately
  delayed?: { keys: string[]; delay: number }; // Keys to invalidate after delay
  batch?: string[]; // Keys to invalidate in batch operations
}

// Example implementation for form updates
const handleFormUpdate = async (
  formId: string, 
  updateType: 'schema' | 'status' | 'settings',
  env: Env
): Promise<void> => {
  const strategies: Record<string, CacheInvalidationStrategy> = {
    schema: {
      immediate: [`form:${formId}`],
      delayed: { 
        keys: [`analytics:${formId}:*`], 
        delay: 5000 // 5 seconds
      },
      batch: [`workspace-analytics:*`] // All workspace analytics
    },
    status: {
      immediate: [`form:${formId}`],
      delayed: { keys: [`analytics:${formId}:*`], delay: 2000 }
    },
    settings: {
      immediate: [`form:${formId}`]
    }
  };

  const strategy = strategies[updateType];
  
  // Immediate invalidation
  if (strategy.immediate?.length) {
    await env.FORM_CACHE.delete(strategy.immediate);
  }
  
  // Batch invalidation for workspace analytics
  if (strategy.batch?.length) {
    await invalidateWorkspaceAnalytics(env, strategy.batch);
  }
  
  // Delayed invalidation (prevents immediate cache misses during high traffic)
  if (strategy.delayed) {
    setTimeout(async () => {
      await invalidateAnalyticsKeys(env, strategy.delayed!.keys);
    }, strategy.delayed.delay);
  }
};
```

#### Cache Warming Strategy

```typescript
// Pre-warm cache after form updates
const warmFormCache = async (formId: string, env: Env): Promise<void> => {
  try {
    // Fetch fresh data
    const freshForm = await fetchFormFromDatabase(formId);
    
    // Pre-populate cache with optimized TTL
    const cacheKey = `form:${formId}`;
    const ttl = getFormCacheTTL(freshForm);
    
    await env.FORM_CACHE.put(cacheKey, JSON.stringify(freshForm), {
      expirationTtl: ttl
    });
    
    console.log(`[Cache Warming] Warmed cache for form ${formId} with ${ttl}s TTL`);
  } catch (error) {
    console.error(`[Cache Warming] Failed to warm cache for form ${formId}:`, error);
  }
};
```

### 3. Data Structure Optimizations

#### Key Coalescing for Related Data

```typescript
// Instead of separate keys for form metadata
// form:123:config, form:123:settings, form:123:version

// Use single composite key
const storeFormMetadata = async (formId: string, metadata: FormMetadata, env: Env): Promise<void> => {
  const compositeKey = `form-metadata:${formId}`;
  const compositeData = {
    config: metadata.config,
    settings: metadata.settings,
    version: metadata.version,
    lastUpdated: Date.now()
  };
  
  await env.FORM_CACHE.put(compositeKey, JSON.stringify(compositeData), {
    expirationTtl: 1800 // 30 minutes
  });
};

// Bulk retrieval
const getFormMetadata = async (formId: string, env: Env): Promise<FormMetadata> => {
  const compositeKey = `form-metadata:${formId}`;
  const data = await env.FORM_CACHE.get(compositeKey, 'json');
  
  if (data) {
    return data;
  }
  
  // Fallback to individual keys for backward compatibility
  const [config, settings, version] = await Promise.all([
    env.FORM_CACHE.get(`form:${formId}:config`, 'json'),
    env.FORM_CACHE.get(`form:${formId}:settings`, 'json'),
    env.FORM_CACHE.get(`form:${formId}:version`, 'json')
  ]);
  
  return { config, settings, version };
};
```

#### Metadata Optimization for Small Values

```typescript
// Store frequently accessed small data in metadata
const storeUserStatus = async (userId: string, status: string, env: Env): Promise<void> => {
  // Store minimal data in metadata for fast access
  await env.SESSION_STORE.put(`user:${userId}`, '', {
    metadata: { 
      status,
      lastSeen: Date.now().toString(),
      plan: 'free' // Could be upgraded to premium
    }
  });
};

// Fast retrieval via list operations
const getUserStatus = async (userId: string, env: Env): Promise<string | null> => {
  const result = await env.SESSION_STORE.getWithMetadata(`user:${userId}`);
  return result.metadata?.status || null;
};
```

### 4. Performance & Cost Optimization

#### Bulk Operations Strategy

```typescript
// Replace multiple individual gets with bulk operations
const getMultipleForms = async (formIds: string[], env: Env): Promise<Record<string, FormData>> => {
  const keys = formIds.map(id => `form:${id}`);
  
  // Single bulk operation instead of multiple individual gets
  const results = await env.FORM_CACHE.get(keys);
  
  const forms: Record<string, FormData> = {};
  for (const [key, value] of results) {
    if (value !== null) {
      const formId = key.split(':')[1];
      forms[formId] = JSON.parse(value);
    }
  }
  
  return forms;
};

// Batch cache invalidation
const batchInvalidateCache = async (keys: string[], env: Env): Promise<void> => {
  // Process in batches of 100 (KV limit)
  for (let i = 0; i < keys.length; i += 100) {
    const batch = keys.slice(i, i + 100);
    await env.FORM_CACHE.delete(batch);
  }
};
```

#### Cache Hit Rate Optimization

```typescript
// Stale-while-revalidate pattern for critical data
const getWithStaleWhileRevalidate = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  env: Env,
  namespace: 'FORM_CACHE' | 'ANALYTICS_CACHE' = 'FORM_CACHE'
): Promise<T> => {
  const ns = env[namespace];
  
  // Try fresh cache first
  const fresh = await ns.get(key, { 
    cacheTtl: 300 // Override default cache TTL
  });
  
  if (fresh !== null) {
    return JSON.parse(fresh);
  }
  
  // Try stale cache (no cacheTtl override)
  const stale = await ns.get(key, 'json');
  if (stale !== null) {
    // Return stale data while refreshing in background
    refreshInBackground(key, fetcher, ns);
    return stale;
  }
  
  // No cache available, fetch fresh
  return await fetcher();
};

const refreshInBackground = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  ns: KVNamespace
): Promise<void> => {
  try {
    const freshData = await fetcher();
    await ns.put(key, JSON.stringify(freshData), {
      expirationTtl: 3600 // 1 hour
    });
  } catch (error) {
    console.error(`[Background Refresh] Failed to refresh ${key}:`, error);
  }
};
```

### 5. Enhanced Error Handling & Fallbacks

#### Graceful KV Failure Handling

```typescript
interface CacheResult<T> {
  data: T | null;
  fromCache: boolean;
  error?: Error;
}

const robustCacheGet = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  env: Env,
  options: {
    namespace: keyof Pick<Env, 'FORM_CACHE' | 'ANALYTICS_CACHE'>;
    fallbackToDatabase?: boolean;
    retryCount?: number;
  } = { namespace: 'FORM_CACHE', fallbackToDatabase: true, retryCount: 2 }
): Promise<CacheResult<T>> => {
  const { namespace, fallbackToDatabase, retryCount } = options;
  const ns = env[namespace];
  
  try {
    // Try cache first
    const cached = await ns.get(key, 'json');
    if (cached !== null) {
      return { data: cached, fromCache: true };
    }
  } catch (cacheError) {
    console.warn(`[KV Cache Error] Failed to get ${key} from ${namespace}:`, cacheError);
    
    // Retry logic for transient errors
    if (retryCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
      return robustCacheGet(key, fetcher, env, {
        ...options,
        retryCount: retryCount - 1
      });
    }
  }
  
  try {
    // Cache miss or error - fetch from origin
    const freshData = await fetcher();
    
    // Try to update cache (non-blocking)
    if (freshData) {
      ns.put(key, JSON.stringify(freshData), {
        expirationTtl: 600 // 10 minutes default
      }).catch(error => {
        console.warn(`[KV Cache Warning] Failed to cache ${key}:`, error);
      });
    }
    
    return { data: freshData, fromCache: false };
  } catch (originError) {
    console.error(`[Origin Error] Failed to fetch ${key} from origin:`, originError);
    
    if (fallbackToDatabase) {
      // Last resort: try direct database access
      return { data: null, fromCache: false, error: originError };
    }
    
    throw originError;
  }
};
```

### 6. Monitoring & Metrics

#### Cache Performance Tracking

```typescript
interface CacheMetrics {
  hits: number;
  misses: number;
  errors: number;
  averageResponseTime: number;
  costOperations: number;
}

class CacheMonitor {
  private metrics: Map<string, CacheMetrics> = new Map();
  private startTime: Map<string, number> = new Map();
  
  startOperation(key: string, namespace: string): void {
    const operationId = `${namespace}:${key}:${Date.now()}`;
    this.startTime.set(operationId, Date.now());
  }
  
  recordHit(key: string, namespace: string): void {
    this.updateMetrics(namespace, { hits: 1 });
  }
  
  recordMiss(key: string, namespace: string): void {
    this.updateMetrics(namespace, { misses: 1 });
  }
  
  recordError(key: string, namespace: string): void {
    this.updateMetrics(namespace, { errors: 1 });
  }
  
  private updateMetrics(namespace: string, updates: Partial<CacheMetrics>): void {
    const current = this.metrics.get(namespace) || {
      hits: 0, misses: 0, errors: 0, averageResponseTime: 0, costOperations: 0
    };
    
    this.metrics.set(namespace, { ...current, ...updates });
  }
  
  getMetrics(): Record<string, CacheMetrics> {
    return Object.fromEntries(this.metrics);
  }
  
  getHitRate(namespace: string): number {
    const metrics = this.metrics.get(namespace);
    if (!metrics || (metrics.hits + metrics.misses === 0)) return 0;
    
    return metrics.hits / (metrics.hits + metrics.misses);
  }
}

// Usage in cache operations
const monitor = new CacheMonitor();

const monitoredCacheGet = async <T>(
  key: string,
  fetcher: () => Promise<T>,
  env: Env,
  namespace: string
): Promise<T> => {
  monitor.startOperation(key, namespace);
  
  try {
    const result = await env[namespace as keyof Env].get(key, 'json');
    if (result !== null) {
      monitor.recordHit(key, namespace);
      return result;
    }
    monitor.recordMiss(key, namespace);
    
    const freshData = await fetcher();
    return freshData;
  } catch (error) {
    monitor.recordError(key, namespace);
    throw error;
  }
};
```

### 7. Implementation Roadmap

#### Phase 1: TTL Optimizations (Week 1)

- [ ] Implement dynamic TTL calculation functions
- [ ] Update FORM_CACHE with usage-based TTLs
- [ ] Optimize ANALYTICS_CACHE TTLs by data type
- [ ] Add sliding expiration for SESSION_STORE

#### Phase 2: Cache Invalidation Improvements (Week 2)

- [ ] Implement smart cache invalidation strategies
- [ ] Add cache warming after form updates
- [ ] Create delayed invalidation for high-traffic scenarios
- [ ] Implement batch invalidation operations

#### Phase 3: Data Structure Optimizations (Week 3)

- [ ] Implement key coalescing for related form data
- [ ] Add metadata optimization for small values
- [ ] Create composite keys for frequently accessed data
- [ ] Add backward compatibility layer

#### Phase 4: Performance & Monitoring (Week 4)

- [ ] Implement bulk operations for multiple keys
- [ ] Add stale-while-revalidate pattern
- [ ] Create comprehensive cache monitoring
- [ ] Add cost tracking and optimization alerts

#### Phase 5: Error Handling & Resilience (Week 5)

- [ ] Implement robust error handling with retries
- [ ] Add graceful degradation strategies
- [ ] Create fallback mechanisms for KV failures
- [ ] Add comprehensive logging and alerting

### 8. Expected Benefits

#### Performance Improvements

- **Cache Hit Rate**: Increase from ~70% to 85%+
- **Response Time**: Reduce average response time by 30-50%
- **Database Load**: Decrease database queries by 60-80%

#### Cost Optimizations

- **KV Operations**: Reduce operations by 40-60% through bulk operations
- **Compute Time**: Reduce Worker execution time by 20-30%
- **Error Handling**: Minimize failed operations and retries

#### Reliability Enhancements

- **Graceful Degradation**: Maintain functionality during KV issues
- **Monitoring**: Proactive issue detection and resolution
- **Consistency**: Improved cache invalidation reduces stale data

### 9. Migration Strategy

#### Backward Compatibility

```typescript
// Maintain compatibility during transition
const getFormData = async (formId: string, env: Env): Promise<FormData> => {
  // Try new composite key first
  const compositeKey = `form-data:${formId}`;
  let data = await env.FORM_CACHE.get(compositeKey, 'json');
  
  if (data) {
    return data;
  }
  
  // Fallback to old single key
  const oldKey = `form:${formId}`;
  data = await env.FORM_CACHE.get(oldKey, 'json');
  
  if (data) {
    // Migrate to new format
    await migrateToCompositeKey(formId, data, env);
    return data;
  }
  
  // Fetch from database if no cache available
  return await fetchAndCacheForm(formId, env);
};
```

#### Gradual Rollout

1. **Canary Deployment**: Deploy to 10% of traffic
2. **Monitor Metrics**: Track performance and error rates
3. **Gradual Increase**: Ramp to 100% over 2 weeks
4. **Rollback Plan**: Quick rollback capability if issues arise

This optimization plan leverages Workers KV strengths while addressing current limitations, resulting in significant performance and cost improvements for FormWeaver.
