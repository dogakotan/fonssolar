# drive-gateway (Faz A iskeleti — deploy edilmedi)

Proje Kontrol dokümanlarına Google Drive üzerinden tek erişim yolu. Tasarım:
`docs/proje-kontrol/tasarim.md` Bölüm 4.5. Kullanıcı Drive'a doğrudan erişmez; her istekte
JWT ve proje yetkisi kontrol edilir, dosya bu fonksiyon üzerinden akar.

| Dosya | Görev |
|---|---|
| `index.ts` | Deno giriş noktası; gerçek Supabase istemcisini (kullanıcı JWT'siyle) ve Drive istemcisini enjekte eder |
| `handler.ts` | İstek akışı, yetki sırası, hata eşleme — bağımlılıklar enjekte edildiği için ağsız test edilir |
| `driveClient.ts` | Drive arayüzü, klasör şablonu; gerçek API çağrıları **TODO (Faz B)** |
| `validation.ts` | İzinli türler (uzantı + dosya imzası), boyut, sözlükler, sha256, Drive dosya adı |
| `handler.test.ts` | 28 test: yetki sırası, 401/403/413/415/409/501, telafi silmesi, indirme başlıkları |

## Eylemler

| Eylem | İstek | Yanıt |
|---|---|---|
| `upload` | `POST ?action=upload`, multipart: `project_id`, `doc_type`, `discipline`, `revision?`, `title?`, `file` | 201 `{document_id, register_no, job_id}` |
| `download` | `GET ?action=download&document_id=<uuid>&disposition=inline\|attachment` | Dosya akışı |
| `provision_folders` | `POST ?action=provision_folders`, JSON `{project_id}` (yalnızca admin) | `{created, folders[]}` |

Kontrol sırası (her eylemde): **JWT (401) → girdi (400) → `has_project_access` (403) →
tür/boyut (415/413) → Drive yapılandırması (501 `drive_not_configured`)**. Drive kurulmamış olsa
bile yetkisiz kullanıcı 403 alır.

Hata kodları: `auth_required`, `invalid_session` (401) · `forbidden` (403) · `not_found` (404) ·
`duplicate` (409) · `payload_too_large` (413) · `unsupported_media_type` (415) · `validation` (400) ·
`drive_not_configured`, `drive_not_implemented`, `register_rpc_missing` (501) · `drive_error` (502) ·
`access_check_unavailable`, `database_error` (500).

## Bağımlı olduğu ama henüz olmayan RPC'ler (Faz B, M05/M09)

`create_document_record` (dry-run yanıtı `register_no` + hedef `folder_id` döndürmeli),
`enqueue_document_job`, `get_document_for_download`. Bunlar yokken `upload` ve `download`
**dosya vermeden/yazmadan** 501 `register_rpc_missing` döner. `provision_folders` için klasör
kimliklerini `project_drive_folders`'a yazacak bir RPC tasarım 4.4'te listelenmemiş — eklenmeli.

## Secret'lar

`GOOGLE_SERVICE_ACCOUNT_JSON`, `DRIVE_SHARED_DRIVE_ID`, `MAX_UPLOAD_BYTES` (varsayılan 25 MiB,
geçici). Yalnızca `supabase secrets set …` ile; repoya, `.env`'e veya `VITE_` önekli değişkene girmez.

## Testler (deploy gerektirmez)

```bash
node --test supabase/functions/drive-gateway/handler.test.ts   # Node >= 22.18
deno test supabase/functions/drive-gateway/handler.test.ts     # Deno kuruluysa (bu makinede doğrulanmadı)
```

## Deploy sonrası curl senaryosu (yetki akışı)

Deploy **kullanıcı onayıyla** yapılır. Değişkenler kabuğa elle girilir; değerler repoya yazılmaz.

```bash
FN="$SUPABASE_URL/functions/v1/drive-gateway"
# JWT'ler: test kullanıcılarıyla giriş yapıp access_token alın (ör. supabase-js signInWithPassword).
# IZMIR_JWT = İzmir şantiye şefi, ADMIN_JWT = admin.

# 1) JWT yok → 401 auth_required
curl -s -o /dev/null -w '%{http_code}\n' "$FN?action=download&document_id=00000000-0000-0000-0000-000000000000" \
  -H "apikey: $SUPABASE_ANON_KEY"

# 2) Başka projeye yükleme → 403 forbidden (Drive kurulu olmasa da)
curl -s -w '\n%{http_code}\n' -X POST "$FN?action=upload" \
  -H "Authorization: Bearer $IZMIR_JWT" -H "apikey: $SUPABASE_ANON_KEY" \
  -F project_id=test-kayseri-develi-ges -F doc_type=rfi -F discipline=dc -F file=@ornek.pdf

# 3) Kendi projesi, izinsiz tür → 415
curl -s -w '\n%{http_code}\n' -X POST "$FN?action=upload" \
  -H "Authorization: Bearer $IZMIR_JWT" -H "apikey: $SUPABASE_ANON_KEY" \
  -F project_id=test-izmir-ges-2026 -F doc_type=rfi -F discipline=dc -F file=@script.js

# 4) Kendi projesi, geçerli PDF, Drive secret'ı yok → 501 drive_not_configured
curl -s -w '\n%{http_code}\n' -X POST "$FN?action=upload" \
  -H "Authorization: Bearer $IZMIR_JWT" -H "apikey: $SUPABASE_ANON_KEY" \
  -F project_id=test-izmir-ges-2026 -F doc_type=rfi -F discipline=dc -F file=@ornek.pdf

# 5) Admin olmayan klasör kurulumu → 403
curl -s -w '\n%{http_code}\n' -X POST "$FN?action=provision_folders" \
  -H "Authorization: Bearer $IZMIR_JWT" -H "apikey: $SUPABASE_ANON_KEY" \
  -H 'Content-Type: application/json' -d '{"project_id":"test-izmir-ges-2026"}'
```

Faz A kabul kriteri ("yetkisiz kullanıcı drive-gateway'den dosya alamıyor") deploy sonrası 1, 2 ve 5
ile kanıtlanır; `download` mutlu yolu Faz B'de `get_document_for_download` geldikten sonra test edilir.
