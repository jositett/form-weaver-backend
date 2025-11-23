import { getDb } from '../db/db';
import type { 
  UserProfile, 
  UserPreferences, 
  UserWorkspaceMembership, 
  UserUsageStatistics,
  UserWithPreferences,
  UserWorkspaceWithRole
} from '../types/user';
import type { Env } from '../types/Env';

/**
 * User Profile Management Utilities
 */

// Generate default preferences for new users
export const generateDefaultPreferences = (): UserPreferences => ({
  theme: 'system',
  notifications: {
    email: true,
    browser: true,
    formSubmissions: true,
    workspaceUpdates: true,
  },
  workspaceDefaults: {
    autoSaveForms: true,
  },
  privacy: {
    profileVisibility: 'private',
    activityTracking: true,
  },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

// Create or update user preferences
export async function createUserPreferences(env: Env, userId: string, preferences?: Partial<UserPreferences>): Promise<UserPreferences> {
  const now = Date.now();
  const defaultPrefs = generateDefaultPreferences();
  const mergedPrefs = { ...defaultPrefs, ...preferences, updatedAt: now };
  
  const insertQuery = `
    INSERT INTO user_preferences (user_id, preferences, created_at, updated_at)
    VALUES (?, ?, ?, ?)
  `;
  
  await getDb(env).prepare(insertQuery).bind(
    userId,
    JSON.stringify(mergedPrefs),
    now,
    now
  ).run();
  
  return mergedPrefs;
}

export async function updateUserPreferences(env: Env, userId: string, updates: Partial<UserPreferences>): Promise<UserPreferences> {
  const now = Date.now();
  
  // Get current preferences
  const currentQuery = 'SELECT preferences FROM user_preferences WHERE user_id = ?';
  const currentResult = await getDb(env).prepare(currentQuery).bind(userId).first();
  
  let currentPrefs: UserPreferences;
  if (currentResult?.preferences) {
    currentPrefs = JSON.parse(currentResult.preferences as string);
  } else {
    currentPrefs = generateDefaultPreferences();
  }
  
  // Merge with updates
  const updatedPrefs = {
    ...currentPrefs,
    ...updates,
    updatedAt: now,
  };
  
  // Update preferences
  const updateQuery = `
    UPDATE user_preferences SET preferences = ?, updated_at = ? WHERE user_id = ?
  `;
  
  await getDb(env).prepare(updateQuery).bind(
    JSON.stringify(updatedPrefs),
    now,
    userId
  ).run();
  
  return updatedPrefs;
}

// Get user profile with all related data
export async function getUserProfileWithDetails(env: Env, userId: string): Promise<{
  profile: UserProfile;
  memberships: UserWorkspaceMembership[];
  usage: UserUsageStatistics;
} | null> {
  // Get user with preferences
  const userQuery = `
    SELECT 
      u.id, u.email, u.name, u.avatar_url, u.bio, u.location, u.website, 
      u.email_verified, u.created_at as user_created_at, u.updated_at as user_updated_at,
      up.preferences, up.created_at as preferences_created_at, up.updated_at as preferences_updated_at
    FROM users u
    LEFT JOIN user_preferences up ON u.id = up.user_id
    WHERE u.id = ?
  `;
  
  const userResult = await getDb(env).prepare(userQuery).bind(userId).first() as UserWithPreferences | null;
  
  if (!userResult) {
    return null;
  }
  
  // Parse preferences
  let preferences: UserPreferences;
  if (userResult.preferences) {
    preferences = JSON.parse(userResult.preferences as string);
  } else {
    preferences = generateDefaultPreferences();
  }
  
  // Get workspace memberships
  const memberships = await getUserWorkspaceMemberships(env, userId);
  
  // Get usage statistics
  const usage = await getUserUsageStatistics(env, userId);
  
  const profile: UserProfile = {
    id: userResult.id,
    email: userResult.email,
    name: userResult.name,
    avatarUrl: userResult.avatar_url || undefined,
    bio: userResult.bio || undefined,
    location: userResult.location || undefined,
    website: userResult.website || undefined,
    emailVerified: Boolean(userResult.email_verified),
    preferences,
    createdAt: userResult.user_created_at,
    updatedAt: userResult.user_updated_at,
  };
  
  return {
    profile,
    memberships,
    usage,
  };
}

// Get user workspace memberships
export async function getUserWorkspaceMemberships(env: Env, userId: string): Promise<UserWorkspaceMembership[]> {
  const query = `
    SELECT 
      w.id as workspace_id, w.name as workspace_name, w.slug as workspace_slug,
      w.owner_id as workspace_owner_id, w.plan_type as workspace_plan_type,
      w.created_at as workspace_created_at, w.updated_at as workspace_updated_at,
      wm.role as member_role, wm.invited_at as member_invited_at, wm.joined_at as member_joined_at
    FROM workspace_members wm
    JOIN workspaces w ON wm.workspace_id = w.id
    WHERE wm.user_id = ?
    ORDER BY wm.joined_at DESC
  `;
  
  const results = await getDb(env).prepare(query).bind(userId).all();
  
  return results.results.map((row: any) => ({
    workspace: {
      id: row.workspace_id,
      name: row.workspace_name,
      slug: row.workspace_slug,
      ownerId: row.workspace_owner_id,
      planType: row.workspace_plan_type,
      createdAt: row.workspace_created_at,
      updatedAt: row.workspace_updated_at,
    },
    role: row.member_role,
    invitedAt: row.member_invited_at,
    joinedAt: row.member_joined_at,
  }));
}

// Get user usage statistics
export async function getUserUsageStatistics(env: Env, userId: string): Promise<UserUsageStatistics> {
  const now = Date.now();
  
  // Get user's workspaces
  const workspaceQuery = `
    SELECT workspace_id FROM workspace_members WHERE user_id = ?
  `;
  const workspacesResult = await getDb(env).prepare(workspaceQuery).bind(userId).all();
  const workspaceIds = workspacesResult.results.map((row: any) => row.workspace_id);
  
  if (workspaceIds.length === 0) {
    return {
      totalFormsCreated: 0,
      totalSubmissionsReceived: 0,
      totalStorageUsed: 0,
      activeWorkspaces: 0,
      totalWorkspaces: 0,
      lastActiveAt: now,
      planLimits: {
        maxForms: 0,
        maxSubmissions: 0,
        maxStorage: 0,
        maxWorkspaces: 0,
        maxMembersPerWorkspace: 0,
      },
    };
  }
  
  const workspaceIdsStr = workspaceIds.map(id => `'${id}'`).join(',');
  
  // Get form count
  const formCountQuery = `
    SELECT COUNT(*) as count FROM forms WHERE workspace_id IN (${workspaceIdsStr}) AND deleted_at IS NULL
  `;
  const formCountResult = await getDb(env).prepare(formCountQuery).run();
  const totalFormsCreated = formCountResult.results[0]?.count || 0;
  
  // Get submission count
  const submissionCountQuery = `
    SELECT COUNT(*) as count 
    FROM submissions s
    JOIN forms f ON s.form_id = f.id
    WHERE f.workspace_id IN (${workspaceIdsStr})
  `;
  const submissionCountResult = await getDb(env).prepare(submissionCountQuery).run();
  const totalSubmissionsReceived = submissionCountResult.results[0]?.count || 0;
  
  // Get storage usage
  const storageQuery = `
    SELECT COALESCE(SUM(size), 0) as total_size, COUNT(*) as file_count
    FROM files WHERE workspace_id IN (${workspaceIdsStr})
  `;
  const storageResult = await getDb(env).prepare(storageQuery).run();
  const totalStorageUsed = storageResult.results[0]?.total_size || 0;
  
  // Get active workspaces (non-deleted)
  const activeWorkspacesQuery = `
    SELECT COUNT(*) as count FROM workspaces WHERE id IN (${workspaceIdsStr}) AND plan_type != 'deleted'
  `;
  const activeWorkspacesResult = await getDb(env).prepare(activeWorkspacesQuery).run();
  const activeWorkspaces = activeWorkspacesResult.results[0]?.count || 0;
  
  // Calculate plan limits (basic implementation - can be enhanced)
  const planLimits = {
    maxForms: activeWorkspaces * 100, // Assuming 100 forms per workspace
    maxSubmissions: activeWorkspaces * 10000, // Assuming 10k submissions per workspace
    maxStorage: activeWorkspaces * 1024 * 1024 * 100, // Assuming 100MB per workspace
    maxWorkspaces: 5, // User can have max 5 workspaces
    maxMembersPerWorkspace: 10, // Assuming 10 members per workspace
  };
  
  return {
    totalFormsCreated,
    totalSubmissionsReceived,
    totalStorageUsed,
    activeWorkspaces,
    totalWorkspaces: workspaceIds.length,
    lastActiveAt: now,
    planLimits,
  };
}

// Update user profile information
export async function updateUserProfile(
  env: Env, 
  userId: string, 
  updates: {
    name?: string;
    avatarUrl?: string | null;
    bio?: string | null;
    location?: string | null;
    website?: string | null;
  }
): Promise<void> {
  const now = Date.now();
  const updateFields: string[] = [];
  const updateParams: (string | number | null)[] = [];
  
  if (updates.name !== undefined) {
    updateFields.push('name = ?');
    updateParams.push(updates.name);
  }
  
  if (updates.avatarUrl !== undefined) {
    updateFields.push('avatar_url = ?');
    updateParams.push(updates.avatarUrl);
  }
  
  if (updates.bio !== undefined) {
    updateFields.push('bio = ?');
    updateParams.push(updates.bio);
  }
  
  if (updates.location !== undefined) {
    updateFields.push('location = ?');
    updateParams.push(updates.location);
  }
  
  if (updates.website !== undefined) {
    updateFields.push('website = ?');
    updateParams.push(updates.website);
  }
  
  if (updateFields.length === 0) {
    return;
  }
  
  updateFields.push('updated_at = ?');
  updateParams.push(now);
  updateParams.push(userId);
  
  const updateQuery = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
  await getDb(env).prepare(updateQuery).bind(...updateParams).run();
}

// Log user audit events
export async function logUserAuditEvent(
  env: Env,
  userId: string,
  action: string,
  details: Record<string, unknown>,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  const now = Date.now();
  const eventId = crypto.randomUUID();
  
  const insertQuery = `
    INSERT INTO user_audit_log (id, userId, action, details, ipAddress, userAgent, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  await getDb(env).prepare(insertQuery).bind(
    eventId,
    userId,
    action,
    JSON.stringify(details),
    ipAddress,
    userAgent,
    now
  ).run();
}

// Check if user can delete their account
export async function canDeleteAccount(env: Env, userId: string): Promise<{ canDelete: boolean; reason?: string }> {
  // Check if user owns any workspaces
  const ownedWorkspacesQuery = `
    SELECT COUNT(*) as count FROM workspaces WHERE owner_id = ?
  `;
  const ownedWorkspacesResult = await getDb(env).prepare(ownedWorkspacesQuery).bind(userId).first();
  const ownedWorkspaces = ownedWorkspacesResult?.count || 0;
  
  if (ownedWorkspaces > 0) {
    return {
      canDelete: false,
      reason: 'Cannot delete account while owning workspaces. Transfer ownership or delete workspaces first.',
    };
  }
  
  // Check for active forms (as workspace member)
  const activeFormsQuery = `
    SELECT COUNT(*) as count
    FROM forms f
    JOIN workspace_members wm ON f.workspace_id = wm.workspace_id
    WHERE wm.user_id = ? AND f.deleted_at IS NULL
  `;
  const activeFormsResult = await getDb(env).prepare(activeFormsQuery).bind(userId).first();
  const activeForms = activeFormsResult?.count || 0;
  
  if (activeForms > 0) {
    return {
      canDelete: false,
      reason: 'Cannot delete account with active forms in workspace. Delete forms first.',
    };
  }
  
  return { canDelete: true };
}