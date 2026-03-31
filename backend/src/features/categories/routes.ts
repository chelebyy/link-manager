import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { query } from '../../shared/db/index.js';

const isPostgres = process.env.DATABASE_URL?.includes('postgresql');
const param = (index: number) => isPostgres ? `$${index + 1}` : `?`;

type CategoryListQuery = {
  type?: string;
};

type CategoryCreateBody = {
  name?: string;
  type?: string;
  color?: string;
  icon?: string;
};

type CategoryUpdateBody = {
  name?: string;
  color?: string;
  icon?: string;
};

type CategoryReorderBody = {
  ids?: number[];
};

type CategoryParams = {
  id: string;
};

export async function categoriesRoutes(app: FastifyInstance, options: FastifyPluginOptions) {
  app.get('/', async (request, reply) => {
    const { type } = request.query as CategoryListQuery;

    const hasTypeFilter = type !== undefined;
    const result = await query(
      `SELECT * FROM categories ${hasTypeFilter ? `WHERE type = ${param(0)}` : ''} ORDER BY sort_order ASC, name ASC`,
      hasTypeFilter ? [type] : []
    );
    return result.rows;
  });

  app.post('/', async (request, reply) => {
    const { name, type, color = '#6366f1', icon = 'Folder' } = request.body as CategoryCreateBody;

    if (!name || !type) {
      reply.status(400);
      return { error: 'name and type are required' };
    }

    const sortResult = await query(
      `SELECT MAX(sort_order) as max_order FROM categories WHERE type = ${param(0)}`,
      [type]
    );
    const nextOrder = Number(sortResult.rows[0]?.max_order || 0) + 1;
    
    try {
      const result = await query(
        `INSERT INTO categories (name, type, color, icon, sort_order) VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)}) RETURNING *`,
        [name, type, color, icon, nextOrder]
      );
      
      reply.status(201);
      return result.rows[0];
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('UNIQUE constraint failed') || message.includes('duplicate key value violates unique constraint')) {
        reply.status(409);
        return { error: 'Category name already exists for this type' };
      }

      throw error;
    }
  });

  app.put('/:id', async (request, reply) => {
    const { id } = request.params as CategoryParams;
    const { name, color, icon } = request.body as CategoryUpdateBody;

    if (!name || !color || !icon) {
      reply.status(400);
      return { error: 'name, color and icon are required' };
    }
    
    const updateTime = isPostgres ? 'NOW()' : "datetime('now')";
    try {
      const result = await query(
        `UPDATE categories SET name = ${param(0)}, color = ${param(1)}, icon = ${param(2)}, updated_at = ${updateTime} WHERE id = ${param(3)} RETURNING *`,
        [name, color, icon, id]
      );
      
      if (result.rows.length === 0) {
        reply.status(404);
        return { error: 'Category not found' };
      }
      
      return result.rows[0];
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('UNIQUE constraint failed') || message.includes('duplicate key value violates unique constraint')) {
        reply.status(409);
        return { error: 'Category name already exists for this type' };
      }

      throw error;
    }
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as CategoryParams;
    
    await query(`UPDATE resources SET category_id = NULL WHERE category_id = ${param(0)}`, [id]);
    await query(`DELETE FROM categories WHERE id = ${param(0)}`, [id]);
    
    reply.status(204);
  });

  app.patch('/reorder', async (request, reply) => {
    const { ids } = request.body as CategoryReorderBody;

    if (!ids || ids.length === 0) {
      reply.status(400);
      return { error: 'ids are required' };
    }

    await Promise.all(
      ids.map((id, index) =>
        query(
          `UPDATE categories SET sort_order = ${param(0)}, updated_at = ${isPostgres ? 'NOW()' : "datetime('now')"} WHERE id = ${param(1)}`,
          [index + 1, id]
        )
      )
    );

    return { success: true };
  });
}
