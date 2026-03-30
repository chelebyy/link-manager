import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { query } from '../../shared/db/index.js';

const isPostgres = process.env.DATABASE_URL?.includes('postgresql');
const param = (index: number) => isPostgres ? `$${index + 1}` : `?`;

export async function categoriesRoutes(app: FastifyInstance, options: FastifyPluginOptions) {
  app.get('/', async (request, reply) => {
    const result = await query('SELECT * FROM categories ORDER BY name ASC');
    return result.rows;
  });

  app.post('/', async (request, reply) => {
    const { name, color, icon } = request.body as any;
    
    const result = await query(
      `INSERT INTO categories (name, color, icon) VALUES (${param(0)}, ${param(1)}, ${param(2)}) RETURNING *`,
      [name, color, icon]
    );
    
    reply.status(201);
    return result.rows[0];
  });

  app.put('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { name, color, icon } = request.body as any;
    
    const updateTime = isPostgres ? 'NOW()' : "datetime('now')";
    const result = await query(
      `UPDATE categories SET name = ${param(0)}, color = ${param(1)}, icon = ${param(2)}, updated_at = ${updateTime} WHERE id = ${param(3)} RETURNING *`,
      [name, color, icon, id]
    );
    
    if (result.rows.length === 0) {
      reply.status(404);
      return { error: 'Category not found' };
    }
    
    return result.rows[0];
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as any;
    
    await query(`UPDATE resources SET category_id = NULL WHERE category_id = ${param(0)}`, [id]);
    await query(`DELETE FROM categories WHERE id = ${param(0)}`, [id]);
    
    reply.status(204);
  });
}
