/**
 * Form Versioning Utilities
 * Centralized utilities for form version creation and management
 */

import type { Env } from '../types/index';
import { getDb } from '../db/db';

/**
 * Generate random ID using crypto.randomUUID
 */
const generateId = (): string => {
  return crypto.randomUUID();
};

/**
 * Create a new version record for a form
 * This function handles the atomic creation of form versions
 *
 * @param env - Environment bindings
 * @param formId - The form ID to create version for
 * @param currentSchema - The current form schema
 * @param versionNotes - Optional notes about this version
 * @returns Object containing version ID and version number
 */
export const createFormVersion = async (
  env: Env,
  formId: string,
  currentSchema: string,
  versionNotes?: string
): Promise<{ versionId: string; versionNumber: number }> => {
  const db = getDb(env);
  const now = new Date().toISOString();

  try {
    // Get current version number
    const currentVersionResult = await db
      .prepare('SELECT version FROM forms WHERE id = ?')
      .bind(formId)
      .first<{ version: number }>();

    if (!currentVersionResult) {
      throw new Error('Form not found');
    }

    const currentVersionNumber = currentVersionResult.version;
    const newVersionNumber = currentVersionNumber + 1;
    const newVersionId = generateId();

    // Insert new version record
    await db
      .prepare(
        `INSERT INTO form_versions (
          id,
          form_id,
          version_number,
          form_schema,
          created_at,
          is_active,
          version_notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        newVersionId,
        formId,
        newVersionNumber,
        currentSchema,
        now,
        1, // Mark as active version
        versionNotes || null
      )
      .run();

    return {
      versionId: newVersionId,
      versionNumber: newVersionNumber,
    };
  } catch (error) {
    console.error('Error creating form version:', error);
    throw new Error('Failed to create form version');
  }
};

/**
 * Auto-create version on form update
 * This function should be called when a form is updated to automatically create a version record
 * 
 * @param env - Environment bindings
 * @param formId - The form ID being updated
 * @param oldSchema - The previous form schema (for the version record)
 * @param updateType - Type of update (title, description, schema, status)
 * @param createdBy - User ID who made the update
 */
export const autoCreateVersionOnUpdate = async (
  env: Env,
  formId: string,
  oldSchema: string,
  updateType: 'title' | 'description' | 'schema' | 'status'
): Promise<{ versionId: string; versionNumber: number } | null> => {
  // Only create versions for schema changes
  if (updateType !== 'schema') {
    return null;
  }

  const versionNotes = `Auto-created version due to ${updateType} update`;
  
  return await createFormVersion(
    env,
    formId,
    oldSchema,
    versionNotes
  );
};