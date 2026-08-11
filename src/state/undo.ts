// スナップショット型 undo/redo。
// 編集操作の直前に ptcop バイト列を保存し、undo 時はサービスへ読み戻す。
// 複数プロジェクト対応のため、スタックはタブ切替で差し替えられる (export let)。
import { ref } from "vue";
import { MemoryIo, PxtnErr } from "pxtone-ts";
import { service, EXE_VER } from "./service";
import { doc, sync, uiRepeatToFile, fileRepeatToUi } from "./project";

const MAX_UNDO = 100;

// ptcop の write/read は measNum・repeatMeas を保持しない (read 時に
// adjustMeasNum で縮小・リセットされる) ため、UI 表示値 (repeatMeas は 1-based) を
// スナップショットに併せて持つ (undo/redo で小節数・Repeat が失われるのを防ぐ)
export interface UndoEntry {
  bytes: Uint8Array;
  measNum: number;
  repeatMeas: number;
}

export let undoStack: UndoEntry[] = [];
export let redoStack: UndoEntry[] = [];

export const canUndo = ref(false);
export const canRedo = ref(false);

export function setUndoStacks(newUndo: UndoEntry[], newRedo: UndoEntry[]): void {
  undoStack = newUndo;
  redoStack = newRedo;
  updateFlags();
}

function updateFlags(): void {
  canUndo.value = undoStack.length > 0;
  canRedo.value = redoStack.length > 0;
}

export function snapshotProject(): UndoEntry | null {
  if (!service.isInit) return null;
  const io = new MemoryIo();
  if (service.write(io, false, EXE_VER) !== PxtnErr.OK) return null;
  // repeatMeas は doc が書き換わった後でもエンジンはまだ編集前の値を持つ
  // (setRepeatMeas は doc 代入 → pushUndo → エンジン反映 の順) ため、エンジンから取る
  return {
    bytes: io.toUint8Array(),
    measNum: service.master.measNum,
    repeatMeas: fileRepeatToUi(service.master.repeatMeas),
  };
}

// 編集開始 (ドラッグ操作の開始時) に呼ぶ。1回の編集で1エントリ
export function pushUndo(): void {
  const b = snapshotProject();
  if (!b) return;
  undoStack.push(b);
  if (undoStack.length > MAX_UNDO) undoStack.shift();
  redoStack.length = 0;
  updateFlags();
}

export function clearUndo(): void {
  undoStack.length = 0;
  redoStack.length = 0;
  updateFlags();
}

// stack から pop したスナップショットへ戻し、現在状態を pushTo へ積む (undo/redo 共通)
function restoreFrom(stack: UndoEntry[], pushTo: UndoEntry[]): boolean {
  const b = stack.pop();
  updateFlags();
  if (!b) return false;
  const cur = snapshotProject();
  if (cur) {
    pushTo.push(cur);
    updateFlags();
  }
  return restoreBytes(b);
}

export function undo(): boolean {
  return restoreFrom(undoStack, redoStack);
}

export function redo(): boolean {
  return restoreFrom(redoStack, undoStack);
}

function restoreBytes(entry: UndoEntry): boolean {
  const io = new MemoryIo(entry.bytes);
  if (service.read(io) !== PxtnErr.OK) return false;
  // measNum / repeatMeas はファイルに保存されず read 時に縮小・リセットされるため明示的に復元する
  service.master.setMeasNum(entry.measNum);
  service.master.setRepeatMeas(uiRepeatToFile(entry.repeatMeas));
  sync();
  doc.rev++;
  return true;
}
