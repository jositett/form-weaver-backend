import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { authMiddleware } from '../middleware/auth';
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  workspaceMemberSchema,
  workspaceInviteSchema,
  workspaceIdParamSchema,
  listWorkspacesQuerySchema,
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  WorkspaceMemberInput,
  WorkspaceInviteInput,
  ListWorkspacesQuery,
  WorkspaceIdParam,
} from '../utils/validation';
import type { Env, HonoContext } from '../types/index';
import { getDb } from '../db/db';
import { checkWorkspaceMembership, checkWorkspacePermission } from '../utils/workspace';
import { generateId, getPlanLimits } from '../utils/workspace';

// Create workspaces router
const workspaces = new Hono<{
  Bindings: Env;
  Variables: HonoContext;
}>();

/**
 * POST /api/workspaces - Create new workspace
 */
workspaces.post(
  '/',
  authMiddleware,
  zValidator('json', createWorkspaceSchema),
  async (c) => {
    const body: CreateWorkspaceInput = c.req.valid('json');
    const userId = c.get('userId')!;

    try {
      // Check if user has reached workspace limit (max 5 workspaces per user)
      const workspaceCount = await getDb(c.env).prepare(`
        SELECT COUNT(*) as count
        FROM workspace_members
        WHERE user_id = ?
      `)
        .bind(userId)
        .first();

      if (workspaceCount && typeof workspaceCount.count === 'number' && workspaceCount.count >= 5) {
        return c.json({
          success: false,
          error: 'You have reached the maximum number of workspaces (5)',
        }, 400);
      }

      const now = Date.now();
      const workspaceId = generateId();
      const memberId = generateId();

      // Generate slug if not provided
      let slug = body.slug;
      if (!slug) {
        slug = body.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
      }

      // Ensure slug is unique
      let slugSuffix = '';
      let attempt = 0;
      while (true) {
        const finalSlug = `${slug}${slugSuffix}`;
        const existingWorkspace = await getDb(c.env).prepare(
          'SELECT id FROM workspaces WHERE slug = ?'
        )
          .bind(finalSlug)
          .first();

        if (!existingWorkspace) {
          slug = finalSlug;
          break;
        }

        attempt++;
        slugSuffix = `-${attempt}`;
      }

      // Insert workspace and member in a transaction
      const batch = [
        // Create workspace
        getDb(c.env).prepare(`
          INSERT INTO workspaces (id, name, slug, owner_id, plan_type, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'free', ?, ?)
        `)
          .bind(workspaceId, body.name, slug, userId, now, now),

        // Add user as owner
        getDb(c.env).prepare(`
          INSERT INTO workspace_members (id, user_id, workspace_id, role, invited_at, joined_at)
          VALUES (?, ?, ?, 'owner', ?, ?)
        `)
          .bind(memberId, userId, workspaceId, now, now),
      ];

      await getDb(c.env).batch(batch);

      // Get created workspace with member count
      const workspace = await getWorkspaceWithMemberCount(c, workspaceId);

      return c.json({
        success: true,
        data: workspace,
        message: 'Workspace created successfully',
      }, 201);

    } catch (error) {
      console.error('[Create Workspace Error]', error);

      return c.json({
        success: false,
        error: 'Failed to create workspace',
      }, 500);
    }
  }
);

/**
 * GET /api/workspaces - List user's workspaces
 */
workspaces.get(
  '/',
  authMiddleware,
  zValidator('query', listWorkspacesQuerySchema),
  async (c) => {
    const query: ListWorkspacesQuery = c.req.valid('query');
    const userId = c.get('userId')!;

    try {
      // Build query with optional member inclusion
      let selectFields = `
        w.id, w.name, w.slug, w.owner_id, w.plan_type, w.created_at, w.updated_at,
        COUNT(DISTINCT wm.id) as member_count
      `;

      if (query.includeMembers) {
        selectFields += `,
          json_group_array(
            json_object(
              'id', wm.id,
              'userId', wm.user_id,
              'role', wm.role,
              'invitedAt', wm.invited_at,
              'joinedAt', wm.joined_at,
              'user', json_object(
                'id', u.id,
                'email', u.email,
                'name', u.name
              )
            )
          ) as members
        `;
      }

      const limit = query.limit || 50;
      const queryBuilder = `
        SELECT ${selectFields}
        FROM workspaces w
        JOIN workspace_members wm ON w.id = wm.workspace_id
        JOIN users u ON wm.user_id = u.id
        WHERE wm.user_id = ?
        GROUP BY w.id
        ORDER BY w.created_at DESC
        LIMIT ?
      `;

      const workspaces = await getDb(c.env).prepare(queryBuilder)
        .bind(userId, limit + 1)
        .all();

      let hasNextPage = false;
      const results = workspaces.results.map(row => {
        hasNextPage = workspaces.results.length > limit;
        
        const workspace: any = {
          id: row.id,
          name: row.name,
          slug: row.slug,
          ownerId: row.owner_id,
          planType: row.plan_type,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          memberCount: row.member_count,
        };

        if (query.includeMembers && row.members) {
          try {
            workspace.members = JSON.parse(row.members as string);
          } catch {
            workspace.members = [];
          }
        }

        return workspace;
      });

      // Remove extra item if there are more results
      if (hasNextPage) {
        results.pop();
      }

      return c.json({
        success: true,
        data: {
          workspaces: results,
          pagination: {
            hasNextPage,
            limit: results.length,
          },
        },
      });

    } catch (error) {
      console.error('[List Workspaces Error]', error);

      return c.json({
        success: false,
        error: 'Failed to list workspaces',
      }, 500);
    }
  }
);

/**
 * GET /api/workspaces/:id - Get specific workspace details
 */
workspaces.get(
  '/:id',
  authMiddleware,
  zValidator('param', workspaceIdParamSchema),
  async (c) => {
    const { id: workspaceId } = c.req.valid('param');

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const workspace = await getWorkspaceWithMemberCount(c, workspaceId);
      if (!workspace) {
        return c.json({
          success: false,
          error: 'Workspace not found',
        }, 404);
      }

      return c.json({
        success: true,
        data: workspace,
      });

    } catch (error) {
      console.error('[Get Workspace Error]', error);

      return c.json({
        success: false,
        error: 'Failed to get workspace',
      }, 500);
    }
  }
);

/**
 * PUT /api/workspaces/:id - Update workspace
 */
workspaces.put(
  '/:id',
  authMiddleware,
  zValidator('param', workspaceIdParamSchema),
  zValidator('json', updateWorkspaceSchema),
  async (c) => {
    const { id: workspaceId } = c.req.valid('param');
    const body: UpdateWorkspaceInput = c.req.valid('json');

    try {
      // Check workspace permission (owner only)
      const permissionCheck = await checkWorkspacePermission(c, workspaceId, ['owner']);
      if (permissionCheck instanceof Response) return permissionCheck;

      const now = Date.now();
      const updateFields: string[] = [];
      const updateParams: (string | number)[] = [];

      if (body.name !== undefined) {
        updateFields.push('name = ?');
        updateParams.push(body.name);
      }

      if (body.slug !== undefined) {
        // Check slug uniqueness
        const existingWorkspace = await getDb(c.env).prepare(
          'SELECT id FROM workspaces WHERE slug = ? AND id != ?'
        )
          .bind(body.slug, workspaceId)
          .first();

        if (existingWorkspace) {
          return c.json({
            success: false,
            error: 'Slug is already in use',
          }, 409);
        }

        updateFields.push('slug = ?');
        updateParams.push(body.slug);
      }

      if (updateFields.length === 0) {
        return c.json({
          success: false,
          error: 'No fields to update',
        }, 400);
      }

      updateFields.push('updated_at = ?');
      updateParams.push(now);
      updateParams.push(workspaceId);

      const updateQuery = `UPDATE workspaces SET ${updateFields.join(', ')} WHERE id = ?`;
      const result = await getDb(c.env).prepare(updateQuery)
        .bind(...updateParams)
        .run();

      if (result.meta.changes === 0) {
        return c.json({
          success: false,
          error: 'Workspace not found or no changes made',
        }, 404);
      }

      // Return updated workspace
      const updatedWorkspace = await getWorkspaceWithMemberCount(c, workspaceId);

      return c.json({
        success: true,
        data: updatedWorkspace,
        message: 'Workspace updated successfully',
      });

    } catch (error) {
      console.error('[Update Workspace Error]', error);

      return c.json({
        success: false,
        error: 'Failed to update workspace',
      }, 500);
    }
  }
);

/**
 * DELETE /api/workspaces/:id - Delete workspace (soft delete)
 */
workspaces.delete(
  '/:id',
  authMiddleware,
  zValidator('param', workspaceIdParamSchema),
  async (c) => {
    const { id: workspaceId } = c.req.valid('param');

    try {
      // Check workspace permission (owner only)
      const permissionCheck = await checkWorkspacePermission(c, workspaceId, ['owner']);
      if (permissionCheck instanceof Response) return permissionCheck;

      // Cannot delete workspace with active forms
      const formCount = await getDb(c.env).prepare(`
        SELECT COUNT(*) as count
        FROM forms
        WHERE workspace_id = ? AND deleted_at IS NULL
      `)
        .bind(workspaceId)
        .first();

      if (formCount && typeof formCount.count === 'number' && formCount.count > 0) {
        return c.json({
          success: false,
          error: 'Cannot delete workspace with active forms. Delete all forms first.',
        }, 400);
      }

      // Soft delete workspace (mark as deleted)
      const now = Date.now();
      const result = await getDb(c.env).prepare(`
        UPDATE workspaces SET plan_type = 'deleted', updated_at = ? WHERE id = ?
      `)
        .bind(now, workspaceId)
        .run();

      if (result.meta.changes === 0) {
        return c.json({
          success: false,
          error: 'Workspace not found',
        }, 404);
      }

      return c.json({
        success: true,
        message: 'Workspace deleted successfully',
      });

    } catch (error) {
      console.error('[Delete Workspace Error]', error);

      return c.json({
        success: false,
        error: 'Failed to delete workspace',
      }, 500);
    }
  }
);

/**
 * POST /api/workspaces/:id/members - Add member to workspace
 */
workspaces.post(
  '/:id/members',
  authMiddleware,
  zValidator('param', workspaceIdParamSchema),
  zValidator('json', workspaceInviteSchema),
  async (c) => {
    const { id: workspaceId } = c.req.valid('param');
    const body: WorkspaceInviteInput = c.req.valid('json');

    try {
      // Check workspace permission (owner or admin)
      const permissionCheck = await checkWorkspacePermission(c, workspaceId, ['owner', 'admin']);
      if (permissionCheck instanceof Response) return permissionCheck;

      // Check workspace plan limits
      const limits = getPlanLimits(c, workspaceId);
      if (limits) {
        const memberCount = await getDb(c.env).prepare(`
          SELECT COUNT(*) as count 
          FROM workspace_members 
          WHERE workspace_id = ? AND joined_at IS NOT NULL
        `)
          .bind(workspaceId)
          .first();

        if ((memberCount?.count || 0) >= limits.maxMembers) {
          return c.json({
            success: false,
            error: 'Workspace has reached the maximum number of members for the current plan',
          }, 400);
        }
      }

      // Find user by email
      const user = await getDb(c.env).prepare(
        'SELECT id FROM users WHERE email = ?'
      )
        .bind(body.email.toLowerCase())
        .first();

      if (!user) {
        return c.json({
          success: false,
          error: 'User with this email does not exist',
        }, 404);
      }

      const userId = user.id as string;
      const now = Date.now();
      const memberRoleId = generateId();

      // Check if user is already a member
      const existingMember = await getDb(c.env).prepare(`
        SELECT id FROM workspace_members 
        WHERE user_id = ? AND workspace_id = ?
      `)
        .bind(userId, workspaceId)
        .first();

      if (existingMember) {
        return c.json({
          success: false,
          error: 'User is already a member of this workspace',
        }, 409);
      }

      // Add user as member
      await getDb(c.env).prepare(`
        INSERT INTO workspace_members (id, user_id, workspace_id, role, invited_at, joined_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
        .bind(memberRoleId, userId, workspaceId, body.role, now, now)
        .run();

      // Get updated workspace with members
      const workspace = await getWorkspaceWithMemberCount(c, workspaceId);

      return c.json({
        success: true,
        data: workspace,
        message: 'Member added successfully',
      }, 201);

    } catch (error) {
      console.error('[Add Member Error]', error);

      return c.json({
        success: false,
        error: 'Failed to add member',
      }, 500);
    }
  }
);

/**
 * DELETE /api/workspaces/:id/members/:userId - Remove member from workspace
 */
workspaces.delete(
  '/:id/members/:userId',
  authMiddleware,
  zValidator('param', z.object({
    id: workspaceIdParamSchema.shape.id,
    userId: z.string().uuid('Invalid user ID format'),
  })),
  async (c) => {
    const { id: workspaceId, userId } = c.req.valid('param');

    try {
      // Check workspace permission (owner or admin)
      const permissionCheck = await checkWorkspacePermission(c, workspaceId, ['owner', 'admin']);
      if (permissionCheck instanceof Response) return permissionCheck;

      // Cannot remove workspace owner
      const workspace = await getDb(c.env).prepare(
        'SELECT owner_id FROM workspaces WHERE id = ?'
      )
        .bind(workspaceId)
        .first();

      if (!workspace) {
        return c.json({
          success: false,
          error: 'Workspace not found',
        }, 404);
      }

      if (workspace.owner_id === userId) {
        return c.json({
          success: false,
          error: 'Cannot remove workspace owner',
        }, 400);
      }

      // Remove member
      const result = await getDb(c.env).prepare(`
        DELETE FROM workspace_members 
        WHERE user_id = ? AND workspace_id = ?
      `)
        .bind(userId, workspaceId)
        .run();

      if (result.meta.changes === 0) {
        return c.json({
          success: false,
          error: 'Member not found',
        }, 404);
      }

      // Get updated workspace with members
      const updatedWorkspace = await getWorkspaceWithMemberCount(c, workspaceId);

      return c.json({
        success: true,
        data: updatedWorkspace,
        message: 'Member removed successfully',
      });

    } catch (error) {
      console.error('[Remove Member Error]', error);

      return c.json({
        success: false,
        error: 'Failed to remove member',
      }, 500);
    }
  }
);

/**
 * GET /api/workspaces/:id/members - List workspace members
 */
workspaces.get(
  '/:id/members',
  authMiddleware,
  zValidator('param', workspaceIdParamSchema),
  async (c) => {
    const { id: workspaceId } = c.req.valid('param');

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      const members = await getDb(c.env).prepare(`
        SELECT 
          wm.id,
          wm.user_id,
          wm.workspace_id,
          wm.role,
          wm.invited_at,
          wm.joined_at,
          u.email,
          u.name
        FROM workspace_members wm
        JOIN users u ON wm.user_id = u.id
        WHERE wm.workspace_id = ?
        ORDER BY wm.joined_at DESC, wm.invited_at DESC
      `)
        .bind(workspaceId)
        .all();

      const memberList = members.results.map(row => ({
        id: row.id,
        userId: row.user_id,
        workspaceId: row.workspace_id,
        role: row.role,
        invitedAt: row.invited_at,
        joinedAt: row.joined_at,
        user: {
          id: row.user_id,
          email: row.email,
          name: row.name,
        },
      }));

      return c.json({
        success: true,
        data: {
          members: memberList,
          count: memberList.length,
        },
      });

    } catch (error) {
      console.error('[List Members Error]', error);

      return c.json({
        success: false,
        error: 'Failed to list members',
      }, 500);
    }
  }
);

/**
 * GET /api/workspaces/:id/usage - Get workspace usage statistics
 */
workspaces.get(
  '/:id/usage',
  authMiddleware,
  zValidator('param', workspaceIdParamSchema),
  async (c) => {
    const { id: workspaceId } = c.req.valid('param');

    try {
      // Check workspace membership
      const membershipCheck = await checkWorkspaceMembership(c, workspaceId);
      if (membershipCheck instanceof Response) return membershipCheck;

      // Get form count
      const formCount = await getDb(c.env).prepare(`
        SELECT COUNT(*) as count 
        FROM forms 
        WHERE workspace_id = ? AND deleted_at IS NULL
      `)
        .bind(workspaceId)
        .first();

      // Get submission count
      const submissionCount = await getDb(c.env).prepare(`
        SELECT COUNT(*) as count 
        FROM submissions s
        JOIN forms f ON s.form_id = f.id
        WHERE f.workspace_id = ?
      `)
        .bind(workspaceId)
        .first();

      // Get storage usage (from files table)
      const storageResult = await getDb(c.env).prepare(`
        SELECT COALESCE(SUM(size), 0) as total_size, COUNT(*) as file_count
        FROM files 
        WHERE workspace_id = ?
      `)
        .bind(workspaceId)
        .first();

      // Get member count
      const memberCount = await getDb(c.env).prepare(`
        SELECT COUNT(*) as count 
        FROM workspace_members 
        WHERE workspace_id = ? AND joined_at IS NOT NULL
      `)
        .bind(workspaceId)
        .first();

      // Get workspace details
      const workspace = await getDb(c.env).prepare(
        'SELECT plan_type FROM workspaces WHERE id = ?'
      )
        .bind(workspaceId)
        .first();

      if (!workspace) {
        return c.json({
          success: false,
          error: 'Workspace not found',
        }, 404);
      }

      const planType = workspace.plan_type as string;
      const limits = getPlanLimits(c, planType);

      return c.json({
        success: true,
        data: {
          workspaceId,
          formCount: formCount?.count || 0,
          submissionCount: submissionCount?.count || 0,
          storageUsed: storageResult?.total_size || 0,
          memberCount: memberCount?.count || 0,
          planType,
          limits: limits || {
            maxForms: 0,
            maxSubmissions: 0,
            maxStorage: 0,
            maxMembers: 0,
          },
        },
      });

    } catch (error) {
      console.error('[Get Usage Error]', error);

      return c.json({
        success: false,
        error: 'Failed to get usage statistics',
      }, 500);
    }
  }
);

// Helper function to get workspace with member count
async function getWorkspaceWithMemberCount(c: any, workspaceId: string) {
  const workspace = await getDb(c.env).prepare(`
    SELECT 
      w.id,
      w.name,
      w.slug,
      w.owner_id,
      w.plan_type,
      w.created_at,
      w.updated_at,
      COUNT(wm.id) as member_count
    FROM workspaces w
    LEFT JOIN workspace_members wm ON w.id = wm.workspace_id
    WHERE w.id = ?
    GROUP BY w.id
  `)
    .bind(workspaceId)
    .first();

  if (!workspace) {
    return null;
  }

  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    ownerId: workspace.owner_id,
    planType: workspace.plan_type,
    createdAt: workspace.created_at,
    updatedAt: workspace.updated_at,
    memberCount: workspace.member_count,
  };
}

export default workspaces;