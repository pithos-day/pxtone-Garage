// 出力レベルメーターの計算 (state 層に依存しない純関数)
// エンジンは出力を int16 の ±32767 に飽和させるため、この値に達したら音割れとみなす
export const CLIP_SAMPLE = 32767;

// 表示する範囲の下限 (dBFS)
const METER_FLOOR_DB = -48;
// 通知 1 回あたりの減衰率。ピークの直後にメーターが急に落ちないようにする
const METER_DECAY = 0.85;

// 新しいピークへは即座に上がり、下がるときは緩やかに落とす
export function decayLevel(previous: number, peak: number): number {
  return Math.max(peak, previous * METER_DECAY);
}

// ピーク (0..1) → メーターの長さ (0..100%)。dB スケールで表示する
export function levelToPercent(peak: number): number {
  if (peak <= 0) return 0;
  const db = 20 * Math.log10(peak);
  const percent = ((db - METER_FLOOR_DB) / -METER_FLOOR_DB) * 100;
  return Math.max(0, Math.min(100, percent));
}
