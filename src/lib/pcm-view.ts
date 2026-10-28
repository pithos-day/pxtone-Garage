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
// 表示領域に全体が収まるときはトラック全体を埋める (本家の無効時と同じ)。
// trackWidth は矢印ボタンを除いたトラックの幅。
export function pcmScrollThumb(
  totalWidth: number,
  viewWidth: number,
  scroll: number,
  trackWidth = viewWidth,
): { width: number; left: number } {
  if (trackWidth <= 0 || totalWidth <= 0) return { width: 0, left: 0 };
  if (totalWidth <= viewWidth) return { width: trackWidth, left: 0 };
  // 本家 if_gen_Scroll と同じ比率 (トラック幅 * 表示幅 / 全体幅)。掴めるよう最小 24px
  const width = Math.min(trackWidth, Math.max(24, (trackWidth * viewWidth) / totalWidth));
  const max = totalWidth - viewWidth;
  const clamped = Math.max(0, Math.min(max, scroll));
  return { width, left: (clamped / max) * (trackWidth - width) };
}
