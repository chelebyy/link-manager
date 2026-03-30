import Fastify from 'fastify';
import cors from '@fastify/cors';

const app = Fastify({
  logger: true
});

app.register(cors, {
  origin: true
});

app.get('/api/health', async () => {
  return { status: 'ok' };
});

export default app;
