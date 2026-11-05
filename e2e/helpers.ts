import { expect, type Page } from '@playwright/test'

// OS のファイルピッカーは自動操作できないので、OPFS の実ファイルを返すものに差し替える。
// アプリの保存処理 (createWritable など) はそのまま動く
export async function stubFilePickers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    window.showSaveFilePicker = async (options) => {
      const dir = await navigator.storage.getDirectory()
      return dir.getFileHandle(options?.suggestedName ?? 'untitled', { create: true })
    }
    window.showOpenFilePicker = async () => {
      const dir = await navigator.storage.getDirectory()
      return [await dir.getFileHandle(localStorage.getItem('e2e-open-file') ?? '')]
    }
  })
}

export async function setFileToOpen(page: Page, name: string): Promise<void> {
  await page.evaluate((n) => localStorage.setItem('e2e-open-file', n), name)
}

// 保存されたファイルの大きさと先頭のバイト列 (latin1 文字列) を返す
export async function readSavedFile(page: Page, name: string): Promise<{ size: number; head: string }> {
  return page.evaluate(async (n) => {
    const dir = await navigator.storage.getDirectory()
    const file = await (await dir.getFileHandle(n)).getFile()
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
    return { size: file.size, head: String.fromCharCode(...head) }
  }, name)
}

// 保存の完了を待つ。createWritable は close まで中身を反映しないので、大きさで判定できる
export async function expectSavedFile(page: Page, name: string, minSize = 1): Promise<{ size: number; head: string }> {
  await expect
    .poll(async () => (await readSavedFile(page, name).catch(() => null))?.size ?? 0, { timeout: 45_000 })
    .toBeGreaterThanOrEqual(minSize)
  return readSavedFile(page, name)
}

// 配布サンプルを OPFS に置き、「開く」で読み込める状態にする
export async function putSampleFile(page: Page, name: string): Promise<void> {
  await page.evaluate(async (n) => {
    const bytes = await (await fetch('/samples/Moldau.ptcop')).arrayBuffer()
    const dir = await navigator.storage.getDirectory()
    const writable = await (await dir.getFileHandle(n, { create: true })).createWritable()
    await writable.write(bytes)
    await writable.close()
  }, name)
  await setFileToOpen(page, name)
}

export async function clickMenu(page: Page, menu: string, ...items: string[]): Promise<void> {
  await page.locator('.menu-label', { hasText: menu }).click()
  for (const item of items) {
    await page.locator('.menu-item', { hasText: new RegExp(`^\\s*${item}`) }).first().click()
  }
}

export async function waitForApp(page: Page): Promise<void> {
  await expect(page.locator('.menu-bar')).toBeVisible()
}
