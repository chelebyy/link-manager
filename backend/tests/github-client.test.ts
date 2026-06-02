import assert from 'node:assert/strict';
import test from 'node:test';
import type { Octokit } from 'octokit';
import { githubClient } from '../src/features/sync/github-client.js';

function buildMockOctokit(
  responder: (params: Record<string, unknown>) => Promise<unknown>,
): Octokit {
  return {
    rest: {
      repos: {
        listCommits: (params: Record<string, unknown>) => responder(params),
      },
    },
  } as unknown as Octokit;
}

test('getLatestCommit preserves etag from response headers when result is empty (304)', async () => {
  const mock = buildMockOctokit(async () => ({
    data: [],
    headers: { etag: 'W/"fresh-etag"' },
    status: 304,
    url: 'https://api.github.com/repos/o/r/commits',
  }));

  const result = await githubClient.getLatestCommit('o', 'r', 'W/"stale-etag"', mock);

  assert.equal(result.data, null);
  assert.equal(result.etag, 'W/"fresh-etag"');
});

test('getLatestCommit falls back to previous etag when 304 response has no etag header', async () => {
  const mock = buildMockOctokit(async () => ({
    data: [],
    headers: {},
    status: 304,
    url: 'https://api.github.com/repos/o/r/commits',
  }));

  const result = await githubClient.getLatestCommit('o', 'r', 'W/"previous-etag"', mock);

  assert.equal(result.data, null);
  assert.equal(result.etag, 'W/"previous-etag"');
});

test('getLatestCommit returns both data and etag on a successful response', async () => {
  const mock = buildMockOctokit(async () => ({
    data: [
      {
        sha: 'abc123',
        commit: {
          author: { date: '2026-05-01T00:00:00Z', name: 'octocat' },
          message: 'feat: something\nmore details',
        },
        author: { login: 'octocat' },
      },
    ],
    headers: { etag: 'W/"success-etag"' },
    status: 200,
    url: 'https://api.github.com/repos/o/r/commits',
  }));

  const result = await githubClient.getLatestCommit('o', 'r', undefined, mock);

  assert.deepEqual(result.data, {
    sha: 'abc123',
    date: '2026-05-01T00:00:00Z',
    message: 'feat: something',
    author: 'octocat',
  });
  assert.equal(result.etag, 'W/"success-etag"');
});

test('getLatestCommit with no previous etag and empty response returns etag: undefined', async () => {
  const mock = buildMockOctokit(async () => ({
    data: [],
    headers: {},
    status: 304,
    url: 'https://api.github.com/repos/o/r/commits',
  }));

  const result = await githubClient.getLatestCommit('o', 'r', undefined, mock);

  assert.equal(result.data, null);
  assert.equal(result.etag, undefined);
});

test('getLatestCommit sends If-None-Match header when etag is provided', async () => {
  let capturedHeaders: Record<string, string> | undefined;
  const mock = buildMockOctokit(async (params) => {
    capturedHeaders = params.headers as Record<string, string>;
    return {
      data: [],
      headers: { etag: 'W/"bumped"' },
      status: 304,
      url: 'https://api.github.com/repos/o/r/commits',
    };
  });

  await githubClient.getLatestCommit('o', 'r', 'W/"old"', mock);

  assert.equal(capturedHeaders?.['If-None-Match'], 'W/"old"');
});
