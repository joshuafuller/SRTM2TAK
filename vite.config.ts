import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

export default defineConfig({
  // Important for GitHub Pages deployment under /SRTM2TAK/
  base: '/SRTM2TAK/',
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'SRTM2TAK',
        short_name: 'SRTM2TAK',
        description: 'SRTM elevation data downloader and packager for ATAK',
        theme_color: '#2196F3',
        background_color: '#ffffff',
        display: 'standalone',
        // Scope and start_url must match the GitHub Pages subpath
        scope: '/SRTM2TAK/',
        start_url: '/SRTM2TAK/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/s3\.amazonaws\.com\/elevation-tiles-prod\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'srtm-tiles',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 7 // 7 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          zip: ['@zip.js/zip.js'],
          pako: ['pako']
        }
      }
    }
  }
});
