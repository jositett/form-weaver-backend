# Backend Development Rules & Standards - Marketplace Edition

**Project:** FormWeaver Backend (Cloudflare Workers + Hono)  
**Focus:** Template Marketplace Backend Infrastructure  
**Last Updated:** 2025-11-23  
**Enforcement:** All PRs must pass these checks

---

## 1. Code Style & Formatting

### 1.1 TypeScript Standards

```typescript
// ✅ GOOD: Explicit types, interfaces for objects
interface FormField {
  id: string;
  type: FieldType;
  label: string;
}

const createField = (config: Partial<FormField>): FormField => {
  return { ...defaultField, ...config };
};

// ❌ BAD: Implicit any, unclear types
const createField = (config) => {
  return { ...defaultField, ...config };
};
```

**Rules:**

- **No implicit `any`** - Enable `strict` mode in tsconfig
- **Prefer `interface` over `type`** for object shapes
- **Use `const` by default**, `let` only when reassigning
- **Avoid `enum`** - Use string union types instead
- **Export types** from dedicated `types/` folder
- **Marketplace-specific types** must include creatorId and pricing info

### 1.2 Hono API Route Structure (Backend)

```typescript
// ✅ GOOD: Typed routes with middleware
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const marketplace = new Hono<{ Bindings: Env }>();

const createTemplateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  price: z.number().min(0).max(999),
  category: z.enum(['healthcare', 'business', 'education', 'events']),
  complexity: z.enum(['basic', 'standard', 'premium', 'enterprise']),
  schema: z.any(), // Form schema validation
  retentionSettings: z.object({
    legalBasis: z.enum(['consent', 'contract', 'legal_obligation', 'legitimate_interest']),
    retentionDays: z.number().min(7).max(2555),
    autoDelete: z.boolean(),
    industry: z.enum(['general', 'healthcare', 'financial']).optional()
  })
});

marketplace.post(
  '/',
  zValidator('json', createTemplateSchema),
  async (c) => {
    const { name, description, price, category, complexity, schema, retentionSettings } = c.req.valid('json');
    const userId = c.get('userId'); // From auth middleware
    
    // Implementation
    return c.json({ id: 'template_123' }, 201);
  }
);

export default marketplace;
```

**Rules:**

- **Group routes by resource** - Separate Hono apps for `/marketplace`, `/creators`, `/commissions`, etc.
- **Use zod-validator** - Validate all input with Zod
- **Type context** - Extend Hono context with custom variables (must use `Env` from [`backend/src/types/Env.ts`](../src/types/Env.ts))
- **Return typed responses** - Use `c.json<ResponseType>(data)`
- **HTTP status codes** - Use correct codes (201 for created, 204 for no content)
- **Marketplace endpoints require authentication** - All marketplace APIs need JWT tokens
- **Creator endpoints require Pro subscription** - Verify active subscription before allowing access

### 1.3 File Naming

```bash
Backend (backend/):
  routes/
    auth.ts                  # camelCase for route files
    marketplace.ts           # Template marketplace routes
    creators.ts              # Creator management routes
    commissions.ts           # Commission & payout routes
    compliance.ts            # Legal compliance routes
    forms.ts                 # Form CRUD routes
    submissions.ts           # Submission routes

  middleware/
    auth.ts                  # camelCase for middleware
    cors.ts
    rateLimiter.ts
    creatorGuard.ts          # Creator permission checks

  services/
    marketplace.ts           # Business logic services
    creatorService.ts        # Creator onboarding & management
    commissionService.ts     # Revenue sharing calculations
    complianceService.ts     # Data retention & deletion
    emailService.ts          # Email notifications

  objects/                   # Durable Objects
    TemplateSales.ts         # Sales tracking & analytics
    ComplianceEngine.ts      # Automated data deletion
    PayoutProcessor.ts       # Stripe Connect integration

  db/
    schema.sql               # snake_case for SQL files
    migrations/
      001_initial.sql
      002_add_creator_tables.sql
      003_add_marketplace_tables.sql

  utils/
    jwt.ts                   # camelCase for utilities
    validation.ts
    retention.ts             # Data retention calculations
    commissionCalculator.ts  # Commission calculation helpers
```

---

## 2. Architecture Patterns

### 2.1 Backend Project Structure

```
backend/
├── src/
│   ├── index.ts              # Main Hono app entry
│   ├── routes/               # API route handlers
│   │   ├── auth.ts          # Authentication routes
│   │   ├── forms.ts         # Form CRUD routes
│   │   ├── marketplace.ts   # Template marketplace routes
│   │   ├── creators.ts      # Creator management routes
│   │   ├── commissions.ts   # Commission & payout routes
│   │   ├── compliance.ts    # Data retention & compliance routes
│   │   └── submissions.ts   # Submission routes
│   ├── middleware/           # Hono middleware
│   │   ├── auth.ts          # JWT authentication
│   │   ├── cors.ts          # CORS configuration
│   │   ├── rateLimiter.ts   # Rate limiting
│   │   └── creatorGuard.ts  # Creator permission checks
│   ├── services/             # Business logic services
│   │   ├── marketplace.ts   # Template marketplace logic
│   │   ├── creatorService.ts # Creator onboarding & management
│   │   ├── commissionService.ts # Revenue sharing calculations
│   │   ├── complianceService.ts # Data retention & deletion
│   │   └── emailService.ts  # Email notifications
│   ├── objects/              # Durable Objects
│   │   ├── TemplateSales.ts # Sales tracking & analytics
│   │   ├── ComplianceEngine.ts # Automated data deletion
│   │   └── PayoutProcessor.ts # Stripe Connect integration
│   ├── db/                   # Database
│   │   ├── schema.sql       # Database schema
│   │   ├── migrations/      # Migration files
│   │   └── queries.ts       # Prepared statements
│   ├── types/                # TypeScript types
│   │   ├── marketplace.ts   # Marketplace-specific types
│   │   ├── creator.ts       # Creator management types
│   │   ├── compliance.ts    # Compliance types
│   │   ├── commission.ts    # Commission calculation types
│   │   └── index.ts         # Shared types
│   └── utils/                # Utility functions
│       ├── jwt.ts           # JWT helpers
│       ├── validation.ts    # Zod schemas
│       └── retention.ts     # Data retention calculations
├── wrangler.toml             # Cloudflare configuration
├── tsconfig.json             # TypeScript configuration
└── package.json              # Dependencies
```

### 2.2 State Management Rules

**Backend State Management:**

```typescript
// ✅ GOOD: Durable Objects for strong consistency
class TemplateSales {
  async recordSale(templateId: string, buyerId: string, amount: number) {
    const sale = {
      templateId, buyerId, amount,
      creatorEarnings: amount * 0.73,
      platformFee: amount * 0.27,
      timestamp: Date.now()
    };
    await this.ctx.storage.put(`sale:${Date.now()}:${buyerId}`, sale);
  }
  
  async getSalesAnalytics(templateId: string): Promise<SalesAnalytics> {
    const sales = await this.ctx.storage.list({ prefix: `sale:${templateId}` });
    return {
      totalSales: sales.length,
      totalRevenue: sales.reduce((sum, sale) => sum + sale.amount, 0),
      avgSalePrice: sales.length > 0 ? totalRevenue / sales.length : 0
    };
  }
}
```

**When to use each:**

- **Durable Objects** - Real-time sales tracking, compliance engine, payout processing
- **KV Storage** - Template caching, session storage, rate limiting
- **D1 Database** - Persistent data (users, forms, submissions, analytics)
- **R2 Storage** - File uploads and template assets

### 2.3 Data Fetching

**Backend (D1 Queries):**

```typescript
// ✅ GOOD: Prepared statements with D1
const getFormById = async (db: D1Database | D1Database, formId: string) => { // Use getDb(env)
  const stmt = db.prepare(
    'SELECT * FROM forms WHERE id = ? AND deleted_at IS NULL'
  );
  return await stmt.bind(formId).first<Form>();
};

// ❌ BAD: String interpolation (SQL injection risk)
const query = `SELECT * FROM forms WHERE id = '${formId}'`; // NEVER DO THIS
```

**Rules:**

- **Use D1 prepared statements** for all database queries
- **All D1 access** must be done via the `getDb(env: Env)` utility function from [`backend/src/db/db.ts`](src/db/db.ts).
- **Workspace isolation** - Always filter by workspace_id for multi-tenant security
- **Commission calculations** must be precise to cents
- **Template pricing** validation required for all price inputs
- **Creator tier validation** before allowing marketplace access

---

## 3. Security Rules (CRITICAL)

### 3.1 Authentication & Authorization (Cloudflare Workers)

**JWT Token Management:**

```typescript
// ✅ GOOD: Verify JWT with Workers
import { verify } from '@tsndr/cloudflare-worker-jwt';

const authMiddleware = async (c: Context, next: Next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  
  if (!token) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const payload = await verify(token, c.env.JWT_SECRET);
    c.set('userId', payload.sub);
    c.set('workspaceId', payload.workspaceId);
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
};

// ❌ BAD: Trusting client-side data
const userId = c.req.query('userId'); // NEVER DO THIS
```

**D1 Row-Level Security:**

```sql
-- ✅ GOOD: Check permissions in queries
SELECT * FROM forms 
WHERE id = ? 
AND workspace_id IN (
  SELECT workspace_id 
  FROM workspace_members 
  WHERE user_id = ?
);

-- ❌ BAD: No permission checks
SELECT * FROM forms WHERE id = ?; -- Anyone can access any form
```

**Creator Permission Levels:**

```typescript
// ✅ GOOD: Creator tier validation
const creatorAuthMiddleware = async (c: Context, next: Next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  
  const payload = await verify(token, c.env.JWT_SECRET);
  
  // Check if user has active Pro subscription
  const user = await getUser(c.env.DB, payload.sub);
  if (!user.subscription || user.subscription.tier !== 'pro') {
    return c.json({ error: 'Pro subscription required' }, 403);
  }
  
  // Check creator onboarding completed
  if (!user.creatorOnboardingComplete) {
    return c.json({ error: 'Complete creator onboarding first' }, 403);
  }
  
  c.set('userId', payload.sub);
  c.set('creatorTier', user.subscription.tier);
  await next();
};
```

**CRITICAL RULES:**

- **NEVER trust client headers** - Always verify JWT signature
- **Always check workspace membership** before allowing access
- **Use prepared statements** - Prevent SQL injection
- **Hash passwords with bcrypt** - Never store plaintext
- **Use KV for session tokens** - Set appropriate TTLs
- **Rate limit all endpoints** - Use Cloudflare Rate Limiting API
- **Marketplace endpoints require JWT authentication**
- **Creator endpoints require active Pro subscription**
- **Template purchases require valid payment method**
- **Compliance operations require elevated permissions**

### 3.2 Input Validation (Zod)

```typescript
// ✅ GOOD: Marketplace-specific Zod schemas
const templateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  price: z.number().min(0).max(999),
  category: z.enum(['healthcare', 'business', 'education', 'events']),
  complexity: z.enum(['basic', 'standard', 'premium', 'enterprise']),
  schema: z.any(), // Form schema validation
  retentionSettings: z.object({
    legalBasis: z.enum(['consent', 'contract', 'legal_obligation', 'legitimate_interest']),
    retentionDays: z.number().min(7).max(2555),
    autoDelete: z.boolean(),
    industry: z.enum(['general', 'healthcare', 'financial']).optional()
  }),
  tags: z.array(z.string()).max(10)
});

// Backend validation
marketplace.post('/', zValidator('json', templateSchema), async (c) => {
  const data = c.req.valid('json'); // Already validated
  // ... save to D1
});
```

**Rules:**

- **Share Zod schemas** between frontend and backend (`/shared/types`)
- **Validate ALL inputs** on both client and server
- **Template pricing validation** - Ensure prices are within acceptable ranges
- **Creator onboarding validation** - Validate all required fields
- **Compliance settings validation** - Ensure legal compliance parameters
- **Commission calculations validation** - Verify financial accuracy

### 3.3 Marketplace-Specific Security

```typescript
// ✅ GOOD: Commission calculation security
function calculateCommission(saleAmount: number, creatorTier: CreatorTier, templateCategory: string) {
  const baseRates = {
    'basic': 0.50,
    'verified': 0.55,
    'elite': 0.65,
    'pro': 0.73
  };
  
  const categoryMultipliers = {
    'healthcare': 1.0,
    'financial': 1.0,
    'general': 1.0,
    'premium': 1.05 // 5% bonus for premium categories
  };
  
  const baseRate = baseRates[creatorTier];
  const multiplier = categoryMultipliers[templateCategory] || 1.0;
  const adjustedRate = Math.min(baseRate * multiplier, 0.85); // Cap at 85%
  
  // Ensure precision to cents
  const creatorEarnings = Math.round(saleAmount * adjustedRate * 100) / 100;
  const platformFee = Math.round(saleAmount * (1 - adjustedRate) * 100) / 100;
  
  return {
    creatorEarnings,
    platformFee,
    commissionRate: adjustedRate
  };
}
```

**Marketplace Security Rules:**

- **Commission calculations must be precise** - Round to cents, never fractions
- **Price manipulation prevention** - Validate all price inputs against acceptable ranges
- **Creator tier validation** - Only allow marketplace access to verified creators
- **Template ownership verification** - Ensure only template owners can modify templates
- **Payout fraud prevention** - Validate all payout requests against sales data
- **Data retention compliance** - Enforce legal requirements for different data types

### 3.4 Rate Limiting

```typescript
// ✅ GOOD: Marketplace-specific rate limiting
const rateLimits = {
  marketplace: { requests: 100, window: 60000 },    // 100/min for browsing
  purchases: { requests: 10, window: 60000 },        // 10/min for purchases
  creatorActions: { requests: 60, window: 60000 },   // 60/min for creators
  compliance: { requests: 30, window: 60000 }        // 30/min for compliance
};

const rateLimitMiddleware = (limit: number, window: number) => {
  return async (c: Context, next: Next) => {
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const path = c.req.path;
    const key = `ratelimit:${ip}:${path}`;
    
    const count = await c.env.RATE_LIMIT.get(key);
    if (count && parseInt(count) >= limit) {
      return c.json({ error: 'Too many requests' }, 429);
    }
    
    await c.env.RATE_LIMIT.put(key, String((parseInt(count || '0') + 1)), {
      expirationTtl: Math.ceil(window / 1000),
    });
    
    await next();
  };
};
```

**Rate Limiting Rules:**

- **Marketplace browsing**: 100 requests/minute per IP
- **Template purchases**: 10 requests/minute per user
- **Creator actions**: 60 requests/minute per creator
- **Compliance operations**: 30 requests/minute per admin
- **Auth endpoints**: 5 login attempts per 15 minutes
- **Signup**: 3 attempts per hour per IP

---

## 4. Performance Optimization

### 4.1 Caching Strategy

```typescript
// ✅ GOOD: Marketplace caching
const getTemplate = async (env: Env, templateId: string) => {
  // Check KV cache first
  const cacheKey = `template:${templateId}`;
  const cached = await env.FORMWEAVER_TEMPLATES.get(cacheKey, 'json');
  if (cached) return cached;

  // Fetch from D1
  const template = await getTemplateFromDB(env.DB, templateId);
  
  // Cache for 10 minutes
  await env.FORMWEAVER_TEMPLATES.put(cacheKey, JSON.stringify(template), {
    expirationTtl: 600
  });
  
  return template;
};
```

**Caching Rules:**

- **Template listings cached** for 5 minutes in KV
- **Creator profiles cached** for 1 hour
- **Category data cached** for 24 hours
- **Sales analytics cached** for 10 minutes
- **Invalidate cache** on template updates
- **Cache headers** - Set appropriate Cache-Control headers

### 4.2 Database Optimization

```typescript
// ✅ GOOD: Optimized queries with indexes
const getTemplatesByCategory = async (env: Env, category: string, limit: number = 20, offset: number = 0) => {
  const stmt = env.DB.prepare(`
    SELECT t.*, c.name as creator_name, c.verified as creator_verified
    FROM templates t
    JOIN creators c ON t.creator_id = c.user_id
    WHERE t.category = ? AND t.published = 1
    ORDER BY t.sales_count DESC, t.created_at DESC
    LIMIT ? OFFSET ?
  `);
  return await stmt.bind(category, limit, offset).all();
};
```

**Database Rules:**

- **Add indexes** on frequently queried fields
- **Template metadata** stored in KV for faster access
- **Batch operations** for compliance processing
- **Pagination** required for all list endpoints
- **Select only needed columns** - Avoid SELECT *
- **Use cursor-based pagination** for large datasets

### 4.3 KV Storage Strategy

```typescript
// ✅ GOOD: KV organization for marketplace
const KV_STRUCTURE = {
  // Template storage
  'template:{category}:{complexity}:{version}': 'Template data',
  
  // Creator analytics
  'creator:{creatorId}:analytics': 'Creator performance metrics',
  'creator:{creatorId}:templates': 'Creator's template list',
  
  // Sales tracking
  'sales:{templateId}:daily': 'Daily sales count',
  'sales:{templateId}:total': 'Total sales count',
  
  // Compliance
  'compliance:{submissionId}:retention': 'Retention settings',
  'compliance:deletion:schedule': 'Scheduled deletions',
  
  // Caching
  'cache:templates:{category}': 'Category template listings',
  'cache:categories': 'Category metadata'
};
```

**KV Rules:**

- **Use descriptive keys** with clear namespace structure
- **Set appropriate TTL** for cached data
- **Compress large values** when possible
- **Handle cache misses** gracefully
- **Monitor KV usage** to avoid limits

---

## 5. Legal Compliance Requirements

### 5.1 Data Retention Implementation

```typescript
// ✅ GOOD: Automatic data deletion
class ComplianceEngine {
  async scheduleDeletion(submissionId: string, formData: any, retentionSettings: RetentionSettings) {
    const ttl = this.calculateTTL(retentionSettings);
    
    if (ttl === null) {
      // No auto-deletion for regulated data
      await this.createLegalHold(submissionId, retentionSettings);
      return;
    }
    
    // Store with TTL
    await this.env.FORMWEAVER_SUBMISSIONS.put(
      `submission:${submissionId}`,
      JSON.stringify(formData),
      { expirationTtl: ttl }
    );
    
    // Schedule notification
    if (retentionSettings.notifyBeforeDelete) {
      await this.scheduleDeletionNotification(submissionId, ttl);
    }
  }
  
  calculateTTL(retentionSettings: RetentionSettings): number | null {
    const { legalBasis, retentionDays, autoDelete, industry } = retentionSettings;
    
    // Cannot auto-delete regulated data
    if (!autoDelete || ['healthcare', 'financial'].includes(industry)) {
      return null;
    }
    
    // Convert days to seconds
    return retentionDays * 24 * 60 * 60;
  }
}
```

**Compliance Rules:**

- **GDPR compliance** - Right to erasure within 30 days
- **CCPA compliance** - Data portability and deletion
- **HIPAA compliance** - 6-year retention for medical data
- **SOX compliance** - 7-year retention for financial data
- **Automatic deletion** - KV TTL-based for non-regulated data
- **Legal hold system** - Suspend deletion during litigation

### 5.2 Financial Compliance

```typescript
// ✅ GOOD: Commission audit trail
const recordCommission = async (env: Env, sale: TemplateSale) => {
  const commission = calculateCommission(sale.amount, sale.creatorTier, sale.templateCategory);
  
  const commissionRecord = {
    id: `comm_${Date.now()}_${sale.buyerId}`,
    templateId: sale.templateId,
    creatorId: sale.creatorId,
    saleAmount: sale.amount,
    commissionRate: commission.commissionRate,
    creatorEarnings: commission.creatorEarnings,
    platformFee: commission.platformFee,
    currency: 'USD',
    calculatedAt: new Date().toISOString(),
    eligibleForPayoutAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // Net 30
  };
  
  // Store in D1 for audit trail
  await env.DB.prepare(`
    INSERT INTO commissions (id, template_id, creator_id, sale_amount, commission_rate, 
                           creator_earnings, platform_fee, currency, calculated_at, eligible_for_payout_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    commissionRecord.id, commissionRecord.templateId, commissionRecord.creatorId,
    commissionRecord.saleAmount, commissionRecord.commissionRate, commissionRecord.creatorEarnings,
    commissionRecord.platformFee, commissionRecord.currency, commissionRecord.calculatedAt,
    commissionRecord.eligibleForPayoutAt
  ).run();
  
  return commissionRecord;
};
```

**Financial Rules:**

- **Audit trail** for all commission calculations
- **Precise calculations** to cents for all financial operations
- **Tax documentation** preparation for creators
- **Multi-currency support** with proper conversion
- **Payout scheduling** on Net 30 terms
- **Dispute resolution** tracking

---

## 6. Testing Requirements

### 6.1 Unit Tests

```typescript
// ✅ GOOD: Marketplace unit tests
describe('Commission Calculation', () => {
  it('should calculate Pro creator commission correctly', () => {
    const result = calculateCommission(99.99, 'pro', 'healthcare');
    
    expect(result.creatorEarnings).toBe(72.99);
    expect(result.platformFee).toBe(27.00);
    expect(result.commissionRate).toBe(0.73);
  });
  
  it('should cap commission at 85%', () => {
    const result = calculateCommission(100, 'pro', 'premium');
    
    expect(result.commissionRate).toBe(0.85);
  });
});
```

**Testing Rules:**

- **100% API coverage** for all marketplace endpoints
- **Commission calculation tests** for all creator tiers
- **Compliance automation tests** for data retention
- **Security tests** for authentication and authorization
- **Performance tests** for marketplace operations
- **Integration tests** for Stripe Connect integration

### 6.2 Integration Tests

```typescript
// ✅ GOOD: Marketplace integration tests
describe('Template Purchase Flow', () => {
  it('should handle complete template purchase flow', async () => {
    // Create test template
    const template = await createTestTemplate();
    
    // Process purchase
    const purchase = await request(app)
      .post(`/api/marketplace/templates/${template.id}/purchase`)
      .set('Authorization', `Bearer ${creatorToken}`)
      .send({ useCase: 'private_practice' });
    
    expect(purchase.status).toBe(200);
    expect(purchase.body.commissionBreakdown).toBeDefined();
    expect(purchase.body.downloadUrl).toBeDefined();
  });
});
```

**Integration Rules:**

- **End-to-end marketplace flows** testing
- **Creator onboarding workflow** testing
- **Payment processing** integration testing
- **Email notification** testing
- **Compliance automation** testing

---

## 7. Deployment & Monitoring

### 7.1 Environment Configuration

```toml
# ✅ GOOD: wrangler.toml configuration
name = "formweaver-marketplace"
main = "src/index.ts"
compatibility_date = "2024-11-23"

[[kv_namespaces]]
binding = "FORMWEAVER_TEMPLATES"
id = "your-templates-namespace-id"

[[kv_namespaces]]
binding = "FORMWEAVER_SUBMISSIONS"
id = "your-submissions-namespace-id"

[[kv_namespaces]]
binding = "FORMWEAVER_COMPLIANCE"
id = "your-compliance-namespace-id"

[[durable_objects.bindings]]
name = "TemplateSales"
class_name = "TemplateSales"

[[durable_objects.bindings]]
name = "ComplianceEngine"
class_name = "ComplianceEngine"

[vars]
ENVIRONMENT = "production"
JWT_EXPIRES_IN = "1h"
REFRESH_TOKEN_EXPIRES_IN = "30d"
MARKETPLACE_ENABLED = true

[env.staging]
name = "formweaver-marketplace-staging"
```

### 7.2 Monitoring & Alerting

```typescript
// ✅ GOOD: Marketplace metrics monitoring
const trackMarketplaceMetrics = async (env: Env, eventType: string, data: any) => {
  const metric = {
    timestamp: Date.now(),
    type: eventType,
    data: { ...data, environment: env.ENVIRONMENT },
    version: '2.0.0'
  };
  
  // Store in analytics table
  await env.DB.prepare(`
    INSERT INTO marketplace_analytics (timestamp, event_type, data)
    VALUES (?, ?, ?)
  `).bind(metric.timestamp, metric.type, JSON.stringify(metric.data)).run();
  
  // Increment counters in KV
  const counterKey = `metrics:${eventType}:${Math.floor(Date.now() / 60000)}`;
  const current = await env.ANALYTICS.get(counterKey);
  await env.ANALYTICS.put(counterKey, String((parseInt(current || '0') + 1)), {
    expirationTtl: 3600 // 1 hour
  });
};
```

**Monitoring Requirements:**

- **Template marketplace conversion rate** tracking
- **Creator acquisition and retention** metrics
- **Commission payout accuracy** monitoring
- **Compliance deletion success rate** tracking
- **API response times** by endpoint
- **Error rates** by service
- **Real-time marketplace dashboard** for operations

---

## 8. Code Review Checklist

### 8.1 Pre-Submission Checklist

Before submitting any PR:

- [ ] **TypeScript compilation** passes without errors
- [ ] **All Zod validations** implemented for new endpoints
- [ ] **Database queries** use prepared statements
- [ ] **Authentication** implemented for all marketplace endpoints
- [ ] **Creator tier validation** for creator-specific endpoints
- [ ] **Commission calculations** tested and accurate
- [ ] **Compliance requirements** implemented
- [ ] **Rate limiting** configured appropriately
- [ ] **Error handling** with proper HTTP status codes
- [ ] **Logging** for all marketplace operations
- [ ] **Tests** added for new functionality
- [ ] **Documentation** updated for API changes

### 8.2 Security Review

- [ ] **JWT validation** implemented correctly
- [ ] **Workspace isolation** enforced in all queries
- [ ] **Creator permission checks** for marketplace access
- [ ] **Financial calculations** are precise and secure
- [ ] **Data retention** policies implemented correctly
- [ ] **Input validation** prevents injection attacks
- [ ] **Rate limiting** prevents abuse

### 8.3 Performance Review

- [ ] **Database indexes** added for new queries
- [ ] **Caching strategy** implemented for frequently accessed data
- [ ] **KV usage** optimized for performance
- [ ] **Pagination** implemented for list endpoints
- [ ] **Response times** meet marketplace requirements
- [ ] **Memory usage** optimized in Durable Objects

---

## 9. Emergency Procedures

### 9.1 Marketplace Incidents

**High Priority Issues:**

1. **Payment Processing Failure**
   - Check Stripe Connect status
   - Verify webhook endpoints
   - Rollback if necessary
   - Notify affected users

2. **Commission Calculation Errors**
   - Stop new purchases immediately
   - Audit recent calculations
   - Manual correction if needed
   - Notify affected creators

3. **Data Compliance Violations**
   - Stop data deletion processes
   - Audit retention policies
   - Implement legal holds
   - Notify compliance team

### 9.2 Rollback Procedures

```bash
# Emergency rollback
wrangler rollback

# Check deployment status
wrangler tail --status error

# Verify marketplace functionality
curl -X GET "https://api.formweaver.com/api/marketplace/health"
```

---

## 📝 Notes

- All marketplace endpoints must be thoroughly tested
- Financial calculations require extra scrutiny
- Legal compliance is non-negotiable
- Performance impacts user experience significantly
- Security vulnerabilities must be addressed immediately
- Documentation must be kept current with code changes

---

**Last Updated:** 2025-11-23  
**Based on:** Marketplace Backend Implementation Requirements  
**Next Review:** 2025-12-23

---

## 🏢 Cross-Reference

For comprehensive development guidelines, also refer to:
- [Backend README](./README.md)
- [Backend API Documentation](./BACKEND.md)
- [Backend Checklist](./BACKEND_CHECKLIST.md)
- [Implementation Guide](./IMPLEMENTATION_GUIDE.md)
- [Quality Assurance](./QUALITY_ASSURANCE.md)
- [Post-MVP Guide](./POST_MVP_GUIDE.md)