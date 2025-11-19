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

// Hono context bindings
export interface HonoContext {
  userId?: string;
  workspaceId?: string;
  userRole?: string;
}
