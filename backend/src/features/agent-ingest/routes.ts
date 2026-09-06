import crypto from 'node:crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db, withTransaction } from '../../shared/db/index.js';

const AGENT_KEY_SHA256 = 'd19ee4b135d3ebec5a77892d7d18e8c0f508668d5251c88b99c38fc08de6b4fd';
const param = (index: number) => db.isPostgres ? `$${index + 1}` : '?';

const ingestSchema = z.object({
  type: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(2000),
  description: z.string().trim().max(4000).nullable().optional(),
  categoryColor: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#6366f1'),
  categoryIcon: z.string().trim().min(1).max(64).optional().default('Folder'),
});

const safeEqualHex = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
};

const verifyAgentKey = (rawKey: unknown) => {
  if (typeof rawKey !== 'string' || rawKey.length < 20 || rawKey.length > 256) return false;
  const digest = crypto.createHash('sha256').update(rawKey).digest('hex');
  return safeEqualHex(digest, AGENT_KEY_SHA256);
};

export async function agentIngestRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.post('/', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '15 minutes',
      },
    },
  }, async (request, reply) => {
    if (!verifyAgentKey(request.headers['x-agent-key'])) {
      return reply.code(401).send({ error: 'Invalid agent key' });
    }

    const parsed = ingestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'Invalid payload',
        details: parsed.error.flatten(),
      });
    }

    const item = parsed.data;

    const result = await withTransaction(async (txQuery) => {
      const typeResult = await txQuery(
        `SELECT id, name FROM resource_types
         WHERE LOWER(id) = LOWER(${param(0)}) OR LOWER(name) = LOWER(${param(1)})
         LIMIT 1`,
        [item.type, item.type],
      );

      const resolvedType = typeResult.rows[0]?.id ? String(typeResult.rows[0].id) : null;
      if (!resolvedType) {
        throw new Error(`Agent ingest resource type not found: ${item.type}`);
      }

      let categoryResult = await txQuery(
        `SELECT id, name FROM categories
         WHERE type = ${param(0)} AND LOWER(name) = LOWER(${param(1)})
         LIMIT 1`,
        [resolvedType, item.category],
      );

      let categoryId = categoryResult.rows[0]?.id as number | string | undefined;

      if (!categoryId) {
        const sortResult = await txQuery(
          `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM categories WHERE type = ${param(0)}`,
          [resolvedType],
        );
        const nextCategoryOrder = Number(sortResult.rows[0]?.max_order || 0) + 1;

        categoryResult = await txQuery(
          `INSERT INTO categories (name, type, color, icon, sort_order)
           VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)})
           RETURNING id, name`,
          [item.category, resolvedType, item.categoryColor, item.categoryIcon, nextCategoryOrder],
        );
        categoryId = categoryResult.rows[0]?.id;
      }

      const duplicates = await txQuery(
        `SELECT id, title, category_id, type, url, description
         FROM resources WHERE url = ${param(0)} ORDER BY id ASC`,
        [item.url],
      );

      if (duplicates.rows.length > 0) {
        const exactType = duplicates.rows.find((row: any) => String(row.type) === resolvedType);
        const current = exactType ?? duplicates.rows[0];
        const needsTypeRepair = String(current.type) !== resolvedType;
        const needsCategoryRepair = String(current.category_id ?? '') !== String(categoryId ?? '');
        const needsDescription = !current.description && item.description;

        if (needsTypeRepair || needsCategoryRepair || needsDescription) {
          const updated = await txQuery(
            `UPDATE resources
             SET type = ${param(0)},
                 category_id = ${param(1)},
                 description = CASE
                   WHEN description IS NULL OR description = '' THEN ${param(2)}
                   ELSE description
                 END
             WHERE id = ${param(3)}
             RETURNING id, category_id, type, title, url, description`,
            [resolvedType, categoryId ?? null, item.description ?? null, current.id],
          );

          return {
            created: false,
            duplicate: true,
            repaired: true,
            duplicateCount: duplicates.rows.length,
            resource: updated.rows[0],
          };
        }

        return {
          created: false,
          duplicate: true,
          repaired: false,
          duplicateCount: duplicates.rows.length,
          resource: current,
        };
      }

      const sortResult = await txQuery(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM resources WHERE type = ${param(0)}`,
        [resolvedType],
      );
      const nextResourceOrder = Number(sortResult.rows[0]?.max_order || 0) + 1;

      const inserted = await txQuery(
        `INSERT INTO resources (category_id, type, title, url, description, metadata, sort_order)
         VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)}, ${param(5)}, ${param(6)})
         RETURNING id, category_id, type, title, url, description`,
        [categoryId ?? null, resolvedType, item.title, item.url, item.description ?? null, '{}', nextResourceOrder],
      );

      return { created: true, duplicate: false, repaired: false, duplicateCount: 0, resource: inserted.rows[0] };
    });

    return reply.code(result.created ? 201 : 200).send(result);
  });
}
