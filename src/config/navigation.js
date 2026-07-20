// Rol → üst-seviye Dashboard sekmeleri + sidebar görünürlüğü tek kaynağı.
// src/pages/dashboard/index.jsx (tab değişimi/varsayılan sekme) ve
// src/components/layouts/Sidebar.jsx (nav item görünürlüğü) buradan beslenir.
// Yeni bir rol eklerken yalnızca bu dosya güncellenir.

// Henüz kendi özel modülü olmayan, tek projeye kilitli saha/teknik uzman rolleri —
// santiye_sefi ile aynı Genel Bakış/İş Planı/Satın Alma/Tickets demetini paylaşıyor,
// ama santiye_sefi'ye özel Günlük Rapor formu/listesi olmadan (bkz. CLAUDE.md Roller).
export const FIELD_SPECIALIST_ROLES = [
  'elektrik_sefi', 'mekanik_sef', 'isg_sorumlusu', 'kalite_kontrol_sefi',
  'enh_sorumlusu', 'proje_kurulum_sefi', 'proje_tasarim_sorumlusu',
  'evrak_takip', 'operasyon_sorumlusu', 'is_makinesi_operator', 'lojistik_tedarik',
]

const FIELD_SPECIALIST_TABS = ['genel', 'is-plani', 'satin-alma', 'tickets', 'bildirimler']

// roles.is_manager=true kümesiyle birebir (DB'den doğrulandı) — Bildirimler'de zincir/adım
// detayının yalnızca yönetici rollerine gösterilip gösterilmeyeceğini belirlemek için kullanılır.
export const MANAGER_ROLES = ['admin', 'koordinator', 'maliyet_kontrolcu', 'muhasebe', 'proje_koordinatoru']

// tabs: null → kısıtsız (yönetici gibi roller, handleTabChange hiçbir sekmeyi engellemez).
// defaultTab: null → rol değişince aktif sekme zorla değiştirilmez.
const UNRESTRICTED = { tabs: null, defaultTab: null }

export const NAVIGATION = {
  admin: {
    ...UNRESTRICTED,
    sidebarItems: ['genel', 'projeler', 'satin-alma', 'finans', 'tickets', 'bildirimler', 'proje-ekle', 'kullanicilar'],
  },
  koordinator: {
    ...UNRESTRICTED,
    sidebarItems: ['genel', 'projeler', 'satin-alma', 'tickets', 'bildirimler'],
  },
  proje_koordinatoru: {
    ...UNRESTRICTED,
    sidebarItems: ['genel', 'projeler', 'satin-alma', 'tickets', 'bildirimler'],
  },
  muhendis: {
    ...UNRESTRICTED,
    sidebarItems: ['genel', 'projeler', 'satin-alma', 'tickets', 'bildirimler'],
  },
  maliyet_kontrolcu: {
    ...UNRESTRICTED,
    sidebarItems: ['genel', 'projeler', 'finans', 'bildirimler'],
  },
  muhasebe: {
    tabs: ['finans', 'bildirimler'],
    defaultTab: 'finans',
    sidebarItems: ['finans', 'bildirimler'],
  },
  proje_yoneticisi: {
    tabs: ['genel', 'projeler', 'is-plani', 'satin-alma', 'bildirimler'],
    defaultTab: 'genel',
    sidebarItems: ['genel', 'is-plani', 'projeler', 'satin-alma', 'bildirimler'],
  },
  santiye_sefi: {
    tabs: ['genel', 'is-plani', 'daily-report', 'rapor-listesi', 'satin-alma', 'tickets', 'bildirimler'],
    defaultTab: 'genel',
    sidebarItems: ['genel', 'is-plani', 'rapor-listesi', 'satin-alma', 'tickets', 'bildirimler'],
  },
  ...Object.fromEntries(FIELD_SPECIALIST_ROLES.map(role => [role, {
    tabs: FIELD_SPECIALIST_TABS,
    defaultTab: 'genel',
    sidebarItems: FIELD_SPECIALIST_TABS,
  }])),
}

export const ROLE_LABEL = {
  admin:                     'Yönetici',
  muhasebe:                  'Muhasebe',
  santiye_sefi:              'Şantiye Şefi',
  muhendis:                  'Mühendis',
  koordinator:               'Koordinatör',
  proje_yoneticisi:          'Proje Yöneticisi',
  proje_koordinatoru:        'Proje Koordinatörü',
  maliyet_kontrolcu:         'Maliyet Kontrolcü',
  elektrik_sefi:             'Elektrik Şefi',
  mekanik_sef:               'Mekanik Şef',
  isg_sorumlusu:             'İSG Sorumlusu',
  kalite_kontrol_sefi:       'Kalite Kontrol Şefi',
  enh_sorumlusu:             'ENH Sorumlusu',
  proje_kurulum_sefi:        'Proje Kurulum Şefi',
  proje_tasarim_sorumlusu:   'Proje Tasarım Sorumlusu',
  evrak_takip:               'Evrak Takip',
  operasyon_sorumlusu:       'Operasyon Sorumlusu',
  is_makinesi_operator:      'İş Makinesi Operatörü',
  lojistik_tedarik:          'Lojistik ve Tedarik',
}
