import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { z, ZodSchema } from 'zod';

const previewGithubSchema = z
  .object({
    url: z.string().min(1),
  })
  .strict();

function validate<T>(
  schema: ZodSchema<T>,
  source: 'query' | 'body' | 'params' = 'body',
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const result = schema.safeParse(request[source]);
    if (!result.success) {
      reply.status(400);
      return reply.send({ error: result.error.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ') });
    }
    (request as FastifyRequest & { validated?: Record<string, unknown> }).validated = {
      ...(request as FastifyRequest & { validated?: Record<string, unknown> }).validated,
      [source]: result.data,
    };
  };
}

export async function syncRoutes(app: FastifyInstance, options: FastifyPluginOptions) {
  app.post('/resources/preview-github', { preHandler: validate(previewGithubSchema, 'body') }, async (request, reply) => {
    const { url } = (request as FastifyRequest & { validated: { body: z.infer<typeof previewGithubSchema> } }).validated.body;

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
