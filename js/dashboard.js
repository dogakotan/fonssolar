/**
 * dashboard.js — Dashboard sekmeleri ve görünüm yönetimi
 * Yeni sekme eklemek için: TAB_META'ya giriş ekle,
 * index.html'e tab-content div ve nav-item butonu ekle.
 */

const TAB_META = {
  'genel':      { title: 'Genel Bakış',  subtitle: 'Proje özeti ve aktif görevler' },
  'projeler':   { title: 'Projeler',     subtitle: 'Tüm GES projeleri' },
  'is-plani':   { title: 'İş Planı',     subtitle: 'Görev takip ve zaman çizelgesi' },
  'satin-alma': { title: 'Satın Alma',   subtitle: 'Tedarik talepleri ve siparişler' },
  'ekip':       { title: 'Ekip',         subtitle: 'Proje ekibi ve roller' },
}

const Dashboard = {

  /** Giriş başarılı olduğunda çağrılır */
  show(user) {
    App.currentUser = user
    App.showPage('dashboard')

    document.getElementById('sidebar-name').textContent = user.fullName
    document.getElementById('sidebar-role').textContent = user.role

    Dashboard.showTab('genel')
  },

  /** Sekme değiştirir */
  showTab(tabName) {
    // Tüm içerikleri gizle
    document.querySelectorAll('.tab-content').forEach(el => {
      el.classList.remove('active')
    })

    // Tüm nav butonlarından active kaldır
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.classList.remove('active')
    })

    // Seçili içeriği göster
    const tabEl = document.getElementById('tab-' + tabName)
    if (tabEl) tabEl.classList.add('active')

    // Seçili nav butonunu aktif et
    const navEl = document.querySelector(`.nav-item[data-tab="${tabName}"]`)
    if (navEl) navEl.classList.add('active')

    // Başlığı güncelle
    const meta = TAB_META[tabName]
    if (meta) {
      document.getElementById('tab-title').textContent    = meta.title
      document.getElementById('tab-subtitle').textContent = meta.subtitle
    }
  }
}
