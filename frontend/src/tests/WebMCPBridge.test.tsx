import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { WebMCPBridge } from '../components/WebMCPBridge';
import { api } from '../lib/api';
import type { WebMCPTool } from '../lib/webmcp';

const pendingPayload = { resourceTypes: [{ id: 'test', name: 'Test Card', icon: 'Folder', color: '#6366f1', description: '', is_builtin: false, sort_order: 0 }], categories: [], resources: [] };
let registry: Map<string, WebMCPTool>;
let client: QueryClient;
let signals: AbortSignal[];
let registerTool: ReturnType<typeof vi.fn<(tool: WebMCPTool, options: { signal: AbortSignal }) => Promise<void>>>;

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('link-manager:webmcp-enabled', 'true');
  registry = new Map(); signals = [];
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  registerTool = vi.fn(async (tool: WebMCPTool, { signal }: { signal: AbortSignal }) => {
    if (registry.has(tool.name)) throw new Error('Duplicate tool registration');
    registry.set(tool.name, tool); signals.push(signal);
    signal.addEventListener('abort', () => { if (registry.get(tool.name) === tool) registry.delete(tool.name); }, { once: true });
  });
  Object.defineProperty(document, 'modelContext', { configurable: true, value: { registerTool } });
  vi.spyOn(api, 'exportData').mockResolvedValue({ revision: 'a'.repeat(64), exported_at: '2026-09-08', resourceTypes: [], categories: [], resources: [] });
  vi.spyOn(api, 'importData').mockResolvedValue({ success: true });
});
afterEach(() => {
  cleanup(); client.clear(); vi.restoreAllMocks();
  Reflect.deleteProperty(document, 'modelContext');
});
const mount = () => render(<StrictMode><QueryClientProvider client={client}><WebMCPBridge onNavigate={vi.fn()} /></QueryClientProvider></StrictMode>);
const ready = async () => { await screen.findByText('WebMCP: Hazır'); expect(registry.size).toBe(19); };
const beginImport = async () => {
  let result!: Promise<string>;
  await act(async () => { result = registry.get('import_data')!.execute({ json: JSON.stringify(pendingPayload) }); });
  await screen.findByRole('alertdialog');
  return { result };
};

it.each([null, 'false', 'invalid'])('requires explicit opt-in when the saved preference is %s', async preference => {
  if (preference === null) localStorage.removeItem('link-manager:webmcp-enabled');
  else localStorage.setItem('link-manager:webmcp-enabled', preference);
  mount();
  await screen.findByText('WebMCP: Kapalı');
  expect(registerTool).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'AI erişimini aç' }));
  await ready();
  expect(localStorage.getItem('link-manager:webmcp-enabled')).toBe('true');
});

it('stays disabled when storage is unavailable and permits explicit tab-only consent', async () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Storage unavailable'); });
  const rendered = mount();
  await screen.findByText('WebMCP: Kapalı');
  expect(registerTool).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'AI erişimini aç' }));
  await ready();
  await screen.findByText('Tercih kaydedilemedi; değişiklik yalnızca bu sekmede geçerli.');
  rendered.unmount();
  mount();
  await screen.findByText('WebMCP: Kapalı');
  expect(registry.size).toBe(0);
});

it('keeps native registration unique under StrictMode and unregisters on unmount', async () => {
  const rendered = mount(); await ready();
  rendered.unmount();
  expect(registry.size).toBe(0);
  expect(signals.every(signal => signal.aborted)).toBe(true);
});

it('leaves the normal page usable in an unsupported browser', async () => {
  Reflect.deleteProperty(document, 'modelContext');
  mount(); await screen.findByText('WebMCP: Tarayıcı desteklemiyor');
  expect(registerTool).not.toHaveBeenCalled();
});

it('cleans up a partially failed registration', async () => {
  const original = registerTool.getMockImplementation()!;
  registerTool.mockImplementation(async (...args) => { if (registry.size === 2) throw new Error('Unsupported contract'); return original(...args); });
  mount(); await screen.findByText('WebMCP: Bağlantı kurulamadı');
  expect(registry.size).toBe(0);
});

it('shows the JSON preview and only imports after the confirmation button', async () => {
  mount(); await ready();
  const { result } = await beginImport();
  expect(screen.getByText(/Test Card/)).toBeInTheDocument();
  expect(api.importData).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Onayla ve içe aktar' })); await result; });
  await waitFor(() => expect(api.importData).toHaveBeenCalledOnce());
  await screen.findByText('JSON içe aktarma tamamlandı.');
  const started = JSON.parse(await result);
  expect(started.result.status).toBe('awaiting_confirmation');
  expect(JSON.parse(await registry.get('get_import_status')!.execute({ request_id: started.result.request_id })).result.status).toBe('completed');
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
});

it('cancels import without writing when the user declines', async () => {
  mount(); await ready();
  const { result } = await beginImport();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'İptal' })); await result; });
  const started = JSON.parse(await result);
  expect(JSON.parse(await registry.get('get_import_status')!.execute({ request_id: started.result.request_id })).result.status).toBe('cancelled');
  expect(api.importData).not.toHaveBeenCalled();
});

it('settles a pending import on unmount and prevents a retained callback from writing', async () => {
  const rendered = mount(); await ready();
  const { result } = await beginImport();
  rendered.unmount();
  expect(JSON.parse(await result).result.status).toBe('awaiting_confirmation');
  await Promise.resolve();
  expect(api.importData).not.toHaveBeenCalled();
});

it('disables and re-enables AI access without duplicate tools', async () => {
  mount(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'AI erişimini kapat' }));
  await waitFor(() => expect(registry.size).toBe(0));
  await screen.findByText('WebMCP: Kapalı');
  fireEvent.click(screen.getByRole('button', { name: 'AI erişimini aç' }));
  await ready();
});

it('preserves the disabled preference after remount', async () => {
  const rendered = mount(); await ready();
  fireEvent.click(screen.getByRole('button', { name: 'AI erişimini kapat' }));
  await screen.findByText('WebMCP: Kapalı');
  rendered.unmount(); mount();
  await screen.findByText('WebMCP: Kapalı');
  expect(registry.size).toBe(0);
});
