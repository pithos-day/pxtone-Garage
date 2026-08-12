// ドラッグ編集でイベント列を書き換える共通操作。
// deleteEvents / addEvent / setEventValue の並び (choreography) を
// コンポーネント間で共有するための純関数群。書き込み先は EventWriteOps で抽象化し、
// state 層へ依存しない (コンポーネント側で state/project の関数をアダプタとして渡す)
import { EventKind } from "pxtone-ts";
import { scaleToGroup, scaleToWoice, type VolumeEditKind } from "./volume";

// イベント書き換え API (state/project の deleteEvents / addEvent / setEventValue)
export interface EventWriteOps {
  deleteEvents(c1: number, c2: number, unit: number, kind: EventKind): void;
  addEvent(clock: number, unit: number, kind: EventKind, value: number): void;
  setEventValue(c1: number, c2: number, unit: number, kind: EventKind, value: number): void;
}

// 音符 (KEY+ON+VELOCITY) を範囲に書き込む (ピアノロールの左ドラッグ)。
// KEY は先頭クロックに 1 個、ON は長さ c2-c1 で先頭に置く
export function writeNote(
  w: EventWriteOps,
  c1: number,
  c2: number,
  unit: number,
  keyValue: number,
  velocity: number,
): void {
  w.deleteEvents(c1, c2, unit, EventKind.KEY);
  w.addEvent(c1, unit, EventKind.KEY, keyValue);
  w.deleteEvents(c1, c2, unit, EventKind.VELOCITY);
  w.addEvent(c1, unit, EventKind.VELOCITY, velocity);
  w.deleteEvents(c1, c2, unit, EventKind.ON);
  w.addEvent(c1, unit, EventKind.ON, c2 - c1);
}

// 音符の長さのみ書き込む (ON+VELOCITY。ピン留めレーンの左ドラッグ。
// KEY は触らないため、音程は既存の KEY イベントに従う)
export function writeNoteLength(w: EventWriteOps, c1: number, c2: number, unit: number, velocity: number): void {
  w.deleteEvents(c1, c2, unit, EventKind.ON);
  w.deleteEvents(c1, c2, unit, EventKind.VELOCITY);
  w.addEvent(c1, unit, EventKind.ON, c2 - c1);
  w.addEvent(c1, unit, EventKind.VELOCITY, velocity);
}

// 音符を消す (右ドラッグ)。key / onVel で消す種別を選ぶ
// (ピアノロールの手ツールは KEY のみ、通常は KEY+ON+VELOCITY すべて)
export function eraseNote(
  w: EventWriteOps,
  c1: number,
  c2: number,
  unit: number,
  opts: { key: boolean; onVel: boolean },
): void {
  if (opts.key) w.deleteEvents(c1, c2, unit, EventKind.KEY);
  if (opts.onVel) {
    w.deleteEvents(c1, c2, unit, EventKind.ON);
    w.deleteEvents(c1, c2, unit, EventKind.VELOCITY);
  }
}

// ボリュームオートメーションの方式別書き込み (ボリュームフィールドの左ドラッグ)。
// 方式 (VolumeEditKind) ごとに delete+add+set の並びが変わる
export function writeVolumeEvent(
  w: EventWriteOps,
  c1: number,
  c2: number,
  unit: number,
  kind: EventKind,
  edit: VolumeEditKind,
  value: number,
  woiceNum: number,
): void {
  if (edit === "setValue") {
    // Velocity: 値の書換のみ
    w.setEventValue(c1, c2, unit, kind, value);
  } else if (edit === "replace") {
    // Pan_Volume / Pan_Time / Volume
    w.deleteEvents(c1, c2, unit, kind);
    w.addEvent(c1, unit, kind, value);
    w.setEventValue(c1, c2, unit, kind, value);
  } else if (edit === "length") {
    // Portament: 長さを書き込み
    w.deleteEvents(c1, c2, unit, kind);
    w.addEvent(c1, unit, kind, c2 - c1);
  } else if (edit === "scaleWoice") {
    // VoiceNo: 値 (0..128) を音色番号へ換算
    w.deleteEvents(c1, c2, unit, kind);
    w.addEvent(c1, unit, kind, scaleToWoice(value, woiceNum));
  } else {
    // GroupNo: 値 (0..128) を 0..7 へ換算
    w.deleteEvents(c1, c2, unit, kind);
    w.addEvent(c1, unit, kind, scaleToGroup(value));
  }
}
