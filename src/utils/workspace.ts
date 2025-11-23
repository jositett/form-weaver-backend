/**
 * Check workspace membership helper
 * Extracted from forms.ts to break circular dependency with analytics.ts
 */
export const checkWorkspaceMembership = async (c: any, workspaceId: string): Promise<{ userId: string; role: string } | Response> => {
  const userId = c.get('userId');
  if (!userId) {
    return c.json({
      success: false,
      error: 'Authentication required',
    }, 401);
  }

  const member = await c.env.DB.prepare(
    'SELECT role FROM workspace_members WHERE user_id = ? AND workspace_id = ?'
  )
    .bind(userId, workspaceId)
    .first() as { role: string } | null;

  if (!member) {
    return c.json({
      success: false,
      error: 'Access denied: not a member of this workspace',
    }, 403);
  }

  return { userId, role: member.role };
};

/**
 * Check workspace permission helper
 * Verifies if user has required role(s) for workspace access
 */
export const checkWorkspacePermission = async (
  c: any,
  workspaceId: string,
  requiredRoles: string[]
): Promise<{ userId: string; role: string } | Response> => {
  const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
  if (membershipCheck instanceof Response) return membershipCheck;

  const { role } = membershipCheck;
  
  if (!requiredRoles.includes(role)) {
    return c.json({
      success: false,
      error: 'Insufficient permissions for this action',
    }, 403);
  }

  return membershipCheck;
};

/**
 * Generate random ID helper
 */
export const generateId = (): string => {
  return crypto.randomUUID();
};

/**
 * Get workspace plan limits
 */
export const getPlanLimits = (c: any, planTypeOrWorkspaceId: string): any => {
  const WORKSPACE_PLAN_LIMITS = {
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

  // If it's a plan type, return limits directly
  if (Object.keys(WORKSPACE_PLAN_LIMITS).includes(planTypeOrWorkspaceId)) {
    return WORKSPACE_PLAN_LIMITS[planTypeOrWorkspaceId as keyof typeof WORKSPACE_PLAN_LIMITS];
  }

  // Otherwise, it's a workspace ID, fetch the plan type
  return c.env.DB.prepare(
    'SELECT plan_type FROM workspaces WHERE id = ?'
  )
    .bind(planTypeOrWorkspaceId)
    .first()
    .then((workspace: any) => {
      if (!workspace) return null;
      return WORKSPACE_PLAN_LIMITS[workspace.plan_type as keyof typeof WORKSPACE_PLAN_LIMITS];
    });
};

/**
 * Check workspace limits helper
 */
export const checkWorkspaceLimits = async (
  c: any,
  workspaceId: string,
  resourceType: 'forms' | 'submissions' | 'storage' | 'members',
  increment: number = 1
): Promise<{ allowed: boolean; current: number; limit: number } | Response> => {
  const limits = await getPlanLimits(c, workspaceId);
  if (!limits) {
    return c.json({
      success: false,
      error: 'Workspace not found',
    }, 404);
  }

  const limit = limits[`max${resourceType.charAt(0).toUpperCase() + resourceType.slice(1)}` as keyof typeof limits];
  
  if (limit === Infinity) {
    return { allowed: true, current: 0, limit: Infinity };
  }

  let current = 0;
  
  switch (resourceType) {
    case 'forms':
      const formCount = await c.env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM forms
        WHERE workspace_id = ? AND deleted_at IS NULL
      `)
        .bind(workspaceId)
        .first();
      current = formCount?.count || 0;
      break;

    case 'submissions':
      const submissionCount = await c.env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM submissions s
        JOIN forms f ON s.form_id = f.id
        WHERE f.workspace_id = ?
      `)
        .bind(workspaceId)
        .first();
      current = submissionCount?.count || 0;
      break;

    case 'storage':
      const storageResult = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(size), 0) as total_size
        FROM files
        WHERE workspace_id = ?
      `)
        .bind(workspaceId)
        .first();
      current = storageResult?.total_size || 0;
      break;

    case 'members':
      const memberCount = await c.env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM workspace_members
        WHERE workspace_id = ? AND joined_at IS NOT NULL
      `)
        .bind(workspaceId)
        .first();
      current = memberCount?.count || 0;
      break;
  }

  if (current + increment > limit) {
    return c.json({
      success: false,
      error: `Workspace has reached the limit for ${resourceType}. Current: ${current}, Limit: ${limit}`,
    }, 400);
  }

  return { allowed: true, current, limit };
};