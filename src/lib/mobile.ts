// モバイル端末の簡易対応 (公式サポートではない)。
// PC と同じレイアウトを横画面で表示し、ブラウザのズーム操作を無効にする
const DESKTOP_LAYOUT_WIDTH = 1280;

// 指でしか操作できない端末か (タッチ対応 PC はマウスがあるので含めない)
export function isTouchOnlyDevice(): boolean {
  return typeof matchMedia === "function" && matchMedia("(hover: none) and (pointer: coarse)").matches;
}

// 画面が小さくても PC と同じ幅でレイアウトし、端末の幅へ縮小して表示する
export function touchViewportContent(screenWidth: number, screenHeight: number): string {
  const width = Math.max(DESKTOP_LAYOUT_WIDTH, screenWidth, screenHeight);
  return `width=${width}, user-scalable=no`;
}

// 指でしか操作できない端末の表示とズームを設定する。起動時に 1 回呼ぶ
export function initMobile(): void {
  if (!isTouchOnlyDevice()) return;
  document
    .querySelector('meta[name="viewport"]')
    ?.setAttribute("content", touchViewportContent(screen.width, screen.height));
  // iOS Safari は user-scalable=no を無視するため、ピンチズームのジェスチャも止める
  document.addEventListener("gesturestart", (e) => e.preventDefault());
}

// 横画面に固定できるか。通常のタブでは固定できず、全画面表示が必要
export function canLockLandscape(): boolean {
  return (
    typeof document.documentElement.requestFullscreen === "function" &&
    typeof (screen.orientation as { lock?: unknown } | undefined)?.lock === "function"
  );
}

// 全画面にして横画面へ固定する。ユーザー操作の中から呼ぶ (失敗時は false)
export async function lockLandscape(): Promise<boolean> {
  try {
    await document.documentElement.requestFullscreen();
    await (screen.orientation as unknown as { lock(o: string): Promise<void> }).lock("landscape");
    return true;
  } catch {
    return false;
  }
}
