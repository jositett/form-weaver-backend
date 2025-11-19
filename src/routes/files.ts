import { Hono } from 'hono';
import type { Env } from '../index';
import type { HonoContext } from '../types/index';

const files = new Hono<{
  Bindings: Env;
  Variables: HonoContext;
}>();

// Helper function to generate unique file names
function generateFileName(originalName: string): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  const extension = originalName.split('.').pop();
  return `${timestamp}_${random}.${extension}`;
}

// POST /api/forms/:formId/upload - Upload file for a form
files.post('/:formId/upload', async (c) => {
  const userId = c.get('userId');
  const workspaceId = c.get('workspaceId');

  if (!userId || !workspaceId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const formId = c.req.param('formId');
  if (!formId) {
    return c.json({ error: 'Form ID required' }, 400);
  }

  try {
    // Verify form exists and belongs to workspace
    const form = await c.env.DB.prepare(
      'SELECT id FROM forms WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL'
    ).bind(formId, workspaceId).first();

    if (!form) {
      return c.json({ error: 'Form not found' }, 404);
    }

    // Parse the multipart form data
    const formData = await c.req.formData();
    const fileEntry = formData.get('file');
    const fieldIdEntry = formData.get('fieldId');

    if (!fileEntry || typeof fileEntry === 'string') {
      return c.json({ error: 'No file provided' }, 400);
    }

    if (!fieldIdEntry || typeof fieldIdEntry !== 'string') {
      return c.json({ error: 'Field ID required' }, 400);
    }

    const file = fileEntry as File;
    const fieldId = fieldIdEntry;

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return c.json({ error: 'File too large. Maximum size is 10MB' }, 413);
    }

    // Generate unique filename
    const fileName = generateFileName(file.name);

    // Upload to R2
    await c.env.FILE_UPLOADS.put(fileName, file, {
      httpMetadata: {
        contentType: file.type,
        contentDisposition: `attachment; filename="${file.name}"`,
      },
    });

    // Save file metadata to database
    const fileId = crypto.randomUUID();
    const now = Date.now();

    await c.env.DB.prepare(
      'INSERT INTO files (id, workspace_id, original_name, file_name, mime_type, size, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      fileId,
      workspaceId,
      file.name,
      fileName,
      file.type,
      file.size,
      userId,
      now
    ).run();

    // Generate public URL for the file
    const publicUrl = `${new URL(c.req.url).origin}/api/files/${fileId}`;

    return c.json({
      id: fileId,
      name: file.name,
      url: publicUrl,
      size: file.size,
      type: file.type,
      uploadedAt: now,
    });

  } catch (error) {
    console.error('File upload error:', error);
    return c.json({ error: 'Upload failed' }, 500);
  }
});

// GET /api/files/:fileId - Download file
files.get('/:fileId', async (c) => {
  const userId = c.get('userId');
  const workspaceId = c.get('workspaceId');

  if (!userId || !workspaceId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const fileId = c.req.param('fileId');
  if (!fileId) {
    return c.json({ error: 'File ID required' }, 400);
  }

  try {
    // Get file metadata
    const file = await c.env.DB.prepare(
      'SELECT * FROM files WHERE id = ? AND workspace_id = ?'
    ).bind(fileId, workspaceId).first() as any;

    if (!file) {
      return c.json({ error: 'File not found' }, 404);
    }

    // Get file from R2
    const r2Object = await c.env.FILE_UPLOADS.get(file.file_name);
    if (!r2Object) {
      return c.json({ error: 'File not found in storage' }, 404);
    }

    // Return file with appropriate headers
    const headers = new Headers();
    headers.set('Content-Type', file.mime_type);
    headers.set('Content-Length', r2Object.size.toString());
    headers.set('Content-Disposition', `attachment; filename="${file.original_name}"`);

    return new Response(r2Object.body, { headers });

  } catch (error) {
    console.error('File download error:', error);
    return c.json({ error: 'Download failed' }, 500);
  }
});

// DELETE /api/files/:fileId - Delete file
files.delete('/:fileId', async (c) => {
  const userId = c.get('userId');
  const workspaceId = c.get('workspaceId');

  if (!userId || !workspaceId) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const fileId = c.req.param('fileId');
  if (!fileId) {
    return c.json({ error: 'File ID required' }, 400);
  }

  try {
    // Get file metadata
    const file = await c.env.DB.prepare(
      'SELECT * FROM files WHERE id = ? AND workspace_id = ?'
    ).bind(fileId, workspaceId).first() as any;

    if (!file) {
      return c.json({ error: 'File not found' }, 404);
    }

    // Delete from R2
    await c.env.FILE_UPLOADS.delete(file.file_name);

    // Delete from database
    await c.env.DB.prepare('DELETE FROM files WHERE id = ?').bind(fileId).run();

    return c.json({ message: 'File deleted successfully' });

  } catch (error) {
    console.error('File deletion error:', error);
    return c.json({ error: 'Deletion failed' }, 500);
  }
});

export default files;
