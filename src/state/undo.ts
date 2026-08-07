// スナップショット型 undo/redo。
// 編集操作の直前に ptcop バイト列を保存し、undo 時はサービスへ読み戻す。
// 複数プロジェクト対応のため、スタックはタブ切替で差し替えられる (export let)。
import { ref } from "vue";
import { MemoryIo, PxtnErr } from "pxtone-ts";
import { service, EXE_VER } from "./service";
import { doc, sync } from "./project";

const MAX_UNDO = 100;

export let undoStack: Uint8Array[] = [];
export let redoStack: Uint8Array[] = [];

export const canUndo = ref(false);
export const canRedo = ref(false);

export function setUndoStacks(u: Uint8Array[], r: Uint8Array[]): void {
  undoStack = u;
  redoStack = r;
  updateFlags();
}

function updateFlags(): void {
  canUndo.value = undoStack.length > 0;
  canRedo.value = redoStack.length > 0;
}

export function snapshotProject(): Uint8Array | null {
  if (!service.isInit) return null;
  const io = new MemoryIo();
  if (service.write(io, false, EXE_VER) !== PxtnErr.OK) return null;
  return io.toUint8Array();
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

export function undo(): boolean {
  const b = undoStack.pop();
  updateFlags();
  if (!b) return false;
  const cur = snapshotProject();
  if (cur) {
    redoStack.push(cur);
    updateFlags();
  }
  return restoreBytes(b);
}

export function redo(): boolean {
  const b = redoStack.pop();
  updateFlags();
  if (!b) return false;
  const cur = snapshotProject();
  if (cur) {
    undoStack.push(cur);
    updateFlags();
  }
  return restoreBytes(b);
}

function restoreBytes(bytes: Uint8Array): boolean {
  const io = new MemoryIo(bytes);
  if (service.read(io) !== PxtnErr.OK) return false;
  sync();
  doc.rev++;
  return true;
}
