// ノイズエディタの共通定数
import { WaveType } from "pxtone-ts";

// 波形タイプの表示名。pxtone-ts の WaveType enum 定義順 (None..Saw8) に一致させる
// (enum の値側は数値のため、名前だけを列挙する)
export const NOISE_WAVE_TYPE_NAMES = Object.values(WaveType).filter(
  (v): v is string => typeof v === "string" && v !== "num",
);

export const NOISE_BUILT_SPS = 44100;
