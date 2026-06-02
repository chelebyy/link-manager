# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] — 2026-06-02

### Security (BREAKING CHANGES)

- **BC-001 (CRITICAL)** — Whitelist sort/order query parameters on `GET /api/resources`. Unknown values return HTTP 400. No more SQL injection vector.
- **SEC-02 (CRITICAL)** — Environment-based API key authentication. All `/api/*` endpoints (except `/api/health` and CORS preflight) now require `Authorization: Bearer <LINK_MANAGER_API_KEY>`. The frontend automatically sends this header on every fetch.
- **SEC-03** — IP-based rate limiting: 60 requests per 15 minutes per IP, keyed by `request.ip`. `/api/health` exempt.
- **SEC-05** — Error message sanitization in production. 5xx errors no longer leak `error.message` to clients; full error still logged server-side.
- **SEC-06** — Removed hardcoded default Postgres credentials. Application fails fast in production if `DATABASE_URL` is missing.
- **SEC-10** — Helmet security headers (X-Frame-Options, HSTS, X-Content-Type-Options, etc.). `0.0.0.0` bind preserved for Docker.

### Backend Correctness

- **BC-002 + BC-003** — `/api/data/import` now wraps all three table writes (resource_types, categories, resources) in a single transaction. Silent `.catch()` handlers replaced with `request.log.error` + re-throw. Per-step failures roll back atomically.
- **BC-004** — SQLite dispatcher now recognizes `WITH` (CTE) and `RETURNING` prefixes. CTEs route to `stmt.all()` instead of falling through to `stmt.run()`.
- **BC-005** — `DELETE /api/resources/:id` returns 404 when the resource does not exist (was always 204). Also validates id format (non-numeric → 400).
- **BC-006** — `DELETE /api/categories/:id` now atomic via `withTransaction`; returns 404 when the category does not exist; validates id format.
- **BC-008** — `getLatestCommit` preserves the ETag on 304/empty responses. The polling client can now send `If-None-Match` on the next call.
- **BC-009** — `POST /api/resources/reorder` validates input with Zod (array of positive integers, no duplicates) and wraps updates in a transaction. Returns 400 with a clear error on validation failure.

### Frontend Correctness

- **F1** — `URL.revokeObjectURL` deferred via `setTimeout(..., 0)` to prevent Firefox Bugzilla 1424255 download race. Both `downloadMarkdown` and the new `downloadJson` helper use the deferral.
- **F4** — `visibleResources` `useEffect` dependency changed from `length` to the array reference. Same-length reorders (e.g., drag-and-drop) now trigger the parent callback.
- **F5** — `navigator.clipboard?.writeText(...).catch(...)` replaced with an explicit guard. Copy buttons no longer throw on insecure contexts where `navigator.clipboard` is undefined.
- **F6** — `draggedId` state always resets on drag end / cancelled drop. No more "stuck dragging" state after a drop outside any valid target.
- **F9** — `AddResourceDialog` submit button and URL input disabled while the duplicate-URL check is in flight. Inline "Mevcut URL'ler kontrol ediliyor..." indicator added.

### UX / Accessibility

- **UX-1** — Touch users now have a working reorder path via `Move-Up` / `Move-Down` buttons (visible on coarse pointers). Desktop keeps native HTML5 drag-and-drop.
- **UX-2** — Resource list rows are now keyboard accessible: `role="button"`, `tabIndex={0}`, and `onKeyDown` for Enter/Space.
- **UX-3** — `MobileMenu` implements focus trap, Escape-to-close, and return-focus to the trigger. `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on the panel.
- **UX-4** — `ToastBanner` exposes `role="region"` + `aria-live="polite"` on the container, and per-toast `role="status"` (success/info) or `role="alert"` + `aria-live="assertive"` (errors).
- **UX-12** — `CategoryCard` keyboard accessible: `role="button"`, `tabIndex={0}`, Enter/Space activate.

### Code Quality

- **LM-002** — Mutation errors (create/update/delete) are now surfaced to the user via the existing toast/notification system instead of being silently `console.error`'d. Files: `AddResourceDialog`, `CategoryManager`, `ResourceTypeManager`, `ResourceList`.
- **LM-003** — Zod schemas for the `resources` and `sync` request bodies/queries. The seven `as any` request casts removed. Validation errors return 400 with a clear message.
- **LM-007** — `db.isPostgres` is now the single source of truth for dialect detection. The seven duplicated `process.env.DATABASE_URL?.includes('postgresql')` checks removed from feature routes.

### Test Coverage

- Backend: 12 → 86 tests (4 new files: `auth`, `categories-delete`, `config`, `dialect`, `error-sanitize`, `github-client`, `import-transaction`, `rate-limit`, `resources-delete`, `resources-reorder`, `resources-sort`, `security-headers`, `sqlite-dispatcher`, `zod-validation`).
- Frontend: 1 → 26 tests (7 new files: `AddResourceDialog`, `CategoryGrid`, `MobileMenu`, `ResourceList`, `mutation-errors`, `revoke-object-url`, `toast-banner`).

### Documentation

- `docs/superpowers/specs/2026-06-02-review-md-implementation-design.md` — Design document for this pass.
- `CHANGELOG.md` — This file.

## Migration Notes

### Required: Set `LINK_MANAGER_API_KEY` and `VITE_API_KEY` before deploy

Both environment variables must be set to the same value (or pair values, but they MUST match) for the frontend to authenticate with the backend.

Generate a key:

```bash
openssl rand -hex 32
```

In Dokploy, set the following project-level secrets:

- `LINK_MANAGER_API_KEY` — backend reads this, expects `Authorization: Bearer <value>` on every `/api/*` call except `/api/health`.
- `VITE_API_KEY` — frontend reads this at build time and embeds it in the bundle. The value MUST equal `LINK_MANAGER_API_KEY`.

`VITE_API_KEY` is a build-time variable. After changing it in Dokploy, the frontend image must be rebuilt (push to the repo will trigger a rebuild).

### Behavior changes

- All endpoints other than `/api/health` now return 401 without a valid `Authorization` header.
- The frontend now sends `Authorization: Bearer <VITE_API_KEY>` on every API call. If you run the frontend in development without setting `VITE_API_KEY` (or set it to a value that does not match the backend's `LINK_MANAGER_API_KEY`), the UI will appear to load but every action will fail with 401.
- `/api/data/import` is now atomic: a single bad row rolls back the entire import. Previously, partial imports were possible.
- `DELETE /api/resources/:id` and `DELETE /api/categories/:id` now return 404 for non-existent ids. If your client treats all 2xx as success, it will still work, but error-handling paths need to be ready for 404.

### Rollback

Each finding is a separate commit, all on `fix/critical-blockers`, `fix/backend-correctness`, `fix/backend-security`, and `fix/frontend-quality` (each merged with `--no-ff` into master). To roll back a specific finding, revert its merge commit or cherry-pick-revert its feature commit. The most security-sensitive change (SEC-02) is the only one that requires coordinated key changes to roll back without breaking the auth flow.
