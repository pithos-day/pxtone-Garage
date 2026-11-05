import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { thirdPartyNotices } from './scripts/third-party-notices.ts'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), thirdPartyNotices()],
  define: { __APP_VERSION__: JSON.stringify(version) },
})
