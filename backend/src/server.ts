import Fastify from 'fastify';
import cors from '@fastify/cors';
import auth from '@fastify/auth';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import { closeDb, initDb } from './shared/db/index.js';
import { apiKey } from './shared/config/index.js';
import { categoriesRoutes } from './features/categories/routes.js';
import { resourcesRoutes } from './features/resources/routes.js';
import { syncRoutes } from './features/sync/routes.js';
import { dashboardRoutes } from './features/dashboard/routes.js';
import { resourceTypesRoutes } from './features/resource-types/routes.js';
import { dataRoutes } from './features/data/routes.js';

dotenv.config();

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  },
});

await app.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL || false
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
});

await app.register(auth);

// SEC-03: rate limit (60 requests / 15 minutes per IP) on all routes.
// /api/health is exempt via per-route `config: { rateLimit: false }` below.
await app.register(rateLimit, {
  global: true,
  max: 60,
  timeWindow: '15 minutes',
  keyGenerator: (request: any) => request.ip,
  skipOnError: true,
});

app.decorate('verifyApiKey', async (request: any, reply: any) => {
  if (!apiKey) {
    reply.code(500).send({ error: 'API key not configured on server' });
    return reply;
  }
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Missing or malformed Authorization header' });
    return reply;
  }
  const token = authHeader.slice('Bearer '.length).trim();
  if (token !== apiKey) {
    reply.code(401).send({ error: 'Invalid API key' });
    return reply;
  }
});

app.addHook('preHandler', async (request, reply) => {
  if (request.url === '/api/health' || request.method === 'OPTIONS') {
    return;
  }
  if (request.url.startsWith('/api/')) {
    return (app as any).verifyApiKey(request, reply);
  }
});

app.get('/api/health', { config: { rateLimit: false } }, async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

app.addHook('onClose', async () => {
  await closeDb();
});

await app.register(categoriesRoutes, { prefix: '/api/categories' });
await app.register(resourcesRoutes, { prefix: '/api/resources' });
await app.register(syncRoutes, { prefix: '/api' });
await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
await app.register(resourceTypesRoutes, { prefix: '/api/resource-types' });
await app.register(dataRoutes, { prefix: '/api/data' });

app.setErrorHandler((error: any, request, reply) => {
  app.log.error(error);
  reply.status(error.statusCode || 500).send({
    error: error.message || 'Internal Server Error',
    code: error.code || 'INTERNAL_ERROR',
  });
});

const start = async () => {
  try {
    await initDb();

    const port = parseInt(process.env.PORT || '3000', 10);
    await app.listen({ port, host: '0.0.0.0' });
    app.log.info(`Server running on port ${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();

export { app };
