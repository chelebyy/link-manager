# Remote MCP authentication

Use a dedicated public hostname and a Cloudflare Access **Managed OAuth** application.
The application must have an Allow policy for the owner's exact email, no Bypass or
Service Auth policies. Configure short OAuth access tokens (15 minutes) and a bounded
session (24 hours). This feature is currently a Cloudflare beta.

Route only `^/mcp/?$` on that hostname through Cloudflare Tunnel to the backend.
All other origin paths must return 404; Cloudflare serves OAuth discovery and login.
Do not publish the backend port. Keep the browser UI in its existing Access app.

Set `LINK_MANAGER_MCP_AUTH_MODE=cloudflare-access`, the exact team issuer
(`https://TEAM.cloudflareaccess.com`), the **dedicated application's audience**, and
`LINK_MANAGER_MCP_OWNER_EMAIL`. See `.env.production.example`. The server verifies
the RS256 signature, issuer, audience, expiry, issued time and owner identity on the
`Cf-Access-Jwt-Assertion` header. A static MCP key or a client-supplied email header
cannot replace this assertion. Invalid configuration prevents startup; absent
configuration disables MCP. Browser Origin headers are rejected unless their exact
HTTPS origin is explicitly configured. Native MCP clients normally omit Origin.

## Connecting clients

Enter `https://YOUR-MCP-HOST/mcp` as a remote Streamable HTTP MCP server. Use OAuth
with PKCE S256 and resource indicators (RFC 8707). Clients discover authorization
metadata through the 401 challenge or `/.well-known/oauth-protected-resource/mcp`.
No API key is needed. Each client must complete the owner's interactive sign-in.

Enable dynamic client registration for localhost and loopback redirects to support
local clients such as Codex, Claude Code and OpenCode. Cloud clients need their
documented callback URI in Access's redirect allowlist. This list limits redirects,
not the identity of the MCP client. Add other clients' exact callback URIs when
needed; never allow arbitrary HTTPS redirects. Current callbacks:

- Claude: `https://claude.ai/api/mcp/auth_callback`; select automatic registration
  if the client offers a choice between published identity and DCR.
- ChatGPT: `https://chatgpt.com/connector_platform_oauth_redirect` or the specific
  `https://chatgpt.com/connector/oauth/...` callback shown by its setup screen.

Cloudflare's browser integrity checks can reject generic or missing User-Agent
headers. Keep those controls enabled; verify compatibility with the actual client.
Do not turn a failed OAuth login into an authentication bypass.

## Verification and rollback

Run `npm test` and `npm run build` in `backend`. Authentication tests cover wrong
keys, claims, owners, audiences, issuers, time bounds, Origin and key-fallback
rejection. Route tests exercise initialization, listing, reads and writes in a
temporary SQLite database. Before release also test the live OAuth flow, refresh,
revocation, and a read-only tool call. Never use production writes as a smoke test.

Back up the Access app, tunnel configuration, compose files, environment, current
backend image and database before deployment. Preserve production-specific Docker
security patches. Deploy only the backend. To roll back, restore its prior image
and environment and remove the new tunnel ingress; keep the existing browser app
protected. An old static-key connector must be replaced with an OAuth connection.
`legacy-key` is an explicit mode for private deployments only, requires its own key
and rejects mixed Access identity settings. It is never an OAuth fallback.

References: [Cloudflare Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/),
[jose 6.2.13](https://github.com/panva/jose/tree/v6.2.13),
[Claude remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
