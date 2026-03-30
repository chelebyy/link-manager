import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { query } from '../../shared/db/index.js';

export async function dashboardRoutes(app: FastifyInstance, options: FastifyPluginOptions) {
  app.get('/', async (request, reply) => {
    const [resourcesResult, categoriesResult, githubResult, favoritesResult] = await Promise.all([
      query('SELECT COUNT(*) as count FROM resources'),
      query('SELECT COUNT(*) as count FROM categories'),
      query("SELECT COUNT(*) as count FROM resources WHERE type = 'github'"),
      query('SELECT COUNT(*) as count FROM resources WHERE is_favorite = true'),
    ]);

    const categoriesWithCount = await query(`
      SELECT c.*, COUNT(r.id) as resource_count
      FROM categories c
      LEFT JOIN resources r ON c.id = r.category_id
      GROUP BY c.id
      ORDER BY resource_count DESC
    `);

    return {
      total_resources: parseInt(resourcesResult.rows[0].count, 10),
      total_categories: parseInt(categoriesResult.rows[0].count, 10),
      github_count: parseInt(githubResult.rows[0].count, 10),
      favorites_count: parseInt(favoritesResult.rows[0].count, 10),
      categories_with_count: categoriesWithCount.rows,
    };
  });
}
