# Remote MCP authentication

Use a dedicated public hostname and a Cloudflare Access **Managed OAuth** application.
The application must have an Allow policy for the owner's exact email and no Bypass
policies. Optional machine access uses the exact Service Auth policy described below.
Configure short OAuth access tokens (15 minutes) and a bounded
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

## Noninteractive clients (no browser login)

Create a dedicated Cloudflare Access service token, then add a **Service Auth**
(`non_identity`) policy to this MCP application selecting only that token's ID.
Do not select "Any Access Service Token" or add a Bypass policy. The service-token
API supports `duration: "forever"` when non-expiring access is explicitly wanted.
Set `LINK_MANAGER_MCP_SERVICE_CLIENT_IDS` to its Client ID (ending in `.access`).
Use commas for multiple individually approved clients; empty disables machine access.
The server accepts only a signed application assertion with this exact `common_name`,
an empty `sub`, and no `email`, after the same signature, issuer, audience and time
checks. Raw client ID/secret headers alone never authorize a direct origin request.
The service identity has the same five existing MCP tool permissions as the owner;
it grants no browser/API access and does not change tool-specific write restrictions.

Clients send `CF-Access-Client-Id` and `CF-Access-Client-Secret` on each request to
the HTTPS MCP endpoint. Store the secret in client credential storage, never in a
URL, repository, frontend bundle or log. Header-capable Codex, Claude Code and
OpenCode clients can use this without OAuth. Clients that cannot send custom
headers must still use OAuth; do not claim all hosted clients support this method.

On Windows, `scripts/mcp-service-headers.ps1` reads a `PSCredential` exported using
`Export-Clixml` by the same Windows user on the same machine. Set its username to
the service Client ID and password to the Client Secret. Protect the file/directory
ACL and place it outside the repository. Codex supports an `http_headers_helper`
command that invokes this script with `-CredentialPath`. It emits secret headers
only to the requesting client's stdout; never run it in a visible terminal or log
its output. This preserves the generic HTTP protocol while encrypting the local
secret at rest. Copy the helper to a stable location before retiring a worktree.

To revoke access, disable/delete the specific service token in Cloudflare and
remove its Client ID from the backend allowlist. Revoke existing application
sessions when immediate invalidation of already-issued assertions is required.
For rotation, rotate that token's secret, update each client's credential storage,
verify a read-only call, then end any previous-secret grace period. Non-expiring
means no scheduled expiry; explicit revocation, secret rotation or disabling still
stops the credential. Retain owner OAuth as a separately authenticated option.

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
protected. An old static-key connector must be replaced with OAuth or the explicitly
scoped Service Auth connection above.
`legacy-key` is an explicit mode for private deployments only, requires its own key
and rejects mixed Access identity settings. It is never an OAuth fallback.

References: [Cloudflare Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/),
[Cloudflare service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/),
[Service token API and non-expiring duration](https://developers.cloudflare.com/api/resources/zero_trust/subresources/access/subresources/service_tokens/methods/create/),
[Codex HTTP header helper](https://learn.chatgpt.com/docs/extend/mcp?surface=cli),
[jose 6.2.13](https://github.com/panva/jose/tree/v6.2.13),
[Claude remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
