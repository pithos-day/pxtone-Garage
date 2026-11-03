// ノイズエディタの共通定数
import { WaveType } from "pxtone-ts";

// 波形タイプの表示名と並び。本家 ptNoise の dlg_Noise_Design.cpp (type_table) と同一。
// 値は pxWAVETYPE / pxtone-ts の WaveType に対応する (enum の定義順も本家と同じ)
export const NOISE_WAVE_TYPES: readonly { value: WaveType; label: string }[] = [
  { value: WaveType.None, label: "None" },
  { value: WaveType.Sine, label: "Sine" },
  { value: WaveType.Saw, label: "Saw" },
  { value: WaveType.Rect, label: "Rect" },
  { value: WaveType.Random, label: "Random" },
  { value: WaveType.Saw2, label: "Saw2" },
  { value: WaveType.Rect2, label: "Rect2" },
  { value: WaveType.Tri, label: "Triangle" },
  { value: WaveType.Random2, label: "random2" },
  { value: WaveType.Rect3, label: "Rect-3" },
  { value: WaveType.Rect4, label: "Rect-4" },
  { value: WaveType.Rect8, label: "Rect-8" },
  { value: WaveType.Rect16, label: "Rect-16" },
  { value: WaveType.Saw3, label: "Saw-3" },
  { value: WaveType.Saw4, label: "Saw-4" },
  { value: WaveType.Saw6, label: "Saw-6" },
  { value: WaveType.Saw8, label: "Saw-8" },
];

export const NOISE_BUILT_SPS = 44100;

// ---- エンベロープ表示単位の変換 (本家 dlg_Noise_Design の
// IDC_ENVELOPE_SEC_* / IDC_ENVELOPE_VOL_* と同じ表示単位) ----

// 秒 (表示値) → エンベロープ x (1/1000 秒)。無効値は null
export function secToEnveX(raw: string): number | null {
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(10000, Math.round(v * 1000)));
}

// % (表示値) → エンベロープ y (0..100)。無効値は null
export function pctToEnveY(raw: string): number | null {
  const v = parseFloat(raw);
  if (!Number.isFinite(v)) return null;
  return Math.max(0, Math.min(100, Math.round(v)));
}

// ---- エンベロープグラフの編集 ----
// x は「直前の点からの区間長 (ms)」で、エンジンは振幅 0 から始めて最後の点の値を保持する。
// グラフでは累積座標で扱い、ここで区間長へ戻す

export interface NoiseEnvePoint {
  x: number;
  y: number;
}

const NOISE_ENVE_X_LIMIT = 10000;

function clampEnveX(v: number): number {
  return Math.max(0, Math.min(NOISE_ENVE_X_LIMIT, Math.round(v)));
}

function clampEnveY(v: number): number {
  return Math.max(0, Math.min(100, Math.round(v)));
}

export function noiseEnveCumulative(enves: readonly NoiseEnvePoint[]): number[] {
  let sum = 0;
  return enves.map((p) => (sum += p.x));
}

// グラフの横軸の最大値 (最後の点の右にサステインを見せる余白を取る)
export function noiseEnveViewMax(enves: readonly NoiseEnvePoint[]): number {
  const total = enves.reduce((sum, p) => sum + p.x, 0);
  return Math.max(100, total * 1.15);
}

// 点 index を累積座標 cumX へ動かす。前の点は越えられず、後ろの点は区間長を保って一緒に動く
export function noiseEnveMove(enves: readonly NoiseEnvePoint[], index: number, cumX: number, y: number): NoiseEnvePoint[] {
  const prev = index > 0 ? noiseEnveCumulative(enves)[index - 1]! : 0;
  return enves.map((p, i) => (i === index ? { x: clampEnveX(cumX - prev), y: clampEnveY(y) } : { ...p }));
}

// 累積座標 cumX に点を追加する。後ろの点の位置は変えない。上限に達していれば null
export function noiseEnveInsert(
  enves: readonly NoiseEnvePoint[],
  cumX: number,
  y: number,
  maxPoints: number,
): NoiseEnvePoint[] | null {
  if (enves.length >= maxPoints) return null;
  const cum = noiseEnveCumulative(enves);
  const target = Math.max(0, cumX);
  const at = cum.findIndex((c) => c >= target);
  const out = enves.map((p) => ({ ...p }));
  if (at < 0) {
    out.push({ x: clampEnveX(target - (cum[cum.length - 1] ?? 0)), y: clampEnveY(y) });
    return out;
  }
  const prev = at > 0 ? cum[at - 1]! : 0;
  const x = clampEnveX(target - prev);
  out[at]!.x = clampEnveX(out[at]!.x - x);
  out.splice(at, 0, { x, y: clampEnveY(y) });
  return out;
}

// 点 index を削除する。後ろの点の位置は変えない。最後の 1 点は消せないので null
export function noiseEnveDelete(enves: readonly NoiseEnvePoint[], index: number): NoiseEnvePoint[] | null {
  if (enves.length <= 1 || index < 0 || index >= enves.length) return null;
  const out = enves.map((p) => ({ ...p }));
  const next = out[index + 1];
  if (next) next.x = clampEnveX(next.x + out[index]!.x);
  out.splice(index, 1);
  return out;
}

// ---- ビルド履歴の追加 ----
// 連続編集 (2 秒以内の再ビルド) は直前エントリを置き換え、30 件で打ち切り。
// 新しい最終記録時刻 (ms) を返す
export const NOISE_HISTORY_COALESCE_MS = 2000;
export const NOISE_HISTORY_MAX = 30;
export function pushHistoryEntry<T>(history: T[], lastAtMs: number, nowMs: number, entry: T): number {
  if (history.length > 0 && nowMs - lastAtMs < NOISE_HISTORY_COALESCE_MS) {
    history[0] = entry;
  } else {
    history.unshift(entry);
    if (history.length > NOISE_HISTORY_MAX) history.length = NOISE_HISTORY_MAX;
  }
  return nowMs;
}
