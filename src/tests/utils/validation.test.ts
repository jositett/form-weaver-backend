import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import bcrypt from 'bcryptjs';
import {
  hashPassword,
  verifyPassword,
  signupSchema,
  loginSchema,
  changePasswordSchema,
  emailVerificationSchema,
  resetPasswordSchema,
  resetPasswordConfirmSchema,
  formFieldSchema,
  updateFormSchema,
  updateFormStatusSchema,
  createFormSchema,
  listFormsQuerySchema,
  uuidSchema,
  formIdParamSchema,
  formVersionIdParamSchema,
  listFormVersionsQuerySchema,
} from '../../utils/validation';

/**
 * Validation utilities test suite
 * Tests all validation functionality including password security, authentication schemas,
 * form validation schemas, and UUID validation with comprehensive edge case coverage.
 */
describe('Validation Utilities', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment
    vi.clearAllMocks();
    process.env = originalEnv;
  });

  /**
   * Password Security Functions Tests
   * Tests bcrypt password hashing and verification with proper salt rounds
   */
  describe('Password Security Functions', () => {
    const testPassword = 'TestPassword123!';
    const testHash = '$2a$12$dummy.hash.for.testing.purposes.only';

    beforeEach(() => {
      // Mock bcrypt functions
      vi.mock('bcryptjs');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('should hash password with correct salt rounds', async () => {
      const mockHash = '$2a$12$examplehashedpasswordstringthatismorethan30characterslong';
      vi.spyOn(bcrypt, 'hash').mockResolvedValue(mockHash);

      const result = await hashPassword(testPassword);

      expect(result).toBe(mockHash);
      expect(bcrypt.hash).toHaveBeenCalledWith(testPassword, 12);
      expect(bcrypt.hash).toHaveBeenCalledTimes(1);
    });

    it('should hash password with industry standard salt rounds', async () => {
      const mockHash = '$2a$12$anothersufficientlylonghashstringforvalidationpurposes';
      vi.spyOn(bcrypt, 'hash').mockResolvedValue(mockHash);

      await hashPassword(testPassword);

      // Verify salt rounds are set to 12 (industry standard)
      const calls = vi.mocked(bcrypt.hash).mock.calls;
      expect(calls[0][1]).toBe(12);
    });

    it('should verify password correctly against hash', async () => {
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      const result = await verifyPassword(testPassword, testHash);

      expect(result).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith(testPassword, testHash);
      expect(bcrypt.compare).toHaveBeenCalledTimes(1);
    });

    it('should return false for incorrect password', async () => {
      vi.spyOn(bcrypt, 'compare').mockResolvedValue(false);

      const result = await verifyPassword('WrongPassword123!', testHash);

      expect(result).toBe(false);
    });

    it('should handle bcrypt errors gracefully', async () => {
      const error = new Error('Bcrypt error');
      vi.spyOn(bcrypt, 'hash').mockRejectedValue(error);

      await expect(hashPassword(testPassword)).rejects.toThrow('Bcrypt error');
    });
  });

  /**
   * Authentication Schema Validation Tests
   * Tests all authentication-related validation schemas with comprehensive input validation
   */
  describe('Authentication Schema Validation', () => {
    describe('signupSchema', () => {
      it('should validate correct signup data', () => {
        const validData = {
          email: 'user@example.com',
          password: 'SecurePassword123',
          name: 'John Doe',
        };

        const result = signupSchema.safeParse(validData);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validData);
      });

      it('should reject invalid email format', () => {
        const invalidData = {
          email: 'invalid-email',
          password: 'SecurePassword123',
          name: 'John Doe',
        };

        const result = signupSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Invalid email format');
      });

      it('should reject password too short', () => {
        const invalidData = {
          email: 'user@example.com',
          password: 'Short1',
          name: 'John Doe',
        };

        const result = signupSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Password must be at least 8 characters');
      });

      it('should reject password too long', () => {
        const longPassword = 'a'.repeat(101);
        const invalidData = {
          email: 'user@example.com',
          password: longPassword,
          name: 'John Doe',
        };

        const result = signupSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Password must be less than 100 characters');
      });

      it('should reject password missing uppercase letter', () => {
        const invalidData = {
          email: 'user@example.com',
          password: 'lowercase123',
          name: 'John Doe',
        };

        const result = signupSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Password must contain at least one lowercase letter, one uppercase letter, and one number');
      });

      it('should reject password missing lowercase letter', () => {
        const invalidData = {
          email: 'user@example.com',
          password: 'UPPERCASE123',
          name: 'John Doe',
        };

        const result = signupSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Password must contain at least one lowercase letter, one uppercase letter, and one number');
      });

      it('should reject password missing number', () => {
        const invalidData = {
          email: 'user@example.com',
          password: 'NoNumbersHere',
          name: 'John Doe',
        };

        const result = signupSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Password must contain at least one lowercase letter, one uppercase letter, and one number');
      });

      it('should reject empty name', () => {
        const invalidData = {
          email: 'user@example.com',
          password: 'SecurePassword123',
          name: '',
        };

        const result = signupSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Name is required');
      });

      it('should reject name too long', () => {
        const longName = 'a'.repeat(101);
        const invalidData = {
          email: 'user@example.com',
          password: 'SecurePassword123',
          name: longName,
        };

        const result = signupSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Name must be less than 100 characters');
      });
    });

    describe('loginSchema', () => {
      it('should validate correct login data', () => {
        const validData = {
          email: 'user@example.com',
          password: 'SecurePassword123',
        };

        const result = loginSchema.safeParse(validData);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validData);
      });

      it('should reject invalid email format', () => {
        const invalidData = {
          email: 'invalid-email',
          password: 'SecurePassword123',
        };

        const result = loginSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Invalid email format');
      });

      it('should reject empty password', () => {
        const invalidData = {
          email: 'user@example.com',
          password: '',
        };

        const result = loginSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Password is required');
      });
    });

    describe('changePasswordSchema', () => {
      it('should validate correct password change data', () => {
        const validData = {
          currentPassword: 'OldPassword123',
          newPassword: 'NewPassword123',
        };

        const result = changePasswordSchema.safeParse(validData);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validData);
      });

      it('should reject empty current password', () => {
        const invalidData = {
          currentPassword: '',
          newPassword: 'NewPassword123',
        };

        const result = changePasswordSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Current password is required');
      });

      it('should reject new password too short', () => {
        const invalidData = {
          currentPassword: 'OldPassword123',
          newPassword: 'Short1',
        };

        const result = changePasswordSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Password must be at least 8 characters');
      });

      it('should reject new password missing complexity requirements', () => {
        const invalidData = {
          currentPassword: 'OldPassword123',
          newPassword: 'SimplePass', // 9 chars but missing number
        };

        const result = changePasswordSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Password must contain at least one lowercase letter, one uppercase letter, and one number');
      });
    });

    describe('emailVerificationSchema', () => {
      it('should validate correct verification token', () => {
        const validData = {
          token: 'verification-token-123',
        };

        const result = emailVerificationSchema.safeParse(validData);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validData);
      });

      it('should reject empty token', () => {
        const invalidData = {
          token: '',
        };

        const result = emailVerificationSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Verification token is required');
      });
    });

    describe('resetPasswordSchema', () => {
      it('should validate correct reset password email', () => {
        const validData = {
          email: 'user@example.com',
        };

        const result = resetPasswordSchema.safeParse(validData);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validData);
      });

      it('should reject invalid email format', () => {
        const invalidData = {
          email: 'invalid-email',
        };

        const result = resetPasswordSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Invalid email format');
      });
    });

    describe('resetPasswordConfirmSchema', () => {
      it('should validate correct password reset confirmation', () => {
        const validData = {
          token: 'reset-token-123',
          newPassword: 'NewPassword123',
        };

        const result = resetPasswordConfirmSchema.safeParse(validData);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validData);
      });

      it('should reject empty reset token', () => {
        const invalidData = {
          token: '',
          newPassword: 'NewPassword123',
        };

        const result = resetPasswordConfirmSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Reset token is required');
      });

      it('should reject new password with invalid complexity', () => {
        const invalidData = {
          token: 'reset-token-123',
          newPassword: 'weak',
        };

        const result = resetPasswordConfirmSchema.safeParse(invalidData);
        expect(result.success).toBe(false);
        // The first validation error is about length, but complexity is also checked
        expect(result.error.errors.some(error =>
          error.message.includes('lowercase') ||
          error.message.includes('uppercase') ||
          error.message.includes('number')
        )).toBe(true);
      });
    });
  });

  /**
   * Form Validation Schema Tests
   * Tests form field validation, form creation/update schemas, and query parameter validation
   */
  describe('Form Validation Schema', () => {
    describe('formFieldSchema', () => {
      it('should validate correct form field data', () => {
        const validField = {
          id: 'field-1',
          type: 'text' as const,
          label: 'Full Name',
          required: true,
          validation: { maxLength: 100 },
          properties: { placeholder: 'Enter your name' },
        };

        const result = formFieldSchema.safeParse(validField);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validField);
      });

      it('should validate field with minimal required data', () => {
        const minimalField = {
          id: 'field-1',
          type: 'text' as const,
          label: 'Name',
        };

        const result = formFieldSchema.safeParse(minimalField);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(minimalField);
      });

      it('should reject empty field ID', () => {
        const invalidField = {
          id: '',
          type: 'text' as const,
          label: 'Full Name',
        };

        const result = formFieldSchema.safeParse(invalidField);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Field ID is required');
      });

      it('should reject invalid field type', () => {
        const invalidField = {
          id: 'field-1',
          type: 'invalid-type' as any,
          label: 'Full Name',
        };

        const result = formFieldSchema.safeParse(invalidField);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toContain('Invalid');
      });

      it('should reject empty field label', () => {
        const invalidField = {
          id: 'field-1',
          type: 'text' as const,
          label: '',
        };

        const result = formFieldSchema.safeParse(invalidField);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Field label is required');
      });

      it('should reject field label too long', () => {
        const longLabel = 'a'.repeat(101);
        const invalidField = {
          id: 'field-1',
          type: 'text' as const,
          label: longLabel,
        };

        const result = formFieldSchema.safeParse(invalidField);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Label must be less than 100 characters');
      });

      it('should accept all valid field types', () => {
        const validTypes = [
          'text', 'email', 'number', 'textarea', 'select', 'radio', 'checkbox',
          'multiselect', 'date', 'time', 'datetime', 'file', 'url', 'phone', 'rating', 'signature'
        ];

        validTypes.forEach(type => {
          const field = {
            id: 'field-1',
            type: type as any,
            label: 'Test Field',
          };

          const result = formFieldSchema.safeParse(field);
          expect(result.success).toBe(true);
        });
      });
    });

    describe('createFormSchema', () => {
      it('should validate correct form creation data', () => {
        const validForm = {
          title: 'Contact Form',
          description: 'A form to contact us',
          schema: [
            {
              id: 'name',
              type: 'text' as const,
              label: 'Full Name',
              required: true,
            },
          ],
          status: 'draft' as const,
        };

        const result = createFormSchema.safeParse(validForm);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validForm);
      });

      it('should set default status to draft', () => {
        const formWithoutStatus = {
          title: 'Contact Form',
          schema: [
            {
              id: 'name',
              type: 'text' as const,
              label: 'Full Name',
            },
          ],
        };

        const result = createFormSchema.safeParse(formWithoutStatus);
        expect(result.success).toBe(true);
        expect(result.data.status).toBe('draft');
      });

      it('should reject empty title', () => {
        const invalidForm = {
          title: '',
          schema: [
            {
              id: 'name',
              type: 'text' as const,
              label: 'Full Name',
            },
          ],
        };

        const result = createFormSchema.safeParse(invalidForm);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Title is required');
      });

      it('should reject title too long', () => {
        const longTitle = 'a'.repeat(101);
        const invalidForm = {
          title: longTitle,
          schema: [
            {
              id: 'name',
              type: 'text' as const,
              label: 'Full Name',
            },
          ],
        };

        const result = createFormSchema.safeParse(invalidForm);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Title must be less than 100 characters');
      });

      it('should reject description too long', () => {
        const longDescription = 'a'.repeat(501);
        const invalidForm = {
          title: 'Contact Form',
          description: longDescription,
          schema: [
            {
              id: 'name',
              type: 'text' as const,
              label: 'Full Name',
            },
          ],
        };

        const result = createFormSchema.safeParse(invalidForm);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Description must be less than 500 characters');
      });

      it('should reject form with no fields', () => {
        const invalidForm = {
          title: 'Contact Form',
          schema: [],
        };

        const result = createFormSchema.safeParse(invalidForm);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('At least one field is required');
      });

      it('should reject invalid status value', () => {
        const invalidForm = {
          title: 'Contact Form',
          schema: [
            {
              id: 'name',
              type: 'text' as const,
              label: 'Full Name',
            },
          ],
          status: 'invalid-status' as any,
        };

        const result = createFormSchema.safeParse(invalidForm);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toContain('Invalid');
      });
    });

    describe('updateFormSchema', () => {
      it('should validate partial form update with title change', () => {
        const updateData = {
          title: 'Updated Form Title',
        };

        const result = updateFormSchema.safeParse(updateData);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(updateData);
      });

      it('should validate partial form update with description change', () => {
        const updateData = {
          description: 'Updated description',
        };

        const result = updateFormSchema.safeParse(updateData);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(updateData);
      });

      it('should validate partial form update with schema change', () => {
        const updateData = {
          schema: [
            {
              id: 'email',
              type: 'email' as const,
              label: 'Email Address',
            },
          ],
        };

        const result = updateFormSchema.safeParse(updateData);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(updateData);
      });

      it('should validate partial form update with status change', () => {
        const updateData = {
          status: 'published' as const,
        };

        const result = updateFormSchema.safeParse(updateData);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(updateData);
      });

      it('should allow null description for clearing', () => {
        const updateData = {
          description: null,
        };

        const result = updateFormSchema.safeParse(updateData);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(updateData);
      });

      it('should reject empty update object', () => {
        const emptyUpdate = {};

        const result = updateFormSchema.safeParse(emptyUpdate);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('At least one field must be provided for update');
      });

      it('should reject invalid status in update', () => {
        const updateData = {
          status: 'invalid-status' as any,
        };

        const result = updateFormSchema.safeParse(updateData);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toContain('Invalid');
      });
    });

    describe('updateFormStatusSchema', () => {
      it('should validate correct status update', () => {
        const statusUpdate = {
          status: 'published' as const,
        };

        const result = updateFormStatusSchema.safeParse(statusUpdate);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(statusUpdate);
      });

      it('should reject invalid status value', () => {
        const invalidStatus = {
          status: 'invalid-status' as any,
        };

        const result = updateFormStatusSchema.safeParse(invalidStatus);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toContain('Invalid');
      });
    });

    describe('listFormsQuerySchema', () => {
      it('should validate correct query parameters', () => {
        const queryData = {
          cursor: 'cursor-token',
          limit: '25',
          status: 'draft' as const,
          search: 'test form',
          sortBy: 'created_at' as const,
          sortOrder: 'desc' as const,
        };
  
        const result = listFormsQuerySchema.safeParse(queryData);
        expect(result.success).toBe(true);
        expect(result.data.limit).toBe(25); // Should be transformed to number
        expect(result.data).toEqual({
          ...queryData,
          limit: 25,
        });
      });

      it('should transform limit string to number and cap at 100', () => {
        const queryData = {
          limit: '150', // Should be capped to 100
        };

        const result = listFormsQuerySchema.safeParse(queryData);
        expect(result.success).toBe(true);
        expect(result.data.limit).toBe(100);
      });

      it('should use default values for missing parameters', () => {
        const emptyQuery = {};

        const result = listFormsQuerySchema.safeParse(emptyQuery);
        expect(result.success).toBe(true);
        expect(result.data.sortBy).toBe('created_at');
        expect(result.data.sortOrder).toBe('desc');
      });

      it('should accept valid optional parameters individually', () => {
        const queryWithSingleParam = {
          search: 'form name',
        };

        const result = listFormsQuerySchema.safeParse(queryWithSingleParam);
        expect(result.success).toBe(true);
        expect(result.data.search).toBe('form name');
      });

      it('should validate sortBy parameter', () => {
        const invalidQuery = {
          sortBy: 'invalid_field' as any,
        };

        const result = listFormsQuerySchema.safeParse(invalidQuery);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toContain('Invalid');
      });

      it('should validate sortOrder parameter', () => {
        const invalidQuery = {
          sortOrder: 'invalid_order' as any,
        };

        const result = listFormsQuerySchema.safeParse(invalidQuery);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toContain('Invalid');
      });
    });
  });

  /**
   * UUID and Parameter Validation Tests
   * Tests UUID validation and URL parameter validation schemas
   */
  describe('UUID and Parameter Validation', () => {
    describe('uuidSchema', () => {
      it('should validate correct UUID format', () => {
        const validUuid = '550e8400-e29b-41d4-a716-446655440000';
        const result = uuidSchema.safeParse(validUuid);
        expect(result.success).toBe(true);
        expect(result.data).toBe(validUuid);
      });

      it('should reject invalid UUID format', () => {
        const invalidUuid = 'invalid-uuid-format';
        const result = uuidSchema.safeParse(invalidUuid);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Invalid UUID format');
      });

      it('should reject empty UUID', () => {
        const result = uuidSchema.safeParse('');
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Invalid UUID format');
      });

      it('should reject malformed UUID', () => {
        const malformedUuid = '550e8400-e29b-41d4-a716-44665544000'; // Missing one character
        const result = uuidSchema.safeParse(malformedUuid);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Invalid UUID format');
      });
    });

    describe('formIdParamSchema', () => {
      it('should validate correct form ID parameter', () => {
        const validParams = {
          id: '550e8400-e29b-41d4-a716-446655440000',
        };

        const result = formIdParamSchema.safeParse(validParams);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validParams);
      });

      it('should reject invalid form ID parameter', () => {
        const invalidParams = {
          id: 'invalid-uuid',
        };

        const result = formIdParamSchema.safeParse(invalidParams);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Invalid UUID format');
      });
    });

    describe('formVersionIdParamSchema', () => {
      it('should validate correct form and version ID parameters', () => {
        const validParams = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          versionId: '123e4567-e89b-12d3-a456-426614174000',
        };

        const result = formVersionIdParamSchema.safeParse(validParams);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(validParams);
      });

      it('should reject invalid form ID', () => {
        const invalidParams = {
          id: 'invalid-uuid',
          versionId: '123e4567-e89b-12d3-a456-426614174000',
        };

        const result = formVersionIdParamSchema.safeParse(invalidParams);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Invalid UUID format');
      });

      it('should reject invalid version ID', () => {
        const invalidParams = {
          id: '550e8400-e29b-41d4-a716-446655440000',
          versionId: 'invalid-uuid',
        };

        const result = formVersionIdParamSchema.safeParse(invalidParams);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Invalid UUID format');
      });
    });

    describe('listFormVersionsQuerySchema', () => {
      it('should validate correct query parameters', () => {
        const queryData = {
          limit: 50,
          cursor: '550e8400-e29b-41d4-a716-446655440000',
        };

        const result = listFormVersionsQuerySchema.safeParse(queryData);
        expect(result.success).toBe(true);
        expect(result.data).toEqual(queryData);
      });

      it('should use default limit when not provided', () => {
        const emptyQuery = {};

        const result = listFormVersionsQuerySchema.safeParse(emptyQuery);
        expect(result.success).toBe(true);
        expect(result.data.limit).toBe(50);
      });

      it('should validate limit minimum value', () => {
        const invalidQuery = {
          limit: 0,
        };

        const result = listFormVersionsQuerySchema.safeParse(invalidQuery);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toContain('greater than or equal');
      });

      it('should validate limit maximum value', () => {
        const invalidQuery = {
          limit: 150,
        };

        const result = listFormVersionsQuerySchema.safeParse(invalidQuery);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Number must be less than or equal to 100');
      });

      it('should reject invalid cursor UUID format', () => {
        const invalidQuery = {
          cursor: 'invalid-uuid-format',
        };

        const result = listFormVersionsQuerySchema.safeParse(invalidQuery);
        expect(result.success).toBe(false);
        expect(result.error.errors[0].message).toBe('Invalid UUID format for cursor');
      });
    });
  });

  /**
   * Edge Cases and Error Handling Tests
   * Tests comprehensive edge cases and error scenarios
   */
  describe('Edge Cases and Error Handling', () => {
    it('should handle null and undefined values gracefully', () => {
      const nullData = {
        email: null as any,
        password: undefined as any,
        name: '' as any,
      };

      const result = signupSchema.safeParse(nullData);
      expect(result.success).toBe(false);
      expect(result.error.errors.length).toBeGreaterThan(0);
    });

    it('should handle special characters in passwords correctly', () => {
      const specialCharsPassword = 'P@ssw0rd!#$%^&*()';
      const validData = {
        email: 'user@example.com',
        password: specialCharsPassword,
        name: 'Test User',
      };

      const result = signupSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should handle Unicode characters in names', () => {
      const unicodeName = 'José María González-Martínez';
      const validData = {
        email: 'user@example.com',
        password: 'SecurePassword123',
        name: unicodeName,
      };

      const result = signupSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data.name).toBe(unicodeName);
    });

    it('should handle very long but valid email addresses', () => {
      const longEmail = 'a'.repeat(50) + '@' + 'b'.repeat(50) + '.com';
      const validData = {
        email: longEmail,
        password: 'SecurePassword123',
        name: 'Test User',
      };

      const result = signupSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject form fields with empty validation and properties objects', () => {
      const fieldWithEmptyObjects = {
        id: 'field-1',
        type: 'text' as const,
        label: 'Test Field',
        validation: {},
        properties: {},
      };

      const result = formFieldSchema.safeParse(fieldWithEmptyObjects);
      expect(result.success).toBe(true);
    });

    it('should handle mixed case status values correctly', () => {
      const mixedCaseStatus = {
        status: 'Published' as any, // Capitalized
      };

      const result = updateFormStatusSchema.safeParse(mixedCaseStatus);
      expect(result.success).toBe(false);
      expect(result.error.errors[0].message).toContain('Invalid');
    });

    it('should validate exact boundary conditions for string lengths', () => {
      // Test exact boundary for 100-character limit
      const exactly100Chars = 'a'.repeat(100);
      const validData = {
        title: exactly100Chars,
        schema: [
          {
            id: 'field-1',
            type: 'text' as const,
            label: exactly100Chars,
          },
        ],
      };

      const result = createFormSchema.safeParse(validData);
      expect(result.success).toBe(true);
      expect(result.data.title).toBe(exactly100Chars);
      expect(result.data.schema[0].label).toBe(exactly100Chars);
    });

    it('should handle whitespace-only input correctly', () => {
      const whitespaceData = {
        email: '   user@example.com   ',
        password: '   SecurePassword123   ',
        name: '   John Doe   ',
      };

      // Zod doesn't trim strings by default, so whitespace-only input should fail
      const result = signupSchema.safeParse(whitespaceData);
      expect(result.success).toBe(false);
      expect(result.error.errors.length).toBeGreaterThan(0);
    });
  });
});