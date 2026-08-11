// コラージュ画面の共有レイアウト定数
// (KeyField / PinnedLanes / ScrollBar / CollageEditor で同じ値が再発明されていたため集約)
import { KEYNUM, KEY_HEIGHT } from "./clock";

export { KEYNUM, KEY_HEIGHT };

export const RULER_H = 12; // 上部ルーラー帯の高さ (px)
export const STRIP_W = 64; // 鍵盤ストリップの幅 (px)
export const NAME_W = 300 + STRIP_W; // PinnedLanes のユニット名領域幅 (左パネル + 鍵盤)
export const KEY_BAND_H = KEYNUM * KEY_HEIGHT; // 鍵盤全体の高さ (px、縦スクロール範囲)
