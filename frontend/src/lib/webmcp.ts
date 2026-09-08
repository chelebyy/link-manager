import { api, ApiError } from './api';
import { normalizeCategory, normalizeExport, normalizeResource, normalizeResourceType } from './webmcp-data';
import { buildFullExportMarkdown, downloadJson, downloadMarkdown, sortResourcesForView } from './resource-view';
import { categorySchema, idSchema, objectSchema, textSchema, validateSchema, type Schema } from './webmcp-schema';

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
interface Dependencies {
  navigate(view: ViewInput): void;
  notify(message: string): void;
}
type Filters = { type?: string; category_id?: number | null; search?: string; favorite?: boolean };
const filterProperties = { type: textSchema, category_id: categorySchema, search: { type: 'string', maxLength: 500 }, favorite: { type: 'boolean' } } satisfies Record<string, Schema>;
const readCategories = async (type?: string) => (await api.getCategories(type)).map(normalizeCategory);
const readTypes = async () => (await api.getResourceTypes()).map(normalizeResourceType);
const readResources = async (params: Parameters<typeof api.getResources>[0]) => (await api.getResources(params)).map(normalizeResource);

function filterResources<T extends { type: string; category_id: number | null; is_favorite: boolean; title: string; url: string | null; description: string | null }>(items: T[], filter: Filters) {
  return items.filter(item => (!filter.type || item.type === filter.type)
    && (filter.category_id === undefined || item.category_id === filter.category_id)
    && (filter.favorite === undefined || item.is_favorite === filter.favorite)
    && (!filter.search || [item.title, item.url, item.description].some(value => value?.toLocaleLowerCase('tr').includes(filter.search!.toLocaleLowerCase('tr')))));
}

export function createWebMCPTools(deps: Dependencies, lifetime: AbortSignal): WebMCPTool[] {
  const tool = <T,>(name: string, description: string, inputSchema: Schema,
    run: (input: T, signal: AbortSignal) => Promise<unknown>): WebMCPTool => ({
    name, description, inputSchema,
    annotations: { readOnlyHint: true, untrustedContentHint: true, consequentialHint: false },
    async execute(input, context) {
      const controller = new AbortController();
      const abort = () => controller.abort();
      const signals = [lifetime, context?.signal].filter((signal): signal is AbortSignal => !!signal);
      signals.forEach(signal => { signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort(); });
      try {
        controller.signal.throwIfAborted();
        validateSchema(input, inputSchema);
        const result = await run(input as T, controller.signal);
        controller.signal.throwIfAborted();
        return JSON.stringify({ ok: true, result: result ?? null });
      } catch (error) {
        const cancelled = controller.signal.aborted;
        deps.notify(cancelled ? 'Yapay zekâ işlemi iptal edildi.' : 'Yapay zekâ işlemi tamamlanamadı.');
        return JSON.stringify({ ok: false, error: cancelled ? 'Cancelled.' : error instanceof Error ? error.message : 'Operation failed.', ...(error instanceof ApiError ? { status: error.status } : {}) });
      } finally {
        signals.forEach(signal => signal.removeEventListener('abort', abort));
      }
    },
  });
  return [
    tool<{ type?: string }>('list_categories', 'List category IDs, names and parent card IDs.', objectSchema({ type: textSchema }), ({ type }) => readCategories(type)),
    tool<Record<string, never>>('list_resource_types', 'List cards (resource types), their IDs and display properties.', objectSchema({}), readTypes),
    tool<Filters & { offset?: number; limit?: number }>('search_resources', 'Search saved links by title, URL or description; filter by card, category (null = uncategorized) or favorite. Does not change the visible page. Returns total and a bounded page; use offset to continue.', objectSchema({ ...filterProperties, offset: { type: 'integer', minimum: 0 }, limit: { type: 'integer', minimum: 1, maximum: 100 } }), async input => {
      const items = sortResourcesForView(filterResources(await readResources({ type: input.type }), input));
      const offset = input.offset ?? 0;
      const limit = input.limit ?? 50;
      return { total: items.length, offset, next_offset: offset + limit < items.length ? offset + limit : null, resources: items.slice(offset, offset + limit).map(({ id, title, url, description, type, category_id, is_favorite }) => ({ id, title, url, description: description?.slice(0, 1000), type, category_id, is_favorite })) };
    }),
    tool<{ id: number }>('get_resource_details', 'Get full saved resource details by ID, including metadata and sync status.', objectSchema({ id: idSchema }, ['id']), async ({ id }) => {
      const resource = (await readResources({})).find(item => item.id === id);
      if (!resource) throw new Error('Resource not found.');
      return resource;
    }),
    tool<ViewInput>('open_view', 'Show a card/category and search/favorite filter on screen. type=null opens the home page. favorite=true shows important links; false shows all.', objectSchema({ ...filterProperties, type: { ...textSchema, type: ['string', 'null'] } }, ['type']), async (input, signal) => {
      if (input.type) {
        if (!(await readTypes()).some(item => item.id === input.type)) throw new Error('Unknown card ID. Use list_resource_types.');
        if (input.category_id != null && !(await readCategories(input.type)).some(item => item.id === input.category_id)) throw new Error('Category does not belong to the selected card.');
      } else if (input.category_id != null) throw new Error('Select a card to open a category.');
      signal.throwIfAborted();
      deps.navigate(input);
      return { opened: input };
    }),
    tool<Filters & { format: 'json' | 'markdown' }>('export_data', 'Download all data or filtered resources as JSON/Markdown in the browser. Returns counts and filename, not the complete file contents. Does not modify saved data.', objectSchema({ ...filterProperties, format: { type: 'string', enum: ['json', 'markdown'] } }, ['format']), async (input, signal) => {
      const data = normalizeExport(await api.exportData());
      const selected = { ...data, resources: filterResources(data.resources, input), resourceTypes: data.resourceTypes.filter(item => !input.type || item.id === input.type), categories: data.categories.filter(item => (!input.type || item.type === input.type) && (input.category_id === undefined || input.category_id === null || item.id === input.category_id)) };
      const filename = `link-manager-webmcp-${new Date().toISOString().slice(0, 10)}.${input.format === 'json' ? 'json' : 'md'}`;
      signal.throwIfAborted();
      if (input.format === 'json') downloadJson(filename, selected);
      else downloadMarkdown(filename, buildFullExportMarkdown({ ...selected, exportedAt: selected.exported_at }));
      return { download_requested: true, filename, resources: selected.resources.length };
    }),
  ];
}

export async function registerWebMCP(context: ModelContext, tools: WebMCPTool[], signal: AbortSignal) {
  for (const tool of tools) {
    signal.throwIfAborted();
    await context.registerTool(tool, { signal });
  }
}
