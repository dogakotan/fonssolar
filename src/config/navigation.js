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
  // "satin-alma" 2026-07-20'de eklendi: muhasebenin bir talebe bağlı ("Fatura Oluştur",
  // purchase_request_id set edilerek) fatura kesebileceği TEK ekran burası — Finans'taki
  // "+ Fatura Ekle" (FaturaEkleModal) talebe hiç bağlanmayan, source='manual' bağımsız bir
  // fatura oluşturuyor; muhasebe bu sekmeye erişemeden invoice↔purchase_request akışını
  // tamamlayamıyordu (canInvoice=isMuhasebe zaten doğru kuruluydu, yalnızca hiç ulaşılamıyordu).
  // TabSatinAlma.jsx zaten canApprove/canCreate'i admin'e/diğer rollere kilitliyor, muhasebe
  // yalnızca "Fatura Oluştur" butonunu görür.
  muhasebe: {
    tabs: ['finans', 'satin-alma', 'bildirimler'],
    defaultTab: 'finans',
    sidebarItems: ['finans', 'satin-alma', 'bildirimler'],
  },
  // 2026-07-21: admin'in tüm operasyonel sekmeleri (finans/tickets/kullanicilar/
  // proje-ekle) eklendi — kullanıcı proje_yoneticisi'nin admin gibi her sayfayı
  // görebilmesini istedi. Aksiyon/yazma yetkisi ayrı: Finans/Tickets zaten
  // isAdmin||isMuhasebe / isAdmin bazlı iç kısıtlamaya sahip (bkz. FaturaListesi,
  // OnayKuyrugu, TicketListesi), Kullanıcılar/Proje Yönetimi'ne ise bu turda
  // isAdmin-only iç aksiyon guard'ı eklendi (bkz. TabKullanicilar.jsx,
  // TabProjeYonetimi.jsx) — bu ikisinde önceden hiç iç kısıtlama yoktu.
  proje_yoneticisi: {
    tabs: ['genel', 'projeler', 'satin-alma', 'tickets', 'kullanicilar', 'proje-ekle', 'bildirimler'],
    defaultTab: 'genel',
    sidebarItems: ['genel', 'projeler', 'satin-alma', 'tickets', 'bildirimler', 'proje-ekle', 'kullanicilar'],
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
