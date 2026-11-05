import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { thirdPartyNotices } from './scripts/third-party-notices.ts'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    thirdPartyNotices(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'pxtone Garage',
        short_name: 'pxtone Garage',
        description: 'A Web DAW compatible with Piston Collage',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#4b4458',
        theme_color: '#4b4458',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // フォントが配信物の大半を占めるので、本体だけ事前にキャッシュする
        globPatterns: ['**/*.{js,css,html,png,svg,ptcop,txt}'],
        runtimeCaching: [
          {
            // ファイル名にハッシュが付くので内容は変わらない。使った分だけキャッシュする
            urlPattern: /\.woff2?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'fonts',
              expiration: { maxEntries: 1000 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(version) },
})
