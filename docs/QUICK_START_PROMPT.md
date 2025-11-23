# Backend Quick Start Prompts for FormWeaver Marketplace

## ⚙️ Backend Development Prompt

```markdown
I'm working on the FormWeaver project. Continue backend development in sprints.

**Your Task:**
1. Read docs/BACKEND_CHECKLIST.md to understand pending tasks
2. Read docs/PROGRESS_CHECKLIST.md to see overall status
3. Read PROJECT_RULES.md for coding standards
4. Read backend/README.md - Note the new secrets/R2 setup sections
5. Determine the highest priority pending feature from the checklist
6. Break it into a 2-3 hour sprint
7. Implement the first sprint task following project conventions
8. Run type checks, lint checks, and resolve all errors/warnings in the backend codebase.
9. Update the checklist as you complete items

**Work Autonomously:**
- Use the checklist to determine what to do next
- Only ask for clarification if you encounter blockers or need decisions
- Follow the priority order in the checklist
- Update checklists after completing work
- After completing the sprint, run: git -C backend add . && git -C backend commit -m "FEAT: [brief description]" && git -C backend push
- Check docs/FRONTEND_CHECKLIST.md for API requirements frontend needs
- Ensure type safety using the Bindings pattern in src/types/index.ts

**Context Files:**
- PROJECT_RULES.md - Coding standards and architecture
- docs/BACKEND_CHECKLIST.md - Backend task list (your primary guide)
- docs/PROGRESS_CHECKLIST.md - Overall progress
- docs/FRONTEND_CHECKLIST.md - Frontend status (check for API dependencies)
- backend/README.md - Backend architecture (updated with secrets/R2 setup)

**Important:** The backend README now includes:
- `.dev.vars` setup for local secrets
- Detailed secrets management (JWT_SECRET, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
- R2 bucket configuration
- Type-safe Bindings pattern

Start working now. Determine the next task from the checklist and begin implementation.
```

---

## 🛒 Marketplace Backend Development Prompt

```markdown
I'm working on the FormWeaver template marketplace backend. Continue marketplace backend development in sprints.

**Your Task:**
1. Read docs/BACKEND_CHECKLIST.md → "Template Marketplace Backend" section
2. Read docs/DEV_RULES.md → "Marketplace Development Standards" section
3. Read docs/IMPLEMENTATION_GUIDE.md → "Marketplace Implementation Patterns" section
4. Read docs/POST_MVP_GUIDE.md → "Marketplace Backend Architecture" section
5. Determine the highest priority marketplace backend feature from the checklist
6. Break it into a 2-3 hour sprint with clear deliverables
7. Implement following marketplace backend standards:
   - Creator management and authentication
   - Template marketplace API endpoints
   - Commission and payout system logic
   - Student verification system backend
   - Legal compliance for data retention (30-90 days)
8. Run type checks, lint checks, and resolve all errors/warnings
9. Update both specific checklists and PROGRESS_CHECKLIST.md with marketplace progress

**Marketplace Backend Requirements:**
- Implement 50-73% creator commission structure
- Add student verification with 30% discount system
- Include legal compliance for data retention (30-90 days)
- Add creator analytics and earnings tracking APIs
- Implement template marketplace API endpoints
- Ensure proper authentication and authorization for creators

**Context Files:**
- docs/BACKEND_CHECKLIST.md - Template marketplace backend tasks
- docs/DEV_RULES.md - Marketplace development standards
- docs/IMPLEMENTATION_GUIDE.md - Marketplace implementation patterns
- docs/POST_MVP_GUIDE.md - Complete marketplace strategy guide
- backend/README.md - Backend architecture and setup
```

---

## ⚖️ Legal Compliance Backend Development Prompt

```markdown
I'm working on legal compliance implementation for FormWeaver marketplace backend. Continue compliance backend development.

**Your Task:**
1. Read docs/DEV_RULES.md → "Legal Compliance Development Requirements" section
2. Read docs/IMPLEMENTATION_GUIDE.md → "Legal Compliance Implementation" section
3. Read docs/POST_MVP_GUIDE.md → "Legal Compliance Framework" section
4. Implement data retention system with 30-90 day TTL
5. Add automatic deletion with legal hold support
6. Implement GDPR compliance features:
   - Right to erasure (30-day processing)
   - Data portability export
   - Consent management
7. Add industry-specific compliance (HIPAA, SOX)
8. Implement audit logging and compliance dashboard
9. Run type checks, lint checks, and resolve all errors/warnings
10. Update legal compliance checklist items

**Compliance Backend Requirements:**
- Automatic data deletion with configurable retention periods
- Legal hold system for litigation scenarios
- GDPR compliance with user rights implementation
- Industry-specific requirements for healthcare/financial forms
- Comprehensive audit trails and compliance monitoring
- Type-safe API endpoints for compliance operations

**Context Files:**
- docs/DEV_RULES.md - Legal compliance requirements
- docs/IMPLEMENTATION_GUIDE.md - Compliance implementation patterns
- docs/POST_MVP_GUIDE.md - Legal compliance framework
- backend/README.md - Backend architecture
```

---

## 📊 Overall Backend Project Development Prompt

```markdown
I'm working on the FormWeaver project backend. Continue backend development in sprints.

**Your Task:**
1. Read docs/PROGRESS_CHECKLIST.md to understand overall project status
2. Focus on backend components and marketplace backend features
3. Read docs/BACKEND_CHECKLIST.md for backend-specific tasks
4. Read PROJECT_RULES.md for coding standards
5. Review backend/README.md for R2 & secrets setup patterns
6. Determine the highest priority backend feature from the checklist
7. Break it into a 2-3 hour sprint
8. Implement the first sprint task following project conventions
9. Update both the backend checklist and PROGRESS_CHECKLIST.md as you complete items
10. Run type checks, lint checks, and resolve all errors/warnings in the backend codebase

**Backend Focus Areas:**
- Marketplace API development
- Creator management system
- Data retention and legal compliance
- Authentication and authorization
- R2 storage integration
- Performance optimization

**Work Autonomously:**
- Use PROGRESS_CHECKLIST.md to understand project priorities
- Use BACKEND_CHECKLIST.md to determine specific backend tasks
- Only ask for clarification if you encounter blockers or need decisions
- Follow the priority order in the backend checklist
- Update checklists after completing work
- After completing the sprint, run: git -C backend add . && git -C backend commit -m "FEAT: [brief description]" && git -C backend push
- Coordinate with frontend when API dependencies exist

**Context Files:**
- PROJECT_RULES.md - Coding standards and architecture
- docs/PROGRESS_CHECKLIST.md - Overall project status
- docs/BACKEND_CHECKLIST.md - Backend task list (primary guide)
- docs/FRONTEND_CHECKLIST.md - Frontend status (check for API dependencies)
- backend/README.md - Backend architecture (updated with R2/secrets)
- docs/DEV_RULES.md - Backend development standards

**Important:** Recent updates to backend README include:
- Node.js >= 16.17.0 requirement
- `.dev.vars` setup workflow
- Production secrets setup
- R2 bucket storage configuration
- Type-safe environment Bindings

Start working now. Review the overall progress, focus on backend development, then begin implementation.
```

---

## 🛠️ Backend Utility Prompts

These prompts are for specific backend tasks like code quality checks or marketplace backend development.

### Run Backend Code Quality Checks

```markdown
Run type checks, lint checks, and resolve all errors/warnings in the backend codebase.
```

### Sync Backend Submodule

```markdown
git -C backend add . && git -C backend commit -m "FEAT: [brief description]" && git -C backend push
```

### Sync Main Repository

```markdown
After completing the sprint, run git commands to sync the main repository.
```

### Backend Marketplace Development Focus

```markdown
**Specific Focus:** [Backend marketplace feature description]
**Priority:** [high/medium/low]
**Estimated Time:** [2-3 hours]

**Backend Tasks:**
- Implement marketplace API endpoints
- Add creator management functionality
- Ensure data compliance and retention
- Update authentication and authorization
- Add proper error handling and logging
```

---

## 📚 Backend Context Files

### **Core Backend Documentation**

- **PROJECT_RULES.md** - Coding standards and architecture (primary guide)
- **docs/PROGRESS_CHECKLIST.md** - Overall project status and sprint tracking
- **docs/BACKEND_CHECKLIST.md** - Backend development tasks and requirements (your primary guide)
- **docs/DEV_RULES.md** - Backend development standards and best practices
- **docs/IMPLEMENTATION_GUIDE.md** - Backend implementation patterns and technical guidance
- **backend/README.md** - Backend architecture, R2 setup, and secrets management

### **Marketplace Backend Documentation**

- **docs/POST_MVP_GUIDE.md** - Complete marketplace strategy and legal compliance framework
- **backend/docs/API.md** - Backend architecture and API documentation
- **docs/QUALITY_ASSURANCE.md** - Backend quality standards and testing procedures
- **docs/CACHE_STRATEGY.md** - Backend caching strategies and KV optimization plans

### **Backend Setup & Configuration**

- **backend/wrangler.toml** - Cloudflare Workers configuration
- **backend/src/types/index.ts** - Type-safe Bindings pattern
- **docs/WRANGLER_GUIDE.md** - Cloudflare Workers deployment guide
- **docs/TESTING.md** - Backend testing strategies and procedures

### **Additional Backend Resources**

- **docs/HOW_TO_CONTINUE_WORK.md** - Detailed backend sprint-based development instructions
- **docs/SPRINT_SUMMARY_2025-11-22.md** - Recent backend sprint accomplishments and learnings
- **backend/docs/CACHE_OPTIMIZATION.md** - KV storage documentation
- **backend/docs/KV_CACHE_OPTIMIZATION_PLAN.md** - Backend caching optimization plans

**Note:** For marketplace backend development, prioritize reading POST_MVP_GUIDE.md first to understand the comprehensive strategy before diving into implementation checklists.

---

## 🎯 For Backend-Specific Issues

If you need to address a specific backend issue or work on a particular feature, add to any of the above prompts:

```markdown
**Specific Focus:** [Backend feature name or issue description]
**Priority:** [high/medium/low]
**Estimated Time:** [2-3 hours]
```

Examples:

```markdown
**Specific Focus:** Implement marketplace template upload API with R2 integration
**Specific Focus:** Add creator commission calculation system
**Specific Focus:** Implement GDPR compliance data export endpoints
**Specific Focus:** Add student verification API with discount system
**Specific Focus:** Optimize marketplace API performance and caching
```

Otherwise, the agent will autonomously follow the checklist priority order.

---

**This file is part of the backend submodule. For complete project documentation, see the [root QUICK_START_PROMPT.md](../docs/QUICK_START_PROMPT.md).**

**See [HOW_TO_CONTINUE_WORK.md](../docs/HOW_TO_CONTINUE_WORK.md) for more detailed instructions on sprint-based development.**
