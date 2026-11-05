// ピアノロールのノート選択とノート単位の編集
import { EVENTDEFAULT_KEY, EventKind } from "pxtone-ts";
import { quantizeNotes } from "../../lib/quantize";
import { clearNotes, collectNoteEvents, notesInUnit, placeNotes, type SmartNote } from "../../lib/smart-note";
import { service } from "../service";
import { doc, mutate } from "./core";
import { focusedOrSelected } from "./units";
import { projectWriteOps } from "./events";
import { scopeClip, scopeClipIsNotes, scopeClipReady, setNoteClip } from "./scope";

// 選択中のノート (フォーカスユニットに実在するもののみ、時間順)
export function selectedNoteList(): SmartNote[] {
  if (doc.focusUnit < 0 || doc.selectedNotes.length === 0) return [];
  const heads = new Set(doc.selectedNotes);
  return notesInUnit(service.evels.records, doc.focusUnit, EVENTDEFAULT_KEY).filter((n) => heads.has(n.head));
}

export function hasNoteSelection(): boolean {
  return doc.selectedNotes.length > 0;
}

export function clearNoteSelection(): void {
  if (doc.selectedNotes.length > 0) doc.selectedNotes = [];
}

export function toggleNoteSelected(head: number): void {
  doc.selectedNotes = doc.selectedNotes.includes(head) ? doc.selectedNotes.filter((h) => h !== head) : [...doc.selectedNotes, head];
}

export function addNotesToSelection(heads: readonly number[]): void {
  doc.selectedNotes = [...new Set([...doc.selectedNotes, ...heads])];
}

// 選択中のノートを移動する (時間 offset / 音程 rowDelta)。undo は呼び出し側で管理する
export function moveSelectedNotesRaw(offset: number, rowDelta: number): void {
  if (doc.readOnly || (offset === 0 && rowDelta === 0)) return;
  const u = doc.focusUnit;
  const notes = selectedNoteList();
  const placements = notes.map((n) => ({
    origin: n.head,
    evs: collectNoteEvents(service.evels.records, u, n),
    head: n.head + offset,
    len: n.end - n.head,
    rowDelta,
  }));
  clearNotes(projectWriteOps, u, notes);
  placeNotes(projectWriteOps, () => service.evels.records, u, placements);
  doc.selectedNotes = placements.map((p) => p.head);
}

// 選択中のノートをクリップボードへコピーする
export function noteCopy(): void {
  const notes = selectedNoteList();
  if (notes.length === 0) return;
  const base = notes[0]!.head;
  const clip = notes.flatMap((n) =>
    collectNoteEvents(service.evels.records, doc.focusUnit, n).map((e) => ({ clock: e.clock - base, unitNo: doc.focusUnit, kind: e.kind, value: e.value })),
  );
  setNoteClip(clip, Math.max(...notes.map((n) => n.end)) - base);
}

// 選択中のノートを消す (後続は詰めない)
export function noteDelete(): void {
  const notes = selectedNoteList();
  if (notes.length === 0) return;
  mutate(() => {
    clearNotes(projectWriteOps, doc.focusUnit, notes);
    doc.selectedNotes = [];
  });
}

export function noteCut(): void {
  noteCopy();
  noteDelete();
}

// クリップボードの内容がノート単位のコピーか (貼り付け位置の決め方が変わる)
export function clipboardHasNotes(): boolean {
  return scopeClipIsNotes && scopeClipReady();
}

// ノート単位の貼り付け。範囲を一括で消さず、貼るノートと重なる部分だけ置き換える。
// 貼ったノートを選択状態にする
export function pasteNotes(clock: number): void {
  const u = doc.focusUnit;
  if (u < 0) return;
  const ons = scopeClip.filter((ev) => ev.kind === EventKind.ON);
  mutate(() => {
    const placements = ons.map((on) => ({
      origin: on.clock,
      evs: scopeClip.filter((ev) => ev.clock >= on.clock && ev.clock < on.clock + on.value && (ev.kind !== EventKind.ON || ev.clock === on.clock)),
      head: clock + on.clock,
      len: on.value,
      rowDelta: 0,
    }));
    placeNotes(projectWriteOps, () => service.evels.records, u, placements);
    doc.selectedNotes = placements.map((p) => p.head);
  });
}

// クオンタイズ。divi は 1 拍の分割数、strength は 0..1。全体で 1 undo。
// 対象は選択中のノート > 選択範囲に先頭があるノート > 対象ユニットの全ノート。
// 対象外のノートは消さない (前のノートは切り詰め、次のノートには届かないよう長さを詰める)
export function quantize(divi: number, strength: number, quantizeEnd: boolean): void {
  if (doc.readOnly || !doc.ready) return;
  const grid = Math.max(1, Math.round(service.master.beatClock / divi));
  const useSelection = hasNoteSelection();
  const hasScope = doc.scope2 > doc.scope1;
  const targets = useSelection ? (doc.focusUnit >= 0 ? [doc.focusUnit] : []) : focusedOrSelected();
  const records = service.evels.records;
  const jobs = targets.flatMap((u) => {
    const all = notesInUnit(records, u, EVENTDEFAULT_KEY);
    const notes = useSelection ? selectedNoteList() : hasScope ? all.filter((n) => n.head >= doc.scope1 && n.head < doc.scope2) : all;
    const targetHeads = new Set(notes.map((n) => n.head));
    const others = all.filter((n) => !targetHeads.has(n.head));
    const results = quantizeNotes(notes, { grid, strength, quantizeEnd });
    const changes = results.flatMap((q, i) => {
      const note = notes[i]!;
      const next = others.find((n) => n.head > q.newHead);
      const newLen = next ? Math.min(q.newLen, next.head - q.newHead) : q.newLen;
      if (!q.dropped && q.newHead === note.head && newLen === note.end - note.head) return [];
      return [{ note, q, newLen, evs: collectNoteEvents(records, u, note) }];
    });
    return changes.length > 0 ? [{ u, changes, results }] : [];
  });
  if (jobs.length === 0) return;
  mutate(() => {
    for (const { u, changes } of jobs) {
      clearNotes(projectWriteOps, u, changes.map((c) => c.note));
      const placements = changes
        .filter((c) => !c.q.dropped)
        .map((c) => ({ origin: c.note.head, evs: c.evs, head: c.q.newHead, len: c.newLen, rowDelta: 0 }));
      placeNotes(projectWriteOps, () => service.evels.records, u, placements, 0);
    }
    if (useSelection) doc.selectedNotes = jobs[0]!.results.filter((q) => !q.dropped).map((q) => q.newHead);
  });
}
