// Local acceptance harness: real API routes, disposable SQLite, loopback only.
// Never reads a production .env file or starts GitHub sync / agent inbox work.
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Fastify from 'fastify';

const tempDir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-webmcp-'));
delete process.env.DATABASE_URL;
process.env.DOTENV_CONFIG_PATH = path.join(tempDir, 'unused.env');
process.env.SQLITE_DB_PATH = path.join(tempDir, 'test.db');
// db/index uses dotenv.config() without path, so run this harness from the
// empty temporary directory before importing it.
process.chdir(tempDir);
const { initDb, closeDb } = await import('../../src/shared/db/index.js');
const { resourcesRoutes } = await import('../../src/features/resources/routes.js');
const { categoriesRoutes } = await import('../../src/features/categories/routes.js');
const { resourceTypesRoutes } = await import('../../src/features/resource-types/routes.js');
const { dataRoutes } = await import('../../src/features/data/routes.js');
await initDb();
const app = Fastify({ logger: false });
// Bulk acceptance exercises many scenarios rapidly. Production rate limits
// remain unchanged; their behavior is covered by the backend test suite.
app.decorate('rateLimit', () => async () => {});
app.addHook('preHandler', async (request, reply) => {
  if (request.headers.authorization !== 'Bearer webmcp-local-only') return reply.code(401).send({ error: 'Local test key required' });
});
await app.register(resourcesRoutes, { prefix: '/api/resources' });
await app.register(categoriesRoutes, { prefix: '/api/categories' });
await app.register(resourceTypesRoutes, { prefix: '/api/resource-types' });
await app.register(dataRoutes, { prefix: '/api/data' });
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await app.close();
  await closeDb();
  process.chdir(os.tmpdir());
  await rm(tempDir, { recursive: true, force: true });
};
process.once('SIGINT', () => { void close(); });
process.once('SIGTERM', () => { void close(); });
try {
  await app.listen({ host: '127.0.0.1', port: 3000 });
  console.log('Disposable WebMCP test API ready on http://127.0.0.1:3000');
} catch (error) {
  await close();
  throw error;
}
