import { timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

type Environment = Record<string, string | undefined>;

/** Access is the OAuth server; the origin verifies its signed identity assertion. */
export function createMcpAuthenticator(env: Environment = process.env, keys?: JWTVerifyGetKey) {
  const mode = env.LINK_MANAGER_MCP_AUTH_MODE || 'disabled';
  const issuer = env.LINK_MANAGER_MCP_ACCESS_ISSUER;
  const audience = env.LINK_MANAGER_MCP_ACCESS_AUDIENCE;
  const owner = env.LINK_MANAGER_MCP_OWNER_EMAIL;
  const serviceIdsValue = env.LINK_MANAGER_MCP_SERVICE_CLIENT_IDS || '';
  const serviceIds = new Set(serviceIdsValue.split(',').map((value) => value.trim()).filter(Boolean));
  if (serviceIdsValue && (serviceIds.size === 0 || [...serviceIds].some((id) => !/^[a-zA-Z0-9_-]+\.access$/.test(id)))) {
    throw new Error('MCP service client IDs must be explicit Cloudflare Access client IDs');
  }
  const origins = new Set((env.LINK_MANAGER_MCP_ALLOWED_ORIGINS || '').split(',').filter(Boolean));
  for (const origin of origins) {
    if (new URL(origin).origin !== origin || !origin.startsWith('https://')) {
      throw new Error('MCP allowed origins must be exact HTTPS origins');
    }
  }
  if (mode !== 'cloudflare-access' && (issuer || audience || owner || serviceIdsValue)) {
    throw new Error('MCP Access settings require cloudflare-access mode');
  }
  if (!['disabled', 'legacy-key', 'cloudflare-access'].includes(mode)) {
    throw new Error('Invalid MCP authentication mode');
  }

  let authenticate: (headers: IncomingHttpHeaders) => Promise<boolean>;
  if (mode === 'cloudflare-access') {
    if (!issuer || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)
      || !audience?.trim() || !owner || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(owner)) {
      throw new Error('MCP Access issuer, audience and owner email must be configured');
    }
    const keySet = keys ?? createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`), {
      timeoutDuration: 5000,
      cooldownDuration: 30000,
      cacheMaxAge: 600000,
    });
    authenticate = async (headers) => {
      const assertion = headers['cf-access-jwt-assertion'];
      if (typeof assertion !== 'string' || !assertion || assertion.length > 16384) return false;
      try {
        const { payload } = await jwtVerify(assertion, keySet, {
          issuer,
          audience,
          algorithms: ['RS256'],
          requiredClaims: ['exp', 'iat', 'sub'],
          clockTolerance: 5,
        });
        if (typeof payload.iat !== 'number' || payload.iat > Date.now() / 1000 + 5) return false;
        // Service Auth assertions have an empty subject and identify the machine
        // through signed common_name. Raw service headers never authorize origin requests.
        if (payload.sub === '') {
          return payload.type === 'app' && payload.email === undefined
            && typeof payload.common_name === 'string' && serviceIds.has(payload.common_name);
        }
        return typeof payload.sub === 'string' && payload.sub.trim().length > 0
          && payload.email === owner && payload.common_name === undefined;
      } catch {
        // Never log assertions, keys, or JWT diagnostics containing identity data.
        return false;
      }
    };
  } else if (mode === 'legacy-key') {
    const expected = env.LINK_MANAGER_MCP_KEY;
    if (!expected) throw new Error('MCP legacy-key mode requires LINK_MANAGER_MCP_KEY');
    const expectedBytes = Buffer.from(expected);
    authenticate = async (headers) => {
      const custom = headers['x-link-manager-mcp-key'];
      const bearer = headers.authorization?.startsWith('Bearer ') ? headers.authorization.slice(7).trim() : '';
      const value = typeof custom === 'string' ? custom.trim() : bearer;
      const bytes = Buffer.from(value);
      return bytes.length === expectedBytes.length && timingSafeEqual(bytes, expectedBytes);
    };
  } else {
    authenticate = async () => false;
  }

  return {
    authenticate,
    validOrigin: (headers: IncomingHttpHeaders) => headers.origin === undefined
      || (typeof headers.origin === 'string' && origins.has(headers.origin)),
  };
}
