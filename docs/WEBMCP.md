# Link Manager WebMCP

Tarih: 8 Eylül 2026. Durum: yerel uygulama ve testler tamamlandı; commit, push, merge veya canlı dağıtım yapılmadı.

## Onaylanan kapsam

WebMCP, mevcut site işlemlerini destekleyen tarayıcıdaki AI istemcisine açar. Ayrı bir MCP sunucusu, AI sağlayıcısı veya bulut hizmeti eklenmedi. Mevcut Fastify API, Bearer kimlik doğrulama ve Dokploy dağıtım yolu kullanılır.

Kaynak, kategori ve kart için **silme aracı yoktur**. Bu kısıt WebMCP araç yüzeyi içindir; mevcut elle kullanılan silme ekranları/API'leri değiştirilmedi.

| Araç | İşlev |
| --- | --- |
| `list_resource_types` | Kartları ve kimliklerini listeler. |
| `list_categories` | Kategorileri, bağlı kartları ve kimliklerini listeler. |
| `search_resources` | Başlık, URL ve açıklamada arar; kart, kategori ve favori filtresi uygular. |
| `get_resource_details` | Kaydın tüm dönen alanlarını, metadata ve mevcut senkronizasyon özetini verir. |
| `create_resource` | Kaynak ekler. Notlarda URL `null` olabilir; bağlantılar HTTP(S) olmalıdır. |
| `update_resource` | Verilen başlık, URL veya açıklama alanlarını değiştirir; diğer alanları korur. |
| `set_resource_favorite` | Favoriyi açıkça `true` veya `false` yapar. |
| `move_resources` | Bir veya birden çok kaynağı kart/kategoriye taşır. |
| `create_category` | Mevcut karta kategori ekler. |
| `update_category` | Kategori adını, rengini ve simgesini düzenler. |
| `create_resource_type` | Kart ekler; kimliği backend üretir. |
| `update_resource_type` | Kartın adını, rengini, simgesini ve açıklamasını düzenler. |
| `reorder_resources` | Kaynakların kayıtlı sırasını değiştirir; favoriler önce gösterilir. |
| `reorder_categories` | Kategori sıra bilgisini kaydeder; mevcut alfabetik ekran sıralaması devam eder. |
| `reorder_resource_types` | Kartların sırasını değiştirir. |
| `open_view` | Kart/kategori ve arama/favori görünümünü ekranda açar. |
| `export_data` | Tüm veriler veya filtrelenmiş kaynaklar için JSON/Markdown oluşturur ve indirmeyi başlatmayı dener. |
| `import_data` | JSON önizlemesini açar; işlem kimliğiyle `awaiting_confirmation` döndürür. |
| `get_import_status` | Son içe aktarmanın gerçek durumunu okur; onay vermez. |

Arama ekranı değiştirmez. `open_view` yalnızca açıkça istendiğinde gezinir. Başarılı veri değişiklikleri kaynak, kategori ve kart sorgularını yeniler. Veri yazımı başarılı olup ekran yenilemesi başarısızsa işlem başarısız gibi gösterilmez.

Örnek istekler:

- “AI araçlarını ara, sadece favorilerimi göster.”
- “Bu bağlantıyı şu kategoriye ekle.”
- “Bu kaynağın sadece açıklamasını değiştir.”
- “Yeni bir AI Agents kartı ve altında Araçlar kategorisi oluştur.”
- “Şu kaynakları Security kategorisine taşı.”
- “Security kategorisini ekranda aç.”
- “Bu kartı Markdown olarak dışa aktar.”
- “Bu JSON'u içe aktarma önizlemesine getir.”

## Tarayıcı ve kullanım

Entegrasyon güncel `document.modelContext.registerTool()` sözleşmesini kullanır. `AbortSignal` ile kayıtlar kaldırılır. Eski `navigator.modelContext` sözleşmesine veya polyfill'e otomatik geçiş yapılmaz.

Sayfanın üst kısmındaki durum:

- **Hazır:** Araç kayıtları tamamlandı.
- **Tarayıcı desteklemiyor:** Normal site kullanılabilir, WebMCP kaydı yapılmaz.
- **Kapalı:** Kullanıcı AI erişimini kapattı.
- **Bağlantı kurulamadı:** Kısmen eklenen araçlar da kaldırıldı.

“AI erişimini kapat/aç” tercihi aynı site için tarayıcıda saklanır. Kapatma, o sekmedeki araçları kaldırır ve henüz onaylanmamış içe aktarmayı iptal eder. Önceden açılmış diğer sekmeler bu tercihi yeniden yüklenince okur. Zaten sunucuya gönderilmiş bir istek geri alınmış sayılmaz.

Siteye bu kodun dağıtılması tek başına her AI ürününü uyumlu hale getirmez. Kullanılan tarayıcı/istemci `document.modelContext` sözleşmesini desteklemelidir. Güncel deneysel destek koşulları için [Chrome WebMCP dokümanı](https://developer.chrome.com/docs/ai/webmcp/imperative-api) esas alınmalıdır.

## JSON içe aktarma

1. AI, `import_data` aracına `json` metnini verir.
2. Yapı, kimlikler ve kart/kategori ilişkileri doğrulanır.
3. Ekranda kayıt adetleri, etkilenecek mevcut kayıtlar ve gönderilecek JSON gösterilir.
4. Araç hemen `request_id` ve `awaiting_confirmation` döndürür. Bu sonuç veri yazıldığı anlamına gelmez.
5. Kullanıcı sitede **Onayla ve içe aktar** veya **İptal** seçer. Onay beş dakika içinde verilmezse istek iptal olur.
6. AI, aynı kimlikle `get_import_status` çağırır. Yalnızca **`completed`** başarılı içe aktarmayı ifade eder.

Diğer durumlar `importing`, `cancelled` ve `failed` olabilir. Bir sayfa oturumunda yalnızca son isteğin durumu tutulur. Yenileme veya AI erişiminin kapatılması bu oturumu sonlandırır; kesilen bir istekten sonra tekrar yazmadan önce mevcut veriler kontrol edilmelidir.

Onay bir araç parametresiyle verilemez. Bekleyen veya yazılmakta olan içe aktarma varken aynı WebMCP oturumundaki diğer yazma araçları reddedilir. Önizleme `/api/data/export` yanıtındaki `revision` değerini saklar; kullanıcı onayından sonra aynı değer `expected_revision` olarak gönderilir. Sunucu veri sürümünü ve yazımı aynı transaction içinde kontrol eder. Önizleme eskimişse HTTP 409 döner, hiçbir içe aktarma kaydı yazılmaz ve yeni önizleme/onay gerekir. Sürümü eksik veya biçimi bozuk istekler HTTP 428 ile reddedilir; otomatik yeniden deneme yapılmaz.

PostgreSQL'de dışa aktarma üç tabloyu SHARE, içe aktarma SHARE ROW EXCLUSIVE kilidiyle tutar. READ COMMITTED altında kilit alındıktan sonra okunduğu için bekleme sırasında commit olan değişiklik de görülür. Bu kilitler doğrudan SQL kullanan yazarlara da uygulanır; en fazla 10 saniye kilit beklenir. SQLite'da BEGIN IMMEDIATE ve paylaşılan bağlantı kuyruğu kullanılır; başka istekler içe aktarma transaction'ına karışamaz. Sürüm tüm kart/kategori/kaynak içeriğinin özetidir: içe aktarılmayan bir kaydın değişmesi de yeni onay gerektirir. Büyük veri kümelerinde bu okuma/kilitleme maliyeti ayrıca ölçülmelidir.

**API uyumluluğu:** Backend ve frontend birlikte güncellenmelidir. `/api/data/import` kullanan harici istemciler önce hedef sunucudan `/api/data/export` okuyup `revision` değerini `expected_revision` alanına koymalıdır. Eski yedekteki sürüm kullanılmaz. Normal dosya yükleme akışı güncel hedef sürümünü otomatik okur; WebMCP ise onaylanan önizlemenin sürümünü değiştirmeden kullanır. Ek bir şema migrasyonu gerekmez.

İçe aktarma, mevcut backend davranışı gibi kimliğe göre ekleme/güncelleme yapar. Aynı kimlikteki alanların üzerine yazılır; dosyada olmayan kayıtlar silinmez. SQLite tarafındaki kategori/kart `INSERT OR REPLACE` işlemleri `ON CONFLICT(id) DO UPDATE` olarak düzeltildi. Böylece kategori güncellemesi, dosyada olmayan kaynakların kategori bağını koparmaz; başka kimlikteki eşsiz ad çakışması kayıt silerek çözülmez.

PostgreSQL'de mevcut kaynaklar UPDATE ile yazılır; INSERT öncesi URL tetikleyicisi artık aynı kaydın yeniden içe aktarılmasını yanlışlıkla engellemez. Yüksek kategori/kaynak kimlikleri içe aktarıldığında BIGSERIAL sayaçları ileri alınır; sonraki normal ekleme eski kimliklerle çakışmaz.

Sınırlar:

- En fazla 750 KB UTF-8 JSON ve her koleksiyonda 500 kayıt.
- `resourceTypes`, `categories`, `resources` dizileri bulunmalı; kullanılmayanlar boş olabilir.
- Her satırda güncellenecek temel alanlar eksiksiz bulunmalıdır. Eksik alanların sessizce varsayılanlarla değiştirilmesi önlenir.
- PostgreSQL BIGINT kimlikleri ve SQLite `0/1` boolean / JSON metni farkları normalize edilir.
- Başka bir veritabanından gelen aynı sayısal kimlikler mevcut kayıtların üzerine yazabilir; önizlemedeki mevcut kayıtlar kontrol edilmelidir.

## Diğer sınırlar

- Arama varsayılan 50, en fazla 100 kayıt döndürür; `offset` ve `next_offset` ile devam edilir. Mevcut API sunucu tarafında sayfalama sağlamadığından kartın kaynakları tarayıcıya bütünüyle alınır.
- `search_resources` için `category_id: null` kategorisiz kaynakları seçer. `open_view` için kategori verilmemesi veya `null`, kartın “Tümü” görünümüdür. Ana sayfada yalnız favorileri gösterecek görünüm bulunmaz; bu durumda `search_resources` kullanılmalıdır.
- Kartlar arasında taşımada kategori verilmezse veya `null` ise mevcut backend kaynak kategori adını hedef karta eşler/gerekirse oluşturur. Aynı kart içinde `null`, kategori bağını kaldırır.
- Tool çıktıları kullanıcı kaynakları içerdiğinden güvenilmeyen içerik olarak işaretlenir. Girdi şemaları araç içinde de doğrulanır; backend kimlik doğrulaması ayrıca geçerlidir.
- İptal, gönderilmemiş yazımı durdurur. HTTP isteği gönderildikten sonra geri alma garantisi yoktur; otomatik yazma tekrarı yapılmaz.
- Dışa aktarma sonucu `download_requested` bildirir; bu, istemcinin dosyayı diske kaydettiğine dair bir teslim makbuzu değildir.

## Doğrulama — 8 Eylül 2026

| Kontrol | Sonuç |
| --- | --- |
| Frontend testleri | 13 dosya, 74 test geçti. Önizleme sürümü, HTTP 409/428 ve form açma/kapatma/kayıt değiştirme regresyonları dahil. |
| Backend testleri | 98 test geçti; SQLite eski sürüm, eşzamanlı içe aktarma ve kısmi kategori düzenleme koruması dahil. PostgreSQL kabulü ayrı çalıştırıldı. |
| Frontend üretim derlemesi | Geçti. |
| Backend TypeScript derlemesi | Geçti. |
| Docker Compose yapılandırması | `docker compose config -q` geçti; mevcut `version` alanı için eski kullanım uyarısı var. Docker imaj derlemesi çalıştırılmadı. |
| Değişen frontend dosyalarında ESLint | Geçti. |
| Tüm frontend ESLint | `--max-warnings=0` ile geçti: sıfır hata ve sıfır uyarı. Form state'i anahtarla sıfırlanıyor; toplu taşıma varsayılanı render sırasında hesaplanıyor. Mobil menü odak temizliği sabitlendi; Radix bileşenleri doğrudan yeniden dışa aktarılıyor. |
| Tarayıcı WebMCP keşfi | Yerel Codex tarayıcısı 19 aracı keşfetti. |
| Tarayıcı + gerçek yerel API | Kart/kategori/kaynak ekleme, düzenleme, favori, arama, detay, taşıma, gezinme ve sıralama çağrıları doğrulandı. |
| İçe aktarma kullanıcı akışı | Bekleme sonucu anında döndü; iptalde kayıt oluşmadı; onaydan sonra yeni kart ekranda göründü ve durum `completed` oldu. |
| AI erişimini kapatma | Araç listesi boşaldı; sayfa yenilenince kapalı tercihi korundu. |
| JSON/Markdown | Chrome 152.0.7977.76 üzerinde normal Export/MD düğmeleri ve yerel WebMCP `export_data` çağrıları gerçek download olayı üretti; dört dosyanın akışı okunup Türkçe karakterler doğrulandı, `download.failure()` null. İndirme kodunda değişiklik gerekmedi. |
| PostgreSQL yerel uçtan uca | PostgreSQL 16.14 üzerinde gerçek Fastify yollarıyla beş senaryo + üst test (6/6) geçti: URL'li round-trip/ilişkiler/metadata/sayaçlar; eski/eksik sürüm; kilit beklerken başka istemcinin commit'i; aynı sürümlü iki importer; tam rollback. Test kendi veritabanını oluşturup kaldırır. |
| Canlı site / Dokploy | Dağıtım ve canlı kabul yapılmadı. |

İlk kullanıcı-onayı-bekleyen araç denemesi istemcide zaman aşımına girdi. Son tasarım bu nedenle anlık bekleme sonucu + ayrı durum sorgulaması kullanır. Geliştirme sırasında WebMCP kodu değiştirildiğinde araç listesi için tam sayfa yenileme kullanılmalıdır.

Tarayıcı kontrolünde mevcut kaynak hata bildiriminin tekrar tekrar eklendiği bir render döngüsü de görüldü. `App` bildirim callback'i sabitlendi ve tek hata bildirimi regresyon testi eklendi. Mevcut duplicate-URL testinin geçici yüklenme ekranına dayanarak yanlış geçmesi giderildi; artık sorgu tamamlandıktan sonraki gerçek davranışı ve mükerrer gönderimin engellendiğini kontrol eder.

Mevcut TypeScript 7 ile typescript-eslint uyumsuzluğu, [Microsoft'un yan yana kullanım düzeni](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0) uygulanarak çözüldü: derlemede TS7, lint için TS6 API uyumluluk paketi. Son test/lint/derleme doğrulaması Node 24.19.0 üzerinde yapıldı. CI ve Docker Node 20'den desteklenen Node 24'e alındı; CI'a backend/frontend testleri ve sıfır uyarı şartlı lint eklendi. Vite'ın mevcut büyük paket ve config-loader uyarıları devam ediyor. Docker servisi bu ortamda çalışmadığından imaj derlemesi ve GitHub üzerindeki CI henüz doğrulanmadı.

## Son kod incelemesi

Standart incelemesinde PostgreSQL kabul testinin hata halinde kaynak bırakabilen temizlik sırası düzeltildi: cleanup kaynak oluşturmadan önce kaydedilir, her adım diğerlerinden bağımsız tamamlanır ve önceki ortam değişkeni geri yüklenir. Yeni sert standart ihlali bulunmadı.

Gereksinim incelemesinde `update_category` aracının eski alanları tam form olarak geri göndermesi düzeltildi. Sunucu yalnız gönderilen izinli alanları tek SQL UPDATE ile değiştirir; renk düzenlemesi başka istemcinin ad değişikliğini ezmez. Tam form güncellemesi ve mevcut uzun SQLite adları uyumluluğu korunur; regresyon testleri eklendi. İnceleme sonrası kalan somut kod engeli bulunmadı. Bu sonuç canlıya dağıtım veya Docker/CI kabulü anlamına gelmez.

İndirme kabulünde Chrome'un deneysel WebMCP desteği etkinleştirildi. `document.modelContext.getTools()` ile bulunan `export_data`, `executeTool(tool, JSON.stringify({ format, type: 'website' }))` ile çağrıldı. Filtreli JSON'da bir kaynak (849 karakter), Markdown'da aynı kaynak (204 karakter) doğrulandı; normal JSON 1646 karakterdi. İndirme başarı kanıtı araç mesajına değil, tarayıcı dosya olayına ve okunabilir dosya içeriğine dayanır. Tarayıcının son kullanıcı indirme tercihlerine ilişkin genel bir teslim garantisi verilmez.

## Yerel tekrar çalıştırma

Proje kökünden:

```powershell
npm ci --prefix frontend
npm ci --prefix backend
npm run test --prefix frontend
npm test --prefix backend
npm run build --prefix frontend
npm run build --prefix backend
```

Geçici yerel PostgreSQL sunucusu hazırken proje kökünden:

```powershell
$env:TEST_POSTGRES_URL = 'postgresql://acceptance@127.0.0.1:55439/postgres'
node --import ./backend/node_modules/tsx/dist/loader.mjs --test backend/tests/import-postgres.test.ts
Remove-Item Env:TEST_POSTGRES_URL
```

Bu URL yalnız yerel test sunucusuna ait olmalıdır; test uzak sunucuları reddeder. Kullanıcının veritabanını sıfırlamak yerine rastgele adlı `link_manager_import_test_*` veritabanı oluşturur ve test sonunda kaldırır. Bağlantı kullanıcısının CREATE DATABASE yetkisi gerekir. Değişken verilmezse PostgreSQL testi atlanır; normal testlerin geçmesi PostgreSQL kabulünün yapıldığı anlamına gelmez.

Gerçek API yollarıyla geçici SQLite tarayıcı kabulü için ayrı bir terminalde:

```powershell
cd backend
node --import tsx tests/support/webmcp-local-server.ts
```

İkinci terminalde proje kökünden:

```powershell
$env:VITE_API_KEY = 'webmcp-local-only'
npm run dev --prefix frontend -- --host 127.0.0.1 --port 4173 --strictPort
```

Tarayıcı adresi `http://127.0.0.1:4173/`. Test sunucusu yalnız `127.0.0.1:3000` üzerinde dinler, geçici veritabanı kullanır; üretim ortam dosyası, agent inbox veya GitHub sync çalıştırmaz. Bu toplu kabul düzeneğinde hız sınırlaması uygulanmaz; gerçek backend limitleri değiştirilmedi. Test anahtarı yalnız bu yerel düzenek içindir. Sunucular Ctrl+C ile durdurulur.

## Kaynaklar

- [Chrome WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [WebMCP belirtimi](https://webmachinelearning.github.io/webmcp/)
- [PostgreSQL 16 tablo kilitleri](https://www.postgresql.org/docs/16/sql-lock.html)
- [React: state sıfırlamak için key kullanımı](https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes)

Entegrasyon dosyaları: `frontend/src/lib/webmcp.ts`, `webmcp-schema.ts`, `webmcp-data.ts`, `frontend/src/components/WebMCPBridge.tsx`. Başlatma ve gezinme bağlantısı `frontend/src/App.tsx` içindedir.
