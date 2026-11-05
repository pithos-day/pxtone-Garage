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
      '--lang=en-US',
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

    // 標準のタイトルバーの代わりのボタン
    const controls = page.locator('.window-controls')
    await expect(controls.locator('button')).toHaveCount(4)

    // headless ではウィンドウの状態が実際には変わらないので、呼び出しと画面への通知を確かめる
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0]
      const state = globalThis as unknown as { windowCalls: string[] }
      state.windowCalls = []
      window.minimize = () => void state.windowCalls.push('minimize')
      window.maximize = () => void state.windowCalls.push('maximize')
    })
    await controls.getByRole('button', { name: 'Minimize' }).click()
    await controls.getByRole('button', { name: 'Maximize' }).click()
    await expect
      .poll(() => app.evaluate(() => (globalThis as unknown as { windowCalls: string[] }).windowCalls))
      .toEqual(['minimize', 'maximize'])

    const emitMaximized = (event: 'maximize' | 'unmaximize') =>
      app.evaluate(({ BrowserWindow }, name) => {
        BrowserWindow.getAllWindows()[0].emit(name as 'maximize')
      }, event)
    await emitMaximized('maximize')
    await expect(controls.getByRole('button', { name: 'Restore' })).toBeVisible()
    await emitMaximized('unmaximize')
    await expect(controls.getByRole('button', { name: 'Maximize' })).toBeVisible()

    const reload = controls.getByRole('button', { name: 'Reload' })
    await page.evaluate(() => ((window as unknown as { reloadMark: boolean }).reloadMark = true))
    await reload.click()
    await expect.poll(() => page.evaluate(() => 'reloadMark' in window)).toBe(false)
    await waitForApp(page)

    // 未保存の変更があるときは、操作に合わせた文言で確認する
    await app.evaluate(({ dialog }) => {
      const state = globalThis as unknown as { confirms: string[] }
      state.confirms = []
      dialog.showMessageBoxSync = ((_window: unknown, options: { message: string }) => {
        state.confirms.push(options.message)
        return 1
      }) as unknown as typeof dialog.showMessageBoxSync
    })
    const confirms = () => app.evaluate(() => (globalThis as unknown as { confirms: string[] }).confirms)
    await page.evaluate(() => window.addEventListener('beforeunload', (e) => e.preventDefault()))
    await controls.getByRole('button', { name: 'Reload' }).click()
    await expect.poll(confirms).toHaveLength(1)
    await controls.getByRole('button', { name: 'Close' }).click()
    await expect.poll(confirms).toHaveLength(2)
    const messages = await confirms()

    // キャンセルしたので開いたまま。確認を通して閉じる
    // (引き止めたままだと app.close() が終わらないので、文言の検証は閉じた後に行う)
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = (() => 0) as unknown as typeof dialog.showMessageBoxSync
    })
    const closed = app.waitForEvent('close')
    await controls.getByRole('button', { name: 'Close' }).click()
    await closed
    expect(messages[0]).toContain('Reload')
    expect(messages[1]).toContain('Close')
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
