// イベント (クロック単位) の編集
import { EventKind, type EveRecord } from "pxtone-ts";
import { type EventWriteOps } from "../../lib/editing";
import { service } from "../service";
import { doc, mutate, units } from "./core";
import { focusedOrSelected } from "./units";

export function clockContext(): { beatClock: number; beatNum: number; zoom: number; measNum: number } {
  return {
    beatClock: service.master.beatClock,
    beatNum: service.master.beatNum,
    zoom: doc.zoom,
    measNum: service.master.measNum,
  };
}

// 実イベントか (NULL プレースホルダでない)
export function isMeaningfulEvent(e: EveRecord): boolean {
  return e.kind !== EventKind.NULL;
}

export function getAllEvents(): EveRecord[] {
  return service.evels.records.filter(isMeaningfulEvent);
}

// ユニット別書き出しの対象。ミュート中とノートの無いユニットは含めない
export function stemUnits(): { index: number; name: string }[] {
  const withNotes = new Set(service.evels.records.filter((e) => e.kind === EventKind.ON).map((e) => e.unitNo));
  return units.value
    .filter((u) => !doc.muted.includes(u.index) && withNotes.has(u.index))
    .map((u) => ({ index: u.index, name: u.name }));
}

export function addEvent(clock: number, unitNo: number, kind: number, value: number): void {
  if (doc.readOnly) return;
  service.evels.recordAddI(clock, unitNo, kind, value);
}

export function deleteEvents(clock1: number, clock2: number, unitNo: number, kind?: number): void {
  if (doc.readOnly) return;
  if (kind !== undefined) {
    service.evels.recordDelete(clock1, clock2, unitNo, kind);
    return;
  }
  service.evels.recordDeleteByUnit(clock1, clock2, unitNo);
}

export function setEventValue(clock1: number, clock2: number, unitNo: number, kind: number, value: number): void {
  if (doc.readOnly) return;
  service.evels.recordValueSet(clock1, clock2, unitNo, kind, value);
}

// lib/editing の書き込み API アダプタ (KeyField / VolumeField / PinnedLanes で共有)
export const projectWriteOps: EventWriteOps = { deleteEvents, addEvent, setEventValue };

// 範囲内のイベント値を加算変更する (本家の「ベロシティ/パン/ボリューム」相当)。
// 対象はフォーカス+選択中のユニット。加算は recordValueChange が
// 種別ごとの上限 (0..128 等) にクランプする
export function changeEventValue(clock1: number, clock2: number, kind: number, value: number): void {
  const targets = focusedOrSelected();
  if (targets.length === 0) return;
  mutate(() => {
    for (const u of targets) {
      service.evels.recordValueChange(clock1, clock2, u, kind, value);
    }
  });
}

// 小節コピー (本家の「小節コピー」相当)。
// [c1, c2) のイベントを対象ユニット (フォーカス+選択) から kinds で
// フィルタして収集し、to 位置から幅×times 分ペーストする。
// ON イベントの長さはコピー範囲内にクランプする
export function copyMeas(c1: number, c2: number, to: number, times: number, kinds: number[]): void {
  if (c2 <= c1 || times < 1) return;
  const targets = focusedOrSelected();
  if (targets.length === 0) return;
  const width = c2 - c1;
  mutate(() => {
    const copied: { clock: number; unitNo: number; kind: number; value: number }[] = [];
    for (const e of service.evels.records) {
      if (!isMeaningfulEvent(e)) continue;
      if (e.clock < c1 || e.clock >= c2) continue;
      if (!targets.includes(e.unitNo)) continue;
      if (!kinds.includes(e.kind)) continue;
      let value = e.value;
      if (e.kind === EventKind.ON && e.clock + e.value > c2) value = c2 - e.clock;
      copied.push({ clock: e.clock - c1, unitNo: e.unitNo, kind: e.kind, value });
    }
    for (let i = 0; i < times; i++) {
      const base = to + i * width;
      for (const ev of copied) {
        service.evels.recordAddI(base + ev.clock, ev.unitNo, ev.kind, ev.value);
      }
    }
  });
}
