import { defineConfig } from '@playwright/test'

const PORT = 4173

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  // Electron とプレビューサーバーを取り合わないよう順番に実行する
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'en-US',
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
    launchOptions: {
      // テスト中は音を出さない
      args: ['--mute-audio', '--autoplay-policy=no-user-gesture-required'],
      // Playwright のブラウザの代わりに端末の Chromium を使うときに指定する
      executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
    },
  },
  webServer: {
    command: `pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
  },
})
