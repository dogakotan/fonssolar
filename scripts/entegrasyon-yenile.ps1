# scripts/entegrasyon-yenile.ps1 — YALNIZCA local/entegrasyon (GES_Dashboard-entegrasyon klasörü)
# Dalı origin/main'den sıfırdan kurar, dalları sırayla merge eder, "local(entegrasyon):" commit'lerini
# yeniden uygular, lint + build alır, 5173'teki entegrasyon sunucusunu yeniden başlatır. Push yapmaz.
# Sıfırlamadan önce mevcut hal local/entegrasyon-yedek dalına alınır; bir adım hata verirse oradan dönülür:
#   git switch -C local/entegrasyon local/entegrasyon-yedek
param(
  [string[]]$Dallar = @('faz-a-proje-kontrol', 'feature/aylik-is-plani')
)
$ErrorActionPreference = 'Stop'
$Kok = Split-Path -Parent $PSScriptRoot
Set-Location $Kok

function Git-Calistir {
  # git'i çalıştırır, çıkış kodu 0 değilse durur.
  git @args
  if ($LASTEXITCODE -ne 0) { throw "git $($args -join ' ') başarısız (çıkış kodu $LASTEXITCODE)." }
}

function Durdur-Sunucu {
  # Yalnızca bu klasörün Vite süreci (node + komut satırında vite + klasör adı).
  # Sarmalayıcılar (npm, start-dev.mjs, 8002 PDF servisi) Vite kapanınca kendileri kapanır.
  Get-CimInstance Win32_Process | Where-Object {
    $_.Name -eq 'node.exe' -and $_.CommandLine -match 'vite' -and $_.CommandLine -like '*GES_Dashboard-entegrasyon*'
  } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; "Durduruldu: Vite PID $($_.ProcessId)" }
}

function Bekle-Port-Bos([int[]]$Portlar, [int]$Saniye = 15) {
  # Vite kapandıktan sonra port ve sarmalayıcılar birkaç saniye dolu görünebilir.
  $sw = [Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt $Saniye) {
    $dolu = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in $Portlar }
    if (-not $dolu) { return }
    Start-Sleep -Milliseconds 500
  }
  $dolu = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in $Portlar }
  $ozet = ($dolu | ForEach-Object { "$($_.LocalPort) (PID $($_.OwningProcess))" }) -join ', '
  throw "Port $Saniye sn içinde boşalmadı: $ozet. Rastgele port kullanılmaz; önce sebebini bulun."
}

function Iki-Tarafi-Koru([string]$Dosya) {
  # CLAUDE.md'deki çakışmada iki tarafın maddelerini de tutar (gelen dal üstte).
  $s = [IO.File]::ReadAllText($Dosya)
  $re = '(?ms)^<<<<<<< [^\r\n]*\r?\n(.*?)^=======\r?\n(.*?)^>>>>>>> [^\r\n]*\r?\n'
  $ev = [Text.RegularExpressions.MatchEvaluator] { param($m) $m.Groups[2].Value.TrimEnd() + "`n`n" + $m.Groups[1].Value }
  $s = [regex]::Replace($s, $re, $ev)
  if ($s -match '(?m)^(<<<<<<<|=======$|>>>>>>>)') { throw "$Dosya içinde çözülemeyen çakışma işareti kaldı." }
  [IO.File]::WriteAllText($Dosya, $s, (New-Object Text.UTF8Encoding $false))
}

# --- Ön kontroller
if ((git rev-parse --abbrev-ref HEAD) -ne 'local/entegrasyon') { throw 'Bu betik yalnızca local/entegrasyon dalında çalışır.' }
if (git status --porcelain --untracked-files=no) { throw 'Çalışma kopyası temiz değil; önce değişiklikleri commit edin veya geri alın.' }

$EskiHead = (git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'HEAD okunamadı.' }

Git-Calistir fetch origin --prune
$Ekler = @(git log --reverse --format=%H --grep='^local(entegrasyon):' origin/main..HEAD)
if ($LASTEXITCODE -ne 0) { throw 'Yerel commit listesi okunamadı.' }
"Yeniden uygulanacak yerel commit: $($Ekler.Count)"

# --- Yedek, sonra sıfırlama
Git-Calistir branch -f local/entegrasyon-yedek $EskiHead
"Yedek: local/entegrasyon-yedek -> $EskiHead"

Durdur-Sunucu
Bekle-Port-Bos -Portlar 5173, 8002

Git-Calistir switch -C local/entegrasyon --no-track origin/main

# --- Dallar
foreach ($d in $Dallar) {
  git merge --no-ff $d -m "local: entegrasyon <- $d"
  if ($LASTEXITCODE -ne 0) {
    $catisan = @(git diff --name-only --diff-filter=U)
    if ($catisan.Count -eq 1 -and $catisan[0] -eq 'CLAUDE.md') {
      Iki-Tarafi-Koru (Join-Path $Kok 'CLAUDE.md')
      Git-Calistir add CLAUDE.md
      Git-Calistir commit --no-edit
      "CLAUDE.md çakışması iki taraf korunarak çözüldü ($d)."
    } else {
      git merge --abort
      throw "DUR: $d merge'ünde çakışma: $($catisan -join ', '). Elle incelenmeli. Geri dönüş: git switch -C local/entegrasyon local/entegrasyon-yedek"
    }
  }
}

# --- Yerel ekler (kilit, kural, bu betik)
foreach ($c in $Ekler) {
  git cherry-pick $c
  if ($LASTEXITCODE -ne 0) {
    git cherry-pick --abort
    throw "DUR: yerel ek $c uygulanamadı. Geri dönüş: git switch -C local/entegrasyon local/entegrasyon-yedek"
  }
}

# --- Kilit dosyası (gitignore'da; yoksa oluşturulur). Kod da varsayılan olarak kilitli.
$EnvYerel = Join-Path $Kok '.env.development.local'
if (-not (Test-Path $EnvYerel)) {
  [IO.File]::WriteAllText($EnvYerel, "# YALNIZCA GES_Dashboard-entegrasyon. Gitignore'da.`nVITE_ENTEGRASYON_6AB_YOK=true`n", (New-Object Text.UTF8Encoding $false))
  '.env.development.local oluşturuldu (kilit açık).'
}

# --- Bağımlılık, lint, build
$KilitDegisti = git diff --name-only $EskiHead HEAD -- package-lock.json
if ($LASTEXITCODE -ne 0) { throw 'package-lock.json karşılaştırılamadı.' }
if ($KilitDegisti -or -not (Test-Path (Join-Path $Kok 'node_modules'))) {
  npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw 'npm ci hatası.' }
} else { 'package-lock.json değişmedi; npm ci atlandı.' }
npm run lint;  if ($LASTEXITCODE -ne 0) { throw 'Lint hatası.' }
npm run build; if ($LASTEXITCODE -ne 0) { throw 'Build hatası.' }

# --- Sunucu
Bekle-Port-Bos -Portlar 5173, 8002
Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'dev' -WorkingDirectory $Kok -WindowStyle Minimized
'Entegrasyon sunucusu başlatıldı: http://localhost:5173'
