# F1 — proje oluşturmanın `create_project_with_code`'a taşınması (taslak diff, uygulanmadı)

Tarih: 09.10.2026.
- **Kararlar:** Karar 21, Ç14, Ç15 (b).
- **SQL:** `taslak-sql/f1_proje_kodu_ve_olusturma.sql`.
- **Deploy:** Faz 1 Adım 6'da, A4 (reddeden kural) uygulanmadan **önce**.

## 1. Proje bugün nerelerde oluşuyor

| Yol | Dosya | Bugünkü yazma | A4 sonrası |
|---|---|---|---|
| Proje sihirbazı ("Manuel doldur") | `src/pages/dashboard/wizard/Adim8Tamamlandi.jsx:59-72` | İstemciden `projects` insert (RLS: yalnızca admin) | Kod satırı olmadığı için reddedilir |
| Excel'den yeni proje | `supabase/functions/import-project-excel/index.ts:157-179` | service_role ile `projects` upsert | Reddedilir |
| Excel "kopya olarak yükle" (`mode=duplicate`) | aynı yer, `nextDuplicateId` | Aynı | Reddedilir. Ayrıca kopya, aslının kodunu kullanamaz (prefix UNIQUE) |
| Excel ile mevcut projeyi güncelleme (`mode=update`) | aynı yer | Upsert, var olan satırı günceller | Etkilenmez (INSERT değil). Ama upsert yerine açık `update` daha güvenli |

## 2. Excel şablonu

- "Proje Bilgileri" sayfasında 13. satır boş (09.10'da şablondan okundu).
- Öneri: **B13 = "Proje Kodu \*"**, **E13 = kod**, H13 = "2-5 karakter, harfle başlar, büyük harf/rakam (ör. DYB)".
- Şablon v7 → **v8**. Kullanım Kılavuzu sayfası güncellenir.
- `export-project-excel` E13'e `project_register_settings.prefix` yazar.
- CLAUDE.md kuralı: iki edge function, statik şablon ve `projectExcelImport.js` senkron güncellenir. `projectExcelImport.js` yalnızca İş Kalemleri sayfasını okuduğu için etkilenmez.

## 3. `import-project-excel/index.ts` taslak diff'i

```diff
@@ const projectName = toStr(cell(p, "E6"));
     const projectName = toStr(cell(p, "E6"));
+    // Proje kodu (Karar 21): yeni projede zorunlu; mevcut projede okunur ama değiştirilmez.
+    const projectCode = toStr(cell(p, "E13"))?.toUpperCase() ?? null;
     if (!projectId || !projectName) return json({ error: "Proje ID ve Proje Adi zorunludur (E5, E6)" }, 400);
@@ if (existsRow && mode === "duplicate") {
+      // Kopya aslının kodunu kullanamaz (prefix UNIQUE). İstemci yeni kodu form alanıyla gönderir.
+      const codeField = form?.get?.("code");
+      if (typeof codeField !== "string" || !codeField.trim()) {
+        return json({ error: "Kopya proje icin yeni bir proje kodu gerekli.", need_code: true }, 400);
+      }
+      duplicateCode = codeField.trim().toUpperCase();
@@ const projectRow = {
-    const { error: pe } = await sb.from("projects").upsert(projectRow, { onConflict: "id" });
-    if (pe) throw new Error(`projects upsert: ${pe.message}`);
+    if (isNewProject) {
+      const code = duplicated ? duplicateCode : projectCode;
+      if (!code) return json({ error: "Proje kodu zorunludur (Proje Bilgileri, E13)" }, 400);
+      // Kullanıcının JWT'siyle: rol kontrolü ve proje+kod tek işlem DB fonksiyonunda.
+      const { error: ce } = await userClient.rpc("create_project_with_code", { p_project: projectRow, p_code: code });
+      if (ce) return json({ error: ce.hint ?? ce.message, code: ce.message, detail: ce.details }, 400);
+    } else {
+      const { id: _id, ...upd } = projectRow;
+      const { error: pe } = await sb.from("projects").update(upd).eq("id", projectIdToUse);
+      if (pe) throw new Error(`projects update: ${pe.message}`);
+    }
     log["projects"] = { id: projectIdToUse, saved: true };
@@ if (isNewProject) {
-      const { error: cwErr } = await sb.from("project_category_weights").insert(...)
+      // Varsayılan ağırlıkları trg_seed_default_category_weights zaten yazıyor (fonksiyon içindeki insert tetikler);
+      // mevcut duplicate-tolerant insert zararsız, olduğu gibi bırakılabilir.
```

**Notlar:**
- `form` değişkeni bugün yalnızca multipart dalında tanımlı. Diff, onu üst kapsamda `let form = null` olarak taşımayı varsayar.
- Rol kontrolü edge function'da (`ALLOWED_NEW_PROJECT_ROLES`) ve fonksiyonda tekrar ediyor. Edge'deki kontrol erken ve dostça bir hata için kalabilir.
- Fonksiyonun hata sözleşmesi:
  - `message` = kod (`forbidden`, `validation`, `duplicate`);
  - `hint` = Türkçe metin;
  - `detail` = JSON.

  Edge function `hint`'i kullanıcıya iletir.
- Hata dönerse proje oluşmaz. Fonksiyon tek işlem olduğu için yarım proje kalmaz.
  - Sonraki adımlarda (görevler, BOM…) hata olursa proje oluşmuş kalır. Bu bugünkü davranışla aynı, değişmedi.

## 4. Frontend değişiklikleri (Adım 5'te yazılacak, burada yalnızca kapsam)

| Dosya | Değişiklik |
|---|---|
| `wizard/Adim1ProjeBilgileri.jsx` | Zorunlu "Proje Kodu" alanı. Biçim ön kontrolü `^[A-Z][A-Z0-9]{1,4}$`, otomatik büyük harf |
| `wizard/Adim8Tamamlandi.jsx` | Yeni projede `.from('projects').insert(...)` yerine `supabase.rpc('create_project_with_code', { p_project, p_code })`. `duplicate` hatası alan bazında Türkçe mesaj. Düzenleme dalı değişmez |
| `wizard/ProjeEditWizard.jsx` | Kod salt okunur gösterilir. Faz 1'de kod değiştirme yok; register numaraları koda bağlı |
| `TabProjeYonetimi.jsx` | Excel "Yeni bir kopya olarak yükle" seçeneğinde yeni kod alanı. `code` form alanıyla gönderilir |

## 5. Açık nokta

**Proje yöneticisinin sihirbazdan proje oluşturması:**
- `projects` INSERT policy'si bugün yalnızca admin'e izinli. UI ise proje yöneticisine butonu gösteriyor.
- Fonksiyon, edge function'la aynı kuralı (admin + proje_yoneticisi) uygular. Proje yöneticisi bu sayede sihirbazdan da proje oluşturabilir hâle gelir.
- Bu bir davranış değişikliği. Bugün sihirbazın proje yöneticisinde gerçekten başarısız olduğu canlıda denenmedi; doğrulanamadı.
