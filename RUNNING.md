# Link Manager - Yerel Çalıştırma Rehberi

## Hızlı Başlangıç

### 1. Backend Başlat (Terminal 1)
```bash
cd link-manager/backend
npm run dev
```
✅ Çalışıyor: http://localhost:3000

### 2. Frontend Başlat (Terminal 2 - YENİ PENCERE)
```bash
cd link-manager/frontend
npm run dev
```
✅ Çalışıyor: http://localhost:5173

### 3. Tarayıcıda Aç
http://localhost:5173

---

## API Test Etme

### Health Check
```bash
curl http://localhost:3000/api/health
```

### Kategori Oluşturma
```bash
curl -X POST http://localhost:3000/api/categories \
  -H "Content-Type: application/json" \
  -d '{"name":"Test Kategori","color":"#6366f1","icon":"Folder"}'
```

### Kategorileri Listeleme
```bash
curl http://localhost:3000/api/categories
```

### Kaynak Ekleme
```bash
curl -X POST http://localhost:3000/api/resources \
  -H "Content-Type: application/json" \
  -d '{"type":"website","title":"Google","url":"https://google.com","description":"Arama motoru"}'
```

### Kaynakları Listeleme
```bash
curl http://localhost:3000/api/resources
```

---

## Önemli Notlar

1. **SQLite Kullanımı**: Yerel geliştirmede otomatik SQLite kullanılır (PostgreSQL gerekmez)
   - Veritabanı dosyası: `link-manager/backend/link-manager.db`
   
2. **Backend Portu**: 3000
   - API: http://localhost:3000/api
   
3. **Frontend Portu**: 5173
   - UI: http://localhost:5173
   
4. **Hot Reload**: Her iki taraf da kod değişikliklerini otomatik algılar

---

## Production (PostgreSQL) için

`.env` dosyasına şunu ekle:
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/linkmanager
```

Ya da Docker ile PostgreSQL:
```bash
docker run -d --name postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=linkmanager \
  -p 5432:5432 \
  postgres:16-alpine
```
