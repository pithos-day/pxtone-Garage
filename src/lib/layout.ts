// コラージュ画面の共有レイアウト定数
// (KeyField / PinnedLanes / ScrollBar / CollageEditor で同じ値が再発明されていたため集約)
import { KEYNUM, KEY_HEIGHT } from "./clock";
import { clamp } from "./clamp";

export const RULER_H = 12; // 上部ルーラー帯の高さ (px)
export const STRIP_W = 64; // 鍵盤ストリップの幅 (px)
export const LEFT_W_DEFAULT = 300; // 左パネル (ユニットリスト) の既定幅 (px)
export const LEFT_W_MIN = 240; // ツール行が折り返さない下限 (px)
export const LEFT_W_MAX = 560;
export const PINNED_MAX_ROWS = 8; // ピン留めレーンの最大表示行数 (超えた分はホイールでスクロール)
export const KEY_BAND_H = KEYNUM * KEY_HEIGHT; // 鍵盤全体の高さ (px、縦スクロール範囲)

// 左パネル幅を範囲内へ丸める。保存値が壊れていたら既定幅に戻す
export function clampLeftW(w: number): number {
  if (!Number.isFinite(w)) return LEFT_W_DEFAULT;
  return Math.round(clamp(w, LEFT_W_MIN, LEFT_W_MAX));
}
