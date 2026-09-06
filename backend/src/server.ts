import Fastify from 'fastify';
import cors from '@fastify/cors';
import auth from '@fastify/auth';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import dotenv from 'dotenv';
import { closeDb, initDb } from './shared/db/index.js';
import { apiKey } from './shared/config/index.js';
import { processAgentInbox } from './shared/agent-inbox.js';
import { categoriesRoutes } from './features/categories/routes.js';
import { resourcesRoutes } from './features/resources/routes.js';
import { syncRoutes } from './features/sync/routes.js';
import { dashboardRoutes } from './features/dashboard/routes.js';
import { resourceTypesRoutes } from './features/resource-types/routes.js';
import { dataRoutes } from './features/data/routes.js';
import { agentIngestRoutes } from './features/agent-ingest/routes.js';

dotenv.config();

const app = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true },
    },
  },
});

await app.register(cors, {
  origin: process.env.NODE_ENV === 'production'
    ? process.env.FRONTEND_URL || false
    : ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
});

await app.register(helmet, {
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

await app.register(auth);

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

await app.register(agentIngestRoutes, { prefix: '/agent/ingest' });
await app.register(categoriesRoutes, { prefix: '/api/categories' });
await app.register(resourcesRoutes, { prefix: '/api/resources' });
await app.register(syncRoutes, { prefix: '/api' });
await app.register(dashboardRoutes, { prefix: '/api/dashboard' });
await app.register(resourceTypesRoutes, { prefix: '/api/resource-types' });
await app.register(dataRoutes, { prefix: '/api/data' });

app.setErrorHandler((error: any, request, reply) => {
  app.log.error(error);
  const statusCode = error.statusCode || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const isServerError = statusCode >= 500;
  const safeMessage = isServerError && isProd
    ? 'Internal Server Error'
    : error.message || 'Internal Server Error';

  reply.status(statusCode).send({
    error: safeMessage,
    code: error.code || 'INTERNAL_ERROR',
  });
});

const start = async () => {
  try {
    await initDb();

    try {
      await processAgentInbox();
    } catch (error) {
      app.log.error({ err: error }, 'Agent inbox processing failed');
    }

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
