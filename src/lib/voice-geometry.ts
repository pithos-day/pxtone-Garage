// 音声エディタ (ptVoice) の波形/エンベロープ座標変換 (純関数)。
// px ↔ データ値の変換と最近傍点探索。VoiceSidePane から利用する
import type { VoiceUnit } from "pxtone-ts";

export const WAVE_PAD = 12;
export const SAMPLE_NUM = 256; // 本家 SCREEN_WAVE_MAIN 相当のサンプル数

// ---- 波形 (Coordinate) 座標変換 ----

export function coordX(c: VoiceUnit, w: number, x: number): number {
  return WAVE_PAD + (x / c.wave.reso) * (w - WAVE_PAD * 2);
}

// 本家 ptuiWave と同じく、サンプル値 (volume 込み) をパディング間の全幅でマッピングする
export function coordY(h: number, y: number): number {
  return h / 2 - (y / 128) * (h - WAVE_PAD * 2);
}

// 波形モニターのサンプル値 → y。本家 ptuiWave::_try_update 同様、
// Oscillator (倍音) は振幅 ±1 を半分の高さ、Coordinate は音量込みサンプル ±0.5 を
// パディング間の全高にマッピングする。倍音は複数の倍音が重なると振幅 1 を超えるため、
// 描画領域からはみ出さないよう上下をクランプする (本家の yy クランプ相当)
export function waveY(h: number, v: number, overtone: boolean): number {
  const scale = overtone ? h / 2 - WAVE_PAD : h - WAVE_PAD * 2;
  return Math.max(WAVE_PAD, Math.min(h - WAVE_PAD, h / 2 - v * scale));
}

export function coordPxToX(c: VoiceUnit, w: number, px: number): number {
  // 本家 _pos_fix は x を reso-1 にクランプする (x == reso の点があると
  // ptVoice.exe は読込自体を拒否するため、生成側で作らない)
  return Math.max(0, Math.min(c.wave.reso - 1, Math.round(((px - WAVE_PAD) / (w - WAVE_PAD * 2)) * c.wave.reso)));
}

// px → データ y。本家 _pos_fix 準拠で ±127 にクランプする
export function coordPxToY(h: number, py: number): number {
  return Math.max(-127, Math.min(127, Math.round(((h / 2 - py) / (h - WAVE_PAD * 2)) * 128)));
}

// カーソル y → データ y。表示は volume スケールなので逆スケールする (volume=0 は不可)
export function cursorToWaveY(h: number, py: number, volume: number): number {
  if (volume <= 0) return 0;
  return Math.max(-127, Math.min(127, Math.round((coordPxToY(h, py) * 128) / volume)));
}

// ---- エンベロープ座標変換 (x は区間長ではなく累積描画座標。maxX はグラフ右端の累積 x) ----

export function enveX(w: number, x: number, maxX: number): number {
  return WAVE_PAD + (x / maxX) * (w - WAVE_PAD * 2);
}

// 本家 _pos_fix 準拠: y は 0..128
export function enveY(h: number, y: number): number {
  return h - WAVE_PAD - (y / 128) * (h - WAVE_PAD * 2);
}

// px → 区間長 x (上限 2000 は本家のドラッグ範囲上限)
export function envePxToX(w: number, px: number, maxX: number): number {
  return Math.max(0, Math.min(2000, Math.round(((px - WAVE_PAD) / (w - WAVE_PAD * 2)) * maxX)));
}

export function envePxToY(h: number, py: number): number {
  return Math.max(0, Math.min(128, Math.round(((h - WAVE_PAD - py) / (h - WAVE_PAD * 2)) * 128)));
}

// エンベロープの x 上限: 末尾のヘッド点の 1.2 倍 (本家の余白と同様)。
// 最小 100 は「本家が 0..100 の区間長」の表示下限
export function enveMaxX(lastHeadX: number): number {
  return Math.max(100, lastHeadX * 1.2);
}

// ---- 最近傍点探索 ----

// threshold px 以内で最も近い点の index。該当なしは -1
export function nearestPoint(points: { x: number; y: number }[], px: number, py: number, threshold = 10): number {
  let best = -1;
  let bestD = threshold;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const d = Math.hypot(px - p.x, py - p.y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}
