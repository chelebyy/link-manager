import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { query } from '../../shared/db/index.js';

type ImportPayload = {
  resourceTypes?: Array<Record<string, unknown>>;
  categories?: Array<Record<string, unknown>>;
  resources?: Array<Record<string, unknown>>;
};

const toNumber = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

export async function dataRoutes(app: FastifyInstance, options: FastifyPluginOptions) {
  app.get('/export', async () => {
    const [resourceTypes, categories, resources] = await Promise.all([
      query('SELECT * FROM resource_types ORDER BY sort_order ASC, name ASC', []),
      query('SELECT * FROM categories ORDER BY sort_order ASC, name ASC', []),
      query('SELECT * FROM resources ORDER BY sort_order ASC, created_at ASC', []),
    ]);

    return {
      exported_at: new Date().toISOString(),
      resourceTypes: resourceTypes.rows,
      categories: categories.rows,
      resources: resources.rows,
    };
  });

  app.post('/import', async (request, reply) => {
    const body = request.body as ImportPayload;

    if (!body || (!Array.isArray(body.resourceTypes) && !Array.isArray(body.categories) && !Array.isArray(body.resources))) {
      reply.status(400);
      return { error: 'Invalid import payload' };
    }

    const resourceTypes = Array.isArray(body.resourceTypes) ? body.resourceTypes : [];
    const categories = Array.isArray(body.categories) ? body.categories : [];
    const resources = Array.isArray(body.resources) ? body.resources : [];

    for (const item of resourceTypes) {
      await query(
        `INSERT INTO resource_types (id, name, icon, color, description, is_builtin, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           icon = EXCLUDED.icon,
           color = EXCLUDED.color,
           description = EXCLUDED.description,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()`,
        [
          String(item.id),
          String(item.name),
          String(item.icon ?? 'Folder'),
          String(item.color ?? '#6366f1'),
          item.description ? String(item.description) : null,
          Boolean(item.is_builtin),
          toNumber(item.sort_order),
        ]
      ).catch(async () => {
        await query(
          `INSERT OR REPLACE INTO resource_types (id, name, icon, color, description, is_builtin, sort_order, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            String(item.id),
            String(item.name),
            String(item.icon ?? 'Folder'),
            String(item.color ?? '#6366f1'),
            item.description ? String(item.description) : null,
            Boolean(item.is_builtin) ? 1 : 0,
            toNumber(item.sort_order),
          ]
        );
      });
    }

    for (const item of categories) {
      await query(
        `INSERT INTO categories (id, name, type, color, icon, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           type = EXCLUDED.type,
           color = EXCLUDED.color,
           icon = EXCLUDED.icon,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()`,
        [
          toNumber(item.id),
          String(item.name),
          String(item.type),
          String(item.color ?? '#6366f1'),
          String(item.icon ?? 'Folder'),
          toNumber(item.sort_order),
        ]
      ).catch(async () => {
        await query(
          `INSERT OR REPLACE INTO categories (id, name, type, color, icon, sort_order, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            toNumber(item.id),
            String(item.name),
            String(item.type),
            String(item.color ?? '#6366f1'),
            String(item.icon ?? 'Folder'),
            toNumber(item.sort_order),
          ]
        );
      });
    }

    for (const item of resources) {
      await query(
        `INSERT INTO resources (id, category_id, type, title, url, description, metadata, is_favorite, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO UPDATE SET
           category_id = EXCLUDED.category_id,
           type = EXCLUDED.type,
           title = EXCLUDED.title,
           url = EXCLUDED.url,
           description = EXCLUDED.description,
           metadata = EXCLUDED.metadata,
           is_favorite = EXCLUDED.is_favorite,
           sort_order = EXCLUDED.sort_order,
           updated_at = NOW()`,
        [
          toNumber(item.id),
          item.category_id === null || item.category_id === undefined ? null : toNumber(item.category_id),
          String(item.type),
          String(item.title),
          item.url ? String(item.url) : null,
          item.description ? String(item.description) : null,
          JSON.stringify(item.metadata ?? {}),
          Boolean(item.is_favorite),
          toNumber(item.sort_order),
        ]
      ).catch(async () => {
        await query(
          `INSERT OR REPLACE INTO resources (id, category_id, type, title, url, description, metadata, is_favorite, sort_order, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
          [
            toNumber(item.id),
            item.category_id === null || item.category_id === undefined ? null : toNumber(item.category_id),
            String(item.type),
            String(item.title),
            item.url ? String(item.url) : null,
            item.description ? String(item.description) : null,
            JSON.stringify(item.metadata ?? {}),
            Boolean(item.is_favorite) ? 1 : 0,
            toNumber(item.sort_order),
          ]
        );
      });
    }

    return {
      success: true,
      imported: {
        resourceTypes: resourceTypes.length,
        categories: categories.length,
        resources: resources.length,
      },
    };
  });
}
