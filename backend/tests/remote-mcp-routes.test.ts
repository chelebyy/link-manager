import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

test('MCP authentication protects every route; authenticated tools still work', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'link-manager-mcp-'));
  process.env.SQLITE_DB_PATH = path.join(dir, 'test.db');
  delete process.env.DATABASE_URL;
  process.env.LINK_MANAGER_MCP_AUTH_MODE = 'legacy-key';
  process.env.LINK_MANAGER_MCP_KEY = 'test-only';
  const { initDb, closeDb, query } = await import('../src/shared/db/index.js');
  const { remoteMcpRoutes } = await import('../src/features/remote-mcp/routes.js');
  const app = Fastify({ logger: false });
  const oauthApp = Fastify({ logger: false });
  t.after(async () => {
    await app.close();
    await oauthApp.close();
    await closeDb();
    delete process.env.SQLITE_DB_PATH;
    delete process.env.LINK_MANAGER_MCP_AUTH_MODE;
    delete process.env.LINK_MANAGER_MCP_KEY;
    delete process.env.LINK_MANAGER_MCP_ACCESS_ISSUER;
    delete process.env.LINK_MANAGER_MCP_ACCESS_AUDIENCE;
    delete process.env.LINK_MANAGER_MCP_OWNER_EMAIL;
    delete process.env.LINK_MANAGER_MCP_SERVICE_CLIENT_IDS;
    await rm(dir, { recursive: true, force: true });
  });
  await initDb();
  await app.register(remoteMcpRoutes, { prefix: '/mcp' });
  app.get('/unrelated-health', async () => ({ ok: true }));
  const payload = { jsonrpc: '2.0', id: 1, method: 'tools/list' };
  for (const method of ['GET', 'POST'] as const) {
    const response = await app.inject({ method, url: '/mcp', ...(method === 'POST' ? { payload } : {}) });
    assert.equal(response.statusCode, 401);
    assert.equal(response.headers['www-authenticate'], 'Bearer');
  }
  assert.equal((await app.inject({ url: '/unrelated-health' })).statusCode, 200, 'MCP hook stays encapsulated');
  const headers = { authorization: 'Bearer test-only' };
  assert.equal((await app.inject({ method: 'POST', url: '/mcp', payload, headers: { ...headers, origin: 'https://evil.example' } })).statusCode, 403);
  assert.equal((await app.inject({ method: 'GET', url: '/mcp', headers })).statusCode, 405);
  const rpc = async (method: string, params?: unknown) => {
    const response = await app.inject({ method: 'POST', url: '/mcp', headers, payload: { jsonrpc: '2.0', id: 1, method, params } });
    assert.equal(response.statusCode, 200);
    return response.json().result;
  };
  assert.equal((await rpc('initialize')).serverInfo.name, 'link-manager');
  assert.equal((await rpc('tools/list')).tools.length, 5);
  await rpc('tools/call', { name: 'list_categories', arguments: {} });
  const added = await rpc('tools/call', { name: 'add_resource', arguments: { type: 'website', category: 'MCP fixture', title: 'MCP test resource', url: 'https://example.com/mcp-test' } });
  const addedData = JSON.parse(added.content[0].text);
  assert.equal(addedData.created, true, JSON.stringify(addedData));
  const search = await rpc('tools/call', { name: 'search_resources', arguments: { query: 'MCP test resource' } });
  assert.equal(JSON.parse(search.content[0].text).resources.length, 1);
  await query('INSERT INTO categories (name, type) VALUES (?, ?)', ['Moved fixture', 'website']);
  const moved = await rpc('tools/call', { name: 'move_resource', arguments: { resource_id: addedData.resource.id, type: 'website', category: 'Moved fixture' } });
  assert.equal(JSON.parse(moved.content[0].text).moved, true, moved.content[0].text);
  const denied = await app.inject({ method: 'POST', url: '/mcp', payload: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'add_resource', arguments: { type: 'website', category: 'MCP fixture', title: 'Unauthorized', url: 'https://example.com/unauthorized' } } } });
  assert.equal(denied.statusCode, 401);
  assert.equal((await query("SELECT id FROM resources WHERE url = ?", ['https://example.com/unauthorized'])).rows.length, 0);

  process.env.LINK_MANAGER_MCP_AUTH_MODE = 'cloudflare-access';
  process.env.LINK_MANAGER_MCP_ACCESS_ISSUER = 'https://test-team.cloudflareaccess.com';
  process.env.LINK_MANAGER_MCP_ACCESS_AUDIENCE = 'mcp-app';
  process.env.LINK_MANAGER_MCP_OWNER_EMAIL = 'owner@example.com';
  process.env.LINK_MANAGER_MCP_SERVICE_CLIENT_IDS = 'machine.access';
  const pair = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(pair.publicKey), kid: 'route-test', alg: 'RS256' };
  t.mock.method(globalThis, 'fetch', async (url: URL | string) => {
    assert.equal(String(url), 'https://test-team.cloudflareaccess.com/cdn-cgi/access/certs');
    return new Response(JSON.stringify({ keys: [jwk] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  await oauthApp.register(remoteMcpRoutes, { prefix: '/mcp' });
  const assertion = await new SignJWT({ email: 'owner@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'route-test' }).setIssuer('https://test-team.cloudflareaccess.com')
    .setAudience('mcp-app').setSubject('owner-id').setIssuedAt().setExpirationTime('15m').sign(pair.privateKey);
  assert.equal((await oauthApp.inject({ method: 'POST', url: '/mcp', payload, headers })).statusCode, 401, 'legacy key cannot bypass OAuth');
  const oauthResponse = await oauthApp.inject({ method: 'POST', url: '/mcp', payload, headers: { 'cf-access-jwt-assertion': assertion } });
  assert.equal(oauthResponse.statusCode, 200);
  assert.equal(oauthResponse.json().result.tools.length, 5);
  const serviceAssertion = await new SignJWT({ type: 'app', common_name: 'machine.access' })
    .setProtectedHeader({ alg: 'RS256', kid: 'route-test' }).setIssuer('https://test-team.cloudflareaccess.com')
    .setAudience('mcp-app').setSubject('').setIssuedAt().setExpirationTime('15m').sign(pair.privateKey);
  const serviceHeaders = { 'cf-access-jwt-assertion': serviceAssertion };
  for (const method of ['initialize', 'tools/list', 'tools/call']) {
    const response = await oauthApp.inject({ method: 'POST', url: '/mcp', headers: serviceHeaders,
      payload: { jsonrpc: '2.0', id: 3, method, ...(method === 'tools/call' ? { params: { name: 'list_categories', arguments: {} } } : {}) } });
    assert.equal(response.statusCode, 200);
    assert.ok(response.json().result);
  }
  const rawService = await oauthApp.inject({ method: 'POST', url: '/mcp', payload,
    headers: { 'cf-access-client-id': 'machine.access', 'cf-access-client-secret': 'not-an-assertion' } });
  assert.equal(rawService.statusCode, 401);
});
