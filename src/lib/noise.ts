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
