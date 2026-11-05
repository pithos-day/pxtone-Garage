import { expect, test } from '@playwright/test'
import { clickMenu, expectSavedFile, putSampleFile, setFileToOpen, stubFilePickers, waitForApp } from './helpers'

test.beforeEach(async ({ page }) => {
  // 未保存の確認ダイアログには常に「離れる」で応答する
  page.on('dialog', (dialog) => void dialog.accept())
  await stubFilePickers(page)
  await page.goto('/')
  await waitForApp(page)
})

test('プロジェクトを編集して保存し、再読み込み後に開き直せる', async ({ page }) => {
  await clickMenu(page, 'File', 'Project settings')
  await page.locator('.dlg input[type=text]').first().fill('E2E Song')
  await page.locator('.dlg .btn-accent').click()

  // 上書き保存はダウンロードになる
  const [download] = await Promise.all([page.waitForEvent('download'), page.keyboard.press('Control+s')])
  expect(download.suggestedFilename()).toBe('untitled.ptcop')

  // 名前を付けて保存はピッカーで選んだファイルへ書き込む
  await clickMenu(page, 'File', 'Save as')
  const saved = await expectSavedFile(page, 'untitled.ptcop')
  expect(saved.head).toContain('PTCOLLAGE')

  await page.reload()
  await waitForApp(page)
  await setFileToOpen(page, 'untitled.ptcop')
  await clickMenu(page, 'File', 'Open project')
  await expect(page.locator('.file-tab.active .tab-name')).toHaveText('untitled')
  await clickMenu(page, 'File', 'Project settings')
  await expect(page.locator('.dlg input[type=text]').first()).toHaveValue('E2E Song')
})

// 編集の直後でも退避が間に合うことも確かめるため、待たずに再読み込みする
test('未保存の編集は再読み込みしても復元される', async ({ page }) => {
  await clickMenu(page, 'File', 'Project settings')
  await page.locator('.dlg input[type=text]').first().fill('Draft Song')
  await page.locator('.dlg .btn-accent').click()

  await page.reload()
  await waitForApp(page)
  await clickMenu(page, 'File', 'Project settings')
  await expect(page.locator('.dlg input[type=text]').first()).toHaveValue('Draft Song')
})

test('曲を再生すると時間が進む', async ({ page }) => {
  await putSampleFile(page, 'Moldau.ptcop')
  await clickMenu(page, 'File', 'Open project')
  const time = page.locator('.time').first()
  const before = await time.innerText()
  await page.locator('.play-btn').click()
  await expect.poll(() => time.innerText(), { timeout: 10_000 }).not.toBe(before)
  await page.locator('.play-btn').click()
})

// メーターは音量スライダーを掛ける前の値を示す (書き出し時の音割れを見逃さないため)
test('音量を 0 にしてもレベルメーターは振れる', async ({ page }) => {
  await putSampleFile(page, 'Moldau.ptcop')
  await clickMenu(page, 'File', 'Open project')
  await page.locator('input[type=range][title="Volume"]').fill('0')
  await page.locator('.play-btn').click()
  const fill = page.locator('.level-fill').first()
  await expect
    .poll(() => fill.evaluate((el) => parseFloat((el as HTMLElement).style.width)), { timeout: 10_000 })
    .toBeGreaterThan(0)
  await page.locator('.play-btn').click()
})

test('WAV を書き出せる', async ({ page }) => {
  await putSampleFile(page, 'Moldau.ptcop')
  await clickMenu(page, 'File', 'Open project')
  await clickMenu(page, 'File', 'Export', 'Export WAV')
  await page.locator('.dlg .btn-accent').click()
  const wav = await expectSavedFile(page, 'Moldau.wav', 1_000_000)
  expect(wav.head.slice(0, 4)).toBe('RIFF')
  expect(wav.head.slice(8, 12)).toBe('WAVE')
})

test('表示言語が html の lang に反映される', async ({ page, browser }) => {
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('.menu-label', { hasText: 'File' })).toBeVisible()

  const context = await browser.newContext({ locale: 'ja-JP' })
  const jaPage = await context.newPage()
  await jaPage.goto('/')
  await waitForApp(jaPage)
  await expect(jaPage.locator('html')).toHaveAttribute('lang', 'ja')
  await jaPage.locator('.menu-label', { hasText: 'File' }).click()
  await expect(jaPage.locator('.menu-item').first()).toHaveText(/新規/)
  await context.close()
})

test('一度開けばネットワークなしで起動できる', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined))

  await context.setOffline(true)
  await page.reload()
  await waitForApp(page)
  const status = await page.evaluate(async () => (await fetch('/samples/Moldau.ptcop')).status)
  expect(status).toBe(200)
  await context.setOffline(false)
})

test('音色の波形タイプの表示が undo と再読み込みに追従する', async ({ page }) => {
  await page.locator('.mode-tab').nth(1).click()
  const [coordinate, oscillator] = [0, 1].map((i) => page.locator('.vsp').first().locator('.seg button').nth(i))

  await oscillator.click()
  await page.locator('.dlg .btn-accent').click()
  await expect(oscillator).toHaveAttribute('aria-pressed', 'true')

  await page.keyboard.press('Control+z')
  await expect(coordinate).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Control+y')
  await expect(oscillator).toHaveAttribute('aria-pressed', 'true')

  await page.reload()
  await waitForApp(page)
  await page.locator('.mode-tab').nth(1).click()
  await expect(oscillator).toHaveAttribute('aria-pressed', 'true')
})

test('A 面だけの音色を開いても A / B を別々に編集できる', async ({ page }) => {
  // A 面のみ・エンベロープなしの ptvoice (本家 ptVoice が保存する省略形)
  const bytes = [
    0x50, 0x54, 0x56, 0x4f, 0x49, 0x43, 0x45, 0x2d, 0xcf, 0x17, 0x32, 0x01, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x01, 0x80, 0x5a, 0x40, 0x40, 0x80, 0x80, 0x80, 0xfc, 0x03, 0x03, 0x01, 0x00, 0x05, 0xc8, 0x01, 0x00, 0x00, 0x01,
    0x30, 0x95, 0x30, 0x96, 0xd0, 0xc7, 0xd0,
  ]
  await page.evaluate(async (data) => {
    const dir = await navigator.storage.getDirectory()
    const writable = await (await dir.getFileHandle('a-only.ptvoice', { create: true })).createWritable()
    await writable.write(new Uint8Array(data))
    await writable.close()
  }, bytes)
  await setFileToOpen(page, 'a-only.ptvoice')

  await page.locator('.mode-tab', { hasText: 'Voice' }).click()
  await clickMenu(page, 'File', 'Open')
  await expect(page.locator('.file-tab.active .tab-name')).toHaveText('a-only')

  const volume = (side: number) => page.locator('.vsp').nth(side).locator('.vsp-param').first().locator('.vsp-pval')
  await expect(volume(0)).toHaveText('64')
  // 右の B 面の波形タイプだけを切り替える
  await page.locator('.vsp').nth(1).getByRole('button', { name: 'Oscillator' }).click()
  await page.locator('.dlg .btn-accent').click()
  await expect(page.locator('.vsp').nth(1).getByRole('button', { name: 'Oscillator' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.vsp').nth(0).getByRole('button', { name: 'Coordinate' })).toHaveAttribute('aria-pressed', 'true')
  await expect(volume(1)).toHaveText('32')
  await expect(volume(0)).toHaveText('64')
})

test('Coordinate の点スライダーの最大値は保存しても符号が変わらない値になる', async ({ page }) => {
  await page.locator('.mode-tab').nth(1).click()
  const row = page.locator('.vsp').first().locator('.vsp-sine-row').nth(1)
  await row.locator('input').focus()
  await page.keyboard.press('End')
  await expect(row.locator('.vsp-sine-val')).toHaveText('127')
})

test('音色のスライダーを 1 回ドラッグすると undo 1 回で戻せる', async ({ page }) => {
  await page.locator('.mode-tab').nth(1).click()
  const param = page.locator('.vsp').first().locator('.vsp-param').first()
  const box = (await param.locator('input').boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width - 4, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, y, { steps: 8 })
  await page.mouse.up()
  await expect(param.locator('.vsp-pval')).not.toHaveText('64')

  await clickMenu(page, 'Edit', 'Undo')
  await expect(param.locator('.vsp-pval')).toHaveText('64')
})

test('音色タブをメニューから閉じるときも未保存の 3 択を出す', async ({ page }) => {
  await page.locator('.mode-tab').nth(1).click()
  await clickMenu(page, 'File', 'New')
  const tabs = page.locator('.file-tab')
  await expect(tabs).toHaveCount(2)
  await page.locator('.vsp').first().locator('.seg button').nth(1).click()
  await page.locator('.dlg .btn-accent').click()

  await clickMenu(page, 'File', 'Close')
  await expect(page.locator('.dlg .btn')).toHaveCount(3)
  await page.locator('.dlg .btn').nth(2).click()
  await expect(tabs).toHaveCount(2)

  await clickMenu(page, 'File', 'Close')
  await page.locator('.dlg .btn').nth(1).click()
  await expect(tabs).toHaveCount(1)
})

test('トレイの行をドラッグで並べ替え、undo 1 回で戻せる', async ({ page }) => {
  await page.goto('/?sample=moldau')
  await waitForApp(page)
  const dragFirstRowDown = async (selector: string): Promise<void> => {
    const rows = page.locator(selector)
    await expect(rows.nth(2)).toBeVisible()
    const before = await rows.allInnerTexts()
    const from = (await rows.nth(0).boundingBox())!
    const to = (await rows.nth(2).boundingBox())!
    // 行の左端はチェックボックス領域なので、名前の上を掴む
    await page.mouse.move(from.x + 200, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + 200, to.y + to.height / 2, { steps: 8 })
    await page.mouse.up()
    // 行のテキストの先頭には位置の番号が付く
    const name = (text: string | undefined): string => (text ?? '').replace(/^\d+\.\s*/, '')
    await expect.poll(async () => name(await rows.nth(2).innerText())).toBe(name(before[0]))
    await page.keyboard.press('Control+z')
    await expect.poll(() => rows.allInnerTexts()).toEqual(before)
  }
  await dragFirstRowDown('.unit-row')
  await page.locator('.tool-mode .mode').first().click()
  await dragFirstRowDown('.woice-row')
})
