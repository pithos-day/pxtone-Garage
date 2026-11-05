// スコープ操作 (本家の ScopeEvent に相当する)
import { eventKindIsTail } from "pxtone-ts";
import { COPIER_KINDS } from "../../lib/eventKinds";
import { service } from "../service";
import { doc, mutate } from "./core";
import { focusedOrSelected } from "./units";
import { isMeaningfulEvent } from "./events";
import { pasteNotes } from "./note-selection";

// 選択範囲 (スコープ) に対するコピー / 切り取り / クリア / 消去 / 貼り付け / 挿入。
// 対象ユニットはフォーカス+選択 (単独ならフォーカスのみ、本家 UnitFocus 相当)。
// クリップボードはスコープ操作共有で、本家同様プロジェクト (タブ) をまたいで貼り付けできる

// クリップボードのイベント (clock はコピー範囲開始からの相対クロック)
interface ScopeClipEvent {
  clock: number;
  unitNo: number;
  kind: number;
  value: number;
}

export let scopeClip: ScopeClipEvent[] = [];
let scopeClipWidth = 0; // コピー元範囲の幅 (クロック)
// 単一ユニット (W モード or 対象単独) でコピーしたか。
// true なら貼り付け時にクリップボードのユニット番号を貼り付け先へ振り直す (本家 Record_UnitNo_Set 相当)
let scopeClipFocusOnly = false;
// 選択中のノートからコピーしたか (貼り付けは範囲を消さずノート単位で置き換える)
export let scopeClipIsNotes = false;

// ノート単位のコピー結果をクリップボードへ入れる (フォーカスユニットのみが対象)
export function setNoteClip(clip: ScopeClipEvent[], width: number): void {
  scopeClip = clip;
  scopeClipWidth = width;
  scopeClipFocusOnly = true;
  scopeClipIsNotes = true;
}

// doc.copier (コピーパネル) のチェック状態 → フィルタ対象のイベント種別
function copierKinds(): number[] {
  return COPIER_KINDS.filter((k) => doc.copier[k.index] ?? true).map((k) => k.kind);
}

// スコープ操作の対象ユニット (本家 UnitFocus 相当)。
// W モード (音源編集) か対象が単独のときはフォーカスユニットのみ
function scopeUnits(): number[] {
  const targets = focusedOrSelected();
  if (doc.mode !== "U" || targets.length <= 1) {
    if (doc.focusUnit >= 0) return [doc.focusUnit];
    return targets.length > 0 ? targets : [];
  }
  return targets;
}

// 範囲の正規化 (本家 _change 相当)
function scopeRange(c1: number, c2: number): [number, number] {
  return [Math.min(c1, c2), Math.max(c1, c2)];
}

// コピー (範囲内のイベントをクリップボードへ収集)。
// kinds は対象イベント種別の一覧 (null = フィルタなし全種別、切り取りで使う)。
// 長さ種別 (ON/PORTAMENT) の value は範囲末尾にクリップする (本家準拠)
export function scopeCopy(c1: number, c2: number, kinds: number[] | null = copierKinds()): void {
  const [a, b] = scopeRange(c1, c2);
  const targets = scopeUnits();
  const clip: ScopeClipEvent[] = [];
  const tset = new Set(targets);
  const kset = kinds ? new Set<number>(kinds) : null;
  if (b > a && targets.length > 0) {
    for (const e of service.evels.records) {
      if (!isMeaningfulEvent(e)) continue;
      if (e.clock >= b) break;
      if (e.clock < a) continue;
      if (!tset.has(e.unitNo)) continue;
      if (kset && !kset.has(e.kind)) continue;
      const value = eventKindIsTail(e.kind) && e.value > b - e.clock ? b - e.clock : e.value;
      clip.push({ clock: e.clock - a, unitNo: e.unitNo, kind: e.kind, value });
    }
  }
  scopeClip = clip;
  scopeClipWidth = b - a;
  scopeClipFocusOnly = targets.length <= 1;
  scopeClipIsNotes = false;
}

// クリップボードに貼り付けられる内容があるか
export function scopeClipReady(): boolean {
  return scopeClip.length > 0 && scopeClipWidth > 0;
}

// クリア (範囲内のイベントを削除。後続は詰めない)
export function scopeClear(c1: number, c2: number): void {
  if (!doc.ready) return;
  const [a, b] = scopeRange(c1, c2);
  const targets = scopeUnits();
  if (b <= a || targets.length === 0) return;
  mutate(() => {
    for (const u of targets) service.evels.recordDeleteByUnit(a, b, u);
  });
}

// 消去 (範囲内のイベントを削除し、後続を詰めて前に寄せる)
export function scopeDelete(c1: number, c2: number): void {
  if (!doc.ready) return;
  const [a, b] = scopeRange(c1, c2);
  const targets = scopeUnits();
  if (b <= a || targets.length === 0) return;
  mutate(() => {
    for (const u of targets) {
      service.evels.recordDeleteByUnit(a, b, u);
      service.evels.recordClockShift(b, a - b, u);
    }
  });
}

// 切り取り (種別フィルタなしでコピーし、消去する。その後コピーパネルのチェックを全 ON にする
// — 本家 ScopeEvent_Cut + if_Copier_AllCheck 相当)
export function scopeCut(c1: number, c2: number): void {
  scopeCopy(c1, c2, null);
  scopeDelete(c1, c2);
  doc.copier.fill(true);
}

// 貼り付け・挿入の共通: クリップボードのコピー方式に応じて貼り付け先ユニットを決める。
// 単一ユニットでコピーした場合: すべてフォーカスユニットへ振り直す (本家 Record_UnitNo_Set 相当)。
// 複数ユニットでコピーした場合: クリップボード元と同じユニットへ (現在の編集対象のみ)
function scopeTargets(): number[] {
  if (scopeClipFocusOnly) {
    if (doc.focusUnit >= 0) return [doc.focusUnit];
  }
  return scopeUnits();
}

// 貼り付け (クリップボードの内容を clock 位置へ載せる)。
// 書き込み領域の既存イベントは種別ごとに消してから載せる (本家 _Paste 相当)。
// 種別の絞り込みは現在のコピーパネルのチェックに従う
export function scopePaste(clock: number): void {
  if (!scopeClipReady() || !doc.ready) return;
  if (scopeClipIsNotes) {
    pasteNotes(clock);
    return;
  }
  const targets = scopeTargets();
  if (targets.length === 0) return;
  const kset = new Set(copierKinds());
  mutate(() => {
    for (const u of targets) {
      // 対象ユニットに載るイベント (単独コピー時はすべて、複数コピー時は元ユニットが一致するもの)
      const events = scopeClip.filter((ev) => (scopeClipFocusOnly || ev.unitNo === u) && kset.has(ev.kind));
      // 書き込み領域の既存イベントを種別ごとに削除 (フィルタON種別のみ。クリップの種別が空でも消す)
      for (const kind of kset) {
        service.evels.recordDelete(clock, clock + scopeClipWidth, u, kind);
      }
      for (const ev of events) {
        service.evels.recordAddI(clock + ev.clock, u, ev.kind, ev.value);
      }
    }
  });
}

// 挿入 (clock 以降のイベントを貼り付け幅だけ後ろへずらし、空いた位置へ貼り付ける)。
// 貼り付けは種別フィルタなしで行う (本家 ScopeEvent_Insert 相当)
export function scopeInsert(clock: number): void {
  if (!scopeClipReady() || !doc.ready) return;
  const targets = scopeTargets();
  if (targets.length === 0) return;
  mutate(() => {
    for (const u of targets) {
      // 対象外ユニットは触らない。空いた幅 (クリップボードに無いユニット) はそのままブランクになる
      service.evels.recordClockShift(clock, scopeClipWidth, u);
      const events = scopeClip.filter((ev) => scopeClipFocusOnly || ev.unitNo === u);
      for (const ev of events) {
        service.evels.recordAddI(clock + ev.clock, u, ev.kind, ev.value);
      }
    }
  });
}
