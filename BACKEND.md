# Backend API Documentation - Marketplace Edition

This backend is built with:
- **Cloudflare Workers**: Serverless edge compute
- **Hono**: Lightweight, fast web framework
- **D1**: SQLite database at the edge
- **KV**: Key-value storage for caching and templates
- **Durable Objects**: Strong consistency for sales tracking and real-time analytics
- **TypeScript**: Type-safe development
- **Stripe Connect**: Creator payouts and marketplace payments

## Project Structure

```
backend/
├── src/
│   ├── index.ts              # Main application entry
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
│   └── utils/                # Utility functions
│       ├── jwt.ts           # JWT helpers
│       ├── validation.ts    # Zod schemas
│       └── retention.ts     # Data retention calculations
├── wrangler.toml             # Cloudflare configuration
├── tsconfig.json             # TypeScript configuration
└── package.json              # Dependencies
```

## Development

### Start local development server:

```bash
cd backend
npm run dev
```

The API will be available at: `http://localhost:8787`

### Initialize D1 database:

```bash
npm run d1:create
npm run d1:migrate
```

### Check database:

```bash
npm run d1:query "SELECT * FROM users LIMIT 5"
```

## API Endpoints

### Health Check

```
GET /
GET /api/health
```

### Authentication

```
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/verify-email
POST /api/auth/reset-password
POST /api/auth/refresh
```

### Forms

```
GET    /api/forms
POST   /api/forms
GET    /api/forms/:id
PUT    /api/forms/:id
DELETE /api/forms/:id
GET    /api/forms/:id/submissions
POST   /api/f/:formId/submit
```

## Template Marketplace API

The marketplace API enables browsing, purchasing, and managing form templates.

### Browse Templates

```
GET /api/marketplace/templates
```

**Query Parameters:**
- `category` (optional): Filter by category (business, healthcare, education, etc.)
- `complexity` (optional): Filter by complexity (basic, standard, premium, enterprise)
- `price_min` (optional): Minimum price filter
- `price_max` (optional): Maximum price filter
- `creator_id` (optional): Filter by specific creator
- `search` (optional): Search in template name, description, tags
- `sort` (optional): Sort by (price_asc, price_desc, rating, newest, best_selling)
- `limit` (optional): Number of results per page (default: 20)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "templates": [
    {
      "id": "tmpl_123",
      "name": "HIPAA Medical Intake Form",
      "description": "Complete patient intake with insurance verification",
      "price": 99,
      "currency": "USD",
      "creator": {
        "id": "user_456",
        "name": "Medical Forms Pro",
        "verified": true,
        "rating": 4.8
      },
      "category": "healthcare",
      "complexity": "premium",
      "features": ["payments", "hipaa", "workflows", "conditional_logic"],
      "rating": 4.7,
      "reviews_count": 342,
      "sales_count": 1289,
      "preview_url": "https://formweaver.com/preview/medical-intake",
      "thumbnail_url": "https://formweaver.com/thumbnails/medical-intake.jpg",
      "created_at": "2024-11-20T10:30:00Z",
      "updated_at": "2024-11-22T15:45:00Z"
    }
  ],
  "total": 150,
  "has_more": true
}
```

### Get Template Details

```
GET /api/marketplace/templates/:id
```

**Response:**
```json
{
  "id": "tmpl_123",
  "name": "HIPAA Medical Intake Form",
  "description": "Complete patient intake with insurance verification",
  "price": 99,
  "currency": "USD",
  "creator": { /* creator object */ },
  "category": "healthcare",
  "complexity": "premium",
  "features": ["payments", "hipaa", "workflows", "conditional_logic"],
  "form_schema": {
    "fields": [
      {
        "id": "patient_name",
        "type": "text",
        "label": "Full Name",
        "required": true,
        "validation": {
          "pattern": "^[a-zA-Z\\s]+$",
          "message": "Please enter a valid name"
        }
      }
    ],
    "workflows": [
      {
        "trigger": "on_submit",
        "actions": [
          {
            "type": "send_email",
            "config": {
              "to": "{{patient_email}}",
              "template": "confirmation"
            }
          }
        ]
      }
    ]
  },
  "retention_settings": {
    "legal_basis": "legal_obligation",
    "retention_days": 2190,
    "auto_delete": false,
    "industry": "healthcare"
  },
  "rating": 4.7,
  "reviews_count": 342,
  "sales_count": 1289,
  "download_count": 847,
  "last_updated": "2024-11-22T15:45:00Z",
  "version": "2.1",
  "tags": ["medical", "intake", "hipaa", "insurance"],
  "includes": [
    "Complete form schema",
    "HIPAA compliance checklist",
    "Insurance verification integration",
    "Patient portal integration guide"
  ],
  "requires_subscription": false
}
```

### Purchase Template

```
POST /api/marketplace/templates/:id/purchase
```

**Request:**
```json
{
  "use_case": "private_practice", // or "hospital", "clinic", etc.
  "customization_needed": false
}
```

**Response:**
```json
{
  "purchase_id": "purchase_123",
  "template_id": "tmpl_123",
  "price": 99,
  "currency": "USD",
  "commission_breakdown": {
    "creator_earnings": 72.27,
    "platform_fee": 26.73,
    "stripe_fee": 2.90,
    "net_to_creator": 69.37
  },
  "license": {
    "type": "single_use",
    "expires_at": null,
    "transferable": false,
    "commercial_use": true
  },
  "download_url": "https://formweaver.com/download/template/abc123",
  "created_at": "2024-11-23T11:45:00Z"
}
```

### Get Template Categories

```
GET /api/marketplace/categories
```

**Response:**
```json
{
  "categories": [
    {
      "id": "business",
      "name": "Business & Professional",
      "description": "Lead generation, payments, client onboarding",
      "icon": "briefcase",
      "subcategories": [
        {
          "id": "lead-generation",
          "name": "Lead Generation",
          "complexity": "standard"
        }
      ],
      "templates_count": 1250
    }
  ]
}
```

### Search Templates

```
GET /api/marketplace/search
```

**Query Parameters:**
- `q`: Search query
- `filters`: JSON string of additional filters

**Response:**
```json
{
  "results": [/* template objects */],
  "suggestions": ["medical forms", "lead generation", "payment forms"],
  "total": 45,
  "search_metadata": {
    "query": "medical forms",
    "took_ms": 23,
    "results_per_page": 20
  }
}
```

## Creator Management API

### Creator Onboarding

```
POST /api/creators/onboard
```

**Request:**
```json
{
  "professional_name": "Medical Forms Pro",
  "bio": "Creating HIPAA-compliant forms for healthcare providers",
  "website": "https://medicalforms.pro",
  "portfolio_url": "https://dribbble.com/medicalformspro",
  "specialties": ["healthcare", "insurance", "patient_experience"],
  "agreement_accepted": true,
  "stripe_account_id": "acct_123" // From Stripe Connect
}
```

**Response:**
```json
{
  "creator_id": "user_456",
  "status": "pending_review",
  "onboarding_progress": {
    "profile_completed": true,
    "stripe_connected": true,
    "agreement_signed": true,
    "templates_published": false,
    "review_pending": true
  },
  "next_steps": ["Submit 3 template samples for review"],
  "estimated_review_time": "3-5 business days"
}
```

### Creator Dashboard

```
GET /api/creators/:id/dashboard
```

**Response:**
```json
{
  "creator": {
    "id": "user_456",
    "name": "Medical Forms Pro",
    "status": "verified",
    "commission_rate": 0.73,
    "total_earnings": 12500.50,
    "this_month_earnings": 1850.25,
    "total_sales": 342,
    "active_templates": 15
  },
  "analytics": {
    "sales_this_month": 23,
    "sales_last_month": 18,
    "avg_rating": 4.7,
    "total_downloads": 1289,
    "conversion_rate": 0.125,
    "top_performing_template": "tmpl_123"
  },
  "recent_activity": [
    {
      "type": "sale",
      "template_id": "tmpl_123",
      "amount": 99,
      "commission": 72.27,
      "timestamp": "2024-11-23T10:30:00Z"
    },
    {
      "type": "review",
      "template_id": "tmpl_456",
      "rating": 5,
      "comment": "Perfect for my clinic!",
      "timestamp": "2024-11-22T18:45:00Z"
    }
  ],
  "payout_summary": {
    "pending_payout": 2340.50,
    "next_payout_date": "2024-12-23",
    "payout_method": "stripe_connect"
  }
}
```

### Publish Template

```
POST /api/creators/:id/templates
```

**Request:**
```json
{
  "name": "Dental Patient Intake",
  "description": "Complete dental practice patient onboarding",
  "price": 79,
  "category": "healthcare",
  "complexity": "premium",
  "form_schema": { /* form schema object */ },
  "retention_settings": {
    "legal_basis": "legal_obligation",
    "retention_days": 2190,
    "auto_delete": false,
    "industry": "healthcare"
  },
  "features": ["payments", "hipaa", "conditional_logic"],
  "tags": ["dental", "patient", "intake", "medical"],
  "preview_url": "https://formweaver.com/preview/dental-intake"
}
```

### Get Creator Analytics

```
GET /api/creators/:id/analytics
```

**Query Parameters:**
- `start_date` (optional): Start date for analytics
- `end_date` (optional): End date for analytics
- `template_id` (optional): Specific template analytics

**Response:**
```json
{
  "period": {
    "start": "2024-11-01",
    "end": "2024-11-23"
  },
  "sales_metrics": {
    "total_sales": 45,
    "total_revenue": 3555,
    "avg_order_value": 79,
    "conversion_rate": 0.142,
    "refund_rate": 0.02
  },
  "template_performance": [
    {
      "template_id": "tmpl_123",
      "sales": 23,
      "revenue": 2277,
      "views": 1840,
      "conversion_rate": 0.125,
      "rating": 4.7
    }
  ],
  "audience_insights": {
    "top_industries": ["healthcare", "private_practice", "hospital"],
    "geographic_distribution": {
      "us": 65,
      "ca": 15,
      "uk": 12,
      "other": 8
    }
  }
}
```

## Commission & Payout API

### Get Commission Details

```
GET /api/commissions/:id
```

**Response:**
```json
{
  "commission_id": "comm_123",
  "template_id": "tmpl_123",
  "sale_amount": 99,
  "commission_rate": 0.73,
  "creator_earnings": 72.27,
  "platform_fee": 26.73,
  "stripe_fee": 2.90,
  "net_to_creator": 69.37,
  "breakdown": {
    "creator_commission": 72.27,
    "platform_percentage": 27,
    "payment_processing": 2.90,
    "taxes": 0,
    "adjustments": 0
  },
  "status": "pending",
  "calculated_at": "2024-11-23T11:45:00Z",
  "eligible_for_payout_at": "2024-12-23T11:45:00Z"
}
```

### Commission Calculation Logic

```javascript
// Example commission calculation
function calculateCommission(saleAmount, creatorStatus, templateCategory) {
  const baseRates = {
    'basic': 0.50,
    'verified': 0.55,
    'elite': 0.65,
    'pro': 0.73
  };
  
  // Category multipliers
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

### Get Payout History

```
GET /api/payouts/:id
```

**Query Parameters:**
- `limit` (optional): Number of payouts to return (default: 10)
- `status` (optional): Filter by status (pending, paid, failed, cancelled)

**Response:**
```json
{
  "payouts": [
    {
      "payout_id": "payout_123",
      "amount": 2340.50,
      "currency": "USD",
      "status": "paid",
      "method": "stripe_connect",
      "estimated_delivery": "2024-11-25",
      "paid_at": "2024-11-25T14:30:00Z",
      "fees": 0.50,
      "commissions": ["comm_456", "comm_789"],
      "stripe_payout_id": "po_123",
      "created_at": "2024-11-23T00:00:00Z"
    }
  ],
  "total_pending": 1560.25,
  "next_payout_date": "2024-12-23"
}
```

### Request Payout

```
POST /api/payouts/request
```

**Request:**
```json
{
  "amount": 1500.00,
  "method": "stripe_connect",
  "notes": "Monthly payout request"
}
```

**Response:**
```json
{
  "request_id": "req_123",
  "status": "approved",
  "amount": 1500.00,
  "estimated_payout_date": "2024-11-27",
  "fees": 0.25,
  "net_amount": 1499.75,
  "payout_id": "payout_456"
}
```

## Compliance API

### Set Retention Policy

```
POST /api/compliance/retention
```

**Request:**
```json
{
  "form_id": "form_123",
  "retention_settings": {
    "legal_basis": "legal_obligation",
    "retention_days": 2190,
    "auto_delete": false,
    "notify_before_delete": true,
    "industry": "healthcare"
  }
}
```

### Get Scheduled Deletions

```
GET /api/compliance/deletions
```

**Query Parameters:**
- `status` (optional): upcoming, overdue, completed
- `days_ahead` (optional): How many days ahead to look (default: 7)

**Response:**
```json
{
  "scheduled_deletions": [
    {
      "submission_id": "sub_123",
      "form_id": "form_456",
      "form_name": "Contact Form",
      "user_id": "user_789",
      "scheduled_deletion": "2024-11-30T00:00:00Z",
      "retention_period": "30 days",
      "legal_basis": "consent",
      "data_size": 2048,
      "notification_sent": false
    }
  ],
  "summary": {
    "total_scheduled": 1542,
    "total_data_mb": 24.5,
    "notifications_pending": 154
  }
}
```

### Data Export Request

```
POST /api/compliance/export
```

**Request:**
```json
{
  "user_id": "user_123",
  "export_type": "all_data",
  "format": "json",
  "include_deletions": true
}
```

**Response:**
```json
{
  "export_id": "exp_123",
  "status": "processing",
  "estimated_completion": "2024-11-23T14:00:00Z",
  "download_url": null,
  "expires_at": null,
  "data_size_estimate": "15.2 MB"
}
```

### Automated Data Deletion

```javascript
// KV TTL-based auto-deletion implementation
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
    
    // Cannot auto-deletion regulated data
    if (!autoDelete || ['healthcare', 'financial'].includes(industry)) {
      return null;
    }
    
    // Convert days to seconds
    return retentionDays * 24 * 60 * 60;
  }
}
```

## Technical Implementation

### Template Storage Strategy

```javascript
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
  
  async getSalesAnalytics(templateId) {
    const sales = await this.ctx.storage.list({ prefix: `sale:${templateId}` });
    return {
      totalSales: sales.length,
      totalRevenue: sales.reduce((sum, sale) => sum + sale.amount, 0),
      avgSalePrice: sales.length > 0 ? totalRevenue / sales.length : 0
    };
  }
}
```

### Creator Verification Workflow

```javascript
// Middleware to check creator eligibility
async function requireCreator(request, env) {
  const user = await getUser(request, env);
  
  // Check active pro subscription
  if (!user.subscription || user.subscription.tier !== "pro") {
    return new Response("Pro subscription required", { status: 403 });
  }
  
  // Check creator onboarding completed
  if (!user.creatorOnboardingComplete) {
    return Response.redirect("/creator/onboarding");
  }
  
  return user;
}

// Creator verification process
async function verifyCreator(userId, verificationData) {
  const { identityDoc, professionalProof, stripeAccount } = verificationData;
  
  // 1. Verify identity document
  const identityVerified = await verifyIdentityDocument(identityDoc);
  
  // 2. Check professional credentials
  const professionalVerified = await verifyProfessionalCredentials(professionalProof);
  
  // 3. Validate Stripe Connect account
  const stripeVerified = await validateStripeAccount(stripeAccount);
  
  return {
    verified: identityVerified && professionalVerified && stripeVerified,
    verificationLevel: calculateVerificationLevel([identityVerified, professionalVerified, stripeVerified]),
    nextSteps: getNextVerificationSteps([identityVerified, professionalVerified, stripeVerified])
  };
}
```

### Error Handling Patterns

```javascript
// Standard error response format
class APIError extends Error {
  constructor(message, status, code, details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  
  toJSON() {
    return {
      error: {
        message: this.message,
        code: this.code,
        status: this.status,
        details: this.details,
        timestamp: new Date().toISOString(),
        request_id: getCurrentRequestId()
      }
    };
  }
}

// Error handling middleware
const errorHandler = async (c, next) => {
  try {
    await next();
  } catch (error) {
    console.error('API Error:', error);
    
    if (error instanceof APIError) {
      return c.json(error.toJSON(), error.status);
    }
    
    // Generic server error
    return c.json(new APIError(
      'Internal server error',
      500,
      'INTERNAL_ERROR'
    ).toJSON(), 500);
  }
};
```

## Security Considerations

### Authentication & Authorization
- All marketplace endpoints require JWT authentication
- Creator endpoints require active Pro subscription
- Template purchases require valid payment method
- Admin endpoints require elevated permissions

### Data Protection
- All template data encrypted at rest using Cloudflare KV
- Sensitive form submissions use separate encrypted storage
- PCI compliance for payment processing via Stripe
- HIPAA compliance for medical forms (encrypted storage, access logs)

### Rate Limiting
- Marketplace browsing: 100 requests/minute per IP
- Template purchases: 10 requests/minute per user
- Creator actions: 60 requests/minute per creator
- Compliance operations: 30 requests/minute per admin

### Input Validation
- All form schemas validated against JSON Schema
- File uploads scanned for malware
- Template content sanitized for XSS prevention
- Price inputs validated against acceptable ranges

## Performance Optimization

### Caching Strategy
- Template listings cached for 5 minutes in KV
- Creator profiles cached for 1 hour
- Category data cached for 24 hours
- Sales analytics cached for 10 minutes

### Database Optimization
- D1 indexes on frequently queried fields
- Template metadata stored in KV for faster access
- Durable Objects for real-time sales tracking
- Batch operations for compliance processing

### CDN Integration
- Template previews served via Cloudflare CDN
- Static assets (images, PDFs) cached at edge
- API responses cached based on content type
- Geographic routing for compliance data

## Environment Variables

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
```bash
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

Durable Objects:
```bash
# Add to wrangler.toml
[[r2_buckets]]
binding = "FORMWEAVER_STORAGE"
bucket_name = "formweaver-storage"

[[durable_objects.bindings]]
name = "TemplateSales"
class_name = "TemplateSales"
```

## Deployment

### Deploy to production:
```bash
npm run deploy
```

### Deploy specific environments:
```bash
# Staging
npm run deploy:staging

# Production
npm run deploy:prod
```

### View live logs:
```bash
npm run tail
```

### Database migrations:
```bash
# Run migrations
npm run d1:migrate

# Rollback last migration
npm run d1:rollback
```

## Testing

### Run all tests:
```bash
npm test
```

### Run specific test suites:
```bash
# Marketplace tests
npm run test:marketplace

# Creator tests
npm run test:creators

# Compliance tests
npm run test:compliance

# Integration tests
npm run test:integration
```

### Code quality checks:
```bash
# Type checking
npm run type-check

# Linting
npm run lint

# Security audit
npm run audit
```

## Monitoring & Analytics

### Key Metrics to Monitor
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

---

For more information, refer to the implementation guide and technical specifications in the main project documentation.