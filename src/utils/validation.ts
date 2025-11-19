import bcrypt from 'bcryptjs';
import { z } from 'zod';

// Password hashing
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = 12; // Industry standard for bcrypt
  return bcrypt.hash(password, saltRounds);
};

export const verifyPassword = async (
  password: string,
  hash: string
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

// Input validation schemas
export const signupSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be less than 100 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  name: z.string().min(1, 'Name is required').max(100, 'Name must be less than 100 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be less than 100 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
});

export const emailVerificationSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export const resetPasswordSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const resetPasswordConfirmSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be less than 100 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
});

// Form validation schemas
export const formFieldSchema = z.object({
  id: z.string().min(1, 'Field ID is required'),
  type: z.enum([
    'text', 'email', 'number', 'textarea', 'select', 'radio', 'checkbox',
    'multiselect', 'date', 'time', 'datetime', 'file', 'url', 'phone', 'rating', 'signature'
  ]),
  label: z.string().min(1, 'Field label is required').max(100, 'Label must be less than 100 characters'),
  required: z.boolean().optional(),
  validation: z.record(z.any()).optional(),
  properties: z.record(z.any()).optional(),
});

// Update form schema (partial - only modified fields)
export const updateFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be less than 100 characters').optional(),
  description: z.string().max(500, 'Description must be less than 500 characters').nullable().optional(),
  schema: z.array(formFieldSchema).min(1, 'At least one field is required').optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
);

export const updateFormStatusSchema = z.object({
  status: z.enum(['draft', 'published', 'archived'], { required_error: 'Status is required' }),
});

export const createFormSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be less than 100 characters'),
  description: z.string().max(500, 'Description must be less than 500 characters').optional(),
  schema: z.array(formFieldSchema).min(1, 'At least one field is required'),
  status: z.enum(['draft', 'published']).optional().default('draft'),
});

export const listFormsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().transform(val =>  Math.min(parseInt(val || '50'), 100)).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['created_at', 'updated_at', 'title']).optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Type exports
export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type EmailVerificationInput = z.infer<typeof emailVerificationSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ResetPasswordConfirmInput = z.infer<typeof resetPasswordConfirmSchema>;
export type CreateFormInput = z.infer<typeof createFormSchema>;
export type UpdateFormInput = z.infer<typeof updateFormSchema>;
export type UpdateFormStatusInput = z.infer<typeof updateFormStatusSchema>;
export type ListFormsQuery = z.infer<typeof listFormsQuerySchema>;
