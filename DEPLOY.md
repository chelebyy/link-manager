# Dokploy Deployment Guide

Bu doküman, Link Manager uygulamasının Dokploy üzerinde nasıl deploy edileceğini açıklar.

## Ön Gereksinimler

- Dokploy hesabı ve sunucu erişimi
- GitHub repository'si
- Domain (opsiyonel, Dokploy subdomain de verebilir)

## Deployment Adımları

### 1. Repository Hazırlığı

```bash
# GitHub'da yeni repo oluştur veya mevcut repoyu kullan
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/username/link-manager.git
git push -u origin main
```

### 2. Dokploy'da Proje Oluşturma

1. **Dokploy Paneline Giriş Yapın**
   - https://your-dokploy-instance.com

2. **Yeni Proje Oluşturun**
   - Projects → Create Project
   - Project Name: `link-manager`
   - Description: `Public resource sharing platform`

3. **Uygulama Oluşturun**
   - Create Application
   - Name: `link-manager`
   - Type: `Docker Compose`

4. **Repository Bağlayın**
   - Git Provider: GitHub
   - Repository: `username/link-manager`
   - Branch: `main`

### 3. Environment Variables Ayarlama

Dokploy panelinde **Environment** sekmesine gidin ve şu değişkenleri ekleyin:

```env
# Zorunlu
DOMAIN=links.yourdomain.com
POSTGRES_PASSWORD=your_secure_random_password

# Opsiyonel (GitHub entegrasyonu için)
GITHUB_TOKEN=ghp_your_github_personal_access_token
SYNC_INTERVAL_MINUTES=30
```

**GITHUB_TOKEN Nasıl Alınır:**
1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Generate new token
3. Scopes: `repo` (read access)
4. Token'ı kopyalayıp `GITHUB_TOKEN` olarak yapıştırın

### 4. Network Yapılandırması

Dokploy terminalinde veya sunucuda şu komutu çalıştırın:

```bash
docker network create dokploy-network
```

### 5. Deploy Etme

Dokploy panelinde:
1. **Deploy** sekmesine gidin
2. **Deploy** butonuna tıklayın
3. Logları izleyin - her şey başarılı olmalı

### 6. Domain Yapılandırması

1. **Domains** sekmesine gidin
2. **Add Domain** butonuna tıklayın
3. Domain: `links.yourdomain.com`
4. HTTPS: Enabled
5. Let's Encrypt sertifikası otomatik oluşturulacaktır

### 7. Health Check Doğrulama

Deploy başarılı olduktan sonra:

```bash
# Backend health check
curl https://links.yourdomain.com/api/health

# Beklenen yanıt:
{"status":"ok","timestamp":"2026-03-30T..."}
```

## Otomatik Deploy (CI/CD)

Her `git push` işleminde otomatik deploy için webhook ayarlayın:

1. Dokploy panelinde **Webhooks** sekmesi
2. GitHub webhook URL'sini kopyalayın
3. GitHub repo → Settings → Webhooks → Add webhook
4. Payload URL: Dokploy webhook URL
5. Content type: `application/json`
6. Events: Just the push event

## Sorun Giderme

### Backend Bağlantı Hatası

```bash
# Container loglarını kontrol edin
docker logs link-manager-backend

# Database bağlantısını test edin
docker exec -it link-manager-backend sh
# İçeride:
# nc -zv postgres 5432
```

### Frontend API Hatası

`nginx.conf` dosyasında backend host adının doğru olduğundan emin olun:
```nginx
location /api/ {
    proxy_pass http://backend:3000/api/;
    ...
}
```

### Database Başlatma Hatası

```bash
# Postgres container'ını yeniden başlatın
docker-compose restart postgres

# Volume'u temizleyip yeniden başlatın (Dikkat: Veriler silinir!)
docker-compose down -v
docker-compose up -d
```

## Güvenlik Notları

- **POSTGRES_PASSWORD**: Güçlü, rastgele bir şifre kullanın
- **GITHUB_TOKEN**: Repo'ya yazma erişimi vermeyin, sadece okuma yetkisi yeterli
- **DOMAIN**: HTTPS zorunlu tutulmuştur
- **CORS**: Production'da sadece belirli domain'lere izin verilir

## Kaynak Kullanımı

Varsayılan limitler:
- **PostgreSQL**: 512MB RAM, 0.5 CPU
- **Backend**: 512MB RAM, 0.5 CPU  
- **Frontend**: 256MB RAM, 0.25 CPU

Daha yüksek trafik için `docker-compose.yml` içindeki `deploy.resources` bölümünü güncelleyin.

## Yedekleme

### Database Yedekleme

```bash
# Otomatik yedekleme scripti
docker exec link-manager-postgres pg_dump -U postgres linkmanager > backup_$(date +%Y%m%d_%H%M%S).sql
```

### Volume Yedekleme

```bash
# PostgreSQL verilerini yedekle
docker run --rm -v link-manager_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres_backup.tar.gz -C /data .
```

## Güncelleme

Yeni versiyon deploy etmek için:

```bash
git add .
git commit -m "Update: yeni özellikler"
git push origin main
# Otomatik deploy çalışacaktır
```

Veya Dokploy panelinden **Redeploy** butonuna tıklayın.

## Destek

Sorun yaşarsanız:
- Container loglarını kontrol edin
- Dokploy Discord community: https://discord.gg/dokploy
- GitHub Issues: https://github.com/username/link-manager/issues
