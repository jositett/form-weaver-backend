import { z } from 'zod';

// User profile validation schemas
export const userProfileUpdateSchema = z.object({
  name: z.string()
    .min(1, 'Name is required')
    .max(100, 'Name must be less than 100 characters')
    .optional(),
  avatarUrl: z.string()
    .url('Invalid avatar URL format')
    .max(500, 'Avatar URL too long')
    .optional()
    .nullable(),
  bio: z.string()
    .max(500, 'Bio must be less than 500 characters')
    .optional()
    .nullable(),
  location: z.string()
    .max(100, 'Location must be less than 100 characters')
    .optional()
    .nullable(),
  website: z.string()
    .url('Invalid website URL format')
    .max(500, 'Website URL too long')
    .optional()
    .nullable(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
);

export const userPreferencesUpdateSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  notifications: z.object({
    email: z.boolean().optional(),
    browser: z.boolean().optional(),
    formSubmissions: z.boolean().optional(),
    workspaceUpdates: z.boolean().optional(),
  }).optional(),
  workspaceDefaults: z.object({
    defaultWorkspaceId: z.string().uuid('Invalid workspace ID format').optional(),
    defaultFormTheme: z.string().max(50, 'Form theme too long').optional(),
    autoSaveForms: z.boolean().optional(),
  }).optional(),
  privacy: z.object({
    profileVisibility: z.enum(['public', 'private']).optional(),
    activityTracking: z.boolean().optional(),
  }).optional(),
});

export const userEmailUpdateSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Current password is required'),
});

export const userPasswordUpdateSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(100, 'Password must be less than 100 characters')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Password must contain at least one lowercase letter, one uppercase letter, and one number'),
});

export const userAvatarUpdateSchema = z.object({
  avatarUrl: z.string()
    .url('Invalid avatar URL format')
    .max(500, 'Avatar URL too long')
    .nullable(),
});

export const userDeleteSchema = z.object({
  confirmation: z.literal('DELETE', {
    errorMap: () => ({ message: 'Confirmation must be "DELETE"' })
  }),
  password: z.string().min(1, 'Current password is required'),
});

export const userProfileQuerySchema = z.object({
  includeSettings: z.string().transform(val => val === 'true').optional(),
  includeMemberships: z.string().transform(val => val === 'true').optional(),
  includeUsage: z.string().transform(val => val === 'true').optional(),
});

// Type exports
export type UserProfileUpdateInput = z.infer<typeof userProfileUpdateSchema>;
export type UserPreferencesUpdateInput = z.infer<typeof userPreferencesUpdateSchema>;
export type UserEmailUpdateInput = z.infer<typeof userEmailUpdateSchema>;
export type UserPasswordUpdateInput = z.infer<typeof userPasswordUpdateSchema>;
export type UserAvatarUpdateInput = z.infer<typeof userAvatarUpdateSchema>;
export type UserDeleteInput = z.infer<typeof userDeleteSchema>;
export type UserProfileQuery = z.infer<typeof userProfileQuerySchema>;

// Rate limiting configurations for user profile operations
export const PROFILE_UPDATE_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 10, // 10 profile updates per hour
};

export const EMAIL_CHANGE_RATE_LIMIT = {
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  maxRequests: 3, // 3 email changes per day
};

export const PASSWORD_CHANGE_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5, // 5 password changes per hour
};

export const ACCOUNT_DELETION_RATE_LIMIT = {
  windowMs: 7 * 24 * 60 * 60 * 1000, // 7 days
  maxRequests: 1, // 1 account deletion per week
};

// Avatar URL validation helper
export const validateAvatarUrl = (url: string | null | undefined): boolean => {
  if (!url) return true; // null is acceptable for avatar
  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
};

// Email uniqueness check helper
export const isEmailUnique = async (env: any, email: string, excludeUserId?: string): Promise<boolean> => {
  const query = excludeUserId 
    ? 'SELECT id FROM users WHERE email = ? AND id != ?'
    : 'SELECT id FROM users WHERE email = ?';
  
  const params = excludeUserId 
    ? [email.toLowerCase(), excludeUserId]
    : [email.toLowerCase()];
  
  const result = await env.DB.prepare(query).bind(...params).first();
  return !result;
};