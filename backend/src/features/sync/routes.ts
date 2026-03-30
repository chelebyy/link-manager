import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { query } from '../../shared/db/index.js';

export async function syncRoutes(app: FastifyInstance, options: FastifyPluginOptions) {
  app.post('/resources/preview-github', async (request, reply) => {
    const { url } = request.body as any;
    
    const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)/);
    if (!match) {
      reply.status(400);
      return { error: 'Invalid GitHub URL' };
    }

    const [, owner, repo] = match;
    
    return {
      owner,
      repo,
      full_name: `${owner}/${repo}`,
    };
  });
}
