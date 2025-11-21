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