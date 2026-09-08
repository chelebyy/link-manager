import { afterEach, expect, it, vi } from 'vitest';
import { api } from '../lib/api';

afterEach(() => vi.unstubAllGlobals());
const payload = { exported_at: 'backup-date', revision: 'old-backup', resourceTypes: [], categories: [], resources: [] };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

it('manual file import obtains the destination revision instead of trusting the backup', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(json({ ...payload, revision: 'current-destination' })).mockResolvedValueOnce(json({ success: true }));
  vi.stubGlobal('fetch', fetch);
  await api.importData(payload);
  expect(fetch.mock.calls[0][0]).toBe('/api/data/export');
  expect(JSON.parse(fetch.mock.calls[1][1].body).expected_revision).toBe('current-destination');
});

it('approved preview sends its original revision and does not retry a conflict', async () => {
  const fetch = vi.fn().mockResolvedValue(json({ error: 'Stale preview' }, 409));
  vi.stubGlobal('fetch', fetch);
  await expect(api.importData(payload, 'approved-revision')).rejects.toMatchObject({ status: 409 });
  expect(fetch).toHaveBeenCalledOnce();
  expect(JSON.parse(fetch.mock.calls[0][1].body).expected_revision).toBe('approved-revision');
});

it('does not POST if the destination server supplies no revision', async () => {
  const fetch = vi.fn().mockResolvedValue(json({ resources: [], categories: [], resourceTypes: [] }));
  vi.stubGlobal('fetch', fetch);
  await expect(api.importData(payload)).rejects.toMatchObject({ status: 428 });
  expect(fetch).toHaveBeenCalledOnce();
});
