import { afterEach, expect, it, vi } from 'vitest';
import { api, ApiError } from '../lib/api';
import { createWebMCPTools, registerWebMCP } from '../lib/webmcp';
import * as resourceView from '../lib/resource-view';
import type { ExportPayload, ResourceWithSync } from '../types';

const card = { id: 'website', name: 'Web', color: '#6366f1', icon: 'Folder', description: null, is_builtin: true, sort_order: 0, created_at: '', updated_at: '' };
const category = { id: 1, name: 'Araçlar', type: 'website', color: '#6366f1', icon: 'Folder', sort_order: 0, created_at: '', updated_at: '' };
const resource: ResourceWithSync = { id: 1, title: 'Örnek', url: 'https://example.com', description: 'Türkçe açıklama', type: 'website', category_id: 1, is_favorite: false, metadata: {}, sort_order: 0, created_at: '', updated_at: '' };
const payload: ExportPayload = { revision: 'a'.repeat(64), exported_at: '2026-09-08', resourceTypes: [card], categories: [category], resources: [resource] };
const setup = () => {
  vi.spyOn(api, 'getResourceTypes').mockResolvedValue([card]);
  vi.spyOn(api, 'getCategories').mockResolvedValue([category]);
  vi.spyOn(api, 'getResources').mockResolvedValue([resource]);
  vi.spyOn(api, 'exportData').mockResolvedValue(payload);
  const controller = new AbortController();
  const deps = { navigate: vi.fn(), notify: vi.fn() };
  const tools = createWebMCPTools(deps, controller.signal);
  const execute = async (name: string, input: unknown, signal?: AbortSignal) => JSON.parse(await tools.find(tool => tool.name === name)!.execute(input, { signal }));
  return { controller, deps, tools, execute };
};
afterEach(() => vi.restoreAllMocks());

it('exposes exactly six read-only tools and no mutation/import capability', () => {
  const { tools } = setup();
  expect(tools.map(tool => tool.name).sort()).toEqual(['export_data', 'get_resource_details', 'list_categories', 'list_resource_types', 'open_view', 'search_resources']);
  expect(tools.every(tool => tool.annotations.readOnlyHint && !tool.annotations.consequentialHint)).toBe(true);
});

it('lists cards/categories and reads details with normalized PostgreSQL IDs', async () => {
  const { execute } = setup();
  vi.mocked(api.getResources).mockResolvedValue([{ ...resource, id: '1', category_id: '1' } as unknown as ResourceWithSync]);
  expect((await execute('list_resource_types', {})).result[0].id).toBe('website');
  expect((await execute('list_categories', { type: 'website' })).result[0].id).toBe(1);
  expect((await execute('get_resource_details', { id: 1 })).result.category_id).toBe(1);
  expect((await execute('get_resource_details', { id: 999 })).ok).toBe(false);
});

it('rejects invalid IDs and extra fields before accessing the API', async () => {
  const { execute } = setup();
  for (const input of [{ id: -1 }, { id: 1.5 }, { id: 1, changes: { title: 'New' } }]) {
    expect((await execute('get_resource_details', input)).ok).toBe(false);
  }
  expect(api.getResources).not.toHaveBeenCalled();
});

it('filters, paginates and preserves the visible view during search', async () => {
  const { execute, deps } = setup();
  vi.mocked(api.getResources).mockResolvedValue([resource, { ...resource, id: 2, is_favorite: true }]);
  const first = await execute('search_resources', { search: 'örnek', category_id: 1, limit: 1 });
  expect(first.result).toMatchObject({ total: 2, next_offset: 1 });
  expect(first.result.resources[0].id).toBe(2);
  expect((await execute('search_resources', { offset: 1, limit: 1 })).result.resources[0].id).toBe(1);
  expect((await execute('search_resources', { favorite: false })).result.total).toBe(1);
  expect((await execute('search_resources', { category_id: null })).result.total).toBe(0);
  expect(deps.navigate).not.toHaveBeenCalled();
});

it('navigates only after validating the selected card and category', async () => {
  const { execute, deps } = setup();
  expect((await execute('open_view', { type: 'website', category_id: 999 })).ok).toBe(false);
  expect((await execute('open_view', { type: null, category_id: 1 })).ok).toBe(false);
  expect(deps.navigate).not.toHaveBeenCalled();
  const view = { type: 'website', category_id: 1, search: 'örnek', favorite: true };
  expect((await execute('open_view', view)).ok).toBe(true);
  expect(deps.navigate).toHaveBeenCalledWith(view);
  expect((await execute('open_view', { type: null })).ok).toBe(true);
});

it('exports filtered JSON and Markdown with Turkish content without writing data', async () => {
  const { execute } = setup();
  const json = vi.spyOn(resourceView, 'downloadJson').mockImplementation(() => {});
  const markdown = vi.spyOn(resourceView, 'downloadMarkdown').mockImplementation(() => {});
  const fetch = vi.spyOn(globalThis, 'fetch');
  expect((await execute('export_data', { type: 'website', format: 'json' })).result.resources).toBe(1);
  expect(json).toHaveBeenCalledWith(expect.stringMatching(/\.json$/), payload);
  expect((await execute('export_data', { type: 'website', format: 'markdown' })).ok).toBe(true);
  expect(markdown).toHaveBeenCalledWith(expect.stringMatching(/\.md$/), expect.stringContaining('Türkçe açıklama'));
  expect(fetch).not.toHaveBeenCalled();
});

it('does not navigate or download if disabled while a request is pending', async () => {
  const { controller, execute, deps } = setup();
  let finish!: (value: typeof card[]) => void;
  vi.mocked(api.getResourceTypes).mockReturnValue(new Promise(resolve => { finish = resolve; }));
  const pending = execute('open_view', { type: 'website' });
  controller.abort(); finish([card]);
  expect((await pending).ok).toBe(false);
  expect(deps.navigate).not.toHaveBeenCalled();
});

it('preserves API status and does not retry a rate limited tool call', async () => {
  const { execute } = setup();
  vi.mocked(api.getResources).mockRejectedValue(new ApiError('Wait', 429));
  expect(await execute('search_resources', {})).toMatchObject({ ok: false, status: 429 });
  expect(api.getResources).toHaveBeenCalledTimes(1);
});

it('honors invocation cancellation and passes registration lifetime signals', async () => {
  const { tools, execute, controller } = setup();
  const invocation = new AbortController(); invocation.abort();
  expect((await execute('get_resource_details', { id: 1 }, invocation.signal)).ok).toBe(false);
  expect(api.getResources).not.toHaveBeenCalled();
  const registerTool = vi.fn().mockResolvedValue(undefined);
  await registerWebMCP({ registerTool }, tools, controller.signal);
  expect(registerTool).toHaveBeenCalledTimes(6);
  expect(registerTool).toHaveBeenCalledWith(tools[0], { signal: controller.signal });
});
