import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { z, ZodSchema } from 'zod';
import { db, query, withTransaction, type TxQuery } from '../../shared/db/index.js';
import {
  DUPLICATE_RESOURCE_URL_ERROR,
  getResourceIdentity,
  hasResourceUrlConflict,
  isResourceUrlConflictError,
  normalizeOptionalText,
} from './url-conflicts.js';

const param = (index: number) => db.isPostgres ? `$${index + 1}` : `?`;
const boolTrue = () => db.isPostgres ? 'true' : '1';
const now = () => db.isPostgres ? 'NOW()' : "datetime('now')";

const resourcesListQuerySchema = z
  .object({
    category: z.string().optional(),
    type: z.string().optional(),
    favorite: z.enum(['true', 'false']).optional(),
    search: z.string().optional(),
    sort: z.enum(['id', 'sort_order', 'title', 'url', 'created_at', 'updated_at']).default('sort_order'),
    order: z.enum(['asc', 'desc']).default('asc'),
  })
  .strict();

const resourceCreateSchema = z
  .object({
    category_id: z.number().int().nullable().optional(),
    type: z.string().min(1),
    title: z.string().min(1),
    url: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const resourceUpdateSchema = z
  .object({
    category_id: z.number().int().nullable().optional(),
    type: z.string().min(1).optional(),
    title: z.string().optional(),
    url: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const resourceFavoriteSchema = z
  .object({
    is_favorite: z.boolean(),
  })
  .strict();

const reorderSchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1),
  })
  .strict();

const bulkMoveSchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1),
    type: z.string().min(1),
    category_id: z.number().int().nullable().optional(),
  })
  .strict();

type ResourcesListQuery = z.infer<typeof resourcesListQuerySchema>;
type ResourceCreateBody = z.infer<typeof resourceCreateSchema>;
type ResourceUpdateBody = z.infer<typeof resourceUpdateSchema>;
type BulkMoveBody = z.infer<typeof bulkMoveSchema>;

type ResourceParams = {
  id: string;
};

const findOrCreateMovedCategoryId = async (
  resourceId: string,
  targetType: string,
  requestedCategoryId: number | null | undefined,
  txQuery: TxQuery,
) => {
  if (requestedCategoryId !== undefined && requestedCategoryId !== null) {
    return requestedCategoryId;
  }

  const sourceCategoryResult = await txQuery(
    `SELECT c.name, c.color, c.icon
     FROM resources r
     LEFT JOIN categories c ON r.category_id = c.id
     WHERE r.id = ${param(0)}`,
    [resourceId]
  );
  const sourceCategory = sourceCategoryResult.rows[0] as { name: string | null; color: string | null; icon: string | null } | undefined;

  if (!sourceCategory?.name) {
    return requestedCategoryId;
  }

  const existingCategoryResult = await txQuery(
    `SELECT id FROM categories WHERE name = ${param(0)} AND type = ${param(1)} LIMIT 1`,
    [sourceCategory.name, targetType]
  );
  const existingCategory = existingCategoryResult.rows[0] as { id: number } | undefined;
  if (existingCategory) {
    return existingCategory.id;
  }

  const sortResult = await txQuery(
    `SELECT MAX(sort_order) as max_order FROM categories WHERE type = ${param(0)}`,
    [targetType]
  );
  const nextOrder = Number(sortResult.rows[0]?.max_order || 0) + 1;
  const insertResult = await txQuery(
    `INSERT INTO categories (name, type, color, icon, sort_order)
     VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)})
     RETURNING id`,
    [
      sourceCategory.name,
      targetType,
      sourceCategory.color ?? '#6366f1',
      sourceCategory.icon ?? 'Folder',
      nextOrder,
    ]
  );

  return (insertResult.rows[0] as { id: number }).id;
};

const securedRouteRateLimit = {
  config: {
    rateLimit: {
      max: 60,
      timeWindow: '15 minutes',
    },
  },
} as const;

function validate<T>(
  schema: ZodSchema<T>,
  source: 'query' | 'body' | 'params' = 'body',
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(request[source]);
    if (!result.success) {
      reply.status(400);
      return reply.send({ error: result.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ') });
    }
    (request as FastifyRequest & { validated?: Record<string, unknown> }).validated = {
      ...(request as FastifyRequest & { validated?: Record<string, unknown> }).validated,
      [source]: result.data,
    };
  };
}

export async function resourcesRoutes(app: FastifyInstance, options: FastifyPluginOptions) {
  app.get('/', {
    ...securedRouteRateLimit,
    preHandler: [app.rateLimit(), validate(resourcesListQuerySchema, 'query')],
  }, async (request, reply) => {
    const { category, type, favorite, search, sort, order } = (request as FastifyRequest & { validated: { query: ResourcesListQuery } }).validated.query;

    let sql = `
      SELECT r.*, c.name as category_name, c.color as category_color, c.icon as category_icon,
             s.github_id, s.last_release_tag, s.has_updates, s.last_sync_at
      FROM resources r
      LEFT JOIN categories c ON r.category_id = c.id
      LEFT JOIN resource_sync_state s ON r.id = s.resource_id
      WHERE 1=1
    `;
    const params: unknown[] = [];
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

  app.post('/', {
    ...securedRouteRateLimit,
    preHandler: [app.rateLimit(), validate(resourceCreateSchema, 'body')],
  }, async (request, reply) => {
    const { category_id, type, title, url, description, metadata = {} } = (request as FastifyRequest & { validated: { body: ResourceCreateBody } }).validated.body;

    const normalizedUrl = normalizeOptionalText(url ?? null);
    if (normalizedUrl && await hasResourceUrlConflict(type, normalizedUrl)) {
      reply.status(409);
      return { error: DUPLICATE_RESOURCE_URL_ERROR };
    }

    const sortResult = await query(
      `SELECT MAX(sort_order) as max_order FROM resources WHERE type = ${param(0)}`,
      [type]
    );
    const nextOrder = Number(sortResult.rows[0]?.max_order || 0) + 1;

    try {
      const result = await query(
        `INSERT INTO resources (category_id, type, title, url, description, metadata, sort_order) VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)}, ${param(5)}, ${param(6)}) RETURNING *`,
        [category_id ?? null, type, title, normalizedUrl, normalizeOptionalText(description), JSON.stringify(metadata), nextOrder]
      );

      reply.status(201);
      return result.rows[0];
    } catch (error) {
      if (isResourceUrlConflictError(error)) {
        reply.status(409);
        return { error: DUPLICATE_RESOURCE_URL_ERROR };
      }

      throw error;
    }
  });

  app.patch('/bulk-move', {
    ...securedRouteRateLimit,
    preHandler: [app.rateLimit(), validate(bulkMoveSchema, 'body')],
  }, async (request, reply) => {
    const { ids, type, category_id } = (request as FastifyRequest & { validated: { body: BulkMoveBody } }).validated.body;
    const uniqueIds = [...new Set(ids)];

    try {
      const moved = await withTransaction(async (txQuery) => {
        const sortResult = await txQuery(
          `SELECT MAX(sort_order) as max_order FROM resources WHERE type = ${param(0)}`,
          [type]
        );
        let nextOrder = Number(sortResult.rows[0]?.max_order || 0) + 1;

        for (const resourceId of uniqueIds) {
          const identityResult = await txQuery(
            `SELECT id, type, url FROM resources WHERE id = ${param(0)}`,
            [resourceId]
          );
          const resource = identityResult.rows[0] as { id: number; type: string; url: string | null } | undefined;
          if (!resource) {
            throw Object.assign(new Error('Resource not found'), { statusCode: 404 });
          }

          const isTypeMove = resource.type !== type;
          if (
            resource.url &&
            isTypeMove &&
            await hasResourceUrlConflict(type, resource.url, resource.id, txQuery)
          ) {
            throw Object.assign(new Error(DUPLICATE_RESOURCE_URL_ERROR), { statusCode: 409 });
          }

          const shouldAutoMapMovedCategory = isTypeMove && (category_id === undefined || category_id === null);
          const categoryIdToSet = shouldAutoMapMovedCategory
            ? await findOrCreateMovedCategoryId(String(resource.id), type, category_id, txQuery)
            : category_id;

          const fields: string[] = [`type = ${param(0)}`];
          const values: unknown[] = [type];
          let paramIndex = 1;

          if (categoryIdToSet !== undefined) {
            fields.push(`category_id = ${param(paramIndex++)}`);
            values.push(categoryIdToSet);
          }

          if (isTypeMove) {
            fields.push(`sort_order = ${param(paramIndex++)}`);
            values.push(nextOrder++);
          }

          values.push(resource.id);
          await txQuery(
            `UPDATE resources SET ${fields.join(', ')}, updated_at = ${now()} WHERE id = ${param(paramIndex)}`,
            values
          );
        }

        return uniqueIds.length;
      });

      return { success: true, moved };
    } catch (error) {
      const statusCode = typeof (error as { statusCode?: unknown }).statusCode === 'number'
        ? (error as { statusCode: number }).statusCode
        : undefined;
      if (statusCode === 404) {
        reply.status(404);
        return { error: 'Resource not found' };
      }
      if (statusCode === 409 || isResourceUrlConflictError(error)) {
        reply.status(409);
        return { error: DUPLICATE_RESOURCE_URL_ERROR };
      }

      throw error;
    }
  });

  app.patch('/:id', {
    ...securedRouteRateLimit,
    preHandler: [app.rateLimit(), validate(resourceUpdateSchema, 'body')],
  }, async (request, reply) => {
    const { id } = request.params as ResourceParams;
    const { category_id, type, title, url, description, metadata } = (request as FastifyRequest & { validated: { body: ResourceUpdateBody } }).validated.body;

    const needsExistingResource = type !== undefined || url !== undefined;
    const existingResource = needsExistingResource ? await getResourceIdentity(id) : undefined;
    if (needsExistingResource && !existingResource) {
      reply.status(404);
      return { error: 'Resource not found' };
    }

    if (
      category_id === undefined &&
      type === undefined &&
      title === undefined &&
      url === undefined &&
      description === undefined &&
      metadata === undefined
    ) {
      reply.status(400);
      return { error: 'No fields to update' };
    }

    if (existingResource && (url !== undefined || type !== undefined)) {
      const targetType = type ?? existingResource.type;
      const normalizedUrl = url !== undefined ? normalizeOptionalText(url) : existingResource.url;
      const hasIdentityChanged = targetType !== existingResource.type || normalizedUrl !== existingResource.url;
      if (normalizedUrl && hasIdentityChanged && await hasResourceUrlConflict(targetType, normalizedUrl, id)) {
        reply.status(409);
        return { error: DUPLICATE_RESOURCE_URL_ERROR };
      }
    }

    try {
      const result = await withTransaction(async (txQuery) => {
        const fields: string[] = [];
        const values: unknown[] = [];
        let paramIndex = 0;
        const isTypeMove = Boolean(existingResource && type !== undefined && type !== existingResource.type);

        if (type !== undefined) {
          fields.push(`type = ${param(paramIndex++)}`);
          values.push(type);

          if (isTypeMove) {
            const sortResult = await txQuery(
              `SELECT MAX(sort_order) as max_order FROM resources WHERE type = ${param(0)}`,
              [type]
            );
            const nextOrder = Number(sortResult.rows[0]?.max_order || 0) + 1;
            fields.push(`sort_order = ${param(paramIndex++)}`);
            values.push(nextOrder);
          }
        }

        const shouldAutoMapMovedCategory = isTypeMove && (category_id === undefined || category_id === null);
        const categoryIdToSet = shouldAutoMapMovedCategory
          ? await findOrCreateMovedCategoryId(id, type as string, category_id, txQuery)
          : category_id;
        if (categoryIdToSet !== undefined) {
          fields.push(`category_id = ${param(paramIndex++)}`);
          values.push(categoryIdToSet);
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

        values.push(id);
        return txQuery(
          `UPDATE resources SET ${fields.join(', ')}, updated_at = ${now()} WHERE id = ${param(paramIndex)} RETURNING *`,
          values
        );
      });

      const isSuccess = result.rows.length > 0 || (!db.isPostgres && (result.rowCount ?? 0) > 0);
      if (!isSuccess) {
        reply.status(404);
        return { error: 'Resource not found' };
      }

      if (result.rows.length > 0) {
        return result.rows[0];
      }
      return { id };
    } catch (error) {
      if (isResourceUrlConflictError(error)) {
        reply.status(409);
        return { error: DUPLICATE_RESOURCE_URL_ERROR };
      }

      throw error;
    }
  });

  app.delete('/:id', securedRouteRateLimit, async (request, reply) => {
    const { id } = request.params as ResourceParams;

    if (!/^\d+$/.test(id)) {
      reply.status(400);
      return { error: 'Invalid resource id' };
    }

    const result = await query(`DELETE FROM resources WHERE id = ${param(0)}`, [id]);

    if (!result.rowCount) {
      reply.status(404);
      return { error: 'Resource not found' };
    }

    reply.status(204);
    return null;
  });

  app.patch('/:id/favorite', {
    ...securedRouteRateLimit,
    preHandler: [app.rateLimit(), validate(resourceFavoriteSchema, 'body')],
  }, async (request, reply) => {
    const { id } = request.params as ResourceParams;
    const { is_favorite } = (request as FastifyRequest & { validated: { body: { is_favorite: boolean } } }).validated.body;

    // Validate id is a valid number
    const resourceId = parseInt(id, 10);
    if (isNaN(resourceId)) {
      reply.status(400);
      return { error: 'Invalid resource ID' };
    }

    const favValue = db.isPostgres ? is_favorite : (is_favorite ? 1 : 0);
    const result = await query(
      `UPDATE resources SET is_favorite = ${param(0)}, updated_at = ${now()} WHERE id = ${param(1)} RETURNING *`,
      [favValue, resourceId]
    );

    // For SQLite, check rowCount; for PostgreSQL, check rows.length
    const isSuccess = db.isPostgres ? result.rows.length > 0 : (result.rowCount ?? 0) > 0;
    if (!isSuccess) {
      reply.status(404);
      return { error: 'Resource not found' };
    }

    return result.rows[0] || { id: resourceId, is_favorite: favValue };
  });

  app.patch('/reorder', {
    ...securedRouteRateLimit,
    preHandler: [app.rateLimit(), validate(reorderSchema, 'body')],
  }, async (request, reply) => {
    const { ids } = (request as FastifyRequest & { validated: { body: z.infer<typeof reorderSchema> } }).validated.body;

    if (new Set(ids).size !== ids.length) {
      reply.status(400);
      return { error: 'ids must not contain duplicates' };
    }

    const NOT_FOUND = Symbol('reorder-id-not-found');

    try {
      await withTransaction(async (txQuery) => {
        let updatedCount = 0;
        for (let index = 0; index < ids.length; index += 1) {
          const result = await txQuery(
            `UPDATE resources SET sort_order = ${param(0)}, updated_at = ${now()} WHERE id = ${param(1)}`,
            [index + 1, ids[index]]
          );
          updatedCount += result.rowCount ?? 0;
        }
        if (updatedCount !== ids.length) {
          throw NOT_FOUND;
        }
      });
    } catch (err) {
      if (err === NOT_FOUND) {
        reply.status(400);
        return { error: 'One or more resource ids do not exist' };
      }
      throw err;
    }

    reply.status(204);
    return null;
  });
}
