import crypto from 'node:crypto';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
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

function createMcpServer() {
  const server = new McpServer({ name: 'link-manager', version: '1.0.0' });

  server.tool('list_categories', 'List resource types and categories available in Link Manager.', {}, async () => {
    const [types, categories] = await Promise.all([
      db.query('SELECT id, name, color, icon, sort_order FROM resource_types ORDER BY sort_order ASC, name ASC'),
      db.query('SELECT id, name, type, color, icon, sort_order FROM categories ORDER BY type ASC, sort_order ASC, name ASC'),
    ]);
    return text({ resourceTypes: types.rows, categories: categories.rows });
  });

  server.tool(
    'search_resources',
    'Search Link Manager resources by title, URL, or description.',
    {
      query: z.string().trim().min(1).max(300),
      type: z.string().trim().min(1).max(80).optional(),
      limit: z.number().int().min(1).max(50).optional().default(20),
    },
    async ({ query, type, limit }) => {
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
    },
  );

  server.tool(
    'check_duplicate',
    'Check whether an exact URL already exists in Link Manager.',
    { url: z.string().trim().url().max(2000) },
    async ({ url }) => {
      const result = await db.query(
        `SELECT id, category_id, type, title, url, description FROM resources WHERE url = ${param(0)} ORDER BY id ASC`,
        [url],
      );
      return text({ duplicate: result.rows.length > 0, count: result.rows.length, resources: result.rows });
    },
  );

  server.tool(
    'add_resource',
    'Add one resource to Link Manager. Existing URLs are returned as duplicates instead of being inserted twice.',
    {
      type: z.string().trim().min(1).max(80),
      category: z.string().trim().min(1).max(80),
      title: z.string().trim().min(1).max(200),
      url: z.string().trim().url().max(2000),
      description: z.string().trim().max(4000).optional(),
    },
    async (item) => {
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
    },
  );

  return server;
}

export async function remoteMcpRoutes(app: FastifyInstance, _opts: FastifyPluginOptions) {
  app.post('/', {
    config: { rateLimit: { max: 60, timeWindow: '15 minutes' } },
  }, async (request, reply) => {
    const auth = request.headers.authorization;
    const bearer = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!verifyMcpKey(bearer)) return reply.code(401).send({ error: 'Invalid MCP key' });

    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);

    try {
      const response = await transport.handleRequest(
        new Request('http://localhost/mcp', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: String(request.headers.accept || 'application/json, text/event-stream') },
          body: JSON.stringify(request.body),
        }),
      );

      reply.code(response.status);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(Buffer.from(await response.arrayBuffer()));
    } finally {
      await transport.close();
      await server.close();
    }
  });

  app.get('/', async (_request, reply) => {
    return reply.code(405).send({ error: 'Remote MCP uses stateless POST requests only' });
  });
}
