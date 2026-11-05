// ノブの値 <-> 正規化位置 (0..1) <-> 角度の変換と、円弧パスの生成。
// log=true は 0 を含む範囲を log1p で対数化する (周波数 0..44100 など)

import { clamp } from "./clamp";

// 目盛りの両端の角度 (真上を 0 とするラジアン。±135 度)
export const KNOB_SWEEP = (135 * Math.PI) / 180;

export function knobNorm(value: number, min: number, max: number, log = false): number {
  if (max <= min) return 0;
  const v = clamp(value, min, max);
  if (log) return Math.log1p(v - min) / Math.log1p(max - min);
  return (v - min) / (max - min);
}

export function knobValue(norm: number, min: number, max: number, log = false): number {
  const n = clamp(norm, 0, 1);
  const v = log ? min + Math.expm1(n * Math.log1p(max - min)) : min + n * (max - min);
  return clamp(Math.round(v), min, max);
}

export function knobAngle(norm: number): number {
  return -KNOB_SWEEP + clamp(norm, 0, 1) * 2 * KNOB_SWEEP;
}

// 中心 (cx, cy)、半径 r の円弧。角度の大小はどちらの順でもよい
export function knobArcPath(a0: number, a1: number, cx: number, cy: number, r: number): string {
  const from = Math.min(a0, a1);
  const to = Math.max(a0, a1);
  const sx = cx + r * Math.sin(from);
  const sy = cy - r * Math.cos(from);
  const ex = cx + r * Math.sin(to);
  const ey = cy - r * Math.cos(to);
  const large = to - from > Math.PI ? 1 : 0;
  return `M${sx.toFixed(2)} ${sy.toFixed(2)}A${r} ${r} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
}
