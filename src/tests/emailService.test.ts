/**
 * Email Service Test Suite
 * Comprehensive tests for email service functionality including
 * verification emails, password reset emails, and form notifications
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EmailService, sendEmailVerification, sendPasswordResetEmail, sendProfileChangeNotification } from '../services/emailService';

describe('Email Service', () => {
  let emailService: EmailService;
  let mockEnv: any;

  beforeEach(() => {
    mockEnv = {
      RESEND_API_KEY: 'test-resend-api-key',
      FROM_EMAIL: 'FormWeaver <noreply@formweaver.com>',
    };

    // Mock Resend client
    vi.doMock('resend', () => ({
      Resend: vi.fn().mockImplementation(() => ({
        emails: {
          send: vi.fn(),
        },
      })),
    }));

    emailService = new EmailService(mockEnv);
  });

  describe('EmailService Class', () => {
    it('should initialize with valid environment', () => {
      expect(emailService).toBeInstanceOf(EmailService);
    });

    it('should throw error with missing RESEND_API_KEY', () => {
      expect(() => {
        new EmailService({
          FROM_EMAIL: 'FormWeaver <noreply@formweaver.com>',
        });
      }).toThrow('RESEND_API_KEY environment variable is required');
    });

    it('should use default from email when not provided', () => {
      const service = new EmailService({
        RESEND_API_KEY: 'test-key',
      });
      expect((service as any).fromEmail).toBe('FormWeaver <noreply@formweaver.com>');
    });

    it('should use custom from email when provided', () => {
      const customEnv = {
        RESEND_API_KEY: 'test-key',
        FROM_EMAIL: 'Custom <custom@formweaver.com>',
      };
      const service = new EmailService(customEnv);
      expect((service as any).fromEmail).toBe('Custom <custom@formweaver.com>');
    });
  });

  describe('sendVerificationEmail', () => {
    it('should successfully send verification email', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      const result = await emailService.sendVerificationEmail(
        'test@example.com',
        'verification-token-123',
        'Test User'
      );

      expect(result).toBe(true);
      expect(resendMock).toHaveBeenCalledWith({
        from: 'FormWeaver <noreply@formweaver.com>',
        to: 'test@example.com',
        subject: 'Verify your FormWeaver account',
        html: expect.stringContaining('Test User'),
        text: expect.stringContaining('Test User'),
      });
    });

    it('should handle Resend API errors gracefully', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: { message: 'Email sending failed' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      const result = await emailService.sendVerificationEmail(
        'test@example.com',
        'verification-token-123',
        'Test User'
      );

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[Email Service] Verification email failed:'),
        { message: 'Email sending failed' }
      );
    });

    it('should handle network/timeout errors', async () => {
      const resendMock = vi.fn().mockRejectedValue(
        new Error('Network timeout')
      );

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      const result = await emailService.sendVerificationEmail(
        'test@example.com',
        'verification-token-123',
        'Test User'
      );

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('[Email Service] Error sending verification email:'),
        new Error('Network timeout')
      );
    });

    it('should generate correct verification URL', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      // Mock process.env.NODE_ENV for testing
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        await emailService.sendVerificationEmail(
          'test@example.com',
          'verification-token-123',
          'Test User'
        );

        expect(resendMock).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('https://formweaver.com/verify-email?token=verification-token-123'),
          })
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should generate development verification URL when not in production', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      // Mock process.env.NODE_ENV for testing
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      try {
        await emailService.sendVerificationEmail(
          'test@example.com',
          'verification-token-123',
          'Test User'
        );

        expect(resendMock).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('http://localhost:8081/verify-email?token=verification-token-123'),
          })
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should handle special characters in user name', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      const result = await emailService.sendVerificationEmail(
        'test@example.com',
        'verification-token-123',
        'José María O\'Brien'
      );

      expect(result).toBe(true);
      expect(resendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('José María O\'Brien'),
          text: expect.stringContaining('José María O\'Brien'),
        })
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should successfully send password reset email', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      const result = await emailService.sendPasswordResetEmail(
        'test@example.com',
        'reset-token-123',
        'Test User'
      );

      expect(result).toBe(true);
      expect(resendMock).toHaveBeenCalledWith({
        from: 'FormWeaver <noreply@formweaver.com>',
        to: 'test@example.com',
        subject: 'Reset your FormWeaver password',
        html: expect.stringContaining('Test User'),
        text: expect.stringContaining('Test User'),
      });
    });

    it('should generate correct reset URL', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        await emailService.sendPasswordResetEmail(
          'test@example.com',
          'reset-token-123',
          'Test User'
        );

        expect(resendMock).toHaveBeenCalledWith(
          expect.objectContaining({
            html: expect.stringContaining('https://formweaver.com/reset-password?token=reset-token-123'),
          })
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should handle Resend API errors for password reset', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: { message: 'Invalid API key' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      const result = await emailService.sendPasswordResetEmail(
        'test@example.com',
        'reset-token-123',
        'Test User'
      );

      expect(result).toBe(false);
    });
  });

  describe('sendFormNotificationEmail', () => {
    it('should successfully send form notification email', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      const submissionData = {
        name: 'John Doe',
        email: 'john@example.com',
        message: 'Hello, this is a test message',
      };

      const result = await emailService.sendFormNotificationEmail(
        'admin@example.com',
        'Contact Form',
        submissionData,
        'Test Workspace'
      );

      expect(result).toBe(true);
      expect(resendMock).toHaveBeenCalledWith({
        from: 'FormWeaver <noreply@formweaver.com>',
        to: 'admin@example.com',
        subject: 'New submission for form: Contact Form',
        html: expect.stringContaining('Contact Form'),
        text: expect.stringContaining('Contact Form'),
      });
    });

    it('should handle empty submission data', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      const result = await emailService.sendFormNotificationEmail(
        'admin@example.com',
        'Empty Form',
        {},
        'Test Workspace'
      );

      expect(result).toBe(true);
      expect(resendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Submission Details:'),
          text: expect.stringContaining('Submission Details:'),
        })
      );
    });

    it('should handle complex submission data', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      const submissionData = {
        personalInfo: {
          name: 'Jane Smith',
          email: 'jane@example.com',
        },
        preferences: ['option1', 'option2'],
        message: 'This is a multiline\nmessage with special characters: @#$%',
        agreeToTerms: true,
      };

      const result = await emailService.sendFormNotificationEmail(
        'admin@example.com',
        'Complex Form',
        submissionData,
        'Test Workspace'
      );

      expect(result).toBe(true);
      expect(resendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('personalInfo'),
        }),
        expect.objectContaining({
          html: expect.stringContaining('preferences'),
        }),
        expect.objectContaining({
          html: expect.stringContaining('This is a multiline'),
        })
      );
    });

    it('should use default workspace name when not provided', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      const result = await emailService.sendFormNotificationEmail(
        'admin@example.com',
        'Standalone Form',
        { field: 'value' }
        // No workspace name provided
      );

      expect(result).toBe(true);
      expect(resendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('Your Workspace'),
          text: expect.stringContaining('Your Workspace'),
        })
      );
    });
  });

  describe('Email Templates', () => {
    it('should create verification email with proper styling', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      await emailService.sendVerificationEmail(
        'test@example.com',
        'verification-token-123',
        'Test User'
      );

      const call = resendMock.mock.calls[0][0];
      const html = call.html;

      expect(html).toContain('FormWeaver');
      expect(html).toContain('Welcome to FormWeaver, Test User!');
      expect(html).toContain('verify your email address');
      expect(html).toContain('Verify Your Email');
      expect(html).toContain('24 hours');
      expect(html).toContain('security reasons');
      expect(html).toContain('background: #f9f9f9');
      expect(html).toContain('background: #007bff');
    });

    it('should create password reset email with proper styling', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      await emailService.sendPasswordResetEmail(
        'test@example.com',
        'reset-token-123',
        'Test User'
      );

      const call = resendMock.mock.calls[0][0];
      const html = call.html;

      expect(html).toContain('FormWeaver');
      expect(html).toContain('Password Reset Request');
      expect(html).toContain('reset your password');
      expect(html).toContain('Reset Your Password');
      expect(html).toContain('1 hour');
      expect(html).toContain('background: #dc3545');
      expect(html).toContain('background: #fff3cd');
      expect(html).toContain('Security Note');
    });

    it('should create form notification email with proper styling', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      await emailService.sendFormNotificationEmail(
        'admin@example.com',
        'Test Form',
        { name: 'John Doe', email: 'john@example.com' },
        'Test Workspace'
      );

      const call = resendMock.mock.calls[0][0];
      const html = call.html;

      expect(html).toContain('FormWeaver');
      expect(html).toContain('New Form Submission');
      expect(html).toContain('new submission for your form');
      expect(html).toContain('Test Form');
      expect(html).toContain('Test Workspace');
      expect(html).toContain('background: #f9f9f9');
      expect(html).toContain('background: white');
      expect(html).toContain('box-shadow: 0 2px 4px rgba(0,0,0,0.1)');
    });

    it('should include unsubscribe information in emails', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      await emailService.sendVerificationEmail(
        'test@example.com',
        'verification-token-123',
        'Test User'
      );

      const call = resendMock.mock.calls[0][0];
      const html = call.html;

      expect(html).toContain('FormWeaver');
      expect(html).toContain('All rights reserved');
    });
  });

  describe('Convenience Functions', () => {
    it('should send verification email using convenience function', async () => {
      const mockEnv = {
        RESEND_API_KEY: 'test-key',
        FROM_EMAIL: 'FormWeaver <noreply@formweaver.com>',
      };

      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      vi.doMock('resend', () => ({
        Resend: vi.fn().mockImplementation(() => ({
          emails: {
            send: resendMock,
          },
        })),
      }));

      const result = await sendEmailVerification(
        mockEnv,
        'test@example.com',
        'verification-token-123',
        'Test User'
      );

      expect(result).toBe(true);
    });

    it('should send password reset email using convenience function', async () => {
      const mockEnv = {
        RESEND_API_KEY: 'test-key',
        FROM_EMAIL: 'FormWeaver <noreply@formweaver.com>',
      };

      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      vi.doMock('resend', () => ({
        Resend: vi.fn().mockImplementation(() => ({
          emails: {
            send: resendMock,
          },
        })),
      }));

      const result = await sendPasswordResetEmail(
        mockEnv,
        'test@example.com',
        'reset-token-123',
        'Test User'
      );

      expect(result).toBe(true);
    });

    it('should handle email service initialization errors in convenience functions', async () => {
      const mockEnv = {
        // Missing RESEND_API_KEY
        FROM_EMAIL: 'FormWeaver <noreply@formweaver.com>',
      };

      const result = await sendEmailVerification(
        mockEnv,
        'test@example.com',
        'verification-token-123',
        'Test User'
      );

      expect(result).toBe(false);
    });
  });

  describe('sendProfileChangeNotification', () => {
    it('should send email changed notification', async () => {
      const mockEnv = {
        RESEND_API_KEY: 'test-key',
        FROM_EMAIL: 'FormWeaver <noreply@formweaver.com>',
      };

      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      vi.doMock('resend', () => ({
        Resend: vi.fn().mockImplementation(() => ({
          emails: {
            send: resendMock,
          },
        })),
      }));

      const result = await sendProfileChangeNotification(
        mockEnv,
        'newemail@example.com',
        'user-123',
        'email_changed',
        { oldEmail: 'oldemail@example.com' }
      );

      expect(result).toBe(true);
      expect(resendMock).toHaveBeenCalledWith({
        from: 'FormWeaver <noreply@formweaver.com>',
        to: 'newemail@example.com',
        subject: 'Your FormWeaver email address has been changed',
        html: expect.stringContaining('Email Address Changed'),
        text: expect.stringContaining('Email Address Changed'),
      });
    });

    it('should send account deleted notification', async () => {
      const mockEnv = {
        RESEND_API_KEY: 'test-key',
        FROM_EMAIL: 'FormWeaver <noreply@formweaver.com>',
      };

      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      vi.doMock('resend', () => ({
        Resend: vi.fn().mockImplementation(() => ({
          emails: {
            send: resendMock,
          },
        })),
      }));

      const result = await sendProfileChangeNotification(
        mockEnv,
        'deleteduser@example.com',
        'user-123',
        'account_deleted',
        {}
      );

      expect(result).toBe(true);
      expect(resendMock).toHaveBeenCalledWith({
        from: 'FormWeaver <noreply@formweaver.com>',
        to: 'deleteduser@example.com',
        subject: 'Your FormWeaver account has been deleted',
        html: expect.stringContaining('Account Deletion Confirmation'),
        text: expect.stringContaining('Account Deletion Confirmation'),
      });
    });

    it('should handle invalid change type', async () => {
      const mockEnv = {
        RESEND_API_KEY: 'test-key',
        FROM_EMAIL: 'FormWeaver <noreply@formweaver.com>',
      };

      const result = await sendProfileChangeNotification(
        mockEnv,
        'test@example.com',
        'user-123',
        'invalid_change_type' as any,
        {}
      );

      expect(result).toBe(false);
    });

    it('should handle Resend API errors in profile notifications', async () => {
      const mockEnv = {
        RESEND_API_KEY: 'test-key',
        FROM_EMAIL: 'FormWeaver <noreply@formweaver.com>',
      };

      const resendMock = vi.fn().mockResolvedValue({
        error: { message: 'API Error' },
      });

      vi.doMock('resend', () => ({
        Resend: vi.fn().mockImplementation(() => ({
          emails: {
            send: resendMock,
          },
        })),
      }));

      const result = await sendProfileChangeNotification(
        mockEnv,
        'test@example.com',
        'user-123',
        'email_changed',
        { oldEmail: 'old@example.com' }
      );

      expect(result).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle undefined/null values in email templates', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      const result = await emailService.sendFormNotificationEmail(
        'admin@example.com',
        'Test Form',
        {
          name: null,
          email: undefined,
          message: '',
        },
        'Test Workspace'
      );

      expect(result).toBe(true);
      expect(resendMock).toHaveBeenCalledWith(
        expect.objectContaining({
          html: expect.stringContaining('name: null'),
        }),
        expect.objectContaining({
          html: expect.stringContaining('email: undefined'),
        }),
        expect.objectContaining({
          html: expect.stringContaining('message: '),
        })
      );
    });

    it('should handle malformed email addresses gracefully', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: { message: 'Invalid email address' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      const result = await emailService.sendVerificationEmail(
        'invalid-email-format',
        'verification-token-123',
        'Test User'
      );

      expect(result).toBe(false);
    });

    it('should handle extremely long submission data', async () => {
      const resendMock = vi.fn().mockResolvedValue({
        error: null,
        data: { id: 'email-id' },
      });

      (emailService as any).resend = {
        emails: {
          send: resendMock,
        },
      };

      const longData = {
        longField: 'A'.repeat(10000),
        anotherLongField: 'B'.repeat(10000),
      };

      const result = await emailService.sendFormNotificationEmail(
        'admin@example.com',
        'Long Data Form',
        longData,
        'Test Workspace'
      );

      expect(result).toBe(true);
      expect(resendMock).toHaveBeenCalled();
    });
  });
});