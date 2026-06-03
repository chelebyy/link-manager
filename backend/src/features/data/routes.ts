import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { db, query, withTransaction, type TxQuery } from '../../shared/db/index.js';
import {
  DUPLICATE_RESOURCE_URL_ERROR,
  getResourceIdentity,
  hasResourceUrlConflict,
  isResourceUrlConflictError,
  normalizeOptionalText,
} from '../resources/url-conflicts.js';

type ImportPayload = {
  resourceTypes?: Array<Record<string, unknown>>;
  categories?: Array<Record<string, unknown>>;
  resources?: Array<Record<string, unknown>>;
};

const toNumber = (value: unknown, fallback = 0) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const upsertResourceType = async (txQuery: TxQuery, item: Record<string, unknown>) => {
  if (db.isPostgres) {
    await txQuery(
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
    );
    return;
  }

  await txQuery(
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
};

const upsertCategory = async (txQuery: TxQuery, item: Record<string, unknown>) => {
  if (db.isPostgres) {
    await txQuery(
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
    );
    return;
  }

  await txQuery(
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
};

const upsertResource = async (txQuery: TxQuery, item: Record<string, unknown>) => {
  const resourceId = toNumber(item.id);
  const resourceType = String(item.type);
  const resourceUrl = normalizeOptionalText(item.url === null || item.url === undefined ? null : String(item.url));
  const resourceDescription = normalizeOptionalText(item.description === null || item.description === undefined ? null : String(item.description));
  const existingResource = await getResourceIdentity(resourceId, txQuery);
  const isSelfEdit = existingResource !== undefined
    && existingResource.type === resourceType
    && existingResource.url === resourceUrl;

  if (resourceUrl && !isSelfEdit && await hasResourceUrlConflict(
    resourceType,
    resourceUrl,
    existingResource ? resourceId : undefined,
    txQuery,
  )) {
    const err = new Error(DUPLICATE_RESOURCE_URL_ERROR);
    (err as Error & { statusCode?: number }).statusCode = 409;
    throw err;
  }

  if (db.isPostgres) {
    await txQuery(
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
        resourceId,
        item.category_id === null || item.category_id === undefined ? null : toNumber(item.category_id),
        resourceType,
        String(item.title),
        resourceUrl,
        resourceDescription,
        JSON.stringify(item.metadata ?? {}),
        Boolean(item.is_favorite),
        toNumber(item.sort_order),
      ]
    );
    return;
  }

  await txQuery(
    `INSERT INTO resources (id, category_id, type, title, url, description, metadata, is_favorite, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       category_id = excluded.category_id,
       type = excluded.type,
       title = excluded.title,
       url = excluded.url,
       description = excluded.description,
       metadata = excluded.metadata,
       is_favorite = excluded.is_favorite,
       sort_order = excluded.sort_order,
       updated_at = datetime('now')`,
    [
      resourceId,
      item.category_id === null || item.category_id === undefined ? null : toNumber(item.category_id),
      resourceType,
      String(item.title),
      resourceUrl,
      resourceDescription,
      JSON.stringify(item.metadata ?? {}),
      Boolean(item.is_favorite) ? 1 : 0,
      toNumber(item.sort_order),
    ]
  );
};

export async function dataRoutes(app: FastifyInstance, options: FastifyPluginOptions) {
  app.get('/export', {
    config: {
      rateLimit: {
        max: 60,
        timeWindow: '15 minutes',
      },
    },
  }, async () => {
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

  app.post('/import', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '15 minutes',
      },
    },
  }, async (request, reply) => {
    const body = request.body as ImportPayload;

    if (!body || (!Array.isArray(body.resourceTypes) && !Array.isArray(body.categories) && !Array.isArray(body.resources))) {
      reply.status(400);
      return { error: 'Invalid import payload' };
    }

    const resourceTypes = Array.isArray(body.resourceTypes) ? body.resourceTypes : [];
    const categories = Array.isArray(body.categories) ? body.categories : [];
    const resources = Array.isArray(body.resources) ? body.resources : [];

    try {
      await withTransaction(async (txQuery) => {
        for (const item of resourceTypes) {
          try {
            await upsertResourceType(txQuery, item);
          } catch (err) {
            request.log.error({ err, itemId: item?.id }, 'import failed at resource_types upsert');
            throw err;
          }
        }

        for (const item of categories) {
          try {
            await upsertCategory(txQuery, item);
          } catch (err) {
            request.log.error({ err, itemId: item?.id }, 'import failed at categories upsert');
            throw err;
          }
        }

        for (const item of resources) {
          try {
            await upsertResource(txQuery, item);
          } catch (err) {
            request.log.error({ err, itemId: item?.id }, 'import failed at resources upsert');
            throw err;
          }
        }
      });
    } catch (error) {
      if (isResourceUrlConflictError(error) || (error as { statusCode?: number })?.statusCode === 409) {
        reply.status(409);
        return { error: DUPLICATE_RESOURCE_URL_ERROR };
      }

      throw error;
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
