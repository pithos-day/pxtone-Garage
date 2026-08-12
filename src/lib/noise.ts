// ノイズエディタの共通定数
import { WaveType } from "pxtone-ts";

// 波形タイプの表示名。pxtone-ts の WaveType enum 定義順 (None..Saw8) に一致させる
// (enum の値側は数値のため、名前だけを列挙する)
export const NOISE_WAVE_TYPE_NAMES = Object.values(WaveType).filter(
  (v): v is string => typeof v === "string" && v !== "num",
);

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
// 新しい最終記録時刻を返す
export const NOISE_HISTORY_COALESCE_MS = 2000;
export const NOISE_HISTORY_MAX = 30;
export function pushHistoryEntry<T>(history: T[], lastAt: number, now: number, entry: T): number {
  if (history.length > 0 && now - lastAt < NOISE_HISTORY_COALESCE_MS) {
    history[0] = entry;
  } else {
    history.unshift(entry);
    if (history.length > NOISE_HISTORY_MAX) history.length = NOISE_HISTORY_MAX;
  }
  return now;
}
