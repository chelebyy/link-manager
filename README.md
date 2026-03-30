# Link Manager

Dokploy VPS üzerinde çalışan, public erişime açık kaynak yönetim uygulaması.

## Özellikler

- **Public Erişim**: Giriş yapmadan herkes kaynak ekleyebilir, düzenleyebilir, silebilir
- **Kategoriler**: Dinamik kategori oluşturma ve yönetme
- **Kaynak Tipleri**: GitHub repos, Skills, Websites, Notes
- **GitHub Entegrasyonu**: Otomatik sync, versiyon takibi
- **Dark/Light Theme**: hub-repo-tracker ile aynı tema

## Tech Stack

- **Backend**: Fastify + TypeScript + PostgreSQL
- **Frontend**: React 18 + Vite + TailwindCSS + shadcn/ui
- **Deployment**: Docker + Dokploy

## Kurulum

### 1. Bağımlılıkları Yükle

```bash
npm run install:all
```

### 2. Environment Variables

```bash
cp .env.example .env
# .env dosyasını düzenleyin
```

### 3. Veritabanı

PostgreSQL çalışıyor olmalı:

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

### 2. Dokploy'da Yeni Proje Oluştur

### 3. Environment Variables

Dokploy'da şu değişkenleri ayarlayın:

```
DOMAIN=links.yourdomain.com
POSTGRES_PASSWORD=secure_password
GITHUB_TOKEN=ghp_your_token (opsiyonel)
```

### 4. Deploy

```bash
git push origin main
# veya Dokploy UI'dan deploy butonu
```

## API Endpoints

### Categories
- `GET /api/categories` - Listele
- `POST /api/categories` - Oluştur
- `PUT /api/categories/:id` - Güncelle
- `DELETE /api/categories/:id` - Sil

### Resources
- `GET /api/resources` - Listele (filtreleme destekler)
- `POST /api/resources` - Oluştur
- `PATCH /api/resources/:id` - Güncelle
- `DELETE /api/resources/:id` - Sil
- `PATCH /api/resources/:id/favorite` - Favori toggle

### GitHub
- `POST /api/resources/preview-github` - Repo önizleme

## Proje Yapısı

```
link-manager/
├── backend/           # Fastify API
│   ├── src/
│   │   ├── features/  # Categories, Resources, Sync
│   │   └── shared/    # DB, Config, Utils
│   └── Dockerfile
├── frontend/          # React + Vite
│   ├── src/
│   │   ├── components/
│   │   └── contexts/
│   └── Dockerfile
└── docker-compose.yml
```

## Güvenlik

- IP-based rate limiting
- URL validasyonu
- XSS koruması (text content escape)
- CORS kısıtlaması

## Lisans

MIT
