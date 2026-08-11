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

// 本家 WoiceUnit::data_reset / default_coodinate / _envelope_default 相当のデフォルト音声。
// basic_key は本家と同じ 0x4500 - 0x0c00*2 = 0x2d00 (再生音程が本家 ptVoice と一致する)
export function createDefaultWoice(): Woice {
  const w = new Woice();
  w.voiceAllocate(2);
  for (let i = 0; i < 2; i++) {
    const vc = w.getVoice(i)!;
    // 本家 data_reset: 0x4500 - 0x0c00 * 2
    vc.basicKey = 0x2d00;
    // B面のデフォルトは本家データ上 0 だが、編集 UI の都合で 64 にする
    // (波形はゼロなので実音は出ない)
    vc.volume = 64;
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

// ---- エンベロープの編集ルール (本家 ptuiEnvelope.cpp 準拠) ----
// エンベロープ点の x は「前の点からの区間長」で、表示・編集は累積座標を使う。

export interface EnveDisplayPoint {
  index: number; // points 配列のインデックス
  x: number; // 累積 x (表示座標)
  y: number;
  interval: number; // 区間長 (points[i].x)
}

// ヘッド部 (points[0..count-1]) の表示点列。ゼロ点 (x=0,y=0, i>0) は未使用スロットとして
// スキップし、x は累積座標に変換する (本家 _put の累積描画と同じ)
export function enveDisplayPoints(points: { x: number; y: number }[], count: number): EnveDisplayPoint[] {
  const out: EnveDisplayPoint[] = [];
  let acc = 0;
  for (let i = 0; i < count; i++) {
    const p = points[i];
    if (!p) continue;
    if (i === 0 || p.x || p.y) {
      acc += p.x;
      out.push({ index: i, x: acc, y: p.y, interval: p.x });
    }
  }
  return out;
}

// 点追加: 累積座標 cx の位置に挿入 (本家 _point_add)。
// 同一累積 x は既存点の y を更新、空きスロットは末尾追加として埋める。成功時 true
export function enveInsertPoint(points: { x: number; y: number }[], maxHead: number, cx: number, y: number): boolean {
  if (cx < 0) return false;
  let cur = cx;
  for (let idx = 0; idx < maxHead; idx++) {
    const p = points[idx]!;
    if (idx > 0 && !p.x && !p.y) {
      // 最初の空きスロット = 末尾追加 (本家の add last)
      points[idx] = { x: cur, y };
      return true;
    }
    if (p.x > cur) {
      // 挿入: 後続の区間長を短縮してシフト (本家の insert)
      for (let j = maxHead - 1; j > idx; j--) points[j] = points[j - 1]!;
      points[idx + 1]!.x -= cur;
      points[idx] = { x: cur, y };
      return true;
    }
    if (p.x === cur) {
      // 同一位置 → y 更新
      points[idx]!.y = y;
      return true;
    }
    cur -= p.x;
  }
  // 末尾を超えるクリックは追加しない (本家準拠)
  return true;
}

// 点削除: 後続の区間長を延長してシフト (本家 _point_delete)。
// 有効点が1つのみ (points[1] が空) なら削除不可
export function enveDeletePoint(points: { x: number; y: number }[], maxHead: number, idx: number): boolean {
  if (idx <= 0 || idx >= maxHead) return false;
  if (!points[1]!.x) return false;
  if (idx < maxHead - 1 && (points[idx + 1]!.x || points[idx + 1]!.y)) {
    points[idx + 1]!.x += points[idx]!.x;
  }
  for (let i = idx; i < maxHead - 1; i++) points[i] = points[i + 1]!;
  points[maxHead - 1] = { x: 0, y: 0 };
  return true;
}

// ヘッド点ドラッグ: 累積座標 cx を前後の累積座標の間にクランプして区間長として保存する。
// (前後の点を乗り越えられないようにする。本家には無いが座標波形と同じルール)
// クランプは「有効点 (ゼロ点を除く)」を基準に行う。配列の隣接要素でクランプすると、
// 末尾の有効点の後ろはゼロ点 (区間長 0) のため accs[idx+1] == accs[idx] となり
// 右へ動かせなくなる。末尾の有効点は右方向へ自由に動かせる
export function enveSetHeadPointX(points: { x: number; y: number }[], maxHead: number, idx: number, cx: number): void {
  if (idx <= 0 || idx >= maxHead) return;
  const disp = enveDisplayPoints(points, maxHead);
  let prev = 0;
  let next = -1; // -1 = 上限なし (末尾の有効点)
  let found = false;
  for (let i = 0; i < disp.length; i++) {
    if (disp[i]!.index === idx) {
      prev = i > 0 ? disp[i - 1]!.x : 0;
      next = i < disp.length - 1 ? disp[i + 1]!.x : -1;
      found = true;
      break;
    }
  }
  if (!found) return;
  const minX = prev + 1;
  const clamped = next < 0 ? Math.max(minX, cx) : Math.max(minX, Math.min(next - 1, cx));
  points[idx]!.x = clamped - prev;
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
