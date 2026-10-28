// PCM 波形表示 (本家 ptNoise の if_PcmTable / if_Panel_Scale 準拠) のレイアウト計算。
// 本家は固定ズーム (サンプル/px) で表示し、横幅に収まらない分は横スクロールする。
// ズームは if_Panel_Scale の既定値 (5 サンプル/px) に合わせる。

export const PCM_VIEW_ZOOM = 5;

// 本家 if_Panel_Scale のズームメニュー (表示名とサンプル/px)。
// 並びは本家のメニューと同じ (1/80 が最も縮小、1/1 が最も拡大)
export const PCM_VIEW_ZOOMS: readonly { zoom: number; label: string }[] = [
  { zoom: 80, label: "1/80" },
  { zoom: 40, label: "1/40" },
  { zoom: 20, label: "1/20" },
  { zoom: 10, label: "1/10" },
  { zoom: 5, label: "1/5" },
  { zoom: 1, label: "1/1" },
];

// 波形全体の幅 (px)。0 フレームなら 0
export function pcmViewWidth(frames: number, zoom = PCM_VIEW_ZOOM): number {
  return frames > 0 ? Math.max(1, Math.ceil(frames / zoom)) : 0;
}

// 横スクロールの最大量 (px)
export function pcmScrollMax(totalWidth: number, viewWidth: number): number {
  return Math.max(0, totalWidth - viewWidth);
}

// スクロールバーのサム (つまみ) の幅と左位置。
// 表示領域に全体が収まるときは幅 0 (スクロール不要) を返す。
export function pcmScrollThumb(
  totalWidth: number,
  viewWidth: number,
  scroll: number,
): { width: number; left: number } {
  if (viewWidth <= 0 || totalWidth <= viewWidth) return { width: 0, left: 0 };
  // 表示割合に比例させつつ、掴めるよう最小 24px を確保する
  const width = Math.min(viewWidth, Math.max(24, (viewWidth * viewWidth) / totalWidth));
  const max = totalWidth - viewWidth;
  const clamped = Math.max(0, Math.min(max, scroll));
  return { width, left: (clamped / max) * (viewWidth - width) };
}
