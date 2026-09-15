import crypto from 'node:crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db, withTransaction } from '../../shared/db/index.js';

const AGENT_KEY_SHA256 = 'd19ee4b135d3ebec5a77892d7d18e8c0f508668d5251c88b99c38fc08de6b4fd';
const param = (index: number) => db.isPostgres ? `$${index + 1}` : '?';
const LOCKED_TYPES = new Set(['akinci', 'hermes', 'trading']);

const mergeSchema = z.object({
  type: z.string().trim().min(1).max(80),
  from: z.string().trim().min(1).max(80),
  to: z.string().trim().min(1).max(80),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#6366f1'),
  icon: z.string().trim().min(1).max(64).optional().default('Folder'),
});

const assignmentSchema = z.object({
  resourceId: z.coerce.number().int().positive(),
  category: z.string().trim().min(1).max(80),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#6366f1'),
  icon: z.string().trim().min(1).max(64).optional().default('Folder'),
});

const requestSchema = z.object({
  merges: z.array(mergeSchema).max(200).optional().default([]),
  assignments: z.array(assignmentSchema).max(200).optional().default([]),
  deleteResourceIds: z.array(z.coerce.number().int().positive()).max(200).optional().default([]),
  dryRun: z.boolean().optional().default(false),
}).refine(
  value => value.merges.length > 0 || value.assignments.length > 0 || value.deleteResourceIds.length > 0,
  { message: 'Provide at least one merge, assignment or resource deletion' },
);

const safeEqualHex = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
};

const verifyAgentKey = (rawKey: unknown) => {
  if (typeof rawKey !== 'string' || rawKey.length < 20 || rawKey.length > 256) return false;
  const digest = crypto.createHash('sha256').update(rawKey).digest('hex');
  return safeEqualHex(digest, AGENT_KEY_SHA256);
};

export async function agentMaintenanceRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.post('/categories', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    if (!verifyAgentKey(request.headers['x-agent-key'])) {
      return reply.code(401).send({ error: 'Invalid agent key' });
    }

    const parsed = requestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid payload', details: parsed.error.flatten() });
    }

    const { merges, assignments, deleteResourceIds, dryRun } = parsed.data;
    const normalizedTypes = [...new Set(merges.map(item => item.type.toLowerCase()))];
    const forbidden = normalizedTypes.filter(type => LOCKED_TYPES.has(type));
    if (forbidden.length) {
      return reply.code(400).send({ error: `Locked resource type cannot be modified: ${forbidden.join(', ')}` });
    }

    const result = await withTransaction(async (txQuery) => {
      const changes: Array<Record<string, unknown>> = [];

      for (const item of merges) {
        const typeResult = await txQuery(
          `SELECT id, name FROM resource_types
           WHERE LOWER(id) = LOWER(${param(0)}) OR LOWER(name) = LOWER(${param(1)})
           LIMIT 1`,
          [item.type, item.type],
        );
        const typeId = typeResult.rows[0]?.id ? String(typeResult.rows[0].id) : null;
        if (!typeId) {
          changes.push({ action: 'merge', type: item.type, from: item.from, to: item.to, status: 'type_not_found' });
          continue;
        }
        if (LOCKED_TYPES.has(typeId.toLowerCase())) {
          throw new Error(`Locked resource type cannot be modified: ${typeId}`);
        }
        if (item.from.toLowerCase() === item.to.toLowerCase()) {
          changes.push({ action: 'merge', type: typeId, from: item.from, to: item.to, status: 'same_category' });
          continue;
        }

        const sourceResult = await txQuery(
          `SELECT id, name FROM categories
           WHERE type = ${param(0)} AND LOWER(name) = LOWER(${param(1)})
           LIMIT 1`,
          [typeId, item.from],
        );
        const source = sourceResult.rows[0];
        if (!source?.id) {
          changes.push({ action: 'merge', type: typeId, from: item.from, to: item.to, status: 'source_not_found' });
          continue;
        }

        let targetResult = await txQuery(
          `SELECT id, name FROM categories
           WHERE type = ${param(0)} AND LOWER(name) = LOWER(${param(1)})
           LIMIT 1`,
          [typeId, item.to],
        );
        let target = targetResult.rows[0];

        if (!target?.id && !dryRun) {
          const sortResult = await txQuery(
            `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM categories WHERE type = ${param(0)}`,
            [typeId],
          );
          const nextOrder = Number(sortResult.rows[0]?.max_order || 0) + 1;
          targetResult = await txQuery(
            `INSERT INTO categories (name, type, color, icon, sort_order)
             VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)})
             RETURNING id, name`,
            [item.to, typeId, item.color, item.icon, nextOrder],
          );
          target = targetResult.rows[0];
        }

        const countResult = await txQuery(
          `SELECT COUNT(*) AS count FROM resources WHERE category_id = ${param(0)}`,
          [source.id],
        );
        const resourceCount = Number(countResult.rows[0]?.count || 0);

        if (dryRun) {
          changes.push({ action: 'merge', type: typeId, from: item.from, to: item.to, status: target?.id ? 'would_merge' : 'would_create_and_merge', resources: resourceCount });
          continue;
        }

        await txQuery(
          `UPDATE resources SET category_id = ${param(0)} WHERE category_id = ${param(1)}`,
          [target.id, source.id],
        );
        await txQuery(`DELETE FROM categories WHERE id = ${param(0)}`, [source.id]);
        changes.push({ action: 'merge', type: typeId, from: item.from, to: item.to, status: 'merged', resources: resourceCount });
      }

      for (const item of assignments) {
        const resourceResult = await txQuery(
          `SELECT id, title, type, category_id FROM resources WHERE id = ${param(0)} LIMIT 1`,
          [item.resourceId],
        );
        const resource = resourceResult.rows[0];
        if (!resource?.id) {
          changes.push({ action: 'assign', resourceId: item.resourceId, category: item.category, status: 'resource_not_found' });
          continue;
        }

        const typeId = String(resource.type);
        if (LOCKED_TYPES.has(typeId.toLowerCase())) {
          throw new Error(`Locked resource type cannot be modified: ${typeId}`);
        }

        let targetResult = await txQuery(
          `SELECT id, name FROM categories
           WHERE type = ${param(0)} AND LOWER(name) = LOWER(${param(1)})
           LIMIT 1`,
          [typeId, item.category],
        );
        let target = targetResult.rows[0];

        if (!target?.id && !dryRun) {
          const sortResult = await txQuery(
            `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM categories WHERE type = ${param(0)}`,
            [typeId],
          );
          const nextOrder = Number(sortResult.rows[0]?.max_order || 0) + 1;
          targetResult = await txQuery(
            `INSERT INTO categories (name, type, color, icon, sort_order)
             VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)})
             RETURNING id, name`,
            [item.category, typeId, item.color, item.icon, nextOrder],
          );
          target = targetResult.rows[0];
        }

        if (dryRun) {
          changes.push({ action: 'assign', resourceId: item.resourceId, title: resource.title, type: typeId, category: item.category, status: target?.id ? 'would_assign' : 'would_create_and_assign' });
          continue;
        }

        await txQuery(
          `UPDATE resources SET category_id = ${param(0)} WHERE id = ${param(1)}`,
          [target.id, item.resourceId],
        );
        changes.push({ action: 'assign', resourceId: item.resourceId, title: resource.title, type: typeId, category: item.category, status: 'assigned' });
      }

      for (const resourceId of [...new Set(deleteResourceIds)]) {
        const resourceResult = await txQuery(
          `SELECT id, title, type, url FROM resources WHERE id = ${param(0)} LIMIT 1`,
          [resourceId],
        );
        const resource = resourceResult.rows[0];
        if (!resource?.id) {
          changes.push({ action: 'delete_resource', resourceId, status: 'resource_not_found' });
          continue;
        }

        const typeId = String(resource.type);
        if (LOCKED_TYPES.has(typeId.toLowerCase())) {
          throw new Error(`Locked resource type cannot be modified: ${typeId}`);
        }

        if (dryRun) {
          changes.push({ action: 'delete_resource', resourceId, title: resource.title, type: typeId, url: resource.url, status: 'would_delete' });
          continue;
        }

        await txQuery(`DELETE FROM resources WHERE id = ${param(0)}`, [resourceId]);
        changes.push({ action: 'delete_resource', resourceId, title: resource.title, type: typeId, url: resource.url, status: 'deleted' });
      }

      return changes;
    });

    return reply.send({ dryRun, lockedTypes: [...LOCKED_TYPES], changes: result });
  });
}
