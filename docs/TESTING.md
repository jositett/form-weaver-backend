# Backend Testing Framework

This document outlines the backend testing framework setup for the FormWeaver project.

## Overview

The backend testing framework is built on top of:
- **Vitest** - Modern testing framework
- **Miniflare** - Cloudflare Workers testing environment
- **TypeScript** - For type-safe testing

## Test Structure

```
backend/
├── src/tests/
│   ├── setup.ts              # Test utilities and configuration
│   ├── utils/
│   │   └── jwt.test.ts       # JWT utility tests
│   └── routes/               # Route tests (to be added)
└── vitest.config.ts          # Vitest configuration
```

## Running Tests

### Basic Commands

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Available Scripts

- `npm test` - Run all tests and exit
- `npm run test:watch` - Run tests in watch mode for development
- `npm run test:coverage` - Run tests with coverage reporting

## Test Utilities

The [`setup.ts`](src/tests/setup.ts) file provides comprehensive utilities for testing:

### Core Functions
- `createMiniflareTestEnv()` - Creates a Miniflare environment for testing
- `testUtils` - Helper functions for creating test data
- `mockDatabase` - Database mocking utilities

### Test Helpers
- `testUtils.createTestToken()` - Creates JWT tokens for testing
- `testUtils.createTestUser()` - Creates user objects
- `testUtils.createTestForm()` - Creates form objects
- `testUtils.createTestSubmission()` - Creates submission objects

### Patterns
- `testPatterns.email` - Email validation regex
- `testPatterns.uuid` - UUID validation regex
- `testPatterns.jwt` - JWT token validation regex

## Writing Tests

### Basic Test Structure

```typescript
import { describe, it, expect, beforeEach } from '../setup';

describe('Your Module', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  it('should do something', async () => {
    // Test implementation
    expect(result).toBeDefined();
  });
});
```

### Testing with Miniflare

```typescript
import { createMiniflareTestEnv } from '../setup';

describe('Route Tests', () => {
  it('should handle requests', async () => {
    const { mf } = await createMiniflareTestEnv();
    
    const res = await mf.dispatchFetch('http://localhost/api/health');
    expect(res.status).toBe(200);
  });
});
```

### Mocking Dependencies

```typescript
// Mock KV storage
const mockEnv = {
  SESSION_STORE: {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
};

// Use in tests
await storeRefreshToken(mockEnv, userId, token);
expect(mockEnv.SESSION_STORE.put).toHaveBeenCalledWith(
  `refresh:${userId}`,
  expect.stringContaining(token),
  expect.any(Object)
);
```

## Best Practices

1. **Use descriptive test names** - Make test names clear and specific
2. **Test one thing at a time** - Each test should verify a single behavior
3. **Use proper assertions** - Leverage Vitest's rich assertion library
4. **Mock external dependencies** - Use the provided mocking utilities
5. **Clean up after tests** - Reset mocks and clear state in `beforeEach`

## Coverage

The testing framework includes coverage reporting via `@vitest/coverage-v8`. Coverage reports are generated in:
- `coverage/` directory
- HTML report for easy viewing
- JSON report for CI/CD integration

## Environment Variables

Tests use a dedicated test environment with predefined values:
- `JWT_SECRET`: Test secret key
- `ENVIRONMENT`: Set to 'test'
- All other environment variables are mocked

## Integration with CI/CD

The testing framework is designed to work seamlessly with CI/CD pipelines:
- Exit codes indicate test success/failure
- Coverage reports can be uploaded to services like Codecov
- Tests are optimized for parallel execution

## Troubleshooting

### Common Issues

1. **Module not found errors**
   - Ensure all dependencies are installed: `npm install`
   - Check TypeScript paths in `tsconfig.json`

2. **Miniflare environment errors**
   - Verify the vitest configuration
   - Check that all required bindings are provided

3. **Test timeout issues**
   - Increase timeout in vitest config if needed
   - Use `await` properly in async tests

### Debugging Tests

```bash
# Run specific test file
npm test -- src/tests/utils/jwt.test.ts

# Run tests matching pattern
npm test -- --grep "generateToken"

# Run with verbose output
npm test -- --reporter=verbose