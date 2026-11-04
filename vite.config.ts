import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { thirdPartyNotices } from './scripts/third-party-notices.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), thirdPartyNotices()],
})
