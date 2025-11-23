# **FormWeaver Backend: Post-MVP Implementation Guide**

### **Last Updated with Marketplace Backend Strategy: November 23, 2024**

---

## **🎯 Backend Post-MVP Priorities**

### **Phase 1: Core Marketplace Infrastructure (Critical)**

**Priority:** 🔴 **CRITICAL - Start Here**

1. **Template Marketplace Backend Implementation**
   - KV storage structure for templates with metadata
   - Template search and filtering API endpoints
   - Template purchase and licensing system
   - Template download and access control
   - Template preview and demo system

2. **Creator Management System**
   - Creator onboarding workflow and API
   - Educational email verification system
   - ID verification and compliance checks
   - Creator tier management (Basic, Verified, Elite, Pro)
   - Creator dashboard backend APIs

3. **Legal Compliance System**
   - Automatic data deletion system (30-90 day TTL)
   - GDPR compliance and data export requests
   - Right to erasure implementation
   - Legal hold system for litigation
   - Industry-specific compliance (HIPAA, SOX)

4. **Template Review & Quality Assurance**
   - Template security scanning and validation
   - Compliance review workflow for regulated industries
   - Template quality scoring and approval
   - Automated template testing and validation

### **Phase 2: Revenue & Growth (High)**

**Priority:** 🟡 **HIGH - After Phase 1 Complete**

5. **Commission & Payout System**
   - Real-time commission calculation engine (50-73% tiers)
   - Stripe Connect integration for payouts
   - Multi-currency support (USD, EUR, GBP)
   - Payout scheduling and processing (Net 30)
   - Earnings tracking and analytics

6. **Billing/Subscription API**
   - Stripe integration for subscriptions
   - Usage tracking and plan limits
   - Subscription management

7. **Rate Limiting on Auth**
   - Login: 5 attempts per 15 minutes
   - Signup: 3 attempts per hour
   - Password reset: 3 attempts per hour

### **Phase 3: Production Readiness (Medium)**

**Priority:** 🟢 **MEDIUM - After Phase 2 Complete**

8. **Monitoring/Alerting**
   - Performance monitoring for marketplace APIs
   - Error tracking and alerting
   - Compliance automation monitoring

9. **CI/CD Pipeline**
   - Automated testing for marketplace features
   - Deployment automation
   - Rollback procedures

10. **Performance Tests**
    - Load testing for marketplace operations
    - Database query optimization
    - KV performance testing

---

## **🏗️ Backend Implementation Architecture**

### **Template Marketplace Backend Structure**

```typescript
// Backend API Structure
backend/
├── src/
│   ├── routes/
│   │   ├── marketplace.ts     # Template marketplace APIs
│   │   ├── creators.ts        # Creator management APIs
│   │   ├── commissions.ts     # Commission & payout APIs
│   │   ├── compliance.ts      # Legal compliance APIs
│   │   ├── forms.ts           # Form CRUD APIs
│   │   ├── submissions.ts     # Submission APIs
│   │   └── auth.ts           # Authentication APIs
│   ├── middleware/
│   │   ├── auth.ts           # JWT authentication
│   │   ├── creatorGuard.ts   # Creator permission checks
│   │   └── rateLimiter.ts    # Rate limiting
│   ├── services/
│   │   ├── marketplace.ts    # Template marketplace logic
│   │   ├── creatorService.ts # Creator onboarding & management
│   │   ├── commissionService.ts # Revenue sharing calculations
│   │   └── complianceService.ts # Data retention & deletion
│   ├── objects/
│   │   ├── TemplateSales.ts  # Sales tracking & analytics
│   │   ├── ComplianceEngine.ts # Automated data deletion
│   │   └── PayoutProcessor.ts # Stripe Connect integration
│   ├── db/
│   │   ├── schema.sql        # Database schema
│   │   └── migrations/       # Migration files
│   └── utils/
│       ├── retention.ts      # Data retention calculations
│       ├── commissionCalculator.ts # Commission calculation helpers
│       └── validation.ts     # Backend validation utilities
```

### **KV Storage Architecture for Marketplace**

```typescript
// KV Namespace Structure
const KV_STRUCTURE = {
  // Template storage
  'template:{category}:{complexity}:{version}': 'Template data',
  'template:search:{category}:{limit}:{offset}': 'Search results cache',
  'template:preview:{templateId}': 'Template preview data',
  
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

// TTL Configuration
const TTL_CONFIG = {
  template: 600,        // 10 minutes
  creator: 3600,        // 1 hour
  category: 86400,      // 24 hours
  analytics: 300,       // 5 minutes
  searchResults: 300    // 5 minutes
};
```

### **Database Schema Extensions**

```sql
-- New tables for marketplace
CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category TEXT NOT NULL,
    complexity TEXT NOT NULL,
    schema TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    version TEXT DEFAULT '1.0.0',
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'published', 'rejected')),
    retention_settings TEXT,
    sales_count INTEGER DEFAULT 0,
    rating REAL DEFAULT 0,
    reviews_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('NOW')),
    updated_at TEXT DEFAULT (datetime('NOW')),
    published_at TEXT,
    deleted_at TEXT,
    FOREIGN KEY (creator_id) REFERENCES users(id)
);

CREATE TABLE creator_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    professional_name TEXT NOT NULL,
    bio TEXT,
    website TEXT,
    portfolio_url TEXT,
    specialties TEXT,
    tier TEXT DEFAULT 'basic' CHECK(tier IN ('basic', 'verified', 'elite', 'pro')),
    stripe_account_id TEXT,
    student_verified BOOLEAN DEFAULT FALSE,
    onboarding_complete BOOLEAN DEFAULT FALSE,
    created_at TEXT DEFAULT (datetime('NOW')),
    updated_at TEXT DEFAULT (datetime('NOW')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE template_sales (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    buyer_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    commission_rate REAL NOT NULL,
    creator_earnings REAL NOT NULL,
    platform_fee REAL NOT NULL,
    creator_tier TEXT NOT NULL,
    timestamp TEXT DEFAULT (datetime('NOW')),
    FOREIGN KEY (template_id) REFERENCES templates(id),
    FOREIGN KEY (buyer_id) REFERENCES users(id)
);

CREATE TABLE commissions (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    sale_amount REAL NOT NULL,
    commission_rate REAL NOT NULL,
    creator_earnings REAL NOT NULL,
    platform_fee REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    calculated_at TEXT DEFAULT (datetime('NOW')),
    eligible_for_payout_at TEXT,
    payout_id TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'failed')),
    FOREIGN KEY (template_id) REFERENCES templates(id),
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (sale_id) REFERENCES template_sales(id)
);

CREATE TABLE payouts (
    id TEXT PRIMARY KEY,
    creator_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    method TEXT DEFAULT 'stripe_connect',
    stripe_payout_id TEXT,
    status TEXT DEFAULT 'processing' CHECK(status IN ('processing', 'paid', 'failed', 'cancelled')),
    fees REAL DEFAULT 0,
    net_amount REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('NOW')),
    paid_at TEXT,
    FOREIGN KEY (creator_id) REFERENCES users(id)
);

-- Indexes for performance
CREATE INDEX idx_templates_category_published ON templates(category, published_at);
CREATE INDEX idx_templates_creator_sales ON templates(creator_id, sales_count);
CREATE INDEX idx_template_sales_template_date ON template_sales(template_id, timestamp);
CREATE INDEX idx_commissions_creator_eligible ON commissions(creator_id, eligible_for_payout_at);
CREATE INDEX idx_commissions_status ON commissions(status);
```

---

## **💰 Backend Commission System Implementation**

### **Commission Calculation Engine**

```typescript
// backend/src/utils/commissionCalculator.ts
interface CommissionCalculator {
  calculateCommission(amount: number, creatorTier: CreatorTier, templateCategory: string): CommissionResult;
  calculatePayoutSchedule(sales: TemplateSale[]): PayoutSchedule[];
  applyCategoryMultipliers(creatorTier: CreatorTier, templateCategory: string): number;
}

class CommissionCalculatorImpl implements CommissionCalculator {
  private readonly COMMISSION_RATES = {
    basic: 0.50,
    verified: 0.55,
    elite: 0.65,
    pro: 0.73
  };
  
  private readonly CATEGORY_MULTIPLIERS = {
    healthcare: 1.0,
    business: 1.0,
    education: 1.0,
    events: 1.0,
    premium: 1.05, // 5% bonus for premium categories
    enterprise: 1.10 // 10% bonus for enterprise categories
  };

  calculateCommission(amount: number, creatorTier: CreatorTier, templateCategory: string): CommissionResult {
    const baseRate = this.COMMISSION_RATES[creatorTier];
    const multiplier = this.CATEGORY_MULTIPLIERS[templateCategory] || 1.0;
    const adjustedRate = Math.min(baseRate * multiplier, 0.85); // Cap at 85%
    
    // Ensure precision to cents
    const creatorEarnings = Math.round(amount * adjustedRate * 100) / 100;
    const platformFee = Math.round(amount * (1 - adjustedRate) * 100) / 100;
    
    // Handle rounding discrepancies
    const total = creatorEarnings + platformFee;
    if (total !== amount) {
      const diff = amount - total;
      creatorEarnings += diff;
    }
    
    return {
      creatorEarnings,
      platformFee,
      commissionRate: adjustedRate,
      currency: 'USD',
      breakdown: {
        creatorCommission: creatorEarnings,
        platformPercentage: 1 - adjustedRate,
        paymentProcessing: 0, // Calculated separately
        taxes: 0, // Calculated separately
        adjustments: total !== amount ? amount - total : 0
      }
    };
  }

  calculatePayoutSchedule(sales: TemplateSale[]): PayoutSchedule[] {
    const payouts: PayoutSchedule[] = [];
    const salesByMonth = this.groupSalesByMonth(sales);
    
    for (const [month, monthSales] of Object.entries(salesByMonth)) {
      const totalEarnings = monthSales.reduce((sum, sale) => {
        const commission = this.calculateCommission(sale.amount, sale.creatorTier, sale.templateCategory);
        return sum + commission.creatorEarnings;
      }, 0);
      
      const payoutDate = this.calculatePayoutDate(month);
      const minimumThreshold = 50; // $50 minimum
      
      payouts.push({
        period: month,
        salesCount: monthSales.length,
        totalEarnings,
        minimumThreshold,
        meetsThreshold: totalEarnings >= minimumThreshold,
        scheduledPayoutDate: payoutDate,
        status: totalEarnings >= minimumThreshold ? 'pending' : 'held',
        currency: 'USD'
      });
    }
    
    return payouts;
  }

  private groupSalesByMonth(sales: TemplateSale[]): Record<string, TemplateSale[]> {
    return sales.reduce((groups, sale) => {
      const month = new Date(sale.timestamp).toISOString().slice(0, 7); // YYYY-MM format
      if (!groups[month]) {
        groups[month] = [];
      }
      groups[month].push(sale);
      return groups;
    }, {} as Record<string, TemplateSale[]>);
  }

  private calculatePayoutDate(month: string): Date {
    // Net 30 days - payouts on 15th of following month
    const payoutDate = new Date(month);
    payoutDate.setMonth(payoutDate.getMonth() + 1);
    payoutDate.setDate(15);
    return payoutDate;
  }

  applyCategoryMultipliers(creatorTier: CreatorTier, templateCategory: string): number {
    const baseRate = this.COMMISSION_RATES[creatorTier];
    const multiplier = this.CATEGORY_MULTIPLIERS[templateCategory] || 1.0;
    return Math.min(baseRate * multiplier, 0.85);
  }
}
```

### **Stripe Connect Integration**

```typescript
// backend/src/services/payoutService.ts
interface PayoutService {
  createPayout(creatorId: string, amount: number, currency: string): Promise<PayoutResult>;
  createAccountLink(creatorId: string): Promise<string>;
  verifyAccount(creatorId: string): Promise<AccountVerification>;
  processBatchPayouts(creators: Creator[]): Promise<BatchPayoutResult[]>;
}

class StripePayoutService implements PayoutService {
  private stripe: Stripe;

  constructor(secretKey: string) {
    this.stripe = new Stripe(secretKey, {
      apiVersion: '2023-10-16',
      typescript: true
    });
  }

  async createPayout(creatorId: string, amount: number, currency: string): Promise<PayoutResult> {
    const creator = await this.getCreatorProfile(creatorId);
    
    if (!creator.stripeAccountId) {
      throw new Error('Creator does not have a connected Stripe account');
    }

    const payout = await this.stripe.payouts.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency: currency.toLowerCase(),
      destination: creator.stripeAccountId
    });

    // Record payout in database
    await this.recordPayout({
      id: payout.id,
      creatorId,
      amount,
      currency,
      stripePayoutId: payout.id,
      status: 'paid'
    });

    return {
      success: true,
      payoutId: payout.id,
      amount,
      currency,
      estimatedDelivery: payout.arrival_date
    };
  }

  async createAccountLink(creatorId: string): Promise<string> {
    const accountLink = await this.stripe.accountLinks.create({
      account: await this.getOrCreateStripeAccount(creatorId),
      refresh_url: `${process.env.FRONTEND_URL}/creator/onboard/refresh`,
      return_url: `${process.env.FRONTEND_URL}/creator/onboard/return`,
      type: 'account_onboarding'
    });

    return accountLink.url;
  }

  async verifyAccount(creatorId: string): Promise<AccountVerification> {
    const creator = await this.getCreatorProfile(creatorId);
    
    if (!creator.stripeAccountId) {
      return { verified: false, reason: 'No connected account' };
    }

    const account = await this.stripe.accounts.retrieve(creator.stripeAccountId);
    
    return {
      verified: account.charges_enabled && account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      requirements: account.requirements,
      capabilities: account.capabilities
    };
  }

  async processBatchPayouts(creators: Creator[]): Promise<BatchPayoutResult[]> {
    const results: BatchPayoutResult[] = [];
    
    for (const creator of creators) {
      try {
        const pendingSales = await this.getPendingSales(creator.id);
        const totalAmount = this.calculateTotalPayout(pendingSales);
        
        if (totalAmount >= 50) { // Minimum threshold
          const result = await this.createPayout(creator.id, totalAmount, 'USD');
          results.push({
            creatorId: creator.id,
            success: true,
            amount: totalAmount,
            payoutId: result.payoutId
          });
        }
      } catch (error) {
        results.push({
          creatorId: creator.id,
          success: false,
          error: error.message
        });
      }
    }
    
    return results;
  }

  private async getCreatorProfile(creatorId: string): Promise<CreatorProfile> {
    // Implementation to fetch creator profile from database
    // This would typically query the creator_profiles table
  }

  private async recordPayout(payoutData: PayoutRecord): Promise<void> {
    // Implementation to record payout in database
    // This would typically insert into the payouts table
  }

  private async getPendingSales(creatorId: string): Promise<TemplateSale[]> {
    // Implementation to fetch pending sales for creator
    // This would typically query the commissions table
  }

  private calculateTotalPayout(sales: TemplateSale[]): number {
    return sales.reduce((total, sale) => total + sale.creatorEarnings, 0);
  }
}
```

---

## **⚖️ Backend Legal Compliance Implementation**

### **Automatic Data Deletion System**

```typescript
// backend/src/services/complianceService.ts
interface ComplianceService {
  scheduleDataRetention(submissionId: string, formType: string, submissionData: any): Promise<void>;
  executeScheduledDeletion(submissionId: string): Promise<DeletionResult>;
  handleErasureRequest(userId: string, reason: string): Promise<ErasureResult>;
  applyLegalHold(submissionId: string, caseId: string, reason: string): Promise<LegalHoldResult>;
  generateComplianceReport(period: string): Promise<ComplianceReport>;
}

class ComplianceServiceImpl implements ComplianceService {
  constructor(private env: Env) {}

  async scheduleDataRetention(submissionId: string, formType: string, submissionData: any): Promise<void> {
    const policy = this.getRetentionPolicy(formType);
    const ttl = this.calculateTTL(policy);
    
    if (ttl === null) {
      // No auto-deletion for regulated data
      await this.createLegalHold(submissionId, policy);
      return;
    }
    
    // Store with TTL
    await this.env.FORMWEAVER_SUBMISSIONS.put(
      `submission:${submissionId}`,
      JSON.stringify(submissionData),
      { 
        expirationTtl: ttl,
        metadata: {
          formType,
          retentionPolicy: policy.formType,
          scheduledDeletion: new Date(Date.now() + ttl * 1000).toISOString(),
          notifyBeforeDelete: policy.notifyBeforeDelete
        }
      }
    );
    
    // Schedule notification
    if (policy.notifyBeforeDelete) {
      await this.scheduleDeletionNotification(submissionId, ttl);
    }
    
    // Log retention action
    await this.logComplianceAction(submissionId, 'scheduled', policy);
  }

  calculateTTL(policy: DataRetentionConfig): number | null {
    if (!policy.autoDelete || policy.legalHold) {
      return null; // No auto-deletion
    }
    
    return policy.retentionDays * 24 * 60 * 60; // Convert days to seconds
  }

  getRetentionPolicy(formType: string): DataRetentionConfig {
    const policies = {
      'contact': { 
        formType: 'contact', 
        retentionDays: 30, 
        autoDelete: true, 
        legalHold: false,
        industry: 'general',
        notifyBeforeDelete: true
      },
      'lead': { 
        formType: 'lead', 
        retentionDays: 365, 
        autoDelete: true, 
        legalHold: false,
        industry: 'general',
        notifyBeforeDelete: true
      },
      'event': { 
        formType: 'event', 
        retentionDays: 30, 
        autoDelete: true, 
        legalHold: false,
        industry: 'general',
        notifyBeforeDelete: true
      },
      'job-application': { 
        formType: 'job-application', 
        retentionDays: 180, 
        autoDelete: true, 
        legalHold: false,
        industry: 'general',
        notifyBeforeDelete: true
      },
      'medical': { 
        formType: 'medical', 
        retentionDays: 2190, // 6 years
        autoDelete: false, 
        legalHold: true,
        industry: 'healthcare',
        notifyBeforeDelete: false
      },
      'financial': { 
        formType: 'financial', 
        retentionDays: 2555, // 7 years
        autoDelete: false, 
        legalHold: true,
        industry: 'financial',
        notifyBeforeDelete: false
      },
      'failed': { 
        formType: 'failed', 
        retentionDays: 7, 
        autoDelete: true, 
        legalHold: false,
        industry: 'general',
        notifyBeforeDelete: false
      }
    };
    
    return policies[formType] || policies['contact'];
  }

  async executeScheduledDeletion(submissionId: string): Promise<DeletionResult> {
    // Check for legal hold
    const holdKey = `hold:${submissionId}`;
    const legalHold = await this.env.LEGAL_HOLDS.get(holdKey);
    
    if (legalHold) {
      return {
        success: false,
        reason: 'Legal hold active',
        submissionId
      };
    }
    
    // Delete submission
    const deletionResult = await this.env.FORMWEAVER_SUBMISSIONS.delete(`submission:${submissionId}`);
    
    if (deletionResult) {
      // Log deletion
      await this.logComplianceAction(submissionId, 'deleted', null);
      
      return {
        success: true,
        submissionId,
        deletedAt: new Date().toISOString()
      };
    } else {
      return {
        success: false,
        reason: 'Submission not found',
        submissionId
      };
    }
  }

  async handleErasureRequest(userId: string, reason: string): Promise<ErasureResult> {
    const requestId = `erasure_${userId}_${Date.now()}`;
    
    // Find all user data across systems
    const searchData = await this.findUserData(userId);
    
    if (searchData.totalRecords === 0) {
      return {
        requestId,
        success: true,
        deletedRecords: 0,
        message: 'No user data found'
      };
    }
    
    // Check for legal holds
    const legalHolds = await this.checkLegalHolds(userId);
    
    if (legalHolds.length > 0) {
      return {
        requestId,
        success: false,
        reason: 'Cannot delete data due to active legal holds',
        legalHolds: legalHolds.length,
        message: 'Please resolve legal holds before requesting deletion'
      };
    }
    
    // Execute deletion
    const deletionResult = await this.deleteUserData(userId, searchData);
    
    // Log erasure request
    await this.logErasureRequest(requestId, userId, searchData.totalRecords, deletionResult.deletedCount);
    
    return {
      requestId,
      success: true,
      deletedRecords: deletionResult.deletedCount,
      totalRecords: searchData.totalRecords,
      completedAt: new Date().toISOString(),
      message: `Successfully deleted ${deletionResult.deletedCount} records`
    };
  }

  private async logComplianceAction(
    submissionId: string, 
    action: string, 
    policy: DataRetentionConfig | null
  ): Promise<void> {
    const logEntry = {
      submissionId,
      action,
      policy: policy?.formType,
      timestamp: new Date().toISOString()
    };
    
    await this.env.COMPLIANCE_LOG.put(
      `compliance:${Date.now()}:${submissionId}`,
      JSON.stringify(logEntry)
    );
  }
}
```

### **GDPR/CCPA Compliance Dashboard**

```typescript
// backend/src/routes/compliance.ts
const compliance = new Hono<{ Bindings: Env }>();

// Get compliance overview
compliance.get('/overview', authMiddleware, adminGuard, async (c) => {
  const overview = await getComplianceOverview(c.env);
  
  return c.json({
    totalSubmissions: overview.totalSubmissions,
    pendingDeletion: overview.pendingDeletion,
    legalHoldCount: overview.legalHoldCount,
    avgRetentionDays: overview.avgRetentionDays,
    gdprRequests: {
      deletionRequests: overview.gdprRequests.deletionRequests,
      completed: overview.gdprRequests.completed,
      avgCompletionTimeDays: overview.gdprRequests.avgCompletionTimeDays,
      complianceRate: overview.gdprRequests.completed / Math.max(overview.gdprRequests.deletionRequests, 1)
    },
    upcomingAudits: overview.upcomingAudits,
    lastAuditDate: overview.lastAuditDate
  });
});

// List submissions pending deletion
compliance.get('/deletions/pending', authMiddleware, adminGuard, async (c) => {
  const { daysAhead = 7 } = c.req.query();
  
  const pendingDeletions = await getPendingDeletions(c.env, parseInt(daysAhead));
  
  return c.json({
    scheduledDeletions: pendingDeletions.map(submission => ({
      submissionId: submission.id,
      formId: submission.formId,
      formName: submission.formName,
      userId: submission.userId,
      scheduledDeletion: submission.scheduledDeletion,
      retentionPeriod: submission.retentionPeriod,
      legalBasis: submission.legalBasis,
      dataSize: submission.dataSize,
      notificationSent: submission.notificationSent
    })),
    summary: {
      totalScheduled: pendingDeletions.length,
      totalDataMb: pendingDeletions.reduce((sum, sub) => sum + sub.dataSize, 0) / 1024 / 1024,
      notificationsPending: pendingDeletions.filter(sub => !sub.notificationSent).length
    }
  });
});

// Execute batch deletion
compliance.post('/deletions/execute', authMiddleware, adminGuard, async (c) => {
  const { batchSize = 100, dryRun = false } = await c.req.json();
  
  const result = await executeBatchDeletion(c.env, batchSize, dryRun);
  
  return c.json({
    success: true,
    processedCount: result.processedCount,
    deletedCount: result.deletedCount,
    skippedCount: result.skippedCount,
    errors: result.errors,
    dryRun,
    executionTimeMs: result.executionTimeMs
  });
});

// Handle data export request
compliance.post('/export/:userId', authMiddleware, async (c) => {
  const { userId } = c.req.param();
  const { format = 'json' } = c.req.query();
  
  // Verify user can request their own data
  const requestingUserId = c.get('userId');
  if (requestingUserId !== userId) {
    return c.json({ error: 'Forbidden' }, 403);
  }
  
  const exportResult = await generateDataExport(c.env, userId, format);
  
  return c.json({
    exportId: exportResult.exportId,
    status: exportResult.status,
    downloadUrl: exportResult.downloadUrl,
    expiresAt: exportResult.expiresAt,
    dataSize: exportResult.dataSize
  });
});

// Apply legal hold
compliance.post('/legal-holds', authMiddleware, adminGuard, async (c) => {
  const { submissionId, caseId, reason } = await c.req.json();
  
  const holdResult = await applyLegalHold(c.env, submissionId, caseId, reason);
  
  return c.json({
    success: holdResult.success,
    holdId: holdResult.holdId,
    submissionId,
    caseId,
    appliedAt: holdResult.appliedAt,
    expiresAt: holdResult.expiresAt
  });
});

// Get audit logs
compliance.get('/audit-logs', authMiddleware, adminGuard, async (c) => {
  const { startDate, endDate, actionType, limit = 1000 } = c.req.query();
  
  const logs = await getAuditLogs(c.env, {
    startDate,
    endDate,
    actionType,
    limit: parseInt(limit)
  });
  
  return c.json({
    logs: logs.map(log => ({
      timestamp: log.timestamp,
      action: log.action,
      performedBy: log.performedBy,
      details: log.details,
      ipAddress: log.ipAddress,
      userAgent: log.userAgent
    })),
    total: logs.length,
    filters: { startDate, endDate, actionType }
  });
});
```

---

## **🚀 Backend Performance Optimization**

### **Database Query Optimization**

```typescript
// backend/src/db/queries.ts
export const marketplaceQueries = {
  // Optimized template search with pagination
  searchTemplates: `
    SELECT t.*, 
           c.name as creator_name, 
           c.verified as creator_verified,
           AVG(r.rating) as avg_rating, 
           COUNT(r.id) as review_count,
           COUNT(s.id) as sales_count
    FROM templates t
    JOIN creator_profiles c ON t.creator_id = c.user_id
    LEFT JOIN reviews r ON t.id = r.template_id
    LEFT JOIN template_sales s ON t.id = s.template_id
    WHERE t.published_at IS NOT NULL 
      AND t.status = 'published'
      AND (:category IS NULL OR t.category = :category)
      AND (:complexity IS NULL OR t.complexity = :complexity)
      AND (:minPrice IS NULL OR t.price >= :minPrice)
      AND (:maxPrice IS NULL OR t.price <= :maxPrice)
      AND (:search IS NULL OR (
        t.name LIKE :searchPattern OR 
        t.description LIKE :searchPattern OR 
        t.tags LIKE :searchPattern
      ))
    GROUP BY t.id, c.name, c.verified
    ORDER BY 
      CASE WHEN :sort = 'rating' THEN AVG(r.rating) END DESC,
      CASE WHEN :sort = 'sales' THEN COUNT(s.id) END DESC,
      CASE WHEN :sort = 'newest' THEN t.published_at END DESC,
      t.created_at DESC
    LIMIT :limit OFFSET :offset
  `,

  // Creator analytics with optimized aggregations
  getCreatorAnalytics: `
    SELECT 
      COUNT(DISTINCT s.id) as total_sales,
      SUM(c.creator_earnings) as total_earnings,
      SUM(CASE WHEN c.status = 'pending' THEN c.creator_earnings ELSE 0 END) as pending_earnings,
      SUM(CASE WHEN c.eligible_for_payout_at <= datetime('now') THEN c.creator_earnings ELSE 0 END) as available_payout,
      COUNT(DISTINCT t.id) as active_templates,
      AVG(c.creator_earnings) as avg_commission,
      COUNT(DISTINCT strftime('%Y-%m', s.timestamp)) as active_months
    FROM template_sales s
    JOIN commissions c ON s.id = c.sale_id
    JOIN templates t ON s.template_id = t.id
    WHERE t.creator_id = :creatorId
      AND t.status = 'published'
      AND (:startDate IS NULL OR s.timestamp >= :startDate)
      AND (:endDate IS NULL OR s.timestamp <= :endDate)
  `,

  // Template performance metrics
  getTemplatePerformance: `
    SELECT 
      t.id,
      t.name,
      t.price,
      COUNT(s.id) as sales_count,
      SUM(c.creator_earnings) as total_earnings,
      AVG(r.rating) as avg_rating,
      COUNT(r.id) as review_count,
      COUNT(DISTINCT v.id) as view_count,
      COUNT(DISTINCT CASE WHEN v.converted THEN v.id END) as conversion_count
    FROM templates t
    LEFT JOIN template_sales s ON t.id = s.template_id
    LEFT JOIN commissions c ON s.id = c.sale_id
    LEFT JOIN reviews r ON t.id = r.template_id
    LEFT JOIN template_views v ON t.id = v.template_id
    WHERE t.creator_id = :creatorId
      AND t.status = 'published'
    GROUP BY t.id, t.name, t.price
    ORDER BY sales_count DESC
  `,

  // Commission calculations with proper indexing
  calculateCommissions: `
    SELECT 
      s.template_id,
      s.creator_id,
      s.amount,
      s.timestamp,
      c.tier as creator_tier,
      t.category as template_category,
      calculate_commission(s.amount, c.tier, t.category) as commission_amount
    FROM template_sales s
    JOIN creator_profiles c ON s.creator_id = c.user_id
    JOIN templates t ON s.template_id = t.id
    WHERE s.timestamp >= :startDate
      AND s.timestamp <= :endDate
      AND s.commission_calculated = 0
  `
};

// Index creation for optimal performance
export const createIndexes = `
  -- Template search indexes
  CREATE INDEX IF NOT EXISTS idx_templates_category_published ON templates(category, published_at);
  CREATE INDEX IF NOT EXISTS idx_templates_complexity_published ON templates(complexity, published_at);
  CREATE INDEX IF NOT EXISTS idx_templates_price_published ON templates(price, published_at);
  CREATE INDEX IF NOT EXISTS idx_templates_sales_count ON templates(sales_count DESC);
  
  -- Creator analytics indexes
  CREATE INDEX IF NOT EXISTS idx_template_sales_creator_date ON template_sales(creator_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_commissions_creator_eligible ON commissions(creator_id, eligible_for_payout_at);
  CREATE INDEX IF NOT EXISTS idx_commissions_status ON commissions(status);
  
  -- Performance indexes
  CREATE INDEX IF NOT EXISTS idx_template_sales_template_date ON template_sales(template_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_reviews_template_created ON reviews(template_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_template_views_template_date ON template_views(template_id, viewed_at);
  
  -- Compliance indexes
  CREATE INDEX IF NOT EXISTS idx_submissions_form_created ON submissions(form_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_submissions_user_created ON submissions(user_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_compliance_logs_timestamp ON compliance_logs(timestamp);
`;
```

### **KV Caching Strategy**

```typescript
// backend/src/utils/cacheManager.ts
interface CacheManager {
  getTemplate(templateId: string): Promise<Template | null>;
  setTemplate(template: Template): Promise<void>;
  invalidateTemplate(templateId: string): Promise<void>;
  getCreatorAnalytics(creatorId: string): Promise<CreatorAnalytics | null>;
  setCreatorAnalytics(creatorId: string, analytics: CreatorAnalytics): Promise<void>;
  invalidateCreatorAnalytics(creatorId: string): Promise<void>;
}

class KVCacheManager implements CacheManager {
  constructor(private env: Env) {}

  async getTemplate(templateId: string): Promise<Template | null> {
    const cacheKey = `template:${templateId}`;
    const cached = await this.env.FORMWEAVER_TEMPLATES.get(cacheKey, 'json');
    return cached;
  }

  async setTemplate(template: Template): Promise<void> {
    const cacheKey = `template:${template.id}`;
    await this.env.FORMWEAVER_TEMPLATES.put(
      cacheKey,
      JSON.stringify(template),
      { expirationTtl: 600 } // 10 minutes
    );
    
    // Also cache by category for search results
    const categoryKey = `category:${template.category}:${template.complexity}`;
    await this.invalidateCategoryCache(categoryKey);
  }

  async invalidateTemplate(templateId: string): Promise<void> {
    const cacheKey = `template:${templateId}`;
    await this.env.FORMWEAVER_TEMPLATES.delete(cacheKey);
  }

  async getCreatorAnalytics(creatorId: string): Promise<CreatorAnalytics | null> {
    const cacheKey = `creator:analytics:${creatorId}`;
    const cached = await this.env.FORMWEAVER_CACHE.get(cacheKey, 'json');
    return cached;
  }

  async setCreatorAnalytics(creatorId: string, analytics: CreatorAnalytics): Promise<void> {
    const cacheKey = `creator:analytics:${creatorId}`;
    await this.env.FORMWEAVER_CACHE.put(
      cacheKey,
      JSON.stringify(analytics),
      { expirationTtl: 300 } // 5 minutes
    );
  }

  async invalidateCreatorAnalytics(creatorId: string): Promise<void> {
    const cacheKey = `creator:analytics:${creatorId}`;
    await this.env.FORMWEAVER_CACHE.delete(cacheKey);
  }

  private async invalidateCategoryCache(categoryKey: string): Promise<void> {
    // List and delete all cache entries for this category
    const keys = await this.env.FORMWEAVER_CACHE.list({ prefix: categoryKey });
    await Promise.all(
      keys.keys.map(key => this.env.FORMWEAVER_CACHE.delete(key.name))
    );
  }

  // Cache warming for popular templates
  async warmPopularTemplates(): Promise<void> {
    const popularTemplates = await this.getPopularTemplates();
    
    await Promise.all(
      popularTemplates.map(template => this.setTemplate(template))
    );
  }

  private async getPopularTemplates(): Promise<Template[]> {
    // Fetch popular templates from database
    // This would typically query templates with high sales_count
    return []; // Placeholder implementation
  }
}
```

---

## **📊 Backend Monitoring & Analytics**

### **Marketplace Performance Monitoring**

```typescript
// backend/src/utils/performanceMonitor.ts
interface PerformanceTracker {
  startTimer(operation: string): () => number;
  recordMetric(metric: string, value: number, tags?: Record<string, string>): Promise<void>;
  getAverageTime(operation: string): number;
  getErrorRate(operation: string): number;
  trackBusinessMetric(metric: BusinessMetric): Promise<void>;
}

class PerformanceTrackerImpl implements PerformanceTracker {
  private timers = new Map<string, number>();
  private metrics = new Map<string, number[]>();

  startTimer(operation: string): () => number {
    this.timers.set(operation, performance.now());
    
    return (): number => {
      const startTime = this.timers.get(operation);
      if (!startTime) return 0;
      
      const duration = performance.now() - startTime;
      this.timers.delete(operation);
      
      this.recordMetric(`${operation}_duration`, duration);
      return duration;
    };
  }

  async recordMetric(metric: string, value: number, tags?: Record<string, string>): Promise<void> {
    if (!this.metrics.has(metric)) {
      this.metrics.set(metric, []);
    }
    
    this.metrics.get(metric)!.push(value);
    
    // Store in KV for persistence
    await this.env.PERFORMANCE_METRICS.put(
      `metric:${metric}:${Date.now()}`,
      JSON.stringify({
        value,
        tags,
        timestamp: Date.now()
      }),
      { expirationTtl: 86400 } // 24 hours
    );
  }

  getAverageTime(operation: string): number {
    const times = this.metrics.get(`${operation}_duration`) || [];
    if (times.length === 0) return 0;
    
    return times.reduce((sum, time) => sum + time, 0) / times.length;
  }

  getErrorRate(operation: string): number {
    const totalRequests = this.metrics.get(`${operation}_requests`) || [];
    const errorRequests = this.metrics.get(`${operation}_errors`) || [];
    
    if (totalRequests.length === 0) return 0;
    
    return errorRequests.length / totalRequests.length;
  }

  async trackBusinessMetric(metric: BusinessMetric): Promise<void> {
    await this.env.BUSINESS_METRICS.put(
      `business:${metric.type}:${Date.now()}`,
      JSON.stringify(metric),
      { expirationTtl: 604800 } // 7 days
    );
  }
}

// Business metrics for marketplace
interface BusinessMetric {
  type: 'template_sale' | 'creator_signup' | 'commission_earned' | 'payout_processed';
  value: number;
  metadata: Record<string, any>;
  timestamp: number;
}

// Performance monitoring middleware
const performanceMiddleware = async (c: Context, next: Next) => {
  const operation = `${c.req.method}:${c.req.path}`;
  const endTimer = performanceMonitor.startTimer(operation);
  
  try {
    await next();
    await performanceMonitor.recordMetric(`${operation}_requests`, 1);
  } catch (error) {
    await performanceMonitor.recordMetric(`${operation}_errors`, 1);
    throw error;
  } finally {
    endTimer();
  }
};

// Marketplace-specific metrics
const trackMarketplaceMetrics = {
  trackTemplateSale: async (templateId: string, amount: number, creatorId: string) => {
    await performanceMonitor.trackBusinessMetric({
      type: 'template_sale',
      value: amount,
      metadata: { templateId, creatorId, currency: 'USD' },
      timestamp: Date.now()
    });
  },

  trackCreatorSignup: async (creatorId: string, tier: string) => {
    await performanceMonitor.trackBusinessMetric({
      type: 'creator_signup',
      value: 1,
      metadata: { creatorId, tier },
      timestamp: Date.now()
    });
  },

  trackCommissionEarned: async (creatorId: string, amount: number) => {
    await performanceMonitor.trackBusinessMetric({
      type: 'commission_earned',
      value: amount,
      metadata: { creatorId },
      timestamp: Date.now()
    });
  },

  trackPayoutProcessed: async (creatorId: string, amount: number) => {
    await performanceMonitor.trackBusinessMetric({
      type: 'payout_processed',
      value: amount,
      metadata: { creatorId },
      timestamp: Date.now()
    });
  }
};
```

### **Alerting & Monitoring Setup**

```typescript
// backend/src/utils/alerting.ts
interface AlertManager {
  checkPerformanceThresholds(): Promise<void>;
  checkErrorRateThresholds(): Promise<void>;
  checkBusinessMetricThresholds(): Promise<void>;
  sendAlert(alert: Alert): Promise<void>;
}

class AlertManagerImpl implements AlertManager {
  constructor(private env: Env) {}

  async checkPerformanceThresholds(): Promise<void> {
    const operations = ['template_search', 'creator_dashboard', 'commission_calculation'];
    
    for (const operation of operations) {
      const avgTime = performanceMonitor.getAverageTime(operation);
      
      if (avgTime > this.getThreshold(operation)) {
        await this.sendAlert({
          type: 'performance',
          severity: 'warning',
          message: `${operation} average response time ${avgTime.toFixed(2)}ms exceeds threshold`,
          metadata: { operation, avgTime, threshold: this.getThreshold(operation) }
        });
      }
    }
  }

  async checkErrorRateThresholds(): Promise<void> {
    const operations = ['marketplace_api', 'creator_api', 'payment_processing'];
    
    for (const operation of operations) {
      const errorRate = performanceMonitor.getErrorRate(operation);
      
      if (errorRate > 0.05) { // 5% error rate threshold
        await this.sendAlert({
          type: 'error_rate',
          severity: 'critical',
          message: `${operation} error rate ${errorRate.toFixed(2)} exceeds 5% threshold`,
          metadata: { operation, errorRate }
        });
      }
    }
  }

  async checkBusinessMetricThresholds(): Promise<void> {
    // Check for unusual business metric patterns
    const recentSales = await this.getRecentSalesCount();
    const recentSignups = await this.getRecentSignupCount();
    
    if (recentSales < this.getExpectedSales()) {
      await this.sendAlert({
        type: 'business',
        severity: 'warning',
        message: `Sales volume below expected threshold`,
        metadata: { recentSales, expectedSales: this.getExpectedSales() }
      });
    }
    
    if (recentSignups < this.getExpectedSignups()) {
      await this.sendAlert({
        type: 'business',
        severity: 'warning',
        message: `Creator signups below expected threshold`,
        metadata: { recentSignups, expectedSignups: this.getExpectedSignups() }
      });
    }
  }

  private getThreshold(operation: string): number {
    const thresholds = {
      'template_search': 500,      // 500ms
      'creator_dashboard': 1500,   // 1.5s
      'commission_calculation': 100 // 100ms
    };
    
    return thresholds[operation] || 1000;
  }

  private async getRecentSalesCount(): Promise<number> {
    // Implementation to get recent sales count
    return 0; // Placeholder
  }

  private async getRecentSignupCount(): Promise<number> {
    // Implementation to get recent signup count
    return 0; // Placeholder
  }

  private getExpectedSales(): number {
    return 10; // Expected sales per hour
  }

  private getExpectedSignups(): number {
    return 2; // Expected signups per hour
  }

  async sendAlert(alert: Alert): Promise<void> {
    // Store alert in database
    await this.env.ALERTS.put(
      `alert:${Date.now()}`,
      JSON.stringify({
        ...alert,
        timestamp: Date.now()
      })
    );
    
    // Send notification (email, webhook, etc.)
    if (alert.severity === 'critical') {
      await this.sendCriticalAlert(alert);
    }
  }

  private async sendCriticalAlert(alert: Alert): Promise<void> {
    // Implementation to send critical alerts via email/webhook
    // This would typically integrate with notification services
  }
}

interface Alert {
  type: 'performance' | 'error_rate' | 'business';
  severity: 'warning' | 'critical';
  message: string;
  metadata: Record<string, any>;
  timestamp: number;
}
```

---

## **🔧 Backend Deployment & Operations**

### **Environment Configuration**

```toml
# backend/wrangler.toml
name = "formweaver-marketplace"
main = "src/index.ts"
compatibility_date = "2024-11-23"

# KV Namespaces
[[kv_namespaces]]
binding = "FORMWEAVER_TEMPLATES"
id = "${FORMWEAVER_TEMPLATES_ID}"

[[kv_namespaces]]
binding = "FORMWEAVER_SUBMISSIONS"
id = "${FORMWEAVER_SUBMISSIONS_ID}"

[[kv_namespaces]]
binding = "FORMWEAVER_CACHE"
id = "${FORMWEAVER_CACHE_ID}"

[[kv_namespaces]]
binding = "LEGAL_HOLDS"
id = "${LEGAL_HOLDS_ID}"

[[kv_namespaces]]
binding = "COMPLIANCE_LOG"
id = "${COMPLIANCE_LOG_ID}"

# D1 Database
[[d1_databases]]
binding = "DB"
database_name = "formweaver_db"
database_id = "${D1_DATABASE_ID}"

# R2 Storage
[[r2_buckets]]
binding = "FORMWEAVER_STORAGE"
bucket_name = "formweaver-storage"

# Durable Objects
[[durable_objects.bindings]]
name = "TemplateSales"
class_name = "TemplateSales"

[[durable_objects.bindings]]
name = "ComplianceEngine"
class_name = "ComplianceEngine"

[[durable_objects.bindings]]
name = "PayoutProcessor"
class_name = "PayoutProcessor"

# Environment Variables
[vars]
ENVIRONMENT = "production"
JWT_SECRET = "${JWT_SECRET}"
STRIPE_SECRET_KEY = "${STRIPE_SECRET_KEY}"
STRIPE_WEBHOOK_SECRET = "${STRIPE_WEBHOOK_SECRET}"
FRONTEND_URL = "https://formweaver.com"

# Performance & Monitoring
PERFORMANCE_MONITORING = true
ALERT_WEBHOOK_URL = "${ALERT_WEBHOOK_URL}"

# Feature Flags
MARKETPLACE_ENABLED = true
COMMISSION_SYSTEM_ENABLED = true
COMPLIANCE_AUTOMATION_ENABLED = true

[env.staging]
name = "formweaver-marketplace-staging"
compatibility_date = "2024-11-23"

[env.development]
name = "formweaver-marketplace-dev"
compatibility_date = "2024-11-23"
```

### **CI/CD Pipeline Configuration**

```yaml
# .github/workflows/backend-marketplace.yml
name: Backend Marketplace CI/CD

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Type checking
      run: npm run type-check
    
    - name: Linting
      run: npm run lint
    
    - name: Unit tests
      run: npm run test:unit
    
    - name: Integration tests
      run: npm run test:integration
      env:
        DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
        JWT_SECRET: test-secret
        STRIPE_SECRET_KEY: sk_test_...
    
    - name: Marketplace API tests
      run: npm run test:marketplace
    
    - name: Commission calculation tests
      run: npm run test:commissions
    
    - name: Compliance tests
      run: npm run test:compliance

  deploy-staging:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Deploy to staging
      uses: cloudflare/actions/wrangler@v3
      with:
        apiToken: ${{ secrets.CF_API_TOKEN }}
        accountId: ${{ secrets.CF_ACCOUNT_ID }}
        wranglerConfigFile: backend/wrangler.toml
        env: staging
    
    - name: Smoke tests
      run: |
        npm run test:smoke:staging
      env:
        STAGING_URL: ${{ steps.deploy.outputs.url }}

  deploy-production:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Deploy to production
      uses: cloudflare/actions/wrangler@v3
      with:
        apiToken: ${{ secrets.CF_API_TOKEN }}
        accountId: ${{ secrets.CF_ACCOUNT_ID }}
        wranglerConfigFile: backend/wrangler.toml
        env: production
    
    - name: Health check
      run: |
        npm run test:health:production
    
    - name: Notify deployment
      run: |
        curl -X POST "${{ secrets.SLACK_WEBHOOK }}" \
          -H 'Content-type: application/json' \
          --data '{"text":"FormWeaver Backend Marketplace deployed to production"}'
```

### **Database Migration Strategy**

```sql
-- Migration 001: Template Marketplace Tables
-- File: backend/migrations/001_add_marketplace_tables.sql

-- Templates table
CREATE TABLE templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category TEXT NOT NULL,
    complexity TEXT NOT NULL,
    schema TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    version TEXT DEFAULT '1.0.0',
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'published', 'rejected')),
    retention_settings TEXT,
    sales_count INTEGER DEFAULT 0,
    rating REAL DEFAULT 0,
    reviews_count INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('NOW')),
    updated_at TEXT DEFAULT (datetime('NOW')),
    published_at TEXT,
    deleted_at TEXT,
    FOREIGN KEY (creator_id) REFERENCES users(id)
);

-- Creator profiles table
CREATE TABLE creator_profiles (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    professional_name TEXT NOT NULL,
    bio TEXT,
    website TEXT,
    portfolio_url TEXT,
    specialties TEXT,
    tier TEXT DEFAULT 'basic' CHECK(tier IN ('basic', 'verified', 'elite', 'pro')),
    stripe_account_id TEXT,
    student_verified BOOLEAN DEFAULT FALSE,
    onboarding_complete BOOLEAN DEFAULT FALSE,
    created_at TEXT DEFAULT (datetime('NOW')),
    updated_at TEXT DEFAULT (datetime('NOW')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Template sales table
CREATE TABLE template_sales (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    buyer_id TEXT NOT NULL,
    amount REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    commission_rate REAL NOT NULL,
    creator_earnings REAL NOT NULL,
    platform_fee REAL NOT NULL,
    creator_tier TEXT NOT NULL,
    timestamp TEXT DEFAULT (datetime('NOW')),
    FOREIGN KEY (template_id) REFERENCES templates(id),
    FOREIGN KEY (buyer_id) REFERENCES users(id)
);

-- Commissions table
CREATE TABLE commissions (
    id TEXT PRIMARY KEY,
    template_id TEXT NOT NULL,
    creator_id TEXT NOT NULL,
    sale_id TEXT NOT NULL,
    sale_amount REAL NOT NULL,
    commission_rate REAL NOT NULL,
    creator_earnings REAL NOT NULL,
    platform_fee REAL NOT NULL,
    currency TEXT DEFAULT 'USD',
    calculated_at TEXT DEFAULT (datetime('NOW')),
    eligible_for_payout_at TEXT,
    payout_id TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'paid', 'failed')),
    FOREIGN KEY (template_id) REFERENCES templates(id),
    FOREIGN KEY (creator_id) REFERENCES users(id),
    FOREIGN KEY (sale_id) REFERENCES template_sales(id)
);

-- Indexes for performance
CREATE INDEX idx_templates_category_published ON templates(category, published_at);
CREATE INDEX idx_templates_creator_sales ON templates(creator_id, sales_count);
CREATE INDEX idx_template_sales_template_date ON template_sales(template_id, timestamp);
CREATE INDEX idx_commissions_creator_eligible ON commissions(creator_id, eligible_for_payout_at);
CREATE INDEX idx_commissions_status ON commissions(status);

-- Insert default data
INSERT INTO templates (id, name, description, price, category, complexity, schema, creator_id, status, published_at) VALUES
('template-welcome', 'Welcome Template', 'Sample template for testing', 0, 'general', 'basic', '{}', 'user-demo', 'published', datetime('NOW'));

-- Migration 002: Compliance Tables
-- File: backend/migrations/002_add_compliance_tables.sql

-- Data retention policies table
CREATE TABLE retention_policies (
    id TEXT PRIMARY KEY,
    form_type TEXT NOT NULL UNIQUE,
    retention_days INTEGER NOT NULL,
    auto_delete BOOLEAN DEFAULT TRUE,
    legal_hold BOOLEAN DEFAULT FALSE,
    industry TEXT DEFAULT 'general',
    notify_before_delete BOOLEAN DEFAULT FALSE,
    created_at TEXT DEFAULT (datetime('NOW')),
    updated_at TEXT DEFAULT (datetime('NOW'))
);

-- Legal holds table
CREATE TABLE legal_holds (
    id TEXT PRIMARY KEY,
    submission_id TEXT NOT NULL,
    case_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    hold_start_date TEXT DEFAULT (datetime('NOW')),
    hold_end_date TEXT,
    applied_by TEXT NOT NULL,
    FOREIGN KEY (submission_id) REFERENCES submissions(id)
);

-- Compliance audit log table
CREATE TABLE compliance_audit_log (
    id TEXT PRIMARY KEY,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    performed_by TEXT,
    details TEXT,
    timestamp TEXT DEFAULT (datetime('NOW')),
    ip_address TEXT,
    user_agent TEXT
);

-- Insert default retention policies
INSERT INTO retention_policies (id, form_type, retention_days, auto_delete, legal_hold, industry, notify_before_delete) VALUES
('policy-contact', 'contact', 30, true, false, 'general', true),
('policy-lead', 'lead', 365, true, false, 'general', true),
('policy-event', 'event', 30, true, false, 'general', true),
('policy-job-application', 'job-application', 180, true, false, 'general', true),
('policy-medical', 'medical', 2190, false, true, 'healthcare', false),
('policy-financial', 'financial', 2555, false, true, 'financial', false),
('policy-failed', 'failed', 7, true, false, 'general', false);
```

---

## **📋 Backend Implementation Checklist**

### **Phase 1: Core Marketplace Infrastructure (🔴 CRITICAL)**

- [ ] **Template Marketplace Backend**
  - [ ] KV storage structure for templates with metadata
  - [ ] Template search and filtering API endpoints
  - [ ] Template purchase and licensing system
  - [ ] Template download and access control
  - [ ] Template preview and demo system
  - [ ] Template rating and review system
  - [ ] Template categorization and tagging

- [ ] **Creator Management System**
  - [ ] Creator onboarding workflow and API
  - [ ] Educational email verification system
  - [ ] ID verification and compliance checks
  - [ ] Creator tier management (Basic, Verified, Elite, Pro)
  - [ ] Creator dashboard backend APIs
  - [ ] Template publishing and approval workflow
  - [ ] Creator analytics and performance tracking
  - [ ] Mentorship program backend support

- [ ] **Legal Compliance System**
  - [ ] Automatic data deletion system (30-90 day TTL)
  - [ ] GDPR compliance and data export requests
  - [ ] Right to erasure implementation
  - [ ] Legal hold system for litigation
  - [ ] Industry-specific compliance (HIPAA, SOX)
  - [ ] Audit logging for compliance tracking

- [ ] **Template Review & Quality Assurance**
  - [ ] Template security scanning and validation
  - [ ] Compliance review workflow for regulated industries
  - [ ] Template quality scoring and approval
  - [ ] Creator education and guidance system
  - [ ] Template revision and rollback capabilities
  - [ ] Automated template testing and validation

### **Phase 2: Revenue & Growth (🟡 HIGH)**

- [ ] **Commission & Payout System**
  - [ ] Real-time commission calculation engine (50-73% tiers)
  - [ ] Dynamic commission calculation based on creator tier
  - [ ] Stripe Connect integration for payouts
  - [ ] Multi-currency support (USD, EUR, GBP)
  - [ ] Payout scheduling and processing (Net 30)
  - [ ] Earnings tracking and analytics
  - [ ] Payout history and transaction records
  - [ ] Dispute resolution tracking

- [ ] **Billing/Subscription API**
  - [ ] Stripe integration for subscriptions
  - [ ] Subscription management
  - [ ] Usage tracking and plan limits
  - [ ] Enforce plan limits

- [ ] **Rate Limiting on Auth**
  - [ ] Login: 5 attempts per 15 minutes
  - [ ] Signup: 3 attempts per hour
  - [ ] Password reset: 3 attempts per hour

### **Phase 3: Production Readiness (🟢 MEDIUM)**

- [ ] **Monitoring/Alerting**
  - [ ] Performance monitoring for marketplace APIs
  - [ ] Error tracking and alerting
  - [ ] Compliance automation monitoring
  - [ ] Business metric tracking

- [ ] **CI/CD Pipeline**
  - [ ] Automated testing for marketplace features
  - [ ] Deployment automation
  - [ ] Rollback procedures
  - [ ] Database migration automation

- [ ] **Performance Tests**
  - [ ] Load testing for marketplace operations
  - [ ] Database query optimization
  - [ ] KV performance testing
  - [ ] API response time optimization

---

## **🚀 Success Metrics & KPIs**

### **Backend-Specific Success Criteria**

| Metric | Target | Current | Status |
|--------|--------|---------|---------|
| **API Performance** | | | |
| Template Search API Response | <500ms | TBD | 🔄 |
| Creator Dashboard Load | <1.5s | TBD | 🔄 |
| Commission Calculation | <100ms | TBD | 🔄 |
| Payout Processing | <2s | TBD | 🔄 |
| **Data Compliance** | | | |
| Automatic Deletion Success Rate | 100% | TBD | 🔄 |
| GDPR Request Processing Time | <30 days | TBD | 🔄 |
| Legal Hold System Uptime | 99.9% | TBD | 🔄 |
| **Financial Accuracy** | | | |
| Commission Calculation Accuracy | 100% | TBD | 🔄 |
| Payout Processing Accuracy | 100% | TBD | 🔄 |
| Financial Audit Trail Completeness | 100% | TBD | 🔄 |
| **System Reliability** | | | |
| Marketplace API Uptime | 99.9% | TBD | 🔄 |
| Database Query Success Rate | 99.9% | TBD | 🔄 |
| KV Cache Hit Rate | >90% | TBD | 🔄 |

### **Business Impact Metrics**

| Metric | Target | Current | Status |
|--------|--------|---------|---------|
| **Creator Ecosystem** | | | |
| Active Creators | 1,000+ | 0 | 🔄 |
| Templates Published | 5,000+ | 0 | 🔄 |
| Creator Earnings | $500,000+ | $0 | 🔄 |
| **Marketplace Performance** | | | |
| Template Sales/Month | 1,000+ | 0 | 🔄 |
| Average Commission Rate | 73% | 0% | 🔄 |
| Payout Volume/Month | $50,000+ | $0 | 🔄 |
| **User Experience** | | | |
| Form Conversion Rate | >15% | TBD | 🔄 |
| Creator Dashboard NPS | >50 | TBD | 🔄 |
| Template Quality Score | >4.5/5 | TBD | 🔄 |

---

## **⚠️ Risk Mitigation & Contingency Plans**

### **High-Risk Areas & Mitigation Strategies**

#### 1. **Legal Compliance Risks**
- **Risk**: GDPR/CCPA violations, data retention non-compliance
- **Mitigation**: 
  - Implement automated compliance checks
  - Regular audits and legal review
  - Data protection impact assessments
  - Clear documentation and user consent

#### 2. **Financial System Risks**
- **Risk**: Commission calculation errors, payout failures
- **Mitigation**:
  - Comprehensive financial testing
  - Audit trails for all transactions
  - Multi-currency reconciliation
  - Backup payment processing

#### 3. **Marketplace Adoption Risks**
- **Risk**: Low creator participation, poor template quality
- **Mitigation**:
  - Creator incentive programs
  - Quality assurance processes
  - Marketing and community building
  - Competitive commission rates

#### 4. **Technical Scalability Risks**
- **Risk**: Performance degradation under load
- **Mitigation**:
  - Load testing and optimization
  - Caching strategies
  - Database optimization
  - CDN and edge optimization

### **Contingency Plans**

#### **Phase 1 Delay Contingencies**
- If template marketplace delayed: Focus on core form features first
- If creator system delayed: Implement basic marketplace without tiers
- If compliance delayed: Implement manual processes temporarily

#### **Phase 2 Delay Contingencies**
- If commission system delayed: Use manual payout processing
- If billing delayed: Focus on marketplace without subscriptions
- If auth rate limiting delayed: Implement basic IP-based limits

#### **Emergency Rollback Procedures**
```bash
# Emergency rollback commands
wrangler rollback --env production
wrangler d1:backup create --env production
wrangler kv:namespace list --binding FORMWEAVER_TEMPLATES

# Database rollback
wrangler d1:execute --file rollback.sql
```

---

## **📚 Backend Learning Resources**

### **Recommended Reading**
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Hono Framework Documentation](https://hono.dev/)
- [Stripe Connect API Documentation](https://stripe.com/docs/connect)
- [GDPR Compliance Guide](https://gdpr.eu/)
- [HIPAA Compliance for Developers](https://www.hhs.gov/hipaa/for-professionals/privacy/index.html)

### **Technical References**
- [Form Schema Validation Patterns](https://json-schema.org/)
- [Commission Calculation Best Practices](https://www.investopedia.com/articles/personal-finance/082615/commission-pay.asp)
- [Data Retention Legal Requirements](https://www.termsfeed.com/blog/data-retention-policy/)
- [Marketplace Architecture Patterns](https://www.notion.so/Marketplace-Architecture-c9b8e8f1a8d54e8e8b8e8f1a8d54e8e8)

### **Community & Support**
- [FormWeaver Developer Discord](https://discord.gg/formweaver)
- [Backend Development Forum](https://community.formweaver.com/backend)
- [Marketplace Creator Community](https://community.formweaver.com/marketplace)
- [Technical Support Portal](https://support.formweaver.com/technical)

---

**Last Updated:** 2025-11-23  
**Next Review:** 2025-12-23  
**Marketplace Launch Target:** Q1 2025

---

## **🏢 Cross-Reference**

For comprehensive backend post-MVP guidance, also refer to:
- [Backend README](./README.md)
- [Backend API Documentation](./API.md)
- [Backend Checklist](./BACKEND_CHECKLIST.md)
- [Development Rules](./DEV_RULES.md)
- [Implementation Guide](./IMPLEMENTATION_GUIDE.md)
- [Quality Assurance](./QUALITY_ASSURANCE.md)