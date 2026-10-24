import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createMcpAuthenticator } from '../src/features/remote-mcp/auth.js';

const issuer = 'https://test-team.cloudflareaccess.com';
const env = {
  LINK_MANAGER_MCP_AUTH_MODE: 'cloudflare-access',
  LINK_MANAGER_MCP_ACCESS_ISSUER: issuer,
  LINK_MANAGER_MCP_ACCESS_AUDIENCE: 'dedicated-mcp-app',
  LINK_MANAGER_MCP_OWNER_EMAIL: 'owner@example.com',
  LINK_MANAGER_MCP_KEY: 'old-key-must-not-work',
};

test('Access identity assertions: signature, audience, issuer, identity and time boundaries', async (t) => {
  const pair = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(pair.publicKey), kid: 'test-key', alg: 'RS256' };
  const auth = createMcpAuthenticator(env, createLocalJWKSet({ keys: [jwk] }));
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: issuer, aud: 'dedicated-mcp-app', sub: 'owner-id', email: 'owner@example.com', iat: now, exp: now + 900 };
  const sign = (payload: Record<string, unknown>, key = pair.privateKey) => new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' }).sign(key);
  const verify = async (payload: Record<string, unknown>) => auth.authenticate({ 'cf-access-jwt-assertion': await sign(payload) });
  assert.equal(await verify(claims), true);
  assert.equal(await verify({ ...claims, aud: ['dedicated-mcp-app'] }), true);

  for (const [name, changed] of Object.entries({
    'wrong app audience': { aud: 'browser-app' },
    'wrong issuer': { iss: 'https://attacker.cloudflareaccess.com' },
    'wrong owner': { email: 'other@example.com' },
    'empty subject': { sub: ' ' },
    'expired token': { exp: now - 60 },
    'not active yet': { nbf: now + 60 },
    'future issued time': { iat: now + 60 },
    'invalid issued type': { iat: 'yesterday' },
  })) {
    await t.test(name, async () => assert.equal(await verify({ ...claims, ...changed }), false));
  }
  for (const claim of ['exp', 'iat', 'sub', 'email', 'iss', 'aud']) {
    await t.test(`missing ${claim}`, async () => {
      const payload: Record<string, unknown> = { ...claims };
      delete payload[claim];
      assert.equal(await verify(payload), false);
    });
  }
  const other = await generateKeyPair('RS256');
  assert.equal(await auth.authenticate({ 'cf-access-jwt-assertion': await sign(claims, other.privateKey) }), false);
  const hs = await new SignJWT(claims).setProtectedHeader({ alg: 'HS256' }).sign(new TextEncoder().encode('a'.repeat(32)));
  for (const assertion of ['invalid', hs, 'a'.repeat(16385)]) {
    assert.equal(await auth.authenticate({ 'cf-access-jwt-assertion': assertion }), false);
  }
  assert.equal(await auth.authenticate({ authorization: 'Bearer old-key-must-not-work', 'x-link-manager-mcp-key': 'old-key-must-not-work' }), false);
  assert.equal(await auth.authenticate({ authorization: `Bearer ${await sign(claims)}` }), false);
  assert.equal(await auth.authenticate({ 'cf-access-authenticated-user-email': 'owner@example.com' }), false);
  assert.equal(await auth.authenticate({}), false);
});

test('configuration fails closed and legacy mode is explicit', async () => {
  assert.equal(await createMcpAuthenticator({ LINK_MANAGER_MCP_KEY: 'legacy' }).authenticate({ authorization: 'Bearer legacy' }), false);
  for (const field of ['LINK_MANAGER_MCP_ACCESS_ISSUER', 'LINK_MANAGER_MCP_ACCESS_AUDIENCE', 'LINK_MANAGER_MCP_OWNER_EMAIL']) {
    assert.throws(() => createMcpAuthenticator({ ...env, [field]: '' }));
  }
  for (const issuer of ['http://test.cloudflareaccess.com', 'https://evil.com', 'https://test.cloudflareaccess.com/extra', 'https://test.cloudflareaccess.com@evil.com']) {
    assert.throws(() => createMcpAuthenticator({ ...env, LINK_MANAGER_MCP_ACCESS_ISSUER: issuer }));
  }
  assert.throws(() => createMcpAuthenticator({ ...env, LINK_MANAGER_MCP_AUTH_MODE: 'legacy-key' }));
  assert.throws(() => createMcpAuthenticator({ LINK_MANAGER_MCP_AUTH_MODE: 'typo' }));
  assert.throws(() => createMcpAuthenticator({ LINK_MANAGER_MCP_AUTH_MODE: 'legacy-key' }));
  for (const ids of ['*', ' ', 'a.access,https://evil.example', 'a.access\nother.access']) {
    assert.throws(() => createMcpAuthenticator({ ...env, LINK_MANAGER_MCP_SERVICE_CLIENT_IDS: ids }));
  }
  assert.throws(() => createMcpAuthenticator({ LINK_MANAGER_MCP_SERVICE_CLIENT_IDS: 'machine.access' }));
  const legacy = createMcpAuthenticator({ LINK_MANAGER_MCP_AUTH_MODE: 'legacy-key', LINK_MANAGER_MCP_KEY: 'secret' });
  assert.equal(await legacy.authenticate({ authorization: 'Bearer secret' }), true);
  assert.equal(await legacy.authenticate({ 'x-link-manager-mcp-key': 'secret' }), true);
  assert.equal(await legacy.authenticate({ authorization: 'Bearer wrong' }), false);
});

test('Service Auth accepts only a signed, explicitly allowed machine identity', async (t) => {
  const pair = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(pair.publicKey), kid: 'service-key', alg: 'RS256' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const auth = createMcpAuthenticator({ ...env, LINK_MANAGER_MCP_SERVICE_CLIENT_IDS: 'machine.access,second.access' }, keys);
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: issuer, aud: 'dedicated-mcp-app', type: 'app', sub: '', common_name: 'machine.access', iat: now, exp: now + 900 };
  const sign = (payload: Record<string, unknown>, key = pair.privateKey) => new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: 'service-key' }).sign(key);
  const verify = async (payload: Record<string, unknown>) => auth.authenticate({ 'cf-access-jwt-assertion': await sign(payload) });
  assert.equal(await verify(claims), true);
  assert.equal(await verify({ ...claims, common_name: 'second.access' }), true);
  assert.equal(await createMcpAuthenticator(env, keys).authenticate({ 'cf-access-jwt-assertion': await sign(claims) }), false, 'empty allowlist denies services');
  for (const [name, changed] of Object.entries({
    'unlisted machine': { common_name: 'other.access' },
    'owner email as machine': { common_name: 'owner@example.com' },
    'wrong application': { aud: 'browser-app' },
    'wrong issuer': { iss: 'https://attacker.cloudflareaccess.com' },
    'global token': { type: 'org' },
    'mixed user subject': { sub: 'owner-id' },
    'mixed owner claims': { sub: 'owner-id', email: 'owner@example.com' },
    'mixed email': { email: 'owner@example.com' },
    'null email': { email: null },
    'expired': { exp: now - 60 },
    'future issued': { iat: now + 60 },
    'not yet valid': { nbf: now + 60 },
  })) {
    await t.test(name, async () => assert.equal(await verify({ ...claims, ...changed }), false));
  }
  for (const claim of ['exp', 'iat', 'sub', 'type', 'common_name', 'iss', 'aud']) {
    const payload: Record<string, unknown> = { ...claims };
    delete payload[claim];
    assert.equal(await verify(payload), false, `missing ${claim}`);
  }
  const other = await generateKeyPair('RS256');
  assert.equal(await auth.authenticate({ 'cf-access-jwt-assertion': await sign(claims, other.privateKey) }), false);
  assert.equal(await auth.authenticate({ 'cf-access-client-id': 'machine.access', 'cf-access-client-secret': 'raw-secret' }), false);
});

test('Origin validation permits native clients and explicit origins only', () => {
  const auth = createMcpAuthenticator({ LINK_MANAGER_MCP_ALLOWED_ORIGINS: 'https://client.example.com' });
  assert.equal(auth.validOrigin({}), true);
  assert.equal(auth.validOrigin({ origin: 'https://client.example.com' }), true);
  for (const origin of ['null', 'https://evil.example.com', 'https://client.example.com.evil.com', 'https://client.example.com/']) {
    assert.equal(auth.validOrigin({ origin }), false);
  }
  assert.throws(() => createMcpAuthenticator({ LINK_MANAGER_MCP_ALLOWED_ORIGINS: 'https://client.example.com/path' }));
});
