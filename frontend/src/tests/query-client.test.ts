import { afterEach, expect, it, vi } from 'vitest';
import { queryClient } from '../lib/query-client';
import { api, ApiError } from '../lib/api';

afterEach(() => { queryClient.clear(); vi.restoreAllMocks(); });

it('does not automatically retry rate limited reads', async () => {
  const read = vi.fn().mockRejectedValue(new ApiError('Wait', 429, 120_000));
  await expect(queryClient.fetchQuery({ queryKey: ['quota-test'], queryFn: read })).rejects.toMatchObject({ status: 429 });
  expect(read).toHaveBeenCalledTimes(1);
  const query = queryClient.getQueryCache().find({ queryKey: ['quota-test'] })!;
  const interval = queryClient.getDefaultOptions().queries!.refetchInterval;
  expect(typeof interval === 'function' ? interval(query) : interval).toBe(120_000);
});

it('polls no faster than once per minute during normal use', () => {
  queryClient.setQueryData(['poll-test'], []);
  const query = queryClient.getQueryCache().find({ queryKey: ['poll-test'] })!;
  const interval = queryClient.getDefaultOptions().queries!.refetchInterval;
  expect(typeof interval === 'function' ? interval(query) : interval).toBe(60_000);
});

it('reports Retry-After and a useful Turkish rate limit message', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Too Many Requests' }), { status: 429, headers: { 'content-type': 'application/json', 'retry-after': '90' } }));
  await expect(api.getResourceTypes()).rejects.toMatchObject({ status: 429, retryAfterMs: 90_000, message: expect.stringContaining('bekleyin') });
});
