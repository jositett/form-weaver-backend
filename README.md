# FormWeaver Backend - Marketplace Edition

Cloudflare Workers API built with Hono framework, D1 database, and Workers KV for edge-first performance. This backend powers the FormWeaver marketplace ecosystem with template marketplace, creator management, legal compliance, and student employment features.

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

## 🏪 Marketplace Backend Features

This backend implementation includes comprehensive marketplace functionality:

### 🎯 Core Marketplace Components

- **Template Marketplace API** - Browse, search, and manage form templates
- **Creator Management System** - Onboarding, verification, and analytics for creators
- **Commission & Payout System** - Multi-tier commission structure with Stripe Connect
- **Legal Compliance Engine** - GDPR/CCPA compliance with automatic data retention
- **Student Verification System** - Educational email validation and mentorship program
- **Template Review & Quality Assurance** - Automated security scanning and manual review

### 💰 Revenue Model

- **Pro Creator Commission**: 73% (requires $199/year subscription)
- **Elite Creator Commission**: 65% (10+ templates sold, 4.5+ star rating)
- **Verified Creator Commission**: 55% (identity verification + 3+ templates)
- **Basic Creator Commission**: 50% (free account, 1+ template)

## 📁 Project Structure

```
backend/
├── src/
│   ├── index.ts           # Main Hono application entry
│   │
│   ├── routes/             # API route handlers
│   │   ├── auth.ts        # Authentication routes
│   │   ├── forms.ts       # Form CRUD routes
│   │   ├── marketplace.ts # Template marketplace routes
│   │   ├── creators.ts    # Creator management routes
│   │   ├── commissions.ts # Commission & payout routes
│   │   ├── compliance.ts  # Legal compliance routes
│   │   └── submissions.ts # Submission routes
│   │
│   ├── middleware/         # Hono middleware
│   │   ├── auth.ts        # JWT authentication
│   │   ├── cors.ts        # CORS configuration
│   │   ├── rateLimiter.ts # Rate limiting
│   │   └── creatorGuard.ts # Creator permission checks
│   │
│   ├── services/           # Business logic services
│   │   ├── marketplace.ts # Template marketplace logic
│   │   ├── creatorService.ts # Creator onboarding & management
│   │   ├── commissionService.ts # Revenue sharing calculations
│   │   ├── complianceService.ts # Data retention & deletion
│   │   └── emailService.ts # Email notifications
│   │
│   ├── objects/            # Durable Objects
│   │   ├── TemplateSales.ts # Sales tracking & analytics
│   │   ├── ComplianceEngine.ts # Automated data deletion
│   │   └── PayoutProcessor.ts # Stripe Connect integration
│   │
│   ├── db/                 # Database
│   │   ├── schema.sql     # Database schema
│   │   ├── migrations/    # Migration files
│   │   └── queries.ts     # Prepared statements
│   │
│   ├── types/              # TypeScript types
│   │   ├── marketplace.ts # Marketplace-specific types
│   │   ├── creator.ts     # Creator management types
│   │   ├── compliance.ts  # Compliance types
│   │   └── commission.ts  # Commission calculation types
│   │
│   └── utils/              # Utility functions
│       ├── jwt.ts         # JWT helpers
│       ├── validation.ts  # Zod schemas
│       └── retention.ts   # Data retention calculations
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

# Marketplace-specific scripts
npm run marketplace:seed   # Seed marketplace with sample templates
npm run compliance:audit   # Audit data retention policies
npm run payouts:process    # Process pending payouts

# View logs
npm run tail               # Live tail production logs
```

### Database Setup

#### Create Database

```bash
npm run d1:create
```

This creates a local D1 database named `formweaver-marketplace`.

#### Run Migrations

```bash
# Local development
npm run d1:migrate

# Production
npm run d1:migrate:prod
```

#### Query Database

```bash
npm run d1:query "SELECT * FROM creators LIMIT 5"
```

## 🏪 Marketplace API Endpoints

### Health Check

```
GET  /              # API status
GET  /api/health    # Health check
```

### Authentication

```
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/verify-email
POST /api/auth/reset-password
POST /api/auth/refresh
```

### Template Marketplace

```
GET    /api/marketplace/templates      # Browse templates
GET    /api/marketplace/templates/:id  # Template details
GET    /api/marketplace/categories     # Template categories
GET    /api/marketplace/search         # Search templates
POST   /api/marketplace/templates/:id/purchase  # Purchase template
GET    /api/marketplace/templates/:id/download  # Download template
GET    /api/marketplace/templates/:id/preview   # Interactive preview
POST   /api/marketplace/templates/:id/rate      # Rate template
```

### Creator Management

```
POST   /api/creators/onboard           # Creator onboarding
GET    /api/creators/:id               # Creator profile
GET    /api/creators/:id/dashboard     # Creator analytics
GET    /api/creators/:id/templates     # Creator's templates
GET    /api/creators/:id/earnings      # Earnings & payouts
POST   /api/creators/templates         # Publish template
PUT    /api/creators/templates/:id     # Update template
```

### Commission & Payouts

```
GET    /api/commissions/:id            # Commission details
GET    /api/payouts/:id                # Payout history
POST   /api/payouts/request            # Request payout
GET    /api/payouts/schedule           # Payout schedule
```

### Legal Compliance

```
POST   /api/compliance/retention       # Set retention policy
GET    /api/compliance/deletions       # Upcoming deletions
POST   /api/compliance/export          # Data export request
POST   /api/compliance/erasure         # Right to erasure
POST   /api/compliance/legal-holds     # Legal hold management
```

## 🔐 Authentication & Authorization

### JWT Token Management

```typescript
// Example: Creator authentication middleware
const creatorAuthMiddleware = async (c, next) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  
  const payload = await verify(token, c.env.JWT_SECRET);
  
  // Check if user has active Pro subscription
  const user = await getUser(c.env.DB, payload.sub);
  if (!user.subscription || user.subscription.tier !== 'pro') {
    return c.json({ error: 'Pro subscription required' }, 403);
  }
  
  c.set('userId', payload.sub);
  c.set('workspaceId', payload.workspaceId);
  await next();
};
```

### Creator Permission Levels

- **Basic Creator**: Free account, 50% commission
- **Verified Creator**: Identity verified, 55% commission
- **Elite Creator**: 10+ templates sold, 65% commission
- **Pro Creator**: $199/year subscription, 73% commission

## 🏪 Marketplace Implementation

### Template Storage Strategy

```typescript
// KV Structure for Templates
// Namespace: FORMWEAVER_TEMPLATES
{
  "template:medical:hipaa-intake:v1": {
    schema: {...}, // Form structure
    price: 99,
    creatorId: "user_123",
    category: "healthcare",
    features: ["payments", "hipaa", "workflows"],
    previewUrl: "https://formweaver.com/preview/...",
    salesCount: 342,
    rating: 4.7,
    tags: ["medical", "intake", "hipaa", "insurance"]
  }
}

// Purchase tracking in Durable Object (strong consistency)
class TemplateSales {
  async recordSale(templateId, buyerId, amount) {
    const sale = {
      templateId, buyerId, amount,
      creatorEarnings: amount * 0.73,
      platformFee: amount * 0.27,
      timestamp: Date.now()
    };
    await this.ctx.storage.put(`sale:${Date.now()}:${buyerId}`, sale);
  }
}
```

### Commission Calculation

```typescript
// Multi-tier commission calculation
function calculateCommission(saleAmount, creatorStatus, templateCategory) {
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
  
  const baseRate = baseRates[creatorStatus];
  const multiplier = categoryMultipliers[templateCategory] || 1.0;
  const adjustedRate = Math.min(baseRate * multiplier, 0.85); // Cap at 85%
  
  return {
    creatorEarnings: Math.round(saleAmount * adjustedRate * 100) / 100,
    platformFee: Math.round(saleAmount * (1 - adjustedRate) * 100) / 100,
    commissionRate: adjustedRate
  };
}
```

### Data Retention & Compliance

```typescript
// Automatic data deletion system
class ComplianceEngine {
  async scheduleDeletion(submissionId, formData, retentionSettings) {
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
  
  calculateTTL(retentionSettings) {
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

## 🔒 Security & Compliance

### Data Protection

- **Encryption**: All template data encrypted at rest using Cloudflare KV
- **HIPAA Compliance**: Medical forms use separate encrypted storage
- **PCI Compliance**: Payment processing via Stripe (no card data stored)
- **GDPR/CCPA**: Automatic data retention and deletion

### Rate Limiting

```typescript
// Marketplace-specific rate limits
const rateLimits = {
  marketplace: { requests: 100, window: 60000 },    // 100/min for browsing
  purchases: { requests: 10, window: 60000 },        // 10/min for purchases
  creatorActions: { requests: 60, window: 60000 },   // 60/min for creators
  compliance: { requests: 30, window: 60000 }        // 30/min for compliance
};
```

### Input Validation

All marketplace inputs validated with Zod schemas:

```typescript
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
  })
});
```

## 🚢 Deployment

### Environment Variables

Required secrets (set with Wrangler):

```bash
wrangler secret put JWT_SECRET
wrangler secret put STRIPE_SECRET_KEY
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put STRIPE_CONNECT_CLIENT_ID
wrangler secret put CLOUDFLARE_ACCOUNT_ID
wrangler secret put ENCRYPTION_KEY
```

KV Namespaces:

```toml
# Add to wrangler.toml
[[kv_namespaces]]
binding = "FORMWEAVER_TEMPLATES"
id = "your-templates-namespace-id"

[[kv_namespaces]]
binding = "FORMWEAVER_SUBMISSIONS"
id = "your-submissions-namespace-id"

[[kv_namespaces]]
binding = "FORMWEAVER_COMPLIANCE"
id = "your-compliance-namespace-id"
```

### Deploy to Production

```bash
npm run deploy
```

### Deploy Specific Environments

```bash
# Staging
npm run deploy:staging

# Production
npm run deploy:prod
```

## 🧪 Testing

```bash
# Type check
npm run type-check

# Run all tests
npm test

# Run marketplace-specific tests
npm run test:marketplace

# Run compliance tests
npm run test:compliance

# Run commission tests
npm run test:commissions
```

### Marketplace Test Coverage

- Template marketplace API functionality
- Creator dashboard analytics accuracy
- Commission calculation verification
- Legal compliance automation
- Student verification system
- Payment processing workflows

## 📊 Monitoring & Analytics

### Key Metrics

- Template marketplace conversion rate
- Creator acquisition and retention
- Commission payout accuracy
- Compliance deletion success rate
- API response times by endpoint
- Error rates by service

### Health Checks

- KV namespace availability
- D1 database connection
- Stripe Connect status
- Durable Object health
- Compliance engine status

### Alerting

Set up alerts for:
- API error rate > 5% over 5 minutes
- Response time > 2s for 95th percentile
- Durable Object failures
- Compliance deletion failures
- Payment processing errors

## 🤝 Contributing

This backend powers the FormWeaver marketplace ecosystem. When contributing:

1. **Maintain backward compatibility** for marketplace APIs
2. **Test commission calculations** thoroughly - financial accuracy is critical
3. **Ensure compliance** - legal requirements must be met
4. **Optimize for performance** - marketplace scales to thousands of creators
5. **Document changes** - marketplace APIs are used by external developers

### Development Guidelines

- All marketplace endpoints require JWT authentication
- Creator endpoints require active Pro subscription
- Template purchases require valid payment method
- Compliance operations require elevated permissions
- Use prepared statements for all database queries
- Implement proper rate limiting for all public endpoints

## 📚 Additional Resources

- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Hono Documentation](https://hono.dev)
- [D1 Database Documentation](https://developers.cloudflare.com/d1/)
- [Workers KV Documentation](https://developers.cloudflare.com/kv/)
- [Stripe Connect Documentation](https://stripe.com/docs/connect)
- [GDPR Compliance Guide](https://gdpr.eu/)
- [HIPAA Compliance Requirements](https://www.hhs.gov/hipaa/for-professionals/privacy/index.html)

## 🏢 Cross-Reference

For comprehensive documentation, also refer to:
- [Main Project Documentation](../docs/)
- [Frontend Marketplace Guide](../frontend/README.md)
- [Marketplace Implementation Guide](../docs/IMPLEMENTATION_GUIDE.md)
- [Quality Assurance Procedures](../docs/QUALITY_ASSURANCE.md)

---

**Version:** 2.0.0 - Marketplace Edition  
**Last Updated:** 2025-11-23  
**Focus:** Template Marketplace Backend Infrastructure