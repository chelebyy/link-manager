import { FastifyInstance } from 'fastify';
import { db } from '../db.js';

export async function resourceRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    const { category, type, favorite, search, sort = 'created_at', order = 'desc' } = request.query as any;
    
    let sql = `
      SELECT r.*, c.name as category_name, c.color as category_color, c.icon as category_icon
      FROM resources r
      LEFT JOIN categories c ON r.category_id = c.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (category) {
      sql += ' AND r.category_id = ?';
      params.push(category);
    }

    if (type) {
      sql += ' AND r.type = ?';
      params.push(type);
    }

    if (favorite === 'true') {
      sql += ' AND r.is_favorite = 1';
    }

    if (search) {
      sql += ' AND (LOWER(r.title) LIKE LOWER(?) OR LOWER(r.description) LIKE LOWER(?))';
      params.push(`%${search}%`, `%${search}%`);
    }

    const allowedSort = ['created_at', 'title', 'updated_at'].includes(sort) ? sort : 'created_at';
    const allowedOrder = order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    sql += ` ORDER BY r.${allowedSort} ${allowedOrder}`;

    const stmt = db.prepare(sql);
    const resources = stmt.all(...params);
    return resources;
  });

  app.post('/', async (request, reply) => {
    const { category_id, type, title, url, description, metadata = {} } = request.body as any;
    
    const stmt = db.prepare(
      'INSERT INTO resources (category_id, type, title, url, description, metadata) VALUES (?, ?, ?, ?, ?, ?)'
    );
    const result = stmt.run(category_id || null, type, title, url || null, description || null, JSON.stringify(metadata));
    
    const newResource = db.prepare('SELECT * FROM resources WHERE id = ?').get(result.lastInsertRowid);
    reply.status(201);
    return newResource;
  });

  app.patch('/:id', async (request, reply) => {
    const { id } = request.params as any;
    const { category_id, title, url, description, metadata } = request.body as any;
    
    const fields: string[] = [];
    const values: any[] = [];

    if (category_id !== undefined) {
      fields.push('category_id = ?');
      values.push(category_id);
    }
    if (title !== undefined) {
      fields.push('title = ?');
      values.push(title);
    }
    if (url !== undefined) {
      fields.push('url = ?');
      values.push(url);
    }
    if (description !== undefined) {
      fields.push('description = ?');
      values.push(description);
    }
    if (metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(JSON.stringify(metadata));
    }

    if (fields.length === 0) {
      reply.status(400);
      return { error: 'No fields to update' };
    }

    values.push(id);
    
    const result = db.prepare(
      `UPDATE resources SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ? RETURNING *`
    ).get(...values);
    
    if (!result) {
      reply.status(404);
      return { error: 'Resource not found' };
    }
    
    return result;
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as any;
    db.prepare('DELETE FROM resources WHERE id = ?').run(id);
    reply.status(204).send();
  });

  app.patch('/:id/favorite', async (request, reply) => {
    const { id } = request.params as any;
    const { is_favorite } = request.body as any;
    
    const favValue = is_favorite ? 1 : 0;
    const result = db.prepare(
      `UPDATE resources SET is_favorite = ?, updated_at = datetime('now') WHERE id = ? RETURNING *`
    ).get(favValue, id);
    
    if (!result) {
      reply.status(404);
      return { error: 'Resource not found' };
    }
    
    return result;
  });
}
