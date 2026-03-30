import Fastify from 'fastify';
import cors from '@fastify/cors';
import { db } from './db.js';
import { categoryRoutes } from './routes/categories.js';

const app = Fastify({
  logger: true
});

await app.register(cors, {
  origin: true
});

app.get('/api/health', async () => {
  return { status: 'ok', db: 'connected' };
});

app.register(categoryRoutes, { prefix: '/api/categories' });

app.setErrorHandler((error: any, request, reply) => {
  app.log.error(error);
  reply.status(error.statusCode || 500).send({
    error: error.message || 'Internal Server Error',
    code: error.code || 'INTERNAL_ERROR'
  });
});

const start = async () => {
  try {
    await app.listen({ port: 3000, host: '0.0.0.0' });
    console.log('Server running on port 3000');
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
