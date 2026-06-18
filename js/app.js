/**
 * app.js — Genel uygulama akışı
 * Sayfa geçişleri ve ortak durum burada yönetilir.
 * login.js ve dashboard.js bu nesneye erişir.
 */

const App = {
  currentUser: null,

  /**
   * Belirtilen sayfayı gösterir, diğerini gizler.
   * @param {'login'|'dashboard'} page
   */
  showPage(page) {
    const loginEl     = document.getElementById('page-login')
    const dashboardEl = document.getElementById('page-dashboard')

    if (page === 'dashboard') {
      loginEl.style.display     = 'none'
      dashboardEl.style.display = 'flex'
    } else {
      loginEl.style.display     = 'flex'
      dashboardEl.style.display = 'none'
    }
  },

  init() {
    this.showPage('login')
  }
}

document.addEventListener('DOMContentLoaded', () => App.init())
