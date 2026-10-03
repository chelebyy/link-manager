import crypto from 'node:crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { z } from 'zod';
import { db, withTransaction } from '../../shared/db/index.js';

const param = (index: number) => db.isPostgres ? `$${index + 1}` : '?';
const LOCKED_TYPES = new Set(['AKINCI', 'HERMES', 'TRADING']);

function verifyMcpKey(rawKey: unknown) {
  const expected = process.env.LINK_MANAGER_MCP_KEY;
  if (!expected || typeof rawKey !== 'string') return false;
  const a = Buffer.from(rawKey);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const text = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
});


const toolDefinitions = [
  {
    name: 'list_categories',
    description: 'List resource types and categories available in Link Manager.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'search_resources',
    description: 'Search Link Manager resources by title, URL, or description.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1, maxLength: 300 },
        type: { type: 'string', minLength: 1, maxLength: 80 },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'check_duplicate',
    description: 'Check whether an exact URL already exists in Link Manager.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string', format: 'uri', maxLength: 2000 } },
      required: ['url'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_resource',
    description: 'Add one resource to Link Manager. Existing URLs are returned as duplicates instead of being inserted twice.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', minLength: 1, maxLength: 80 },
        category: { type: 'string', minLength: 1, maxLength: 80 },
        title: { type: 'string', minLength: 1, maxLength: 200 },
        url: { type: 'string', format: 'uri', maxLength: 2000 },
        description: { type: 'string', maxLength: 4000 },
      },
      required: ['type', 'category', 'title', 'url'],
      additionalProperties: false,
    },
  },
] as const;

const searchSchema = z.object({
  query: z.string().trim().min(1).max(300),
  type: z.string().trim().min(1).max(80).optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

const duplicateSchema = z.object({ url: z.string().trim().url().max(2000) });

const addSchema = z.object({
  type: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(200),
  url: z.string().trim().url().max(2000),
  description: z.string().trim().max(4000).optional(),
});

async function callTool(name: string, rawArgs: unknown) {
  if (name === 'list_categories') {
    const [types, categories] = await Promise.all([
      db.query('SELECT id, name, color, icon, sort_order FROM resource_types ORDER BY sort_order ASC, name ASC'),
      db.query('SELECT id, name, type, color, icon, sort_order FROM categories ORDER BY type ASC, sort_order ASC, name ASC'),
    ]);
    return text({ resourceTypes: types.rows, categories: categories.rows });
  }

  if (name === 'search_resources') {
    const { query, type, limit } = searchSchema.parse(rawArgs ?? {});
    const needle = `%${query.toLowerCase()}%`;
    const values: unknown[] = [needle, needle, needle];
    let sql = `SELECT id, category_id, type, title, url, description
      FROM resources
      WHERE (LOWER(title) LIKE ${param(0)} OR LOWER(url) LIKE ${param(1)} OR LOWER(COALESCE(description, '')) LIKE ${param(2)})`;
    if (type) {
      sql += ` AND LOWER(type) = LOWER(${param(3)})`;
      values.push(type);
    }
    sql += ` ORDER BY title ASC LIMIT ${Number(limit)}`;
    const result = await db.query(sql, values);
    return text({ resources: result.rows });
  }

  if (name === 'check_duplicate') {
    const { url } = duplicateSchema.parse(rawArgs ?? {});
    const result = await db.query(
      `SELECT id, category_id, type, title, url, description FROM resources WHERE url = ${param(0)} ORDER BY id ASC`,
      [url],
    );
    return text({ duplicate: result.rows.length > 0, count: result.rows.length, resources: result.rows });
  }

  if (name === 'add_resource') {
    const item = addSchema.parse(rawArgs ?? {});
    if (LOCKED_TYPES.has(item.type.toUpperCase())) {
      return text({ error: `${item.type} is intentionally excluded from Remote MCP writes` });
    }

    const result = await withTransaction(async (txQuery) => {
      const typeResult = await txQuery(
        `SELECT id, name FROM resource_types
         WHERE LOWER(id) = LOWER(${param(0)}) OR LOWER(name) = LOWER(${param(1)})
         LIMIT 1`,
        [item.type, item.type],
      );
      const resolvedType = typeResult.rows[0]?.id ? String(typeResult.rows[0].id) : null;
      if (!resolvedType) throw new Error(`Resource type not found: ${item.type}`);

      const duplicate = await txQuery(
        `SELECT id, category_id, type, title, url, description FROM resources
         WHERE url = ${param(0)} ORDER BY id ASC`,
        [item.url],
      );
      if (duplicate.rows.length) {
        return { created: false, duplicate: true, resource: duplicate.rows[0] };
      }

      let category = await txQuery(
        `SELECT id, name FROM categories
         WHERE type = ${param(0)} AND LOWER(name) = LOWER(${param(1)}) LIMIT 1`,
        [resolvedType, item.category],
      );
      let categoryId = category.rows[0]?.id as string | number | undefined;

      if (!categoryId) {
        const sort = await txQuery(
          `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM categories WHERE type = ${param(0)}`,
          [resolvedType],
        );
        category = await txQuery(
          `INSERT INTO categories (name, type, color, icon, sort_order)
           VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)})
           RETURNING id, name`,
          [item.category, resolvedType, '#6366f1', 'Folder', Number(sort.rows[0]?.max_order || 0) + 1],
        );
        categoryId = category.rows[0]?.id;
      }

      const sort = await txQuery(
        `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM resources WHERE type = ${param(0)}`,
        [resolvedType],
      );
      const inserted = await txQuery(
        `INSERT INTO resources (category_id, type, title, url, description, metadata, sort_order)
         VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)}, ${param(5)}, ${param(6)})
         RETURNING id, category_id, type, title, url, description`,
        [categoryId ?? null, resolvedType, item.title, item.url, item.description ?? null, '{}', Number(sort.rows[0]?.max_order || 0) + 1],
      );
      return { created: true, duplicate: false, resource: inserted.rows[0] };
    });

    return text(result);
  }

  throw new Error(`Unknown tool: ${name}`);
}

function jsonRpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function jsonRpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

export async function remoteMcpRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.post('/', {
    config: { rateLimit: { max: 60, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const auth = request.headers.authorization;
    const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    const customHeader = request.headers['x-link-manager-mcp-key'];
    const customKey = typeof customHeader === 'string' ? customHeader.trim() : '';
    const presentedKey = customKey || bearer;
    if (!verifyMcpKey(presentedKey)) return reply.code(401).send({ error: 'Invalid MCP key' });

    const body = request.body as { jsonrpc?: string; id?: unknown; method?: string; params?: any } | undefined;
    if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
      return reply.code(400).send(jsonRpcError(body?.id, -32600, 'Invalid Request'));
    }

    if (body.method === 'initialize') {
      return reply.send(jsonRpcResult(body.id, {
        protocolVersion: '2025-06-18',
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'link-manager', version: '1.0.0' },
      }));
    }

    if (body.method === 'notifications/initialized') {
      return reply.code(202).send();
    }

    if (body.method === 'ping') {
      return reply.send(jsonRpcResult(body.id, {}));
    }

    if (body.method === 'tools/list') {
      return reply.send(jsonRpcResult(body.id, { tools: toolDefinitions }));
    }

    if (body.method === 'tools/call') {
      const name = body.params?.name;
      if (typeof name !== 'string') {
        return reply.code(400).send(jsonRpcError(body.id, -32602, 'Tool name is required'));
      }
      try {
        const result = await callTool(name, body.params?.arguments ?? {});
        return reply.send(jsonRpcResult(body.id, result));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.send(jsonRpcResult(body.id, {
            content: [{ type: 'text', text: JSON.stringify({ error: 'Invalid tool arguments', details: error.flatten() }) }],
            isError: true,
          }));
        }
        const message = error instanceof Error ? error.message : 'Tool call failed';
        return reply.send(jsonRpcResult(body.id, {
          content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
          isError: true,
        }));
      }
    }

    return reply.code(404).send(jsonRpcError(body.id, -32601, 'Method not found'));
  });

  app.get('/', async (_request, reply) => {
    return reply.code(405).send({ error: 'Remote MCP uses stateless POST requests only' });
  });
}
