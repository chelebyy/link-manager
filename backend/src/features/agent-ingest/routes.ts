import crypto from 'node:crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db, withTransaction } from '../../shared/db/index.js';

const AGENT_KEY_SHA256 = '91f48f24a2562dc0da86f7c8fefea1ea72966a4aab17b88214fcca4cbc47757c';
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
      const duplicate = await txQuery(
        `SELECT id, title, category_id FROM resources WHERE type = ${param(0)} AND url = ${param(1)} LIMIT 1`,
        [item.type, item.url],
      );

      if (duplicate.rows[0]) {
        return { created: false, duplicate: true, resource: duplicate.rows[0] };
      }

      let categoryResult = await txQuery(
        `SELECT id, name FROM categories WHERE type = ${param(0)} AND name = ${param(1)} LIMIT 1`,
        [item.type, item.category],
      );

      let categoryId = categoryResult.rows[0]?.id as number | string | undefined;

      if (!categoryId) {
        const sortResult = await txQuery(
          `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM categories WHERE type = ${param(0)}`,
          [item.type],
        );
        const nextCategoryOrder = Number(sortResult.rows[0]?.max_order || 0) + 1;

        categoryResult = await txQuery(
          `INSERT INTO categories (name, type, color, icon, sort_order)
           VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)})
           RETURNING id, name`,
          [item.category, item.type, item.categoryColor, item.categoryIcon, nextCategoryOrder],
        );
        categoryId = categoryResult.rows[0]?.id;
      }

      const sortResult = await txQuery(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM resources WHERE type = ${param(0)}`,
        [item.type],
      );
      const nextResourceOrder = Number(sortResult.rows[0]?.max_order || 0) + 1;

      const inserted = await txQuery(
        `INSERT INTO resources (category_id, type, title, url, description, metadata, sort_order)
         VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)}, ${param(5)}, ${param(6)})
         RETURNING id, category_id, type, title, url, description`,
        [categoryId ?? null, item.type, item.title, item.url, item.description ?? null, '{}', nextResourceOrder],
      );

      return { created: true, duplicate: false, resource: inserted.rows[0] };
    });

    return reply.code(result.created ? 201 : 200).send(result);
  });
}
