# FormWeaver Backend

Cloudflare Workers API built with Hono framework, D1 database, and Workers KV for edge-first performance.

## 🚀 Quick Start

### Prerequisites

- Node.js >= 18.x
- npm >= 9.x
- Cloudflare account
- Wrangler CLI installed globally: `npm install -g wrangler`

### Installation

```bash
# Install dependencies
npm install

# Login to Cloudflare (first time only)
wrangler login

# Create D1 database (first time only)
npm run d1:create

# Run database migrations (local)
npm run d1:migrate

# Start development server
npm run dev
```

The API will be available at **<http://localhost:8787>**.

## 📁 Project Structure

```
backend/
├── src/
│   ├── index.ts           # Main Hono application entry
│   │
│   ├── routes/             # API route handlers
│   │   ├── auth.ts        # Authentication routes (TODO)
│   │   ├── forms.ts       # Form CRUD routes (TODO)
│   │   └── submissions.ts # Submission routes (TODO)
│   │
│   ├── middleware/         # Hono middleware
│   │   ├── auth.ts        # JWT authentication (TODO)
│   │   ├── cors.ts        # CORS configuration (TODO)
│   │   └── rateLimiter.ts # Rate limiting (TODO)
│   │
│   ├── db/                 # Database
│   │   ├── schema.sql     # Database schema
│   │   └── migrations/    # Migration files
│   │
│   ├── types/              # TypeScript types
│   │   └── index.ts       # Shared types
│   │
│   └── utils/              # Utility functions
│       ├── jwt.ts         # JWT helpers (TODO)
│       └── validation.ts  # Zod schemas (TODO)
│
├── wrangler.toml           # Cloudflare Workers configuration
├── tsconfig.json           # TypeScript configuration
└── package.json            # Dependencies
```

## 🛠️ Development

### Available Scripts

```bash
# Start local development server
npm run dev

# Deploy to production
npm run deploy

# Type check
npm run type-check

# Database operations
npm run d1:create          # Create new D1 database
npm run d1:list            # List all D1 databases
npm run d1:migrate         # Run migrations (local)
npm run d1:migrate:prod    # Run migrations (production)
npm run d1:query           # Execute SQL query

# View logs
npm run tail               # Live tail production logs
```

### Development Server

The dev server runs on **<http://localhost:8787>** by default.

Features:

- **Hot reload** - Automatic restart on file changes
- **Local D1** - SQLite database for local development
- **Local KV** - In-memory KV store for local development
- **TypeScript** - Full type checking

### Database Setup

#### Create Database

```bash
npm run d1:create
```

This creates a local D1 database named `formweaver-dev`.

#### Run Migrations

```bash
# Local development
npm run d1:migrate

# Production
npm run d1:migrate:prod
```

#### Query Database

```bash
npm run d1:query "SELECT * FROM forms LIMIT 5"
```

## 📊 Database Schema

See `src/db/schema.sql` for complete schema.

### Core Tables

- **users** - User accounts
- **workspaces** - Multi-tenant workspaces
- **forms** - Form definitions
- **submissions** - Form submissions
- **workspace_members** - Workspace access control

### Indexes

All tables have appropriate indexes for performance:

- User email lookups
- Workspace-based queries
- Form status filtering
- Submission pagination

## 🔌 API Endpoints

### Health Check

```
GET  /              # API status
GET  /api/health    # Health check
```

### Authentication (TODO)

```
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/verify-email
POST /api/auth/reset-password
```

### Forms (TODO)

```
GET    /api/forms              # List forms
POST   /api/forms              # Create form
GET    /api/forms/:id          # Get form
PUT    /api/forms/:id          # Update form
DELETE /api/forms/:id          # Delete form
```

### Submissions (TODO)

```
POST   /api/f/:formId/submit   # Submit form (public)
GET    /api/forms/:id/submissions  # List submissions
GET    /api/forms/:id/submissions/:subId  # Get submission
DELETE /api/forms/:id/submissions/:subId  # Delete submission
```

## 🔐 Authentication

### JWT Tokens

- **Access tokens** - Short-lived (1 hour), for API requests
- **Refresh tokens** - Long-lived (30 days), stored in KV

### Implementation (TODO)

```typescript
// middleware/auth.ts
const authMiddleware = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  
  const payload = await verify(token, c.env.JWT_SECRET);
  c.set('userId', payload.sub);
  await next();
};
```

## 🗄️ Database Operations

### Using D1 in Code

```typescript
// Example: Query forms
const forms = await c.env.DB.prepare(
  'SELECT * FROM forms WHERE workspace_id = ? AND deleted_at IS NULL'
)
  .bind(workspaceId)
  .all();

// Example: Insert form
await c.env.DB.prepare(
  'INSERT INTO forms (id, workspace_id, title, schema, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
)
  .bind(formId, workspaceId, title, schema, userId, Date.now(), Date.now())
  .run();
```

### Prepared Statements

**Always use prepared statements** to prevent SQL injection:

```typescript
// ✅ GOOD
const stmt = c.env.DB.prepare('SELECT * FROM forms WHERE id = ?');
const form = await stmt.bind(formId).first();

// ❌ BAD - Never do this!
const query = `SELECT * FROM forms WHERE id = '${formId}'`;
```

## 💾 Workers KV

### Caching Forms

```typescript
// Cache form schema
const cacheKey = `form:${formId}`;
const cached = await c.env.FORM_CACHE.get(cacheKey, 'json');
if (cached) return cached;

// Fetch from D1
const form = await getFormFromDB(c.env.DB, formId);

// Cache for 10 minutes
await c.env.FORM_CACHE.put(cacheKey, JSON.stringify(form), {
  expirationTtl: 600
});
```

### KV Namespaces

Configured in `wrangler.toml`:

- **FORM_CACHE** - Form schema caching
- **SESSION_STORE** - JWT refresh tokens
- **EMAIL_TOKENS** - Email verification tokens
- **RATE_LIMIT** - Rate limiting counters

## 🔒 Security

### Environment Variables

#### Public Variables (wrangler.toml)

```toml
[vars]
ENVIRONMENT = "development"
JWT_EXPIRES_IN = "1h"
REFRESH_TOKEN_EXPIRES_IN = "30d"
```

#### Secrets (set with wrangler CLI)

```bash
wrangler secret put JWT_SECRET
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
```

### CORS Configuration

```typescript
app.use('/api/*', cors({
  origin: ['http://localhost:5173', 'http://localhost:8080'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
```

### Rate Limiting

```typescript
// Rate limit middleware (TODO)
const rateLimitMiddleware = (limit: number, window: number) => {
  return async (c, next) => {
    const ip = c.req.header('CF-Connecting-IP') || 'unknown';
    const key = `ratelimit:${ip}:${c.req.path}`;
    
    const count = await c.env.RATE_LIMIT.get(key);
    if (count && parseInt(count) >= limit) {
      return c.json({ error: 'Too many requests' }, 429);
    }
    
    await c.env.RATE_LIMIT.put(key, String((parseInt(count || '0') + 1)), {
      expirationTtl: window,
    });
    
    await next();
  };
};
```

## 📦 Dependencies

### Core

- **hono** ^4.10.6 - Web framework
- **@hono/zod-validator** ^0.7.4 - Request validation
- **zod** ^3.25.76 - Schema validation

### Authentication

- **jose** ^6.1.2 - JWT handling
- **bcryptjs** ^3.0.3 - Password hashing

### Development

- **wrangler** ^4.47.0 - Cloudflare CLI
- **typescript** ^5.9.3 - Type checking
- **@cloudflare/workers-types** ^4.20251115.0 - TypeScript types

## 🚢 Deployment

### Deploy to Production

```bash
npm run deploy
```

### Deploy to Staging

```bash
wrangler deploy --env staging
```

### View Logs

```bash
# Live tail
npm run tail

# Filter errors
wrangler tail --status error

# Search logs
wrangler tail --search "form_123"
```

### Rollback

```bash
wrangler rollback
```

## 🧪 Testing

```bash
# Type check
npm run type-check

# Run tests (when configured)
npm run test
```

### Testing Locally

```bash
# Start dev server
npm run dev

# In another terminal, test endpoints
curl http://localhost:8787/api/health
```

## 📈 Performance

### Optimization Tips

1. **Use KV caching** - Cache frequently accessed data
2. **Add indexes** - Ensure all queries use indexes
3. **Batch operations** - Use `DB.batch()` for multiple queries
4. **Limit result sets** - Always paginate large queries
5. **Select only needed columns** - Avoid `SELECT *`

### Monitoring

- **Workers Analytics** - View in Cloudflare dashboard
- **CPU time** - Monitor with `wrangler tail`
- **Error rate** - Set up alerts in Cloudflare dashboard

## 🐛 Troubleshooting

### Database Not Found

```bash
# Create database
npm run d1:create

# Verify database exists
npm run d1:list
```

### Migration Errors

```bash
# Check migration files in src/db/migrations/
# Verify SQL syntax

# Re-run migrations
npm run d1:migrate
```

### Wrangler Errors

```bash
# Re-login
wrangler login

# Check account
wrangler whoami
```

### Type Errors

```bash
# Run type check
npm run type-check

# Restart TypeScript server in VS Code
```

## 📚 Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Hono Documentation](https://hono.dev)
- [D1 Database Documentation](https://developers.cloudflare.com/d1/)
- [Workers KV Documentation](https://developers.cloudflare.com/kv/)
- [Wrangler CLI Documentation](https://developers.cloudflare.com/workers/wrangler/)

## 🤝 Contributing

See main [README.md](../README.md) for contribution guidelines.

---

**Version:** 1.0.0  
**Last Updated:** 2025-01-16
