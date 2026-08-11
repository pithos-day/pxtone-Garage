// ノイズ (.ptnoise) ドキュメント管理。
// タブ管理・undo スタックは doc-tabs.ts の共通実装を使い、
// ここでは実体 (Noise) の読み書きとデフォルト生成だけを提供する。
import { markRaw } from "vue";
import { Noise, WaveType, MemoryIo, PxtnErr } from "pxtone-ts";
import { pxtnErrorMessage } from "./project";
import { createDocTabs, type TabDocBase } from "./doc-tabs";

export const NOISE_UNIT_NUM = 4; // 本家 MAX_NOISEEDITUNITNUM
export const NOISE_ENVE_NUM = 3; // 本家 MAX_NOISEEDITENVELOPENUM

export interface NoiseDoc extends TabDocBase {
  noise: Noise;
}

const tabs = createDocTabs<NoiseDoc>({
  snapshot: (d) => {
    const io = new MemoryIo();
    if (!d.noise.write(io)) return null;
    return io.toUint8Array();
  },
  restore: (d, bytes) => d.noise.read(new MemoryIo(bytes)) === PxtnErr.OK,
});

export const noises = tabs.docs;
export const currentNoiseId = tabs.currentId;

export function currentNoise(): NoiseDoc | null {
  // noise は markRaw で格納しているため実体は Noise のまま
  return tabs.current() as NoiseDoc | null;
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

// 1回の編集操作 (undo 1エントリ + dirty 化)
export function editNoise(fn: () => void): void {
  const d = currentNoise();
  if (!d) return;
  tabs.edit(d, fn);
}

export function undoNoise(): boolean {
  const d = currentNoise();
  return d ? tabs.restoreFrom(d, d.undoStack, d.redoStack) : false;
}

export function redoNoise(): boolean {
  const d = currentNoise();
  return d ? tabs.restoreFrom(d, d.redoStack, d.undoStack) : false;
}

// 新規タブを追加して切り替える
export function newNoise(): NoiseDoc {
  return tabs.add({ fileName: "", dirty: false, noise: markRaw(createDefaultNoise()), undoStack: [], redoStack: [] });
}

// .ptnoise バイト列から新規タブを開く。エラーメッセージを返す (成功時 null)
export function openNoise(bytes: Uint8Array, name: string): string | null {
  const n = new Noise();
  const res = n.read(new MemoryIo(bytes));
  if (res !== PxtnErr.OK) return pxtnErrorMessage(res);
  tabs.add({ fileName: name, dirty: false, noise: markRaw(n), undoStack: [], redoStack: [] });
  return null;
}

export function closeNoise(id: number): void {
  tabs.close(id);
}

export function switchNoise(id: number): void {
  tabs.switchTo(id);
}

// 現在のノイズを .ptnoise として保存 (asNew でファイル名入力を促す)
export function saveNoise(asNew: boolean): boolean {
  const d = currentNoise();
  if (!d) return false;
  return tabs.save(d, asNew, ".ptnoise");
}
