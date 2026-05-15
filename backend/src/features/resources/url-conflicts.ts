import { query } from '../../shared/db/index.js';

const isPostgres = process.env.DATABASE_URL?.includes('postgresql');
const param = (index: number) => isPostgres ? `$${index + 1}` : `?`;

export const DUPLICATE_RESOURCE_URL_ERROR = 'URL zaten mevcut';

export const normalizeOptionalText = (value: string | null | undefined) => {
  if (value === undefined || value === null) {
    return null;
  }

  return value.trim() === '' ? null : value;
};

export const getResourceIdentity = async (id: number | string) => {
  const result = await query(
    `SELECT id, type, url FROM resources WHERE id = ${param(0)}`,
    [id]
  );

  return result.rows[0] as { id: number; type: string; url: string | null } | undefined;
};

export const hasResourceUrlConflict = async (type: string, url: string, excludeId?: number | string) => {
  const params: Array<number | string> = [type, url];
  let sql = `SELECT id FROM resources WHERE type = ${param(0)} AND url = ${param(1)}`;

  if (excludeId !== undefined) {
    sql += ` AND id <> ${param(2)}`;
    params.push(excludeId);
  }

  sql += ' LIMIT 1';

  const result = await query(sql, params);
  return result.rows.length > 0;
};

export const isResourceUrlConflictError = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';

  return (
    message.includes(DUPLICATE_RESOURCE_URL_ERROR) ||
    message.includes('UNIQUE constraint failed: resources.type, resources.url') ||
    message.includes('resources_type_url_unique_enforced_idx')
  );
};
