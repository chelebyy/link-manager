import Fastify from 'fastify';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import { initDb } from './shared/db/index.js';
import { categoriesRoutes } from './features/categories/routes.js';
import { resourcesRoutes } from './features/resources/routes.js';
import { syncRoutes } from './features/sync/routes.js';
import { dashboardRoutes } from './features/dashboard/routes.js';

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

app.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

await app.register(categoriesRoutes, { prefix: '/api/categories' });
await app.register(resourcesRoutes, { prefix: '/api/resources' });
await app.register(syncRoutes, { prefix: '/api' });
await app.register(dashboardRoutes, { prefix: '/api/dashboard' });

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
