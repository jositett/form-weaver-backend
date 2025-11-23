# Email Service Integration

This document explains how to set up and use the email service integration in FormWeaver.

## Overview

The email service provides seamless integration with Resend for sending:

- Email verification emails during signup
- Password reset emails
- Form submission notification emails

## Setup

### 1. Environment Variables

Add the following environment variables to your `.env` file or set them using Wrangler:

```bash
# Required: Resend API key
RESEND_API_KEY=your_resend_api_key_here

# Optional: From email address (defaults to "FormWeaver <noreply@formweaver.com>")
FROM_EMAIL="Your App Name <noreply@yourapp.com>"
```

Set these secrets using Wrangler CLI:

```bash
wrangler secret put RESEND_API_KEY
wrangler secret put FROM_EMAIL
```

### 2. Database Setup

Ensure the database migrations have been run to create the `EMAIL_TOKENS` KV namespace:

```bash
npm run d1:migrate
```

## Usage

### Email Service API

The email service provides several convenience functions:

```typescript
import { 
  sendEmailVerification, 
  sendPasswordResetEmail, 
  sendFormNotification 
} from '../services/emailService';

// Send verification email
const success = await sendEmailVerification(
  env,
  'user@example.com',
  'verification-token-here',
  'John Doe'
);

// Send password reset email
const success = await sendPasswordResetEmail(
  env,
  'user@example.com',
  'reset-token-here',
  'John Doe'
);

// Send form notification email
const success = await sendFormNotification(
  env,
  'admin@example.com',
  'Contact Form',
  { name: 'John Doe', email: 'john@example.com', message: 'Hello!' },
  'My Workspace'
);
```

### Auth Integration

The auth routes automatically use the email service:

- **Signup**: Sends verification email after successful registration
- **Password Reset**: Sends reset email with secure token

Rate limiting is automatically applied:

- 3 signup attempts per hour per IP
- 3 password reset attempts per hour per IP

## Email Templates

The service includes professionally designed HTML email templates:

### Verification Email

- Welcome message with user's name
- Clear call-to-action button
- Fallback plain text version
- 24-hour expiration notice

### Password Reset Email

- Security-focused messaging
- Clear reset instructions
- 1-hour expiration notice
- Warning about unauthorized requests

### Form Notification Email

- Form submission details
- Workspace context
- Professional formatting

## Error Handling

The email service includes comprehensive error handling:

- **API Errors**: Gracefully handles Resend API failures
- **Network Issues**: Retries failed requests
- **Invalid Data**: Validates email addresses and content
- **Rate Limiting**: Prevents abuse with IP-based limits

All errors are logged with appropriate severity levels.

## Security Features

- **Secure Tokens**: Uses crypto.randomUUID() for secure token generation
- **Expiration**: Tokens expire automatically (24 hours for verification, 1 hour for resets)
- **Rate Limiting**: Prevents email spam and abuse
- **Environment Validation**: Ensures required secrets are configured

## Testing

To test the email service:

1. Set up a Resend account and get an API key
2. Configure the environment variables
3. Start the development server: `npm run dev`
4. Use the auth endpoints to trigger emails

### Test Endpoints

```bash
# Test signup (triggers verification email)
curl -X POST http://localhost:8787/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","name":"Test User"}'

# Test password reset (triggers reset email)
curl -X POST http://localhost:8787/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com"}'
```

## Production Deployment

When deploying to production:

1. Set up production environment variables
2. Use a production email domain with proper DNS records
3. Monitor email delivery metrics in Resend dashboard
4. Set up email delivery webhooks if needed

## Monitoring

Monitor email service health through:

- **Server Logs**: Check for email service errors
- **Resend Dashboard**: Monitor delivery rates and bounces
- **Rate Limit Logs**: Watch for potential abuse

## Troubleshooting

### Common Issues

1. **Emails not sending**: Check RESEND_API_KEY configuration
2. **Rate limit errors**: Verify IP is not exceeding limits
3. **Template errors**: Check HTML formatting in email templates
4. **Delivery failures**: Verify sender domain configuration in Resend

### Debug Mode

Enable debug logging by setting environment variable:

```bash
DEBUG_EMAIL_SERVICE=true
```

## Future Enhancements

Potential improvements:

- Email delivery webhooks
- Custom email templates per workspace
- Email analytics and tracking
- Bulk email support
- Transactional email templates

## Compliance

The email service follows best practices for:

- **GDPR Compliance**: No personal data stored in email service
- **CAN-SPAM**: Proper unsubscribe mechanisms and sender identification
- **Security**: Encrypted transmission and secure token generation
