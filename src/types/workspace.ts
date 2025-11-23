import type { Workspace, WorkspaceMember } from './index';

export interface CreateWorkspaceRequest {
  name: string;
  slug?: string;
}

export interface UpdateWorkspaceRequest {
  name?: string;
  slug?: string;
}

export interface WorkspaceWithMembers extends Workspace {
  members: WorkspaceMember[];
  memberCount: number;
}

export interface WorkspaceMemberRequest {
  userId: string;
  role: 'admin' | 'editor' | 'viewer';
}

export interface WorkspaceSwitchRequest {
  workspaceId: string;
}

export interface ListWorkspacesQuery {
  limit?: number;
  cursor?: string;
  includeMembers?: boolean;
}

export interface WorkspaceInviteRequest {
  email: string;
  role: 'admin' | 'editor' | 'viewer';
}

export interface WorkspaceMemberResponse {
  id: string;
  userId: string;
  workspaceId: string;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  invitedAt: number;
  joinedAt?: number;
  user: {
    id: string;
    email: string;
    name?: string;
  };
}

export interface WorkspaceUsage {
  workspaceId: string;
  formCount: number;
  submissionCount: number;
  storageUsed: number; // in bytes
  memberCount: number;
  planType: string;
  limits: {
    maxForms: number;
    maxSubmissions: number;
    maxStorage: number; // in bytes
    maxMembers: number;
  };
}

export interface WorkspaceAnalytics {
  workspaceId: string;
  totalForms: number;
  totalSubmissions: number;
  activeMembers: number;
  recentActivity: {
    date: string;
    action: string;
    count: number;
  }[];
}

// Workspace role permissions
export interface WorkspacePermissions {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canManageMembers: boolean;
  canManageBilling: boolean;
}

// Helper function to get permissions based on role
export function getWorkspacePermissions(role: string): WorkspacePermissions {
  switch (role) {
    case 'owner':
      return {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canManageMembers: true,
        canManageBilling: true,
      };
    case 'admin':
      return {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canManageMembers: true,
        canManageBilling: false,
      };
    case 'editor':
      return {
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
        canManageMembers: false,
        canManageBilling: false,
      };
    case 'viewer':
      return {
        canRead: true,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        canManageMembers: false,
        canManageBilling: false,
      };
    default:
      return {
        canRead: false,
        canCreate: false,
        canUpdate: false,
        canDelete: false,
        canManageMembers: false,
        canManageBilling: false,
      };
  }
}

// Workspace plan limits
export const WORKSPACE_PLAN_LIMITS = {
  free: {
    maxForms: 10,
    maxSubmissions: 1000,
    maxStorage: 100 * 1024 * 1024, // 100MB
    maxMembers: 3,
  },
  prepaid: {
    maxForms: 50,
    maxSubmissions: 10000,
    maxStorage: 1024 * 1024 * 1024, // 1GB
    maxMembers: 10,
  },
  pro: {
    maxForms: 200,
    maxSubmissions: 50000,
    maxStorage: 5 * 1024 * 1024 * 1024, // 5GB
    maxMembers: 25,
  },
  business: {
    maxForms: 1000,
    maxSubmissions: 500000,
    maxStorage: 50 * 1024 * 1024 * 1024, // 50GB
    maxMembers: 100,
  },
  enterprise: {
    maxForms: Infinity,
    maxSubmissions: Infinity,
    maxStorage: Infinity,
    maxMembers: Infinity,
  },
} as const;

export type WorkspacePlanType = keyof typeof WORKSPACE_PLAN_LIMITS;