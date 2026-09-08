import { api, ApiError } from './api';
import { normalizeCategory, normalizeExport, normalizeId, normalizeResource, normalizeResourceType } from './webmcp-data';
import { buildFullExportMarkdown, downloadJson, downloadMarkdown, sortResourcesForView } from './resource-view';
import { categorySchema, colorSchema, descriptionSchema, idSchema, idsSchema, objectSchema, textSchema, urlSchema, validateSchema, type Schema } from './webmcp-schema';
import type { ExportPayload } from '../types';

export interface WebMCPTool {
  name: string;
  description: string;
  inputSchema: Schema;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean; consequentialHint: boolean };
  execute(input: unknown, context?: { signal?: AbortSignal }): Promise<string>;
}
export interface ModelContext {
  registerTool(tool: WebMCPTool, options: { signal: AbortSignal }): Promise<void>;
}
export interface ViewInput { type: string | null; category_id?: number | null; search?: string; favorite?: boolean }
export interface ImportPreview { payload: ExportPayload; existing: ExportPayload }
interface ImportStatus {
  request_id: string;
  status: 'awaiting_confirmation' | 'importing' | 'completed' | 'cancelled' | 'failed';
  error?: string;
}
interface Dependencies {
  refresh(): Promise<void>;
  navigate(view: ViewInput): void;
  confirmImport(preview: ImportPreview, signal: AbortSignal): Promise<boolean>;
  notify(message: string): void;
}
type Filters = { type?: string; category_id?: number | null; search?: string; favorite?: boolean };
const filterProperties = { type: textSchema, category_id: categorySchema, search: { type: 'string', maxLength: 500 }, favorite: { type: 'boolean' } } satisfies Record<string, Schema>;
const resourceProperties = { type: textSchema, title: textSchema, url: urlSchema, description: descriptionSchema, category_id: categorySchema };
const categoryProperties = { name: textSchema, color: colorSchema, icon: textSchema };
const typeProperties = { ...categoryProperties, description: { type: 'string', maxLength: 20000 } } satisfies Record<string, Schema>;
const requireChanges = (value: object) => { if (!Object.keys(value).length) throw new Error('At least one changed field is required.'); };
const readCategories = async (type?: string) => (await api.getCategories(type)).map(normalizeCategory);
const readTypes = async () => (await api.getResourceTypes()).map(normalizeResourceType);
const readResources = async (params: Parameters<typeof api.getResources>[0]) => (await api.getResources(params)).map(normalizeResource);
const readExport = async () => normalizeExport(await api.exportData());

function filterResources<T extends { type: string; category_id: number | null; is_favorite: boolean; title: string; url: string | null; description: string | null }>(items: T[], filter: Filters) {
  return items.filter(item => (!filter.type || item.type === filter.type)
    && (filter.category_id === undefined || item.category_id === filter.category_id)
    && (filter.favorite === undefined || Boolean(item.is_favorite) === filter.favorite)
    && (!filter.search || [item.title, item.url, item.description].some(value => value?.toLocaleLowerCase('tr').includes(filter.search!.toLocaleLowerCase('tr')))));
}

// Require the complete export shape so an omitted field cannot silently reset
// a record during an upsert. Timestamps and other server export fields may remain.
export function parseImport(json: string): ExportPayload {
  if (new TextEncoder().encode(json).length > 750000) throw new Error('JSON must be smaller than 750 KB; split larger imports.');
  const data: unknown = JSON.parse(json);
  // SQLite exports booleans as 0/1; PostgreSQL exports true/false.
  if (data && typeof data === 'object') {
    for (const [collection, field] of [['resourceTypes', 'is_builtin'], ['resources', 'is_favorite']]) {
      const rows = (data as Record<string, unknown>)[collection];
      if (Array.isArray(rows)) for (const row of rows) {
        if (row && typeof row === 'object' && (row[field] === 0 || row[field] === 1)) row[field] = Boolean(row[field]);
      }
    }
    const resources = (data as Record<string, unknown>).resources;
    if (Array.isArray(resources)) for (const resource of resources) {
      if (resource && typeof resource === 'object' && typeof resource.metadata === 'string') resource.metadata = JSON.parse(resource.metadata);
    }
    for (const collection of ['categories', 'resources']) {
      const rows = (data as Record<string, unknown>)[collection];
      if (Array.isArray(rows)) for (const row of rows) {
        if (row && typeof row === 'object') {
          row.id = normalizeId(row.id);
          if (collection === 'resources' && row.category_id !== null) row.category_id = normalizeId(row.category_id);
        }
      }
    }
  }
  const exportRow = (properties: Record<string, Schema>, required: string[]): Schema => ({ ...objectSchema(properties, required), additionalProperties: true });
  const order: Schema = { type: 'integer', minimum: 0 };
  const importColor: Schema = { type: 'string', pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' };
  const payloadSchema = objectSchema({
    exported_at: textSchema,
    revision: textSchema,
    resourceTypes: { type: 'array', maxItems: 500, items: exportRow({ id: textSchema, ...typeProperties, color: importColor, description: descriptionSchema, is_builtin: { type: 'boolean' }, sort_order: order }, ['id', 'name', 'icon', 'color', 'description', 'is_builtin', 'sort_order']) },
    categories: { type: 'array', maxItems: 500, items: exportRow({ id: idSchema, type: textSchema, ...categoryProperties, color: importColor, sort_order: order }, ['id', 'type', 'name', 'icon', 'color', 'sort_order']) },
    resources: { type: 'array', maxItems: 500, items: exportRow({ id: idSchema, ...resourceProperties, is_favorite: { type: 'boolean' }, sort_order: order, metadata: { type: 'object' } }, ['id', 'type', 'title', 'url', 'description', 'category_id', 'is_favorite', 'sort_order', 'metadata']) },
  }, ['resourceTypes', 'categories', 'resources']);
  validateSchema(data, payloadSchema);
  const result = data as ExportPayload;
  for (const rows of [result.resourceTypes, result.categories, result.resources]) {
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Duplicate IDs in import.');
  }
  if (!result.resourceTypes.length && !result.categories.length && !result.resources.length) throw new Error('Import is empty.');
  return result;
}

export function createWebMCPTools(deps: Dependencies, lifetime: AbortSignal): WebMCPTool[] {
  let writing = false;
  let importStatus: ImportStatus | undefined;
  const importBusy = () => importStatus?.status === 'awaiting_confirmation' || importStatus?.status === 'importing';
  const finishImport = async (preview: ImportPreview, status: ImportStatus) => {
    try {
      if (!await deps.confirmImport(preview, lifetime) || lifetime.aborted) {
        status.status = 'cancelled';
        deps.notify('İçe aktarma iptal edildi; hiçbir veri yazılmadı.');
        return;
      }
      status.status = 'importing';
      deps.notify('JSON içe aktarılıyor…');
      if (!preview.existing.revision) throw new Error('Server did not provide a data revision. Request a fresh import preview after updating the server.');
      lifetime.throwIfAborted();
      await api.importData(preview.payload, preview.existing.revision);
      status.status = 'completed';
      try { await deps.refresh(); deps.notify('JSON içe aktarma tamamlandı.'); }
      catch { deps.notify('İçe aktarma tamamlandı; listeyi görmek için sayfayı yenileyin.'); }
    } catch (error) {
      status.status = lifetime.aborted ? 'cancelled' : 'failed';
      status.error = error instanceof Error ? error.message : 'Import failed. Check current data before retrying an interrupted request.';
      deps.notify('İçe aktarma tamamlanamadı. Kesilmiş bir isteği tekrarlamadan önce verileri kontrol edin.');
    }
  };
  const tool = <T,>(name: string, description: string, inputSchema: Schema, write: boolean,
    run: (input: T, signal: AbortSignal) => Promise<unknown>, consequential = false, deferred = false): WebMCPTool => ({
    name, description, inputSchema,
    annotations: { readOnlyHint: !write, untrustedContentHint: true, consequentialHint: consequential },
    async execute(input, context) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      const signals = [lifetime, context?.signal].filter((signal): signal is AbortSignal => !!signal);
      signals.forEach(signal => { signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); });
      let ownsWrite = false;
      try {
        controller.signal.throwIfAborted();
        validateSchema(input, inputSchema);
        if (write) { if (writing || importBusy()) throw new Error('Another change is in progress. Wait for it to finish.'); writing = true; ownsWrite = true; }
        const result = await run(input as T, controller.signal);
        if (write && !deferred) {
          // A committed change must not be reported as failed if refreshing the UI fails.
          try { await deps.refresh(); deps.notify('Yapay zekâ işlemi tamamlandı.'); }
          catch { deps.notify('İşlem tamamlandı; liste yenilenemedi. Sayfayı yenileyin.'); }
        }
        return JSON.stringify({ ok: true, result: result ?? null });
      } catch (error) {
        const cancelled = controller.signal.aborted;
        deps.notify(cancelled ? 'Yapay zekâ işlemi iptal edildi.' : 'Yapay zekâ işlemi tamamlanamadı.');
        return JSON.stringify({ ok: false, error: cancelled ? 'Cancelled before completion; an already sent request may have committed. Check current data before retrying.' : error instanceof Error ? error.message : 'Operation failed.', ...(error instanceof ApiError ? { status: error.status } : {}) });
      } finally {
        if (ownsWrite) writing = false;
        signals.forEach(signal => signal.removeEventListener('abort', abort));
      }
    },
  });
  const validateTarget = async (type: string, categoryId?: number | null) => {
    if (!(await readTypes()).some(item => item.id === type)) throw new Error('Unknown card ID. Use list_resource_types.');
    if (categoryId != null && !(await readCategories(type)).some(item => item.id === categoryId)) throw new Error('Category does not belong to the selected card.');
  };
  const findResource = async (id: number) => {
    const resource = (await readResources({})).find(item => item.id === id);
    if (!resource) throw new Error('Resource not found.');
    return resource;
  };
  const reorderTool = <T extends number | string>(name: string, description: string, itemSchema: Schema, load: () => Promise<{ id: T }[]>, reorder: (ids: T[]) => Promise<unknown>) =>
    tool<{ ids: T[] }>(name, description, objectSchema({ ids: idsSchema(itemSchema) }, ['ids']), true, async ({ ids }, signal) => {
      const existing = new Set((await load()).map(item => item.id));
      if (ids.some(id => !existing.has(id))) throw new Error('Unknown ID in ordering.');
      signal.throwIfAborted();
      return reorder(ids);
    });
  return [
    reorderTool('reorder_resources', 'Set the saved order of resource IDs. Favorites still display first.', idSchema, () => readResources({}), ids => api.reorderResources(ids)),
    reorderTool('reorder_categories', 'Set saved category order. The current website displays categories alphabetically, so this does not change that view.', idSchema, () => readCategories(), ids => api.reorderCategories(ids)),
    reorderTool('reorder_resource_types', 'Set the display order of card IDs.', textSchema, readTypes, ids => api.reorderResourceTypes(ids)),
    tool<{ type?: string }>('list_categories', 'List category IDs, names and parent card IDs.', objectSchema({ type: textSchema }), false, ({ type }) => readCategories(type)),
    tool<Record<string, never>>('list_resource_types', 'List cards (resource types), their IDs and display properties.', objectSchema({}), false, readTypes),
    tool<Filters & { offset?: number; limit?: number }>('search_resources', 'Search saved links by title, URL or description; filter by card, category (null = uncategorized) or favorite. Does not change the visible page. Returns total and a bounded page; use offset to continue.', objectSchema({ ...filterProperties, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }), false, async (input) => {
      const items = sortResourcesForView(filterResources(await readResources({ type: input.type }), input));
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 50;
      return { total: items.length, offset, next_offset: offset + limit < items.length ? offset + limit : null, resources: items.slice(offset, offset + limit).map(({ id, title, url, description, type, category_id, is_favorite }) => ({ id, title, url, description: description?.slice(0, 1000), type, category_id, is_favorite })) };
    }),
    tool<{ id: number }>('get_resource_details', 'Get full saved resource details by ID, including metadata and sync status.', objectSchema({ id: idSchema }, ['id']), false, ({ id }) => findResource(id)),
    tool<Parameters<typeof api.createResource>[0]>('create_resource', 'Create a saved link. Use IDs from list tools. URL must be HTTP(S) or null for a note; no external page is fetched by this tool.', objectSchema(resourceProperties, ['type', 'title', 'url', 'description', 'category_id']), true, async (input, signal) => { await validateTarget(input.type, input.category_id); signal.throwIfAborted(); return api.createResource(input); }),
    tool<{ id: number; changes: Parameters<typeof api.updateResource>[1] }>('update_resource', 'Update only supplied link fields. Omitted fields are preserved. Use move_resources to change card/category.', objectSchema({ id: idSchema, changes: objectSchema({ title: textSchema, url: urlSchema, description: descriptionSchema }) }, ['id', 'changes']), true, async ({ id, changes }, signal) => { requireChanges(changes); await findResource(id); signal.throwIfAborted(); return api.updateResource(id, changes); }),
    tool<{ id: number; favorite: boolean }>('set_resource_favorite', 'Set favorite explicitly to true or false (safe to repeat).', objectSchema({ id: idSchema, favorite: { type: 'boolean' } }, ['id', 'favorite']), true, ({ id, favorite }, signal) => { signal.throwIfAborted(); return api.toggleFavorite(id, favorite); }),
    tool<{ ids: number[]; type: string; category_id?: number | null }>('move_resources', 'Move links to a card/category. Across cards, omitted or null category preserves the source category name by mapping/creating it in the target card. Within the same card null removes the category; omitted keeps it.', objectSchema({ ids: idsSchema(idSchema), type: textSchema, category_id: categorySchema }, ['ids', 'type']), true, async (input, signal) => { await validateTarget(input.type, input.category_id); signal.throwIfAborted(); return api.bulkMoveResources(input); }),
    tool<{ type: string; name: string; color?: string; icon?: string }>('create_category', 'Create a category inside an existing card. Defaults: Folder icon and #6366f1 color.', objectSchema({ type: textSchema, ...categoryProperties }, ['type', 'name']), true, async (input, signal) => { await validateTarget(input.type); signal.throwIfAborted(); return api.createCategory({ color: '#6366f1', icon: 'Folder', ...input }); }),
    tool<{ id: number; changes: Partial<{ name: string; color: string; icon: string }> }>('update_category', 'Edit category name, color or icon; preserve omitted fields. Cannot change its parent card.', objectSchema({ id: idSchema, changes: objectSchema(categoryProperties) }, ['id', 'changes']), true, async ({ id, changes }, signal) => {
      requireChanges(changes);
      const current = (await readCategories()).find(item => item.id === id);
      if (!current) throw new Error('Category not found.');
      signal.throwIfAborted();
      return api.updateCategory(id, changes);
    }),
    tool<{ name: string; color?: string; icon?: string; description?: string }>('create_resource_type', 'Create a card. ID is generated by the backend from its name. Defaults: Folder icon and #6366f1 color.', objectSchema(typeProperties, ['name']), true, (input, signal) => { signal.throwIfAborted(); return api.createResourceType({ color: '#6366f1', icon: 'Folder', description: '', ...input }); }),
    tool<{ id: string; changes: Partial<Parameters<typeof api.updateResourceType>[1]> }>('update_resource_type', 'Edit a card name, icon, color or description; its ID stays unchanged.', objectSchema({ id: textSchema, changes: objectSchema(typeProperties) }, ['id', 'changes']), true, async ({ id, changes }, signal) => {
      requireChanges(changes);
      const current = (await readTypes()).find(item => item.id === id);
      if (!current) throw new Error('Card not found.');
      signal.throwIfAborted();
      return api.updateResourceType(id, changes);
    }),
    tool<ViewInput>('open_view', 'Show a card/category and search/favorite filter on screen. type=null opens the home page. favorite=true shows important links; false shows all.', objectSchema({ ...filterProperties, type: { ...textSchema, type: ['string', 'null'] } }, ['type']), false, async (input, signal) => {
      if (input.type) await validateTarget(input.type, input.category_id);
      else if (input.category_id != null) throw new Error('Select a card to open a category.');
      signal.throwIfAborted(); deps.navigate(input); return { opened: input };
    }),
    tool<Filters & { format: 'json' | 'markdown' }>('export_data', 'Download all data or filtered resources as JSON/Markdown in the browser. Returns counts and filename, not the complete file contents.', objectSchema({ ...filterProperties, format: { type: 'string', enum: ['json', 'markdown'] } }, ['format']), false, async (input, signal) => {
      const data = await readExport();
      const selected = { ...data, resources: filterResources(data.resources, input), resourceTypes: data.resourceTypes.filter(item => !input.type || item.id === input.type), categories: data.categories.filter(item => (!input.type || item.type === input.type) && (input.category_id === undefined || input.category_id === null || item.id === input.category_id)) };
      const filename = `link-manager-webmcp-${new Date().toISOString().slice(0, 10)}.${input.format === 'json' ? 'json' : 'md'}`;
      signal.throwIfAborted();
      if (input.format === 'json') downloadJson(filename, selected); else downloadMarkdown(filename, buildFullExportMarkdown({ ...selected, exportedAt: selected.exported_at }));
      return { download_requested: true, filename, resources: selected.resources.length };
    }),
    tool<{ request_id: string }>('get_import_status', 'Read the latest import request status in this page session. Only completed means data was imported. awaiting_confirmation requires the user to approve in the website; cancelled/failed are not success. Reloading or disabling AI access ends this session.', objectSchema({ request_id: textSchema }, ['request_id']), false, async ({ request_id }) => {
      if (importStatus?.request_id !== request_id) throw new Error('Import request not found in this page session. Check current data before starting another import.');
      return { ...importStatus };
    }),
    tool<{ json: string }>('import_data', 'Open a JSON import preview and return awaiting_confirmation with a request_id immediately. Ask the user to approve in the website, then use get_import_status; do not report completion before completed. Upserts by ID; absent records are retained. No confirmed argument bypasses the dialog. Max 750 KB and 500 records per collection.', objectSchema({ json: { type: 'string', minLength: 1, maxLength: 750000 } }, ['json']), true, async ({ json }, signal) => {
      const payload = parseImport(json);
      const existing = await readExport();
      const types = new Set([...existing.resourceTypes, ...payload.resourceTypes].map(item => item.id));
      const categories = new Map([...existing.categories, ...payload.categories].map(item => [item.id, item]));
      for (const category of payload.categories) if (!types.has(category.type)) throw new Error('Import category references an unknown card.');
      const resources = new Map([...existing.resources, ...payload.resources].map(item => [item.id, item]));
      for (const resource of resources.values()) if (!types.has(resource.type) || (resource.category_id !== null && categories.get(resource.category_id)?.type !== resource.type)) throw new Error('Import would leave a resource with an invalid card/category reference.');
      signal.throwIfAborted();
      importStatus = { request_id: crypto.randomUUID(), status: 'awaiting_confirmation' };
      deps.notify('JSON içe aktarma onayınızı bekliyor.');
      void finishImport({ payload, existing }, importStatus);
      return { request_id: importStatus.request_id, status: 'awaiting_confirmation' };
    }, true, true),
  ];
}

// No navigator fallback or polyfill: older implementations have different
// registration/return contracts. Unsupported browsers keep the regular UI.
export async function registerWebMCP(context: ModelContext, tools: WebMCPTool[], signal: AbortSignal) {
  for (const tool of tools) {
    signal.throwIfAborted();
    await context.registerTool(tool, { signal });
  }
}
