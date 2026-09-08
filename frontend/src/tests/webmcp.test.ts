import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../lib/api';
import { createWebMCPTools, parseImport, registerWebMCP } from '../lib/webmcp';
import { objectSchema, idSchema, validateSchema } from '../lib/webmcp-schema';
import { normalizeId } from '../lib/webmcp-data';
import * as resourceView from '../lib/resource-view';
import type { ExportPayload, ResourceWithSync } from '../types';

const card = { id: 'website', name: 'Web', color: '#6366f1', icon: 'Folder', description: null, is_builtin: true, sort_order: 0, created_at: '', updated_at: '' };
const category = { id: 1, name: 'Tools', type: 'website', color: '#6366f1', icon: 'Folder', sort_order: 0, created_at: '', updated_at: '' };
const resource: ResourceWithSync = { id: 1, title: 'Example', url: 'https://example.com', description: 'Keep this', type: 'website', category_id: 1, is_favorite: false, metadata: {}, sort_order: 0, created_at: '', updated_at: '' };
const payload: ExportPayload = { revision: 'a'.repeat(64), exported_at: '2026-09-08', resourceTypes: [card], categories: [category], resources: [resource] };
const setup = () => {
  vi.spyOn(api, 'getResourceTypes').mockResolvedValue([card]);
  vi.spyOn(api, 'getCategories').mockResolvedValue([category]);
  vi.spyOn(api, 'getResources').mockResolvedValue([resource]);
  vi.spyOn(api, 'exportData').mockResolvedValue(payload);
  const controller = new AbortController();
  const deps = { refresh: vi.fn().mockResolvedValue(undefined), navigate: vi.fn(), confirmImport: vi.fn().mockResolvedValue(true), notify: vi.fn() };
  const tools = createWebMCPTools(deps, controller.signal);
  const execute = async (name: string, input: unknown, signal?: AbortSignal) => JSON.parse(await tools.find(tool => tool.name === name)!.execute(input, { signal }));
  return { controller, deps, tools, execute };
};
afterEach(() => vi.restoreAllMocks());

describe('WebMCP tool contracts', () => {
  it('exposes the agreed features without any deletion tool', () => {
    const { tools } = setup();
    expect(tools).toHaveLength(19);
    expect(new Set(tools.map(tool => tool.name)).size).toBe(tools.length);
    expect(tools.some(tool => /delete|remove/.test(tool.name))).toBe(false);
    expect(tools.find(tool => tool.name === 'import_data')?.annotations.consequentialHint).toBe(true);
  });
  it('rejects forged extra fields and invalid IDs before calling the API', async () => {
    const { execute } = setup();
    const update = vi.spyOn(api, 'updateResource');
    expect((await execute('update_resource', { id: 1, changes: { title: 'New', delete: true } })).ok).toBe(false);
    expect((await execute('get_resource_details', { id: -1 })).ok).toBe(false);
    expect((await execute('get_resource_details', { id: 1.5 })).ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(api.getResources).not.toHaveBeenCalled();
  });
  it('preserves unspecified resource fields instead of replacing them', async () => {
    const { execute, deps } = setup();
    const update = vi.spyOn(api, 'updateResource').mockResolvedValue({ ...resource, title: 'New' });
    expect((await execute('update_resource', { id: 1, changes: { title: 'New' } })).ok).toBe(true);
    expect(update).toHaveBeenCalledWith(1, { title: 'New' });
    expect(deps.refresh).toHaveBeenCalledOnce();
  });
  it('sends only requested category and card fields, preserving concurrent edits', async () => {
    const { execute } = setup();
    const updateCategory = vi.spyOn(api, 'updateCategory').mockResolvedValue(category);
    const updateType = vi.spyOn(api, 'updateResourceType').mockResolvedValue(card);
    await execute('update_category', { id: 1, changes: { name: 'New' } });
    expect(updateCategory).toHaveBeenCalledWith(1, { name: 'New' });
    await execute('update_resource_type', { id: 'website', changes: { name: 'New' } });
    expect(updateType).toHaveBeenCalledWith('website', { name: 'New' });
  });
  it('rejects empty edits', async () => {
    const { execute } = setup();
    for (const name of ['update_resource', 'update_category', 'update_resource_type']) expect((await execute(name, { id: name === 'update_resource_type' ? 'website' : 1, changes: {} })).ok).toBe(false);
  });
  it('blocks category/card mismatch and duplicate move IDs', async () => {
    const { execute } = setup();
    vi.mocked(api.getCategories).mockResolvedValue([]);
    const move = vi.spyOn(api, 'bulkMoveResources');
    expect((await execute('move_resources', { ids: [1], type: 'website', category_id: 999 })).ok).toBe(false);
    expect((await execute('move_resources', { ids: [1, 1], type: 'website' })).ok).toBe(false);
    expect(move).not.toHaveBeenCalled();
  });
  it('resolves PostgreSQL BIGINT strings through the integer tool contract', async () => {
    const { execute } = setup();
    vi.mocked(api.getResources).mockResolvedValue([{ ...resource, id: '1', category_id: '1' } as unknown as ResourceWithSync]);
    expect((await execute('get_resource_details', { id: 1 })).result.id).toBe(1);
    vi.mocked(api.getCategories).mockResolvedValue([{ ...category, id: '1' } as unknown as typeof category]);
    const create = vi.spyOn(api, 'createResource').mockResolvedValue(resource);
    expect((await execute('create_resource', { type: 'website', title: 'New', url: null, description: null, category_id: 1 })).ok).toBe(true);
    expect(create).toHaveBeenCalledOnce();
    expect(() => normalizeId('9007199254740992')).toThrow();
  });
  it('returns bounded search pages and does not navigate', async () => {
    const { execute, deps } = setup();
    vi.mocked(api.getResources).mockResolvedValue(Array.from({ length: 120 }, (_, id) => ({ ...resource, id: id + 1 })));
    const first = await execute('search_resources', {});
    expect(first.result.resources).toHaveLength(50);
    expect(first.result.total).toBe(120);
    expect(first.result.next_offset).toBe(50);
    const last = await execute('search_resources', { offset: 100 });
    expect(last.result.resources).toHaveLength(20);
    expect(last.result.next_offset).toBeNull();
    expect(deps.navigate).not.toHaveBeenCalled();
  });
  it('filters favorite and uncategorized independently', async () => {
    const { execute } = setup();
    vi.mocked(api.getResources).mockResolvedValue([resource, { ...resource, id: 2, category_id: null, is_favorite: true }]);
    const result = await execute('search_resources', { favorite: true, category_id: null });
    expect(result.result.resources.map((row: { id: number }) => row.id)).toEqual([2]);
  });
  it('filters integer SQLite favorites with the same semantics as PostgreSQL booleans', async () => {
    const { execute } = setup();
    vi.mocked(api.getResources).mockResolvedValue([{ ...resource, is_favorite: 1 as unknown as boolean }]);
    expect((await execute('search_resources', { favorite: true })).result.total).toBe(1);
    expect((await execute('search_resources', { favorite: false })).result.total).toBe(0);
  });
  it('validates navigation before changing screen', async () => {
    const { execute, deps } = setup();
    expect((await execute('open_view', { type: 'missing' })).ok).toBe(false);
    expect(deps.navigate).not.toHaveBeenCalled();
    await execute('open_view', { type: 'website', category_id: 1, favorite: true });
    expect(deps.navigate).toHaveBeenCalledWith({ type: 'website', category_id: 1, favorite: true });
  });
  it('exports only the selected resources and constructs real JSON and Markdown content', async () => {
    const { execute } = setup();
    const json = vi.spyOn(resourceView, 'downloadJson').mockImplementation(() => {});
    const markdown = vi.spyOn(resourceView, 'downloadMarkdown').mockImplementation(() => {});
    expect((await execute('export_data', { type: 'website', category_id: 1, format: 'json' })).result.resources).toBe(1);
    expect(json).toHaveBeenCalledWith(expect.stringMatching(/\.json$/), payload);
    await execute('export_data', { type: 'website', format: 'markdown' });
    expect(markdown).toHaveBeenCalledWith(expect.stringMatching(/\.md$/), expect.stringContaining('https://example.com'));
    await execute('export_data', { favorite: true, format: 'json' });
    expect(json).toHaveBeenLastCalledWith(expect.any(String), expect.objectContaining({ resources: [] }));
  });
  it('reports API errors as failures and does not retry writes', async () => {
    const { execute, deps } = setup();
    const favorite = vi.spyOn(api, 'toggleFavorite').mockRejectedValue(new ApiError('Unauthorized', 401));
    expect(await execute('set_resource_favorite', { id: 1, favorite: true })).toEqual({ ok: false, error: 'Unauthorized', status: 401 });
    expect(favorite).toHaveBeenCalledOnce();
    expect(deps.refresh).not.toHaveBeenCalled();
  });
  it('does not report a committed write as failed when UI refresh fails', async () => {
    const { execute, deps } = setup();
    vi.spyOn(api, 'toggleFavorite').mockResolvedValue(resource);
    deps.refresh.mockRejectedValue(new Error('offline'));
    expect((await execute('set_resource_favorite', { id: 1, favorite: true })).ok).toBe(true);
    expect(deps.notify).toHaveBeenLastCalledWith('İşlem tamamlandı; liste yenilenemedi. Sayfayı yenileyin.');
  });
  it('stops a mutation cancelled during its prerequisite read', async () => {
    const { execute, controller } = setup();
    vi.mocked(api.getResources).mockImplementation(async () => { controller.abort(); return [resource]; });
    const update = vi.spyOn(api, 'updateResource');
    expect((await execute('update_resource', { id: 1, changes: { title: 'New' } })).ok).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });
  it('blocks retained callbacks after registration is disabled', async () => {
    const { execute, controller } = setup();
    controller.abort();
    expect((await execute('get_resource_details', { id: 1 })).ok).toBe(false);
    expect(api.getResources).not.toHaveBeenCalled();
  });
  it('rejects unknown IDs when sorting and preserves submitted order', async () => {
    const { execute } = setup();
    const reorder = vi.spyOn(api, 'reorderResources').mockResolvedValue({ success: true });
    expect((await execute('reorder_resources', { ids: [999] })).ok).toBe(false);
    expect(reorder).not.toHaveBeenCalled();
    await execute('reorder_resources', { ids: [1] });
    expect(reorder).toHaveBeenCalledWith([1]);
  });
});

describe('JSON import', () => {
  it('accepts SQLite exported integer booleans without changing their meaning', () => {
    const sqlite = { ...payload, resourceTypes: [{ ...card, is_builtin: 1 }], resources: [{ ...resource, is_favorite: 0 }] };
    expect(parseImport(JSON.stringify(sqlite))).toEqual(payload);
  });
  it('accepts actual SQLite metadata strings and built-in three-digit colors', () => {
    const sqlite = { ...payload, resourceTypes: [{ ...card, color: '#333' }], resources: [{ ...resource, metadata: '{"local":true}' }] };
    expect(parseImport(JSON.stringify(sqlite)).resources[0].metadata).toEqual({ local: true });
    expect(parseImport(JSON.stringify(sqlite)).resourceTypes[0].color).toBe('#333');
  });
  it('accepts PostgreSQL exports containing BIGINT strings', () => {
    const pg = { ...payload, categories: [{ ...category, id: '1' }], resources: [{ ...resource, id: '1', category_id: '1' }] };
    expect(parseImport(JSON.stringify(pg))).toEqual(payload);
  });
  it('accepts a full export and rejects incomplete, malformed, oversized and duplicate records', () => {
    expect(parseImport(JSON.stringify(payload))).toEqual(payload);
    for (const value of ['{', JSON.stringify({ resources: [{ id: 1 }] }), JSON.stringify({ ...payload, resources: [resource, resource] }), JSON.stringify({ ...payload, resources: [{ ...resource, url: 'javascript:alert(1)' }] }), ' '.repeat(750001)]) expect(() => parseImport(value)).toThrow();
  });
  it('cannot bypass user confirmation with an input flag', async () => {
    const { execute, deps } = setup();
    const imported = vi.spyOn(api, 'importData');
    expect((await execute('import_data', { json: JSON.stringify(payload), confirmed: true })).ok).toBe(false);
    expect(imported).not.toHaveBeenCalled();
    expect(deps.confirmImport).not.toHaveBeenCalled();
  });
  it('does not write when the user declines', async () => {
    const { execute, deps } = setup();
    deps.confirmImport.mockResolvedValue(false);
    const imported = vi.spyOn(api, 'importData');
    const started = await execute('import_data', { json: JSON.stringify(payload) });
    expect(started.result.status).toBe('awaiting_confirmation');
    expect((await execute('get_import_status', { request_id: started.result.request_id })).result.status).toBe('cancelled');
    expect(imported).not.toHaveBeenCalled();
  });
  it('waits for approval and serializes other writes during the preview', async () => {
    const { execute, deps } = setup();
    let approve!: (value: boolean) => void;
    deps.confirmImport.mockImplementation(() => new Promise(resolve => { approve = resolve; }));
    const imported = vi.spyOn(api, 'importData').mockResolvedValue({ success: true });
    const started = await execute('import_data', { json: JSON.stringify(payload) });
    await vi.waitFor(() => expect(deps.confirmImport).toHaveBeenCalledOnce());
    expect(imported).not.toHaveBeenCalled();
    expect((await execute('get_import_status', { request_id: started.result.request_id })).result.status).toBe('awaiting_confirmation');
    expect((await execute('set_resource_favorite', { id: 1, favorite: true })).ok).toBe(false);
    approve(true);
    await vi.waitFor(async () => expect((await execute('get_import_status', { request_id: started.result.request_id })).result.status).toBe('completed'));
    expect(imported).toHaveBeenCalledWith(payload, payload.revision);
    expect(deps.refresh).toHaveBeenCalledOnce();
  });
  it('keeps the approved preview revision when another client changes data', async () => {
    const { execute, deps } = setup();
    deps.confirmImport.mockImplementation(async () => {
      vi.mocked(api.exportData).mockResolvedValue({ ...payload, revision: 'b'.repeat(64), resources: [{ ...resource, title: 'Changed elsewhere' }] });
      return true;
    });
    const imported = vi.spyOn(api, 'importData').mockRejectedValue(new ApiError('Stale preview', 409));
    const started = await execute('import_data', { json: JSON.stringify(payload) });
    await vi.waitFor(async () => expect((await execute('get_import_status', { request_id: started.result.request_id })).result.status).toBe('failed'));
    expect(imported).toHaveBeenCalledWith(payload, payload.revision);
    expect(api.exportData).toHaveBeenCalledOnce();
  });
  it('fails closed when the preview server supplies no revision', async () => {
    const { execute } = setup();
    vi.mocked(api.exportData).mockResolvedValue({ ...payload, revision: undefined });
    const imported = vi.spyOn(api, 'importData');
    const started = await execute('import_data', { json: JSON.stringify(payload) });
    await vi.waitFor(async () => expect((await execute('get_import_status', { request_id: started.result.request_id })).result.status).toBe('failed'));
    expect(imported).not.toHaveBeenCalled();
  });
  it('tracks API rejection as failed rather than completed', async () => {
    const { execute } = setup();
    vi.spyOn(api, 'importData').mockRejectedValue(new ApiError('Conflict', 409));
    const started = await execute('import_data', { json: JSON.stringify(payload) });
    await vi.waitFor(async () => expect((await execute('get_import_status', { request_id: started.result.request_id })).result).toMatchObject({ status: 'failed', error: 'Conflict' }));
  });
  it('rejects import that would invalidate an existing link outside the payload', async () => {
    const { execute, deps } = setup();
    const changed = { ...payload, resourceTypes: [card, { ...card, id: 'other' }], categories: [{ ...category, type: 'other' }], resources: [] };
    expect((await execute('import_data', { json: JSON.stringify(changed) })).ok).toBe(false);
    expect(deps.confirmImport).not.toHaveBeenCalled();
  });
});

it('registers native tools with an abortable lifecycle', async () => {
  const { tools, controller } = setup();
  const context = { registerTool: vi.fn().mockResolvedValue(undefined) };
  await registerWebMCP(context, tools, controller.signal);
  expect(context.registerTool).toHaveBeenCalledTimes(tools.length);
  expect(context.registerTool).toHaveBeenCalledWith(tools[0], { signal: controller.signal });
});

it('does not accept inherited properties as schema fields', () => {
  expect(() => validateSchema(JSON.parse('{"id":1,"__proto__":{}}'), objectSchema({ id: idSchema }, ['id']))).toThrow();
});
