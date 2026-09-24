# Fons Solar GES Dashboard

React + Vite arayüzü Supabase Auth ve veritabanına bağlanır. Günlük rapor PDF'leri
için Python servisi kullanılır. Ajan sohbeti Gemini API'sine, oturum doğrulayan
Supabase Edge Function üzerinden erişir.

## macOS'ta yerel çalıştırma

Önce Node.js 20 veya üstü, Git ve Python 3 kurulu olmalı. Projeyi indirin:

```bash
git clone --branch agent/fatura-kurtarma-migration-arsivi --single-branch https://github.com/dogakotan/fonssolar.git
cd fonssolar
npm ci
```

PDF servisi için sanal Python ortamı oluşturup bağımlılıkları kurun:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r pdf-service/requirements.txt
```

Supabase bağlantı ayarlarını yerel dosyaya kopyalayıp düzenleyin:

```bash
cp .env.example .env.local
open -e .env.local
```

`VITE_SUPABASE_URL` ve `VITE_SUPABASE_ANON_KEY` alanlarına Supabase projesinin
Project URL ve anon/public key değerlerini girin. `VITE_APP_URL` için yerel
adresi kullanın:

```env
VITE_SUPABASE_URL=https://proje-ref.supabase.co
VITE_SUPABASE_ANON_KEY=anon-public-key
VITE_APP_URL=http://localhost:5173
```

`.env.local` gizli/yerel ayar dosyasıdır; Git'e eklemeyin. `service_role` veya
Supabase secret key'i tarayıcıda kullanılan değişkenlere koymayın.

Sanal Python ortamı etkin durumdayken uygulamayı başlatın:

```bash
npm run dev
```

Geliştirme sunucusu `http://localhost:5173` adresinde açılır. Terminal'de
çalışmaya devam etmelidir. `npm run dev` Python PDF servisini de 8002 portunda
başlatır. Uygulamayı durdurmak için Terminal'de `Ctrl+C` kullanın.

## Gemini ajanını yapılandırma

Gemini API anahtarı istemciye eklenmez. Google AI Studio'dan alınan anahtarı,
Supabase Dashboard'da `bshhgvdzemgfijkzhcrf` projesinin Edge Function secrets
bölümüne `GEMINI_API_KEY` adıyla ekleyin. Ardından proje klasöründe Supabase
CLI ile giriş yapıp projeyi bağlayın ve fonksiyonu dağıtın:

```bash
npx supabase login
npx supabase link --project-ref bshhgvdzemgfijkzhcrf
npx supabase functions deploy agent-chat
```

CLI deployment için Supabase projesinde fonksiyon dağıtma yetkisi gerekir.
Yerel Edge Function geliştirmesinde örnek dosyayı `supabase/functions/.env`
olarak kopyalayıp anahtarı oraya girin; bu dosya Git tarafından yok sayılır.

## Windows

Node.js ve Python 3 kurulumundan sonra aynı Git, npm ve pip adımlarını
PowerShell'de kullanın. Python ortamını etkinleştirmek için:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r pdf-service/requirements.txt
```

`.env.local` oluşturmak için `Copy-Item .env.example .env.local` kullanın.
