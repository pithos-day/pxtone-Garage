// スナップショット型 undo/redo。
// 編集操作の直前に ptcop バイト列を保存し、undo 時はサービスへ読み戻す。
// 複数プロジェクト対応のため、スタックはタブ切替で差し替えられる (export let)。
import { ref } from "vue";
import { MemoryIo, PxtnErr, type Service } from "pxtone-ts";
import { service, EXE_VER } from "./service";
import { restoreWoiceKeys, woiceKeysOf } from "./woice-keys";
import { NO_UNIT_KEY, restoreUnitKeys, unitKeysOf } from "./unit-keys";
import { exitSolo } from "./project/core";
import { doc, sync, uiRepeatToFile, fileRepeatToUi } from "./project";
import { isRevisionSaved, markRevisionSaved, newRevisionTracker, touchRevision, type RevisionTracker } from "../lib/revision";

const MAX_UNDO = 100;

// ptcop の write/read は measNum・repeatMeas を保持しない (read 時に
// adjustMeasNum で縮小・リセットされる) ため、UI 表示値 (repeatMeas は 1-based) を
// スナップショットに併せて持つ (undo/redo で小節数・Repeat が失われるのを防ぐ)
export interface UndoEntry {
  bytes: Uint8Array;
  measNum: number;
  repeatMeas: number;
  woiceKeys: number[]; // 読み戻しで作り直される音色の識別子
  unitKeys: number[]; // 読み戻しで作り直されるユニットの識別子
  unitFlags?: UnitFlags[]; // 取得時の UI 状態 (現在のタブ以外への書き戻しでは持たない)
  revision: number; // この状態のリビジョン (undo で保存時の状態へ戻ったかの判定に使う)
}

// ユニットごとの UI 状態。ファイルに保存されないので undo では巻き戻さず、今の状態を
// 同じユニットへ引き継ぐ。削除の undo で戻ってきたユニットだけは取得時の状態へ戻す
interface UnitFlags {
  muted: boolean;
  selected: boolean;
  soloBackup: boolean;
  visible: boolean;
  pinned: boolean;
}

export let undoStack: UndoEntry[] = [];
export let redoStack: UndoEntry[] = [];
let revisions: RevisionTracker = newRevisionTracker();

export const canUndo = ref(false);
export const canRedo = ref(false);

export function setUndoStacks(newUndo: UndoEntry[], newRedo: UndoEntry[], newRevisions: RevisionTracker): void {
  undoStack = newUndo;
  redoStack = newRedo;
  revisions = newRevisions;
  refreshUndoFlags();
}

// canUndo/canRedo の表示フラグを現在のスタックから再計算する。
// 別プロジェクトのスタックへ積んだ場合 (現在のタブでないとき) は呼ばないこと
export function refreshUndoFlags(): void {
  canUndo.value = undoStack.length > 0;
  canRedo.value = redoStack.length > 0;
}

// 任意の Service のスナップショット (現在のタブ以外への書き戻しでも使う)
export function snapshotService(s: Service, revision: number): UndoEntry | null {
  if (!s.isInit) return null;
  const io = new MemoryIo();
  if (s.write(io, false, EXE_VER) !== PxtnErr.OK) return null;
  // repeatMeas は doc が書き換わった後でもエンジンはまだ編集前の値を持つ
  // (setRepeatMeas は doc 代入 → pushUndo → エンジン反映 の順) ため、エンジンから取る
  return {
    bytes: io.toUint8Array(),
    measNum: s.master.measNum,
    repeatMeas: fileRepeatToUi(s.master.repeatMeas),
    woiceKeys: woiceKeysOf(s),
    unitKeys: unitKeysOf(s),
    revision,
  };
}

function currentUnitFlags(): UnitFlags[] {
  return Array.from({ length: service.unitNum }, (_, u) => ({
    muted: doc.muted.includes(u),
    selected: doc.selectedUnits.includes(u),
    soloBackup: doc.soloBackup.includes(u),
    visible: doc.unitVisible[u] ?? true,
    pinned: doc.unitPinned[u] ?? false,
  }));
}

export function snapshotProject(): UndoEntry | null {
  const entry = snapshotService(service, revisions.current);
  if (entry) entry.unitFlags = currentUnitFlags();
  return entry;
}

// 現在のプロジェクトが編集された
export function touchCurrentRevision(): void {
  touchRevision(revisions);
}

// 現在のプロジェクトの今の状態を保存済みとして扱う
export function markCurrentRevisionSaved(): void {
  markRevisionSaved(revisions);
}

// 任意の undo スタックへエントリを積む (上限と redo クリアは pushUndo と共通)
export function pushUndoToStack(stack: UndoEntry[], redoStack: UndoEntry[], entry: UndoEntry): void {
  stack.push(entry);
  if (stack.length > MAX_UNDO) stack.shift();
  redoStack.length = 0;
}

// 編集開始 (ドラッグ操作の開始時) に呼ぶ。1回の編集で1エントリ
export function pushUndo(): void {
  const b = snapshotProject();
  if (!b) return;
  pushUndoToStack(undoStack, redoStack, b);
  refreshUndoFlags();
}

export function clearUndo(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  refreshUndoFlags();
}

// stack から pop したスナップショットへ戻し、現在状態を pushTo へ積む (undo/redo 共通)
function restoreFrom(stack: UndoEntry[], pushTo: UndoEntry[]): boolean {
  const b = stack.pop();
  refreshUndoFlags();
  if (!b) return false;
  const cur = snapshotProject();
  if (cur) {
    pushTo.push(cur);
    refreshUndoFlags();
  }
  if (!restoreBytes(b)) return false;
  revisions.current = b.revision;
  doc.dirty = !isRevisionSaved(revisions);
  return true;
}

export function undo(): boolean {
  return restoreFrom(undoStack, redoStack);
}

export function redo(): boolean {
  return restoreFrom(redoStack, undoStack);
}

// 読み戻し後のユニット番号に合わせて UI 状態を付け替える
function applyUnitFlags(entry: UndoEntry, before: UnitState): void {
  const flags = entry.unitKeys.map(
    (key, u): UnitFlags =>
      before.flags.get(key) ?? entry.unitFlags?.[u] ?? { muted: false, selected: false, soloBackup: false, visible: true, pinned: false },
  );
  const unitsWith = (name: "muted" | "selected" | "soloBackup"): number[] => flags.flatMap((f, u) => (f[name] ? [u] : []));
  doc.muted = unitsWith("muted");
  doc.selectedUnits = unitsWith("selected");
  doc.soloBackup = unitsWith("soloBackup");
  doc.unitVisible = flags.map((f) => f.visible);
  doc.unitPinned = flags.map((f) => f.pinned);
  doc.focusUnit = before.focusKey === NO_UNIT_KEY ? -1 : entry.unitKeys.indexOf(before.focusKey);
  if (before.soloKey === NO_UNIT_KEY) return;
  doc.soloUnit = entry.unitKeys.indexOf(before.soloKey);
  // ソロ対象がなくなったら解除して元のミュート状態へ戻す
  if (doc.soloUnit < 0) exitSolo();
}

interface UnitState {
  flags: Map<number, UnitFlags>;
  focusKey: number;
  soloKey: number;
}

function currentUnitState(): UnitState {
  const unitKeys = unitKeysOf(service);
  const flags = currentUnitFlags();
  return {
    flags: new Map(unitKeys.map((key, u) => [key, flags[u]!])),
    focusKey: unitKeys[doc.focusUnit] ?? NO_UNIT_KEY,
    soloKey: unitKeys[doc.soloUnit] ?? NO_UNIT_KEY,
  };
}

function restoreBytes(entry: UndoEntry): boolean {
  const io = new MemoryIo(entry.bytes);
  const before = currentUnitState();
  if (service.read(io) !== PxtnErr.OK) return false;
  restoreWoiceKeys(service, entry.woiceKeys);
  restoreUnitKeys(service, entry.unitKeys);
  applyUnitFlags(entry, before);
  // measNum / repeatMeas はファイルに保存されず read 時に縮小・リセットされるため明示的に復元する
  service.master.setMeasNum(entry.measNum);
  service.master.setRepeatMeas(uiRepeatToFile(entry.repeatMeas));
  sync();
  doc.rev++;
  return true;
}
