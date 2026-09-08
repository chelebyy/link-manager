# Link Manager WebMCP

Güncelleme: 8 Eylül 2026. WebMCP yalnız okuma, gezinme ve dışa aktarma sunar.
Bu kapsam normal web arayüzünü değiştirmez: elle ekleme, düzenleme, silme,
favori, taşıma, sıralama ve JSON içe aktarma kullanılmaya devam eder.

## Araçlar

| Araç | İşlev |
| --- | --- |
| `list_resource_types` | Kartları, kimliklerini ve görünüm alanlarını listeler. |
| `list_categories` | Kategorileri, kimliklerini ve bağlı kartları listeler. |
| `search_resources` | Başlık, URL ve açıklamada arar; kart, kategori ve favori filtresi uygular. |
| `get_resource_details` | Kaydın detayını, metadata ve senkronizasyon özetini okur. |
| `open_view` | Kart/kategori ve arama/favori görünümünü ekranda açar. |
| `export_data` | Tüm verileri veya filtrelenmiş kaynakları JSON/Markdown olarak indirir. |

Tam araç listesi altı isimden oluşur. Ekleme, düzenleme, silme, favori değiştirme,
taşıma, sıralama, içe aktarma ve içe aktarma durumu araçları yoktur. Araçların
tamamı `readOnlyHint: true` ve `consequentialHint: false` bildirir. Veri değişikliği
yapan API çağrıları WebMCP köprüsünde bulunmaz.

`search_resources` ekranı değiştirmez. `open_view` gezinme yapar, kayıtlı veriyi
değiştirmez. Ana sayfada favori görünümü yoktur; favori araması için
`search_resources` kullanılabilir. Arama varsayılan 50, en fazla 100 kayıt döndürür;
`offset` ve `next_offset` ile devam edilir. Kaynak API'si kartın kayıtlarını
bütünüyle döndürür; araç sonuçları bu veri üzerinde filtrelenir ve sınırlandırılır.

`category_id: null`, aramada kategorisiz kaynakları seçer; gezinmede kartın
“Tümü” görünümüdür. Detay/kategori kimliklerinde PostgreSQL BIGINT metinleri
güvenli tam sayıya, SQLite boolean/metadata alanları ortak tipe dönüştürülür.

## AI erişimi ve tarayıcı desteği

İlk açılışta AI erişimi kapalıdır. Yalnız açıkça kaydedilmiş `true` tercihi
otomatik etkinleşir. Kullanıcı “AI erişimini aç/kapat” düğmesiyle tercihini
değiştirebilir. Saklama başarısızsa tercih yalnız o sekmede uygulanır.

- **Hazır:** Altı araç kaydedilmiştir.
- **Kapalı:** Hiçbir araç kayıtlı değildir.
- **Tarayıcı desteklemiyor:** Normal site kullanılabilir, WebMCP kaydı yapılmaz.
- **Bağlantı kurulamadı:** Kısmen kaydedilen araçlar da kaldırılır.

`document.modelContext.registerTool()` ve `AbortSignal` kullanılır; eski
`navigator.modelContext` sözleşmesine veya polyfill'e geçiş yapılmaz. AI erişimini
kapatma ve bileşeni kaldırma araç kayıtlarını iptal eder; bekleyen okumadan sonra
gezinme/indirme başlatılmaz. Diğer sekmeler tercihi yeniden yüklenince okur.

Araç çıktılarını kaynak içerikleri nedeniyle güvenilmeyen veri olarak ele alın.
Girdi şemaları ayrıca doğrulanır; mevcut backend kimlik doğrulaması korunur.

## İstek kotası

Önceki 10 saniyelik genel polling, üç aktif sorguda 15 dakikada yaklaşık 270
okuma üretip 60 istek kotasını kullanıcı işlem yapmasa da tüketebiliyordu.

- Normal sorgular 60 saniyede bir yenilenir; arka planda polling yapılmaz.
- Cache tazelik süresi 30 saniyedir; elle yapılan başarılı yazmaların mevcut
  sorgu invalidation davranışı korunur.
- `429` ve diğer 4xx yanıtları otomatik retry edilmez. `429` sonrasında polling
  en az 60 saniye veya daha uzunsa sunucunun `Retry-After` süresi kadar bekler.
- `/api/` GET/HEAD uçlarının her biri IP başına 120 istek/dakika ile sınırlıdır.
- Varsayılan yazma bütçesi 60 istek/15 dakika, normal JSON içe aktarma bütçesi
  20 istek/15 dakika olarak korunur. Health kontrolü istisnası değişmez.

Forwarded header'lara koşulsuz güven eklenmedi. Sunucu gerçek bağlantı IP'sini
kullanır; proxy arkasındaki istemciler aynı uç için kotayı paylaşabilir. Çok sayıda
eşzamanlı kullanıcı için güvenilir proxy zinciri ayrıca ölçülerek yapılandırılmalıdır.

## JSON/Markdown doğrulaması

Canlı `https://link.cheleby.qzz.io/` üzerinde normal Export/Markdown düğmeleri ve
WebMCP `export_data` çağrıları gerçek dosyalar üretti. Chrome DevTools indirme
olayında `completed` ve yerel dosya içeriği birlikte kontrol edildi:

| Yol | Sonuç |
| --- | --- |
| Normal JSON | Geçerli JSON, 15 kart / 119 kategori / 525 kaynak ve revision; 295394 bayt. |
| Normal Markdown | 108899 bayt; kaynak başlıkları ve Türkçe karakterler doğru. |
| WebMCP filtreli JSON | 1 context-mode kaydı, geçerli JSON ve Türkçe açıklama; 1577 bayt. |
| WebMCP filtreli Markdown | Aynı kayıt ve Türkçe açıklama; 427 bayt, indirme completed. |

Önceki `waitForEvent('download')` zaman aşımı tek başına ürün hatası değildi;
desteklenen CDP olayları ve diskteki çıktılar ile belirsizlik giderildi. İndirme
yardımcılarında değişiklik gerekmedi. Bu canlı kanıt daraltma dağıtılmadan önceki
sürüme aittir; dışa aktarma ve dosya oluşturma yolu bu değişiklikte korunmuştur.

Normal JSON içe aktarma revision/transaction korumaları sürer. WebMCP içe aktarma
tamamen kaldırıldığı için önceki AI onay önizlemesi ve ilişkili durum akışı yoktur.
Canlı veride daha önce gözlenen ilişki doğrulama bulgusu otomatik veri düzeltmesi
yapıldığı anlamına gelmez; bu çalışma canlı kayıtları değiştirmez.
