// 音声 (.ptvoice) ドキュメント管理。
// コラージュの projects.ts と同様、タブごとに独立した Woice / undo スタックを持つ。
// undo は ptvWrite によるバイト列スナップショット方式。
import { ref, markRaw } from "vue";
import {
  Woice,
  WoiceType,
  VoiceType,
  MemoryIo,
  PxtnErr,
  EVENTDEFAULT_BASICKEY,
  PTV_VOICEFLAG_SMOOTH,
  PTV_VOICEFLAG_WAVELOOP,
  PTV_DATAFLAG_WAVE,
  PTV_DATAFLAG_ENVELOPE,
} from "pxtone-ts";
import { pxtnErrorMessage } from "./project";
import { downloadBytes, sanitizeFileName } from "../engine/io";
import { t } from "../i18n";

const MAX_UNDO = 100;
const WAVE_RESO = 256; // 本家 ptvCOODINATERESOLUTION
const MAX_ENVE_POINT = 31; // 本家 ptvMAX_ENVELOPEPOINT

export interface VoiceDoc {
  id: number;
  fileName: string;
  dirty: boolean;
  woice: Woice;
  undoStack: Uint8Array[];
  redoStack: Uint8Array[];
}

export const voices = ref<VoiceDoc[]>([]);
export const currentVoiceId = ref(-1);

let nextId = 1;

export function currentVoice(): VoiceDoc | null {
  const v = voices.value.find((x) => x.id === currentVoiceId.value);
  // woice は markRaw で格納しているため実体は Woice のまま
  return v ? (v as unknown as VoiceDoc) : null;
}

// ---- Coordinate 波形の編集ルール (本家 ptuiWave.cpp 準拠) ----

// 点ドラッグ: 前後の点を越えられないよう x をクランプする (本家 _point_set)。
// idx 0 は x=0 固定 (動かせない)
export function clampWavePointX(points: { x: number }[], idx: number, x: number, reso: number): number {
  if (idx <= 0) return points[0]!.x;
  const minX = points[idx - 1]!.x;
  const maxX = idx < points.length - 1 ? points[idx + 1]!.x : reso;
  return Math.max(minX, Math.min(maxX, x));
}

// 点追加: x でソートされた位置に挿入 (本家 _point_add)。同一 x は既存点の y を更新。
// x=0 は点0 が占有するため不可、最大 maxNum 点。成功時 true
export function insertWavePoint(points: { x: number; y: number }[], x: number, y: number, maxNum: number): boolean {
  if (x <= 0) return false;
  for (let i = 0; i < points.length; i++) {
    if (x === points[i]!.x) {
      points[i]!.y = y;
      return true;
    }
    if (x < points[i]!.x) {
      points.splice(i, 0, { x, y });
      return true;
    }
  }
  if (points.length >= maxNum) return false;
  points.push({ x, y });
  return true;
}

// 本家 WoiceUnit::data_reset / default_coodinate / _envelope_default 相当のデフォルト音声
export function createDefaultWoice(): Woice {
  const w = new Woice();
  w.voiceAllocate(2);
  for (let i = 0; i < 2; i++) {
    const vc = w.getVoice(i)!;
    vc.basicKey = EVENTDEFAULT_BASICKEY;
    vc.volume = i ? 0 : 64;
    vc.pan = 64;
    vc.tuning = 1;
    vc.type = VoiceType.Coodinate;
    vc.voiceFlags = PTV_VOICEFLAG_SMOOTH | PTV_VOICEFLAG_WAVELOOP;
    vc.dataFlags = PTV_DATAFLAG_WAVE | PTV_DATAFLAG_ENVELOPE;
    vc.wave.reso = WAVE_RESO;
    if (i) {
      vc.wave.num = 1;
      vc.wave.points = [{ x: 0, y: 0 }];
    } else {
      vc.wave.num = 3;
      vc.wave.points = [
        { x: 0, y: 0 },
        { x: 64, y: 64 },
        { x: 192, y: -64 },
      ];
    }
    vc.envelope.fps = 1000;
    vc.envelope.headNum = MAX_ENVE_POINT;
    vc.envelope.bodyNum = 0;
    vc.envelope.tailNum = 1;
    vc.envelope.points = [];
    for (let e = 0; e < MAX_ENVE_POINT + 1; e++) vc.envelope.points.push({ x: 0, y: 0 });
    vc.envelope.points[0] = { x: 0, y: 96 };
    vc.envelope.points[MAX_ENVE_POINT] = { x: 1, y: 0 };
  }
  return w;
}

// 音声スナップショット (undo 用)
export function snapshotVoice(v: VoiceDoc): Uint8Array | null {
  const io = new MemoryIo();
  if (v.woice.ptvWrite(io) < 0) return null;
  return io.toUint8Array();
}

// 編集前のスナップショットを undo スタックへ
export function pushVoiceUndo(v: VoiceDoc): void {
  const b = snapshotVoice(v);
  if (!b) return;
  v.undoStack.push(b);
  if (v.undoStack.length > MAX_UNDO) v.undoStack.shift();
  v.redoStack.length = 0;
}

// 1回の編集操作 (undo 1エントリ + dirty 化)
export function editVoice(fn: () => void): void {
  const v = currentVoice();
  if (!v) return;
  pushVoiceUndo(v);
  fn();
  v.dirty = true;
}

function restoreVoiceFrom(v: VoiceDoc, stack: Uint8Array[], pushTo: Uint8Array[]): boolean {
  const b = stack.pop();
  if (!b) return false;
  const cur = snapshotVoice(v);
  if (cur) pushTo.push(cur);
  const io = new MemoryIo(b);
  if (v.woice.read(io, WoiceType.PTV) !== PxtnErr.OK) return false;
  v.dirty = true;
  return true;
}

export function undoVoice(): boolean {
  const v = currentVoice();
  return v ? restoreVoiceFrom(v, v.undoStack, v.redoStack) : false;
}

export function redoVoice(): boolean {
  const v = currentVoice();
  return v ? restoreVoiceFrom(v, v.redoStack, v.undoStack) : false;
}

// 新規タブを追加して切り替える
export function newVoice(): VoiceDoc {
  const doc: VoiceDoc = {
    id: nextId++,
    fileName: "",
    dirty: false,
    woice: markRaw(createDefaultWoice()),
    undoStack: [],
    redoStack: [],
  };
  voices.value.push(doc);
  currentVoiceId.value = doc.id;
  return doc;
}

// .ptvoice バイト列から新規タブを開く。エラーメッセージを返す (成功時 null)
export function openVoice(bytes: Uint8Array, name: string): string | null {
  const w = new Woice();
  const res = w.read(new MemoryIo(bytes), WoiceType.PTV);
  if (res !== PxtnErr.OK) return pxtnErrorMessage(res);
  const doc: VoiceDoc = {
    id: nextId++,
    fileName: name,
    dirty: false,
    woice: markRaw(w),
    undoStack: [],
    redoStack: [],
  };
  voices.value.push(doc);
  currentVoiceId.value = doc.id;
  return null;
}

export function closeVoice(id: number): void {
  const idx = voices.value.findIndex((v) => v.id === id);
  if (idx < 0) return;
  voices.value.splice(idx, 1);
  if (currentVoiceId.value === id) {
    const next = voices.value[Math.min(idx, voices.value.length - 1)];
    currentVoiceId.value = next?.id ?? -1;
  }
}

export function switchVoice(id: number): void {
  if (currentVoiceId.value !== id) currentVoiceId.value = id;
}

// 現在の音声を .ptvoice として保存 (asNew でファイル名入力を促す)
export function saveVoice(asNew: boolean): boolean {
  const v = currentVoice();
  if (!v) return false;
  let name = v.fileName || "untitled";
  if (asNew) {
    const input = window.prompt(t("prompt.fileName"), name);
    if (input === null) return false;
    name = input.trim() || "untitled";
  }
  const io = new MemoryIo();
  if (v.woice.ptvWrite(io) < 0) return false;
  const bytes = io.toUint8Array();
  downloadBytes(bytes, sanitizeFileName(name, ".ptvoice"));
  v.fileName = name;
  v.dirty = false;
  return true;
}
