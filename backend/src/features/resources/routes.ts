import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { query } from '../../shared/db/index.js';

const isPostgres = process.env.DATABASE_URL?.includes('postgresql');
const param = (index: number) => isPostgres ? `$${index + 1}` : `?`;
const boolTrue = () => isPostgres ? 'true' : '1';
const now = () => isPostgres ? 'NOW()' : "datetime('now')";

type ResourceCreateBody = {
  category_id?: number | null;
  type?: string;
  title?: string;
  url?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
};

type ResourceUpdateBody = {
  category_id?: number | null;
  title?: string;
  url?: string | null;
  description?: string | null;
  metadata?: Record<string, unknown>;
};

type ResourceParams = {
  id: string;
};

type ResourceReorderBody = {
  ids?: number[];
};

const normalizeOptionalText = (value: string | null | undefined) => {
  if (value === undefined || value === null) {
    return null;
  }

  return value.trim() === '' ? null : value;
};

export async function resourcesRoutes(app: FastifyInstance, options: FastifyPluginOptions) {
  app.get('/', async (request, reply) => {
      const { category, type, favorite, search, sort = 'sort_order', order = 'asc' } = request.query as any;
    
    let sql = `
      SELECT r.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
             s.github_id, s.last_release_tag, s.has_updates, s.last_sync_at
      FROM resources r
      LEFT JOIN categories c ON r.category_id = c.id
      LEFT JOIN resource_sync_state s ON r.id = s.resource_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 0;

    if (category) {
      sql += ` AND r.category_id = ${param(paramIndex++)}`;
      params.push(category);
    }

    if (type) {
      sql += ` AND r.type = ${param(paramIndex++)}`;
      params.push(type);
    }

    if (favorite === 'true') {
      sql += ` AND r.is_favorite = ${boolTrue()}`;
    }

      if (search) {
        const searchParam = param(paramIndex++);
       sql += ` AND (LOWER(r.title) LIKE LOWER(${searchParam}) OR LOWER(r.description) LIKE LOWER(${searchParam}) OR LOWER(COALESCE(c.name, '')) LIKE LOWER(${searchParam}) OR LOWER(r.type) LIKE LOWER(${searchParam}))`;
       params.push(`%${search}%`);
      }

    sql += ` ORDER BY r.${sort} ${order.toUpperCase()}`;

    const result = await query(sql, params);
    return result.rows;
  });

  app.post('/', async (request, reply) => {
    const { category_id, type, title, url, description, metadata = {} } = request.body as ResourceCreateBody;

    if (!type || !title) {
      reply.status(400);
      return { error: 'type and title are required' };
    }

    const sortResult = await query(
      `SELECT MAX(sort_order) as max_order FROM resources WHERE type = ${param(0)}`,
      [type]
    );
    const nextOrder = Number(sortResult.rows[0]?.max_order || 0) + 1;
    
    const result = await query(
      `INSERT INTO resources (category_id, type, title, url, description, metadata, sort_order) VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)}, ${param(5)}, ${param(6)}) RETURNING *`,
      [category_id ?? null, type, title, normalizeOptionalText(url), normalizeOptionalText(description), JSON.stringify(metadata), nextOrder]
    );
    
    reply.status(201);
    return result.rows[0];
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as ResourceParams;
    const { category_id, title, url, description, metadata } = request.body as ResourceUpdateBody;
    
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 0;

    if (category_id !== undefined) {
      fields.push(`category_id = ${param(paramIndex++)}`);
      values.push(category_id);
    }
    if (title !== undefined) {
      fields.push(`title = ${param(paramIndex++)}`);
      values.push(title);
    }
    if (url !== undefined) {
      fields.push(`url = ${param(paramIndex++)}`);
      values.push(normalizeOptionalText(url));
    }
    if (description !== undefined) {
      fields.push(`description = ${param(paramIndex++)}`);
      values.push(normalizeOptionalText(description));
    }
    if (metadata !== undefined) {
      fields.push(`metadata = ${param(paramIndex++)}`);
      values.push(JSON.stringify(metadata));
    }

    if (fields.length === 0) {
      reply.status(400);
      return { error: 'No fields to update' };
    }

    values.push(id);
    
    const result = await query(
      `UPDATE resources SET ${fields.join(', ')}, updated_at = ${now()} WHERE id = ${param(paramIndex)} RETURNING *`,
      values
    );
    
    const isSuccess = result.rows.length > 0 || (!isPostgres && (result.rowCount ?? 0) > 0);
    if (!isSuccess) {
      reply.status(404);
      return { error: 'Resource not found' };
    }
    
    if (result.rows.length > 0) {
      return result.rows[0];
    }
    return { id };
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as ResourceParams;
    await query(`DELETE FROM resources WHERE id = ${param(0)}`, [id]);
    reply.status(204);
  });

  app.patch('/:id/favorite', async (request, reply) => {
    const { id } = request.params as ResourceParams;
    const { is_favorite } = request.body as any;
    
    const favValue = isPostgres ? is_favorite : (is_favorite ? 1 : 0);
    const result = await query(
      `UPDATE resources SET is_favorite = ${param(0)}, updated_at = ${now()} WHERE id = ${param(1)} RETURNING *`,
      [favValue, id]
    );
    
    // For SQLite, check rowCount; for PostgreSQL, check rows.length
    const isSuccess = isPostgres ? result.rows.length > 0 : (result.rowCount ?? 0) > 0;
    if (!isSuccess) {
      reply.status(404);
      return { error: 'Resource not found' };
    }
    
    return result.rows[0] || { id, is_favorite: favValue };
  });

  app.patch('/reorder', async (request, reply) => {
    const { ids } = request.body as ResourceReorderBody;

    if (!ids || ids.length === 0) {
      reply.status(400);
      return { error: 'ids are required' };
    }

    await Promise.all(
      ids.map((id, index) =>
        query(
          `UPDATE resources SET sort_order = ${param(0)}, updated_at = ${now()} WHERE id = ${param(1)}`,
          [index + 1, id]
        )
      )
    );

    return { success: true };
  });
}
