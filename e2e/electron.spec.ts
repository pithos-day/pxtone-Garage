import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, expect, test } from '@playwright/test'
import { waitForApp } from './helpers'

test('スタンドアロン版が起動し、同梱のファイルで再生できる', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'pxtone-garage-e2e-'))
  // 実行中のデスクトップにウィンドウを出さず、音も鳴らさない
  const env = { ...process.env } as Record<string, string>
  delete env.DISPLAY
  delete env.WAYLAND_DISPLAY
  const app = await electron.launch({
    args: [
      '.',
      '--ozone-platform=headless',
      '--headless',
      '--disable-gpu',
      '--mute-audio',
      '--no-sandbox',
      '--autoplay-policy=no-user-gesture-required',
      `--user-data-dir=${userDataDir}`,
    ],
    env,
  })
  try {
    const page = await app.firstWindow()
    await waitForApp(page)
    expect(page.url()).toBe('app://bundle/')
    expect(await page.evaluate(() => window.isSecureContext)).toBe(true)
    expect(await page.evaluate(() => typeof window.showSaveFilePicker)).toBe('function')

    // 本体を同梱しているので Service Worker は登録しない
    expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull()

    const status = await page.evaluate(async () => (await fetch('/samples/Moldau.ptcop')).status)
    expect(status).toBe(200)
    const missing = await page.evaluate(async () => (await fetch('/../../package.json')).status)
    expect(missing).toBe(404)

    await page.goto('app://bundle/?sample=moldau')
    await expect(page.locator('.file-tab.active .tab-name')).toHaveText('Moldau')
    const time = page.locator('.time').first()
    const before = await time.innerText()
    await page.locator('.play-btn').click()
    await expect.poll(() => time.innerText(), { timeout: 10_000 }).not.toBe(before)
    await page.locator('.play-btn').click()
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
