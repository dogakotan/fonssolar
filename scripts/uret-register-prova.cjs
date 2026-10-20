// Register okuma fonksiyonları provasını bekleyen SQL dosyalarından üretir: fonksiyon gövdeleri ve ters SQL'ler
// şablona birebir kopyalanır, md5'leri başlığa yazılır (prova ile dosya ayrışmasın diye).
// Koşturma: node scripts/uret-register-prova.cjs
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const repo = path.resolve(__dirname, '..')
const read = p => fs.readFileSync(path.join(repo, p), 'utf8')
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex')

const mig = read('supabase/bekleyen/20261020090000_register_okuma_rpc.sql')
const nav = read('supabase/bekleyen/20261020090100_register_navigasyon.sql')
const migDown = read('supabase/rollback/20261020090000_register_okuma_rpc.down.sql')
const navDown = read('supabase/rollback/20261020090100_register_navigasyon.down.sql')
let t = read('supabase/bekleyen/register_prova_sablon.sql')
for (const [k, v] of Object.entries({ '@@MIGRATION@@': mig, '@@NAVIGATION@@': nav,
  '@@MIGRATION_DOWN@@': migDown, '@@NAVIGATION_DOWN@@': navDown, '@@MIG_MD5@@': md5(mig), '@@NAV_MD5@@': md5(nav) })) {
  if (!t.includes(k)) throw new Error('yer tutucu yok: ' + k)
  t = t.split(k).join(v)
}
if (/\$prova\$/.test(mig + nav + migDown + navDown)) throw new Error('$prova$ ayırıcısı SQL içinde geçiyor')
const out = path.join(repo, 'supabase/bekleyen/20261020090000_register_okuma_rpc_prova.sql')
fs.writeFileSync(out, t)
console.log('yazıldı', path.relative(repo, out), 'mig', md5(mig), 'nav', md5(nav))
