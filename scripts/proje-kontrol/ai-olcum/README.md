# AI sağlayıcı ölçüm betiği (Proje Kontrol, Karar #5)

Tasarım: `docs/proje-kontrol/tasarim.md` Bölüm 4.6 "Faz B ölçüm protokolü". Aynı belgeler, aynı şema
(`schemas/rfi_v1.json`) ve aynı prompt (`prompts/rfi_v1.md`) iki sağlayıcıya verilir; alan bazında
doğruluk, doğru boş bırakma, hatalı doldurma, **yüksek güvenle yanlış**, süre ve belge başı maliyet
raporlanır. Seçim kuralı: yüksek güvenle yanlış en az olan; eşitlikte ucuz olan.

```
ai-olcum/
├─ run.mjs              ölçümü çalıştırır → <out>/rapor.md + ham.json
├─ metrics.mjs          sınıflandırma, metrikler, rapor
├─ make-sample-set.mjs  SENTETİK 4 PDF + beklenen.csv (yalnızca boru hattı denemesi)
├─ schemas/rfi_v1.json  alan şeması (x-compare: karşılaştırma kuralı, modele gönderilmez)
├─ prompts/rfi_v1.md    sistem mesajı (belge içeriği talimat değildir)
├─ providers/           base.mjs (ortak arayüz), adapter-a/b (BOŞ yuvalar), mock.mjs (sahte)
└─ lib/                 csv, PDF metni, alıntı doğrulaması, şema doğrulayıcı
```

## Sahte sağlayıcıyla deneme (ağ ve anahtar gerekmez)

```bash
node scripts/proje-kontrol/ai-olcum/make-sample-set.mjs
node scripts/proje-kontrol/ai-olcum/run.mjs --set scripts/proje-kontrol/ai-olcum/ornek-olcum-seti --providers mock
```

## Gerçek ölçüm (Faz B, 3-9 Kas)

1. `olcum-seti/` klasörüne 10-15 PDF ve `beklenen.csv` koy (klasör gitignore'da; repoya girmez).
   `beklenen.csv`: ilk sütun `dosya`, diğerleri şema alan adları; boş hücre = belgede yok.
2. Belge metni için `pdfjs-dist` kur (`npm i -D pdfjs-dist`) veya her PDF'in yanına aynı adlı `.txt`
   koy. Yerleşik çıkarıcı yalnızca basit PDF'lerde güvenilir.
3. `providers/external-adapter.mjs` içindeki TODO'yu iki aday sağlayıcı için doldur.
4. Anahtarları yalnızca kabukta tanımla: `AI_OLCUM_A_API_KEY`, `AI_OLCUM_A_MODEL`, (isteğe bağlı)
   `AI_OLCUM_A_PRICE_IN/OUT`, `AI_OLCUM_A_LABEL`; B için aynısı.
5. Gizlilik onayı alındıysa: `AI_OLCUM_GIZLILIK_ONAYI=evet`. Bu değişken yoksa betik harici
   sağlayıcıya hiçbir belge göndermez (Karar #5).
6. `node scripts/proje-kontrol/ai-olcum/run.mjs --providers adapter-a,adapter-b`
