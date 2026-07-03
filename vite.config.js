import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    include: ['@supabase/supabase-js'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/generate-pdf': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
      '/tcmb-kurlar': {
        target: 'https://www.tcmb.gov.tr',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/tcmb-kurlar/, '/kurlar'),
      },
      '/anthropic': {
        target: 'https://api.anthropic.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/anthropic/, ''),
        secure: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            // Origin ve Referer'ı sil — Anthropic bunları görünce CORS modu devreye giriyor
            proxyReq.removeHeader('origin')
            proxyReq.removeHeader('referer')
          })
        },
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-xlsx':     ['xlsx'],
          'vendor-pdf':      ['jspdf', 'jspdf-autotable'],
        },
      },
    },
  },
})
