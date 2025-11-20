// Shared types between frontend and backend
// These should be synchronized with shared/types/index.ts

export interface User {
  id: string;
  email: string;
  name?: string;
  emailVerified: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  planType: 'free' | 'prepaid' | 'pro' | 'business' | 'enterprise';
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceMember {
  id: string;
  userId: string;
  workspaceId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  invitedAt: number;
  joinedAt?: number;
}

// API response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthResponse {
  user: User;
  workspace: Workspace;
  accessToken: string;
  refreshToken: string;
}

export interface SignupRequest {
  email: string;
  password: string;
  name: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
}

// Form types (partial - shared with frontend)
export interface FormField {
  id: string;
  type: string;
  label: string;
  required?: boolean;
  validation?: Record<string, any>;
  properties?: Record<string, any>;
}

export interface Form {
  id: string;
  workspaceId: string;
  title: string;
  description?: string;
  schema: FormField[];
  status: 'draft' | 'published' | 'archived';
  version: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}
export interface FormVersion {
  id: string;
  form_id: string;
  version_number: number;
  form_schema: string; // JSON string
  created_at: string; // ISO 8601 timestamp
  is_active: number; // 0 or 1
  version_notes: string | null; // Added for versioning feature
}

export interface FormVersionListItem {
  id: string;
  form_id: string;
  version_number: number;
  created_at: string; // ISO 8601 timestamp
  version_notes: string | null;
}

// Hono context bindings

export interface File {
  id: string;
  workspaceId: string;
  originalName: string;
  fileName: string; // The key in R2
  mimeType: string;
  size: number;
  uploadedBy: string;
  uploadedAt: number;
  submissionId?: string; // Optional, as files can be uploaded before submission
  url?: string; // The signed URL for download
}

export interface Submission {
  id: string;
  formId: string;
  formVersionId: string;
  workspaceId: string;
  data: Record<string, any>;
  submittedAt: number;
  submittedBy?: string;
  files?: File[]; // Array of associated files with signed URLs
}

export interface HonoContext {
  userId?: string;
  workspaceId?: string;
  userRole?: string;
}

// Email notification types
export interface FormNotification {
  id: string;
  formId: string;
  workspaceId: string;
  enabled: boolean;
  notifyOnSubmission: boolean;
  notifyOnDailySummary: boolean;
  notifyOnWeeklyReport: boolean;
  recipientEmails: string[]; // Array of email addresses
  emailTemplateId?: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface NotificationHistory {
  id: string;
  formId: string;
  workspaceId: string;
  notificationType: 'submission' | 'daily_summary' | 'weekly_report';
  recipientEmail: string;
  subject: string;
  status: 'pending' | 'sent' | 'failed' | 'bounced';
  sentAt?: number;
  errorMessage?: string;
  submissionId?: string;
  emailServiceId?: string;
  createdAt: number;
}

export interface EmailTemplate {
  id: string;
  workspaceId: string;
  name: string;
  templateType: 'submission' | 'daily_summary' | 'weekly_report';
  subjectTemplate: string;
  bodyTemplate: string; // HTML template with placeholders
  isDefault: boolean;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
  createdBy: string;
}

export interface CreateNotificationRequest {
  enabled?: boolean;
  notifyOnSubmission?: boolean;
  notifyOnDailySummary?: boolean;
  notifyOnWeeklyReport?: boolean;
  recipientEmails: string[];
  emailTemplateId?: string;
}

export interface UpdateNotificationRequest {
  enabled?: boolean;
  notifyOnSubmission?: boolean;
  notifyOnDailySummary?: boolean;
  notifyOnWeeklyReport?: boolean;
  recipientEmails?: string[];
  emailTemplateId?: string;
}

export type { Env } from './Env';
