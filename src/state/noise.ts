// ノイズ (.ptnoise) ドキュメント管理。
// 音声 (voice.ts) と同様、タブごとに独立した Noise / undo スタックを持つ。
// undo は Noise.write によるバイト列スナップショット方式。
import { ref, markRaw } from "vue";
import { Noise, WaveType, MemoryIo, PxtnErr } from "pxtone-ts";
import { pxtnErrorMessage } from "./project";
import { downloadBytes, sanitizeFileName } from "../engine/io";
import { t } from "../i18n";

const MAX_UNDO = 100;
export const NOISE_UNIT_NUM = 4; // 本家 MAX_NOISEEDITUNITNUM
export const NOISE_ENVE_NUM = 3; // 本家 MAX_NOISEEDITENVELOPENUM

export interface NoiseDoc {
  id: number;
  fileName: string;
  dirty: boolean;
  noise: Noise;
  undoStack: Uint8Array[];
  redoStack: Uint8Array[];
}

export const noises = ref<NoiseDoc[]>([]);
export const currentNoiseId = ref(-1);

let nextId = 1;

export function currentNoise(): NoiseDoc | null {
  const n = noises.value.find((x) => x.id === currentNoiseId.value);
  // noise は markRaw で格納しているため実体は Noise のまま
  return n ? (n as unknown as NoiseDoc) : null;
}

// 本家 ptNoise NoiseTable_SetDefault 相当のデフォルトノイズ
export function createDefaultNoise(): Noise {
  const n = new Noise();
  n.allocate(NOISE_UNIT_NUM, NOISE_ENVE_NUM);
  n.setSmpNum44k(44100);
  for (let u = 0; u < NOISE_UNIT_NUM; u++) {
    const unit = n.getUnit(u)!;
    unit.bEnable = u === 0;
    unit.pan = 0;
    unit.enveNum = 2;
    unit.enves = [
      { x: 0, y: 100 },
      { x: 1000, y: 0 },
    ];
    unit.main = { type: WaveType.Sine, freq: 440, volume: 50, offset: 0, bRev: false };
    unit.freq = { type: WaveType.None, freq: 1, volume: 0, offset: 0, bRev: false };
    unit.volu = { type: WaveType.None, freq: 1, volume: 100, offset: 0, bRev: false };
  }
  return n;
}

// ノイズスナップショット (undo 用)
export function snapshotNoise(d: NoiseDoc): Uint8Array | null {
  const io = new MemoryIo();
  if (!d.noise.write(io)) return null;
  return io.toUint8Array();
}

// 編集前のスナップショットを undo スタックへ
export function pushNoiseUndo(d: NoiseDoc): void {
  const b = snapshotNoise(d);
  if (!b) return;
  d.undoStack.push(b);
  if (d.undoStack.length > MAX_UNDO) d.undoStack.shift();
  d.redoStack.length = 0;
}

// 1回の編集操作 (undo 1エントリ + dirty 化)
export function editNoise(fn: () => void): void {
  const d = currentNoise();
  if (!d) return;
  pushNoiseUndo(d);
  fn();
  d.dirty = true;
}

function restoreNoiseFrom(d: NoiseDoc, stack: Uint8Array[], pushTo: Uint8Array[]): boolean {
  const b = stack.pop();
  if (!b) return false;
  const cur = snapshotNoise(d);
  if (cur) pushTo.push(cur);
  if (d.noise.read(new MemoryIo(b)) !== PxtnErr.OK) return false;
  d.dirty = true;
  return true;
}

export function undoNoise(): boolean {
  const d = currentNoise();
  return d ? restoreNoiseFrom(d, d.undoStack, d.redoStack) : false;
}

export function redoNoise(): boolean {
  const d = currentNoise();
  return d ? restoreNoiseFrom(d, d.redoStack, d.undoStack) : false;
}

// 新規タブを追加して切り替える
export function newNoise(): NoiseDoc {
  const doc: NoiseDoc = {
    id: nextId++,
    fileName: "",
    dirty: false,
    noise: markRaw(createDefaultNoise()),
    undoStack: [],
    redoStack: [],
  };
  noises.value.push(doc);
  currentNoiseId.value = doc.id;
  return doc;
}

// .ptnoise バイト列から新規タブを開く。エラーメッセージを返す (成功時 null)
export function openNoise(bytes: Uint8Array, name: string): string | null {
  const n = new Noise();
  const res = n.read(new MemoryIo(bytes));
  if (res !== PxtnErr.OK) return pxtnErrorMessage(res);
  const doc: NoiseDoc = {
    id: nextId++,
    fileName: name,
    dirty: false,
    noise: markRaw(n),
    undoStack: [],
    redoStack: [],
  };
  noises.value.push(doc);
  currentNoiseId.value = doc.id;
  return null;
}

export function closeNoise(id: number): void {
  const idx = noises.value.findIndex((n) => n.id === id);
  if (idx < 0) return;
  noises.value.splice(idx, 1);
  if (currentNoiseId.value === id) {
    const next = noises.value[Math.min(idx, noises.value.length - 1)];
    currentNoiseId.value = next?.id ?? -1;
  }
}

export function switchNoise(id: number): void {
  if (currentNoiseId.value !== id) currentNoiseId.value = id;
}

// 現在のノイズを .ptnoise として保存 (asNew でファイル名入力を促す)
export function saveNoise(asNew: boolean): boolean {
  const d = currentNoise();
  if (!d) return false;
  let name = d.fileName || "untitled";
  if (asNew) {
    const input = window.prompt(t("prompt.fileName"), name);
    if (input === null) return false;
    name = input.trim() || "untitled";
  }
  const io = new MemoryIo();
  if (!d.noise.write(io)) return false;
  downloadBytes(io.toUint8Array(), sanitizeFileName(name, ".ptnoise"));
  d.fileName = name;
  d.dirty = false;
  return true;
}
