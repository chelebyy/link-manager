import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { db, query } from './db/index.js';

type AgentInboxItem = {
  type: string;
  category: string;
  title: string;
  url: string;
  description?: string | null;
  categoryColor?: string;
  categoryIcon?: string;
};

const param = (index: number) => db.isPostgres ? `$${index + 1}` : `?`;

const getInboxPath = () => process.env.AGENT_INBOX_PATH || path.join(process.cwd(), 'agent-inbox.json');

const readInbox = async (): Promise<AgentInboxItem[]> => {
  try {
    const raw = await readFile(getInboxPath(), 'utf8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('agent-inbox.json must contain a JSON array');
    }
    return parsed as AgentInboxItem[];
  } catch (error: any) {
    if (error?.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
};

const resolveResourceType = async (label: string) => {
  const result = await query(
    `SELECT id, name FROM resource_types
     WHERE LOWER(id) = LOWER(${param(0)}) OR LOWER(name) = LOWER(${param(1)})
     LIMIT 1`,
    [label, label],
  );

  if (!result.rows[0]) {
    throw new Error(`Agent inbox resource type not found: ${label}`);
  }

  return String(result.rows[0].id);
};

const resolveCategory = async (type: string, item: AgentInboxItem) => {
  const existing = await query(
    `SELECT id FROM categories
     WHERE type = ${param(0)} AND LOWER(name) = LOWER(${param(1)})
     LIMIT 1`,
    [type, item.category],
  );

  if (existing.rows[0]) {
    return Number(existing.rows[0].id);
  }

  const sortResult = await query(
    `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM categories WHERE type = ${param(0)}`,
    [type],
  );
  const nextOrder = Number(sortResult.rows[0]?.max_order || 0) + 1;

  const inserted = await query(
    `INSERT INTO categories (name, type, color, icon, sort_order)
     VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)})
     RETURNING id`,
    [
      item.category,
      type,
      item.categoryColor || '#ef4444',
      item.categoryIcon || 'ScanSearch',
      nextOrder,
    ],
  );

  return Number(inserted.rows[0].id);
};

const resourceExists = async (type: string, url: string) => {
  const result = await query(
    `SELECT id FROM resources WHERE type = ${param(0)} AND url = ${param(1)} LIMIT 1`,
    [type, url],
  );
  return Boolean(result.rows[0]);
};

const insertResource = async (type: string, categoryId: number, item: AgentInboxItem) => {
  const sortResult = await query(
    `SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM resources WHERE type = ${param(0)}`,
    [type],
  );
  const nextOrder = Number(sortResult.rows[0]?.max_order || 0) + 1;

  await query(
    `INSERT INTO resources (category_id, type, title, url, description, metadata, sort_order)
     VALUES (${param(0)}, ${param(1)}, ${param(2)}, ${param(3)}, ${param(4)}, ${param(5)}, ${param(6)})`,
    [
      categoryId,
      type,
      item.title.trim(),
      item.url.trim(),
      item.description?.trim() || null,
      JSON.stringify({ source: 'agent-inbox' }),
      nextOrder,
    ],
  );
};

export const processAgentInbox = async () => {
  const items = await readInbox();
  if (items.length === 0) {
    return { added: 0, skipped: 0 };
  }

  let added = 0;
  let skipped = 0;

  for (const item of items) {
    if (!item?.type || !item?.category || !item?.title || !item?.url) {
      console.warn('Skipping malformed agent inbox item', item?.title || item?.url || '<unknown>');
      skipped += 1;
      continue;
    }

    if (!/^https?:\/\//i.test(item.url)) {
      console.warn('Skipping agent inbox item with invalid URL', item.url);
      skipped += 1;
      continue;
    }

    const type = await resolveResourceType(item.type);
    if (await resourceExists(type, item.url.trim())) {
      skipped += 1;
      continue;
    }

    const categoryId = await resolveCategory(type, item);
    await insertResource(type, categoryId, item);
    added += 1;
  }

  console.log(`Agent inbox processed: ${added} added, ${skipped} skipped`);
  return { added, skipped };
};
