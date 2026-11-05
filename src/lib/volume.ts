// ボリュームオートメーションの編集方式テーブル (VolumeField の switch を定数化)
// mode (doc.volumeMode 0..7) → 書き込み方式:
//  "setValue": 値の書換のみ (Velocity)
//  "replace":  delete + add + set (Pan_Volume / Pan_Time / Volume)
//  "length":   ノート長を書き込み (Portament)
//  "scaleWoice": 0..128 を音色番号へ換算 (VoiceNo)
//  "scaleGroup": 0..128 を 0..7 へ換算 (GroupNo)
//  (7 = Tuning はインライン入力のため対象外)
export type VolumeEditKind = "setValue" | "replace" | "length" | "scaleWoice" | "scaleGroup";

// doc.volumeMode の値 (state/project の VOLUME_MODES の添字と対応する)
export const VolumeMode = {
  Velocity: 0,
  PanVolume: 1,
  PanTime: 2,
  Volume: 3,
  Portament: 4,
  VoiceNo: 5,
  GroupNo: 6,
  Tuning: 7,
} as const;

export const VOLUME_EDIT_KIND: Record<number, VolumeEditKind> = {
  [VolumeMode.Velocity]: "setValue",
  [VolumeMode.PanVolume]: "replace",
  [VolumeMode.PanTime]: "replace",
  [VolumeMode.Volume]: "replace",
  [VolumeMode.Portament]: "length",
  [VolumeMode.VoiceNo]: "scaleWoice",
  [VolumeMode.GroupNo]: "scaleGroup",
};

// 0..128 の値 → 音色番号 (0..woiceNum-1)
export function scaleToWoice(value: number, woiceNum: number): number {
  return Math.round((value / 128) * Math.max(0, woiceNum - 1));
}

// 0..128 の値 → グループ番号 (0..7)
export function scaleToGroup(value: number): number {
  return Math.min(7, Math.round((value / 128) * 7));
}
