// 重い同期処理を分割して UI を更新するための時間ヘルパ。
// 同期処理の途中ではブラウザが再描画できないため、チャンクごとに nextFrame() で
// 譲ってやる必要がある (進捗ダイアログの表示・キャンセルはこの譲りで機能する)。
// node (テスト) には requestAnimationFrame が無いので setTimeout(0) にフォールバックする

// 前回 yield からこの時間が経ったら譲る。小さくすると進捗は滑らかになるが
// フレーム待ちの分だけ処理が遅くなる (100ms で +1〜2 割程度)
export const YIELD_INTERVAL_MS = 100;

export function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

// 前回 yield から intervalMs 以上経過したか (now はテスト用に注入できる)
export function dueYield(lastAt: number, intervalMs = YIELD_INTERVAL_MS, now = nowMs()): boolean {
  return now - lastAt >= intervalMs;
}

// 次の描画機会まで譲る
export function nextFrame(): Promise<void> {
  if (typeof requestAnimationFrame === "function") {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}
