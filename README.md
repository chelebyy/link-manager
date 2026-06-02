# Link Manager

Dokploy VPS üzerinde çalışan, API key ile korumalı kaynak yönetim uygulaması.

## Özellikler

- **API Key Auth**: Tüm `/api/*` endpoint'ler (sağlık kontrolü hariç) Bearer token ile korunur
- **Kategoriler**: Dinamik kategori oluşturma ve yönetme
- **Kaynak Tipleri**: GitHub repos, Skills, Websites, Notes
- **GitHub Entegrasyonu**: Otomatik sync, versiyon takibi
- **Dark/Light Theme**: hub-repo-tracker ile aynı tema

## Tech Stack

- **Backend**: Fastify + TypeScript + PostgreSQL (SQLite dev fallback)
- **Frontend**: React 18 + Vite + TailwindCSS + shadcn/ui
- **Deployment**: Docker + Dokploy

## Kurulum

### 1. Bağımlılıkları Yükle

```bash
npm run install:all
```

### 2. Environment Variables

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
# .env dosyalarını düzenleyin
```

Backend ve frontend aynı API key'i paylaşmalı (`LINK_MANAGER_API_KEY` == `VITE_API_KEY`).

```bash
# 256-bit rastgele key üret
openssl rand -hex 32
```

### 3. Veritabanı

PostgreSQL çalışıyor olmalı (ya da DATABASE_URL'siz development modunda SQLite kullanılır):

```bash
# Docker ile PostgreSQL
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=linkmanager \
  -p 5432:5432 \
  postgres:16-alpine
```

### 4. Geliştirme Modu

```bash
npm run dev
```

Backend: http://localhost:3000  
Frontend: http://localhost:5173

## Dokploy Deployment

### 1. Repository'i GitHub'a Push Et

### 2. Dokploy'da Proje Ayarla

Dokploy `dokploy.json` dosyasını kullanır — push sonrası servisler otomatik oluşur.

### 3. Environment Variables (Dokploy Secrets)

**ZORUNLU — deploy'dan ÖNCE ayarlanmazsa site kırılır:**

| Değişken | Nerede | Açıklama |
|----------|--------|----------|
| `POSTGRES_PASSWORD` | postgres servisi | Veritabanı şifresi |
| `LINK_MANAGER_API_KEY` | backend servisi | Backend'in beklediği Bearer token |
| `VITE_API_KEY` | frontend servisi (build-time) | Frontend'in gönderdiği Bearer token. `LINK_MANAGER_API_KEY` ile **aynı değer** olmalı |
| `GITHUB_TOKEN` | backend servisi (opsiyonel) | GitHub API rate limit için |
| `DOMAIN` | frontend servisi | Public domain adresi |

`VITE_API_KEY` build-time bir değişkendir — değer değişirse frontend imajı yeniden build olmalıdır (push yeterli).

API key üretmek için:

```bash
openssl rand -hex 32
# Çıktı hem LINK_MANAGER_API_KEY hem VITE_API_KEY olarak aynı değerle ayarlanmalı
```

### 4. Deploy

```bash
git push origin master
# Dokploy push'u algılar ve otomatik deploy başlatır
```

## API Endpoints

> 🔒 Tüm endpoint'ler `Authorization: Bearer <VITE_API_KEY>` header'ı gerektirir. `/api/health` istisna.

### Health
- `GET /api/health` — Servis sağlık kontrolü (auth gerektirmez)

### Categories
- `GET /api/categories` — Listele
- `POST /api/categories` — Oluştur
- `PUT /api/categories/:id` — Güncelle
- `DELETE /api/categories/:id` — Sil (404 yoksa 404 döner; transaction-atomik)

### Resources
- `GET /api/resources` — Listele (filtreleme destekler; sort/order whitelist uygulanır)
- `POST /api/resources` — Oluştur
- `PATCH /api/resources/:id` — Güncelle
- `DELETE /api/resources/:id` — Sil (404 yoksa 404 döner)
- `PATCH /api/resources/:id/favorite` — Favori toggle
- `POST /api/resources/reorder` — Toplu sıralama (Zod validated)

### Data
- `POST /api/data/import` — Atomik import (üç tablo tek transaction'da)
- `GET /api/data/export` — Tüm verileri dışa aktar

### GitHub
- `POST /api/resources/preview-github` — Repo önizleme
- `GET /api/sync/latest-commit` — ETag korumalı son commit sorgusu

## Proje Yapısı

```
link-manager/
├── backend/           # Fastify API
│   ├── src/
│   │   ├── features/  # Categories, Resources, Sync
│   │   └── shared/    # DB, Config, Utils
│   ├── tests/         # node:test regression suite
│   └── Dockerfile
├── frontend/          # React + Vite
│   ├── src/
│   │   ├── components/
│   │   └── tests/     # vitest regression suite
│   └── Dockerfile
├── docs/superpowers/specs/  # Tasarım dökümanları
└── dokploy.json
```

## Güvenlik

| Katman | Uygulama |
|--------|----------|
| **Authentication** | `@fastify/auth` Bearer token (env-based API key); `/api/health` ve CORS preflight muaf |
| **SQL Injection** | Prepared statements (param()) + sort/order whitelist (BC-001) |
| **Rate Limiting** | 60 req / 15 dakika / IP (`@fastify/rate-limit`) |
| **Security Headers** | `@fastify/helmet` (X-Frame-Options, HSTS, X-Content-Type-Options, vb.) |
| **Error Sanitization** | Üretimde 5xx hata mesajları genelleştirilmiş "Internal Server Error" döner |
| **Fail-Fast Config** | Üretimde `DATABASE_URL` yoksa uygulama başlamaz |
| **Transactions** | `/import`, `DELETE /categories`, `/reorder` transaction-atomik |
| **CORS** | `credentials: true`, env-based origin (production fallback `false`) |
| **XSS** | React default escaping + shadcn/ui primitives |

> ⚠️ **Not:** Bu projede tam kullanıcı auth (login/register/JWT/bcrypt) yerine API key kullanılır. Reverse proxy (nginx/Caddy) zaten public-facing filtreleme yaptığı varsayılır. Tam auth ileride eklenecek.

## Test

```bash
# Backend (node:test)
cd backend && npm test

# Frontend (vitest)
cd frontend && npm test

# Backend build
cd backend && npm run build

# Frontend build
cd frontend && npm run build
```

## Lisans

MIT
