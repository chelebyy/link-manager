import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { query } from '../../shared/db/index.js';

const isPostgres = process.env.DATABASE_URL?.includes('postgresql');
const param = (index: number) => isPostgres ? `$${index + 1}` : `?`;
const falseValue = () => isPostgres ? 'FALSE' : '0';

const AVAILABLE_ICONS = [
  'Github', 'Globe', 'Wrench', 'FileText', 'Folder',
  'Star', 'Heart', 'Bookmark', 'Tag', 'Zap',
  'Code', 'Terminal', 'Database', 'Cloud', 'Server',
  'Layout', 'Image', 'Video', 'Music', 'Mail',
  'Calendar', 'Clock', 'Map', 'Phone', 'Link',
  'Book', 'Briefcase', 'Coffee', 'Cpu', 'Layers',
  'Box', 'Home', 'User', 'Users', 'Settings',
  'Search', 'Filter', 'Bell', 'Flag', 'Shield'
] as const;

type ResourceTypeCreateBody = {
  id?: string;
  name?: string;
  icon?: string;
  color?: string;
  description?: string;
};

type ResourceTypeUpdateBody = {
  name?: string;
  icon?: string;
  color?: string;
  description?: string;
  sort_order?: number;
};

type ResourceTypeParams = {
  id: string;
};

const generateId = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
};

const isValidIcon = (icon: string): boolean => {
  return AVAILABLE_ICONS.includes(icon as typeof AVAILABLE_ICONS[number]);
};

const isValidColor = (color: string): boolean => {
  return /^#[0-9A-Fa-f]{6}$/.test(color);
};

export async function resourceTypesRoutes(app: FastifyInstance, options: FastifyPluginOptions) {
  app.get('/', async (request, reply) => {
    const result = await query(
      `SELECT * FROM resource_types ORDER BY sort_order ASC, name ASC`,
      []
    );
    return result.rows;
  });

  app.get('/icons', async (request, reply) => {
    return {
      icons: AVAILABLE_ICONS
    };
  });

  app.post('/', async (request, reply) => {
    const { id, name, icon = 'Folder', color = '#6366f1', description = '' } = request.body as ResourceTypeCreateBody;

    if (!name) {
      reply.status(400);
      return { error: 'name is required' };
    }

    if (!isValidIcon(icon)) {
      reply.status(400);
      return { error: `Invalid icon. Available icons: ${AVAILABLE_ICONS.join(', ')}` };
    }

    if (!isValidColor(color)) {
      reply.status(400);
      return { error: 'Invalid color format. Use hex format like #6366f1' };
    }

    const typeId = id?.trim() || generateId(name);

    if (!typeId || typeId.length < 1) {
      reply.status(400);
      return { error: 'Could not generate valid id from name' };
    }

    const maxOrderResult = await query(
      `SELECT MAX(sort_order) as max_order FROM resource_types`,
      []
    );
    const nextOrder = Number(maxOrderResult.rows[0]?.max_order || 0) + 1;

    try {
      const result = await query(
        `INSERT INTO resource_types (id, name, icon, color, description, is_builtin, sort_order)
         VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)}, ${falseValue()}, ${param(5)})
         RETURNING *`,
        [typeId, name, icon, color, description, nextOrder]
      );

      reply.status(201);
      return result.rows[0];
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('UNIQUE constraint failed') || message.includes('duplicate key value violates unique constraint')) {
        reply.status(409);
        return { error: 'Resource type with this ID already exists' };
      }

      throw error;
    }
  });

  app.put('/:id', async (request, reply) => {
    const { id } = request.params as ResourceTypeParams;
    const { name, icon, color, description, sort_order } = request.body as ResourceTypeUpdateBody;

    const typeResult = await query(
      `SELECT * FROM resource_types WHERE id = ${param(0)}`,
      [id]
    );

    if (typeResult.rows.length === 0) {
      reply.status(404);
      return { error: 'Resource type not found' };
    }

    if (icon !== undefined && !isValidIcon(icon)) {
      reply.status(400);
      return { error: `Invalid icon. Available icons: ${AVAILABLE_ICONS.join(', ')}` };
    }

    if (color !== undefined && !isValidColor(color)) {
      reply.status(400);
      return { error: 'Invalid color format. Use hex format like #6366f1' };
    }

    const updates: string[] = [];
    const values: (string | number)[] = [];
    let paramIndex = 0;

    if (name !== undefined) {
      updates.push(`name = ${param(paramIndex++)}`);
      values.push(name);
    }
    if (icon !== undefined) {
      updates.push(`icon = ${param(paramIndex++)}`);
      values.push(icon);
    }
    if (color !== undefined) {
      updates.push(`color = ${param(paramIndex++)}`);
      values.push(color);
    }
    if (description !== undefined) {
      updates.push(`description = ${param(paramIndex++)}`);
      values.push(description);
    }
    if (sort_order !== undefined) {
      updates.push(`sort_order = ${param(paramIndex++)}`);
      values.push(sort_order);
    }

    const updateTime = isPostgres ? 'NOW()' : "datetime('now')";
    updates.push(`updated_at = ${updateTime}`);

    if (updates.length === 1) {
      reply.status(400);
      return { error: 'No fields to update' };
    }

    try {
      const result = await query(
        `UPDATE resource_types SET ${updates.join(', ')} WHERE id = ${param(paramIndex)} RETURNING *`,
        [...values, id]
      );

      return result.rows[0];
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message.includes('UNIQUE constraint failed') || message.includes('duplicate key value violates unique constraint')) {
        reply.status(409);
        return { error: 'Resource type with this name already exists' };
      }

      throw error;
    }
  });

  app.delete('/:id', async (request, reply) => {
    const { id } = request.params as ResourceTypeParams;

    const typeResult = await query(
      `SELECT * FROM resource_types WHERE id = ${param(0)}`,
      [id]
    );

    if (typeResult.rows.length === 0) {
      reply.status(404);
      return { error: 'Resource type not found' };
    }

    const type = typeResult.rows[0];
    if (type.is_builtin) {
      reply.status(403);
      return { error: 'Cannot delete built-in resource types' };
    }

    const resourceCount = await query(
      `SELECT COUNT(*) as count FROM resources WHERE type = ${param(0)}`,
      [id]
    );

    if (resourceCount.rows[0]?.count > 0) {
      reply.status(409);
      return { error: 'Cannot delete resource type with existing resources. Delete or reassign resources first.' };
    }

    await query(`DELETE FROM resource_types WHERE id = ${param(0)}`, [id]);

    return reply.status(204).send();
  });
}
