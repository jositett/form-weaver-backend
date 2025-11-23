/**
 * User Profile Management Types
 * Extended user types for profile management functionality
 */

import { User, Workspace } from './index';

// User preferences and settings
export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications?: {
    email?: boolean;
    browser?: boolean;
    formSubmissions?: boolean;
    workspaceUpdates?: boolean;
  };
  workspaceDefaults: {
    defaultWorkspaceId?: string;
    defaultFormTheme?: string;
    autoSaveForms: boolean;
  };
  privacy: {
    profileVisibility: 'public' | 'private';
    activityTracking: boolean;
  };
  createdAt: number;
  updatedAt: number;
}

// User profile with extended information
export interface UserProfile {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  website?: string;
  emailVerified: boolean;
  preferences: UserPreferences;
  createdAt: number;
  updatedAt: number;
}

// User settings for API responses
export interface UserSettings {
  profile: {
    name?: string;
    avatarUrl?: string;
    bio?: string;
    location?: string;
    website?: string;
  };
  preferences: UserPreferences;
  security: {
    emailVerified: boolean;
    twoFactorEnabled: boolean;
    lastLoginAt?: number;
    passwordUpdatedAt: number;
  };
}

// User workspace membership with role
export interface UserWorkspaceMembership {
  workspace: Workspace;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  joinedAt: number;
  invitedAt: number;
}

// User usage statistics
export interface UserUsageStatistics {
  totalFormsCreated: number;
  totalSubmissionsReceived: number;
  totalStorageUsed: number; // in bytes
  activeWorkspaces: number;
  totalWorkspaces: number;
  lastActiveAt: number;
  planLimits: {
    maxForms: number;
    maxSubmissions: number;
    maxStorage: number; // in bytes
    maxWorkspaces: number;
    maxMembersPerWorkspace: number;
  };
}

// API Request types for profile updates
export interface UpdateUserProfileRequest {
  name?: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  website?: string;
}

export interface UpdateUserPreferencesRequest {
  theme?: 'light' | 'dark' | 'system';
  notifications?: Partial<UserPreferences['notifications']>;
  workspaceDefaults?: Partial<UserPreferences['workspaceDefaults']>;
  privacy?: Partial<UserPreferences['privacy']>;
}

export interface DeleteUserRequest {
  confirmation: string; // User must type "DELETE" to confirm
  password: string; // Current password required
}

// User audit log entry
export interface UserAuditLog {
  id: string;
  userId: string;
  action: 'profile_updated' | 'preferences_updated' | 'email_changed' | 'avatar_updated' | 'account_deleted';
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  timestamp: number;
}

// Combined profile response
export interface UserProfileResponse {
  profile: UserProfile;
  settings: UserSettings;
  memberships: UserWorkspaceMembership[];
  usage: UserUsageStatistics;
}

// Database row types for queries
export interface UserWithPreferences {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  bio?: string;
  location?: string;
  website?: string;
  email_verified: number;
  user_created_at: number;
  user_updated_at: number;
  preferences?: string; // JSON string
  preferences_created_at?: number;
  preferences_updated_at?: number;
}

export interface UserWorkspaceWithRole {
  workspace_id: string;
  workspace_name: string;
  workspace_slug: string;
  workspace_owner_id: string;
  workspace_plan_type: string;
  workspace_created_at: string;
  workspace_updated_at: string;
  member_role: string;
  member_invited_at: number;
  member_joined_at?: number;
}