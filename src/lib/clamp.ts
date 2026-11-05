// 値を [min, max] の範囲に収める。min > max のときは min を返す
export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
