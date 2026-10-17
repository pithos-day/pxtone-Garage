// イベント音量ダイアログの共有定義。
// SFC (EventVolumeDialog.vue) から型・テーブルを export する変則構造を解消するため
// MenuBar / AppShell ともここを参照する
import { EventKind } from "pxtone-ts";

// 対象イベント種別
export type EventVolumeMode = "velocity" | "pantime" | "panvolume" | "volume" | "transpose";

// モード → i18n キー
export const EVENT_VOLUME_TITLES: Record<EventVolumeMode, string> = {
  velocity: "menu.edit.velocity",
  pantime: "menu.edit.pantime",
  panvolume: "menu.edit.panvolume",
  volume: "menu.edit.volume",
  transpose: "menu.edit.transpose",
};

// モード → 書き込み対象イベント種別
export const EVENT_VOLUME_KINDS: Record<EventVolumeMode, EventKind> = {
  velocity: EventKind.VELOCITY,
  pantime: EventKind.PAN_TIME,
  panvolume: EventKind.PAN_VOLUME,
  volume: EventKind.VOLUME,
  transpose: EventKind.KEY,
};

// 入力値 → イベント値の倍率 (移調は半音単位 = KEY 値 0x100 ずつ。本家 dlg_EventVolume 準拠)
export const EVENT_VOLUME_VALUE_SCALE: Record<EventVolumeMode, number> = {
  velocity: 1,
  pantime: 1,
  panvolume: 1,
  volume: 1,
  transpose: 0x100,
};
