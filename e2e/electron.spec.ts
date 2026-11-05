import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron, type ElectronApplication, expect, type Page, test } from '@playwright/test'
import { clickMenu, waitForApp } from './helpers'

// 実行中のデスクトップにウィンドウを出さず、音も鳴らさない
function launch(userDataDir: string): Promise<ElectronApplication> {
  const env = { ...process.env } as Record<string, string>
  delete env.DISPLAY
  delete env.WAYLAND_DISPLAY
  return electron.launch({
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
}

// テストの途中で失敗しても、確認ダイアログで終了が止まらないようにする
async function forceQuit(app: ElectronApplication): Promise<void> {
  await app
    .evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().forEach((window) => window.destroy()))
    .catch(() => {})
  await app.close()
}

async function makeDirty(page: Page, songName: string): Promise<void> {
  await clickMenu(page, 'File', 'Project settings')
  await page.locator('.dlg input[type=text]').first().fill(songName)
  await page.locator('.dlg .btn-accent').click()
}

function closeFromOs(app: ElectronApplication): Promise<void> {
  return app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close())
}

test('スタンドアロン版が起動し、同梱のファイルで再生できる', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'pxtone-garage-e2e-'))
  const app = await launch(userDataDir)
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

    // 変更がなければ確認なしで閉じる
    const closed = app.waitForEvent('close')
    await controls.getByRole('button', { name: 'Close' }).click()
    await closed
  } finally {
    await forceQuit(app)
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('未保存の変更があれば、アプリのダイアログで確認してから閉じる', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'pxtone-garage-e2e-'))
  let app = await launch(userDataDir)
  try {
    let page = await app.firstWindow()
    await waitForApp(page)
    await app.evaluate(({ dialog }) => {
      const state = globalThis as unknown as { nativeDialogs: number }
      state.nativeDialogs = 0
      dialog.showMessageBoxSync = (() => {
        state.nativeDialogs++
        return 1
      }) as unknown as typeof dialog.showMessageBoxSync
    })
    await makeDirty(page, 'Draft Song')

    const controls = page.locator('.window-controls')
    const confirm = page.getByRole('dialog', { name: 'app-confirm' })
    const cancel = confirm.getByRole('button', { name: 'Cancel' })

    // 再読み込みはキャンセルすればそのまま
    await page.evaluate(() => ((window as unknown as { reloadMark: boolean }).reloadMark = true))
    await controls.getByRole('button', { name: 'Reload' }).click()
    await expect(confirm).toContainText('Reload the app?')
    // 進捗ダイアログより上に出る
    await expect(page.locator('.dlg-overlay').last()).toHaveCSS('z-index', '310')
    await cancel.click()
    await expect(confirm).toBeHidden()
    expect(await page.evaluate(() => 'reloadMark' in window)).toBe(true)

    // ボタン以外の閉じる操作も同じ確認を通る。操作を重ねてもダイアログは 1 つ
    await controls.getByRole('button', { name: 'Close' }).click()
    await expect(confirm).toContainText('Close the app?')
    await closeFromOs(app)
    await expect(confirm).toHaveCount(1)
    await cancel.click()
    await expect(confirm).toBeHidden()
    await closeFromOs(app)
    await expect(confirm).toBeVisible()

    // 応答があるのでネイティブのダイアログは出ない
    await page.waitForTimeout(3500)
    expect(await app.evaluate(() => (globalThis as unknown as { nativeDialogs: number }).nativeDialogs)).toBe(0)

    const closed = app.waitForEvent('close')
    await confirm.getByRole('button', { name: 'OK' }).click()
    await closed

    // 閉じた変更は次回の起動で復元される
    app = await launch(userDataDir)
    page = await app.firstWindow()
    await waitForApp(page)
    await clickMenu(page, 'File', 'Project settings')
    await expect(page.locator('.dlg input[type=text]').first()).toHaveValue('Draft Song')
  } finally {
    await forceQuit(app)
    rmSync(userDataDir, { recursive: true, force: true })
  }
})

test('画面が固まっていても、ネイティブのダイアログから閉じられる', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'pxtone-garage-e2e-'))
  const app = await launch(userDataDir)
  try {
    const page = await app.firstWindow()
    await waitForApp(page)
    // 「閉じる」を選ぶ。画面は固まっているので、この経路でしか閉じない
    await app.evaluate(({ dialog }) => {
      dialog.showMessageBoxSync = (() => 0) as unknown as typeof dialog.showMessageBoxSync
    })
    void page
      .evaluate(() => {
        for (;;);
      })
      .catch(() => {})
    // 閉じる要求より先に画面が固まるのを待つ
    await new Promise((resolve) => setTimeout(resolve, 500))
    const closed = app.waitForEvent('close')
    await closeFromOs(app)
    await closed
  } finally {
    await forceQuit(app)
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
