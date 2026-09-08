import type { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

// Each read route has a short window, separate from the long-lived write quota.
// Keep the server's actual peer IP. Do not trust arbitrary forwarded headers.
export async function registerRateLimits(app: FastifyInstance) {
  // Install before the plugin's onRoute hook so it sees the final policy.
  app.addHook('onRoute', route => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    // Fastify onRoute supplies the full prefixed URL; routePath is the local path.
    if (route.url.startsWith('/api/') && methods.every(method => method === 'GET' || method === 'HEAD')
      && route.config?.rateLimit !== false) {
      route.config = {
        ...route.config,
        rateLimit: { max: 120, timeWindow: '1 minute' },
      };
    }
  });
  await app.register(rateLimit, {
    global: true,
    max: 60,
    timeWindow: '15 minutes',
    keyGenerator: request => request.ip,
    skipOnError: true,
  });
}
