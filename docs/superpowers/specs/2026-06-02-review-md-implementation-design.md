# REVIEW.md CRITICAL+HIGH Implementation Design

**Tarih:** 2026-06-02
**Yazar:** Claude Code
**Durum:** Onaylandı (kullanıcı: "workflows başlayabilirsin")
**Kaynak:** `../REVIEW.md` — 48 bulgu (2 CRITICAL + 24 HIGH + 18 MEDIUM + 2 LOW + 5 REFUTED)

## 1. Kapsam

**Bu pass:** 2 CRITICAL + 24 HIGH = 26 bulgu.
**Kapsam dışı (backlog):** 18 MEDIUM + 2 LOW + 5 REFUTED.

### 1.1 Tier Dağılımı

| Tier | ID'ler | Adet |
|------|--------|------|
| **CRITICAL** | BC-001, SEC-02, SEC-06 | 3 |
| **HIGH Backend Correctness** | BC-002, BC-003, BC-004, BC-005, BC-006, BC-008, BC-009 | 7 |
| **HIGH Backend Security** | SEC-03, SEC-05, SEC-10 | 3 |
| **HIGH Frontend Correctness** | F1, F4, F5, F6, F9 | 5 |
| **HIGH UX/A11y** | UX-1, UX-2, UX-3, UX-4, UX-12 | 5 |
| **HIGH Code Quality** | LM-002, LM-003, LM-007 | 3 |
| **Toplam** | | **26** |

## 2. Branch Stratejisi

```
master
  │
  ├─ fix/critical-blockers    [BC-001, SEC-02, SEC-06]
  ├─ fix/backend-correctness  [BC-002..BC-009]
  ├─ fix/backend-security     [SEC-03, SEC-05, SEC-10]
  └─ fix/frontend-quality     [F1, F4, F5, F6, F9, UX-1..UX-12, LM-002, LM-003, LM-007]
```

Her branch bağımsız merge'lenebilir. Sıralı merge önerilir (blockers → correctness → security → frontend).

## 3. Auth Tasarımı (SEC-02)

**Karar:** Environment-based statik bearer token + `@fastify/auth` preHandler.

**Akış:**
- `LINK_MANAGER_API_KEY` env var (256-bit random)
- `backend/src/server.ts` → `@fastify/auth` register, `/api/*` için preHandler (health hariç)
- `verifyApiKey(request, reply, done)` → `Bearer <key>` karşılaştırması
- Frontend `lib/api.ts` → tüm fetch'lere `Authorization: Bearer ${import.meta.env.VITE_API_KEY}` ekle
- Test ortamı: `tests/helpers.ts` otomatik token

**Neden API key yeterli:**
- Reverse proxy zaten public-facing filtreleme yapıyor (varsayım)
- Tam auth (JWT + bcrypt + login) → ayrı sprint
- Middleware swap'la ileride genişletilebilir

## 4. Test Stratejisi

**Mevcut durum:**
- Backend: `tsx --test tests/**/*.test.ts` → `backend/tests/` BOŞ
- Frontend: `vitest run` + `setup.ts` → sadece `resource-view.test.ts`
- Pattern: `fix: <X>` → `test: add <X> regression coverage` (son 2 commit kanıtı)

**Strateji:** Fix başına regression test.

- Backend fix'leri → `backend/tests/<area>.test.ts` dosyasına test ekle
- Frontend fix'leri → `frontend/src/tests/<component>.test.ts(x)` ekle
- Test pattern: AAA (Arrange, Act, Assert), supertest-like fastify injection
- Her agent (subagent) kendi testini yazar, çalıştırır, fix'ler, tekrar çalıştırır

**Verification gate:** Her branch sonunda:
1. `npm test` (backend) — tüm testler geçmeli
2. `npm test` (frontend) — tüm testler geçmeli
3. `npm run build` (frontend) — tsc + vite build geçmeli
4. Manuel smoke: `npm run dev` → 5 dakikalık happy-path (load → list → add → edit → delete → export)

## 5. Implementation Sırası

1. **fix/critical-blockers** (ilk) — SQL injection fix + auth + fail-fast config. Diğer her şey bu temelin üstünde.
2. **fix/backend-correctness** — transaction + 404 + CTE + reorder. Auth sonrası anlamlı.
3. **fix/backend-security** — rate-limit + helmet + error sanitize. Auth'la bağımsız savunma katmanı.
4. **fix/frontend-quality** — UX/a11y/toast/clipboard. Backend kararlı olduktan sonra.

## 6. Workflow Yapısı

Her workflow phase'i bir branch üzerinde çalışır. Her agent:
- Spesifik bir bulgu (örn. BC-001) için scope'lanır
- Önce regression test yazar (FAIL)
- Fix'i implemente eder
- Test'i çalıştırır (PASS)
- Tüm test suite'i çalıştırır (regresyon yok)
- `fix(<scope>): <id> <description>` formatında commit

**Workflow script mimarisi:**
- Phase 1: Setup (1 agent) → branch + design doc
- Phase 2-5: Per branch (pipeline of agents, birer bulgu)
- Phase 6: Verification (1 agent)

## 7. Riskler ve Telafi

| Risk | Telafi |
|------|--------|
| Subagent birbirinin işini bozar | Pipeline sequential, her agent commit ondan önceki üzerine kurulu |
| Test suite bozulur | Her agent `npm test` çalıştırmak zorunda; geçmeden commit yok |
| Frontend breaking değişiklik | API key header eklenmesi → tüm fetch'leri güncelle. agentType general-purpose, edit izinli |
| SEC-02 frontend'i kırar | `lib/api.ts` wrapper pattern; agent'ın testi SSR/CSR'de çalışmalı |
| `package.json` değişimi gerekebilir | `@fastify/auth`, `@fastify/rate-limit`, `@fastify/helmet`, `bcrypt` (gelecek) — her agent önce dependency eklemeyi dener, sonra implement eder |

## 8. Tanımlanmış Tamamlanma Kriterleri (DoD)

- [ ] 4 branch master'a merge'lendi
- [ ] Backend: `npm test` → 0 fail
- [ ] Frontend: `npm test` → 0 fail
- [ ] Frontend: `npm run build` → 0 error
- [ ] Dev server: load → list → add → edit → delete → export happy-path geçer
- [ ] `link-manager/README.md` veya `RELEASE_NOTES.md` özet (opsiyonel)

## 9. Won't Fix (Bu Pass'te)

- BC-007 (REFUTED — zaten düşürüldü)
- F2, F8, F10, F11, F13, F14, F16 (PARTIAL/REFUTED veya MEDIUM)
- UX-5, UX-6, UX-7, UX-8, UX-9, UX-10, UX-11, UX-13, UX-14, UX-15
- LM-001, LM-005, LM-006, LM-008, LM-009, LM-010, LM-011, LM-012, LM-013, LM-014, LM-015, LM-016, LM-017
- Tüm MEDIUM ve LOW

Bunlar ayrı bir backlog pass'inde.
