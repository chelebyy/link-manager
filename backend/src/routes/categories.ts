import { FastifyInstance } from 'fastify';
import { db } from '../db.js';

export async function categoryRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    const stmt = db.prepare('SELECT * FROM categories ORDER BY name ASC');
    const categories = stmt.all();
    return categories;
  });

  app.post('/', async (request, reply) => {
    const { name, color, icon } = request.body as any;
    
    try {
      const stmt = db.prepare('INSERT INTO categories (name, color, icon) VALUES (?, ?, ?)');
      const result = stmt.run(name, color, icon);
      
      const newCategory = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
      reply.status(201);
      return newCategory;
    } catch (error: any) {
      if (error.message.includes('UNIQUE constraint failed')) {
        reply.status(409);
        return { error: 'Category name already exists' };
      }
      throw error;
    }
  });

  app.put('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { name, color, icon } = request.body as any;
    
    const stmt = db.prepare('UPDATE categories SET name = ?, color = ?, icon = ?, updated_at = datetime("now") WHERE id = ?');
    const result = stmt.run(name, color, icon, id);
    
    if (result.changes === 0) {
      reply.status(404);
      return { error: 'Category not found' };
    }
    
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as any;
    
    db.prepare('UPDATE resources SET category_id = NULL WHERE category_id = ?').run(id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    
    reply.status(204).send();
  });
}
