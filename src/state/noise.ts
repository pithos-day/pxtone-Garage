// ノイズ (.ptnoise) ドキュメント管理。
// タブ管理・undo スタックは doc-tabs.ts の共通実装を使い、
// ここでは実体 (Noise) の読み書きとデフォルト生成だけを提供する。
import { markRaw } from "vue";
import { Noise, WaveType, MemoryIo, PxtnErr, type NoiseUnit } from "pxtone-ts";
import { pxtnErrorMessage } from "./project";
import type { WoiceLink } from "./projects";
import { createDocTabs, type TabDocBase } from "./doc-tabs";
import { pushHistoryEntry } from "../lib/noise";

export const NOISE_UNIT_NUM = 4; // 本家 MAX_NOISEEDITUNITNUM
export const NOISE_ENVE_NUM = 3; // 本家 MAX_NOISEEDITENVELOPENUM

// ビルド履歴の1件。label は表示用の時刻、bytes はエディタへ戻す際のノイズデータ、
// pcm はクリック時の再生用 (デバウンス後の波形)
export interface NoiseHistoryEntry {
  label: string;
  bytes: Uint8Array;
  pcm: Float32Array;
}

export interface NoiseDoc extends TabDocBase {
  noise: Noise;
  // 「音色を編集」で開いた場合の書き戻し先 (通常のファイルオープンでは undefined)
  link?: WoiceLink;
  // ビルド履歴。タブ (ファイル) ごとに独立させ、別ファイルの履歴と混ざらないようにする
  history: NoiseHistoryEntry[];
  historyAtMs: number; // 直前エントリの記録時刻 (連続編集のまとめ用)
}

// 本家 NoiseTable_CopyUnit と同じフィールドをコピーする。
// pxtone-ts の NoiseUnit に copy API が無いため、対象フィールドをここに列挙する
function copyNoiseUnit(dst: NoiseUnit, src: NoiseUnit): void {
  dst.bEnable = src.bEnable;
  dst.pan = src.pan;
  dst.main = src.main;
  dst.freq = src.freq;
  dst.volu = src.volu;
  dst.enveNum = src.enveNum;
  // 退避元のユニットは他から参照されないため、配列は共有してよい
  dst.enves = src.enves;
}

// 読み込んだノイズを 4 レイヤー分 (本家 MAX_NOISETABLEUNIT) に広げる。
// バイト列に無いレイヤーは無効な空レイヤーとして追加され、常に 4 レイヤー表示になる
// (本家 dlg_Noise_Design::_Load_Design の Allocate + NoiseTable_CopyUnit と同じ)。
// 無効レイヤーは write が書き出さないため、バイト列は元のまま
function padNoiseUnits(n: Noise): void {
  const unitNum = n.unitNum;
  if (unitNum >= NOISE_UNIT_NUM) return;
  const units: NoiseUnit[] = [];
  for (let u = 0; u < unitNum; u++) units.push(n.getUnit(u)!);
  n.allocate(NOISE_UNIT_NUM, NOISE_ENVE_NUM);
  for (let u = 0; u < unitNum; u++) {
    copyNoiseUnit(n.getUnit(u)!, units[u]!);
  }
}

// ノイズのバイト列を読み込む (タブを開く / undo 復元 / History の反映で共用)。
// 読み込んだ後はレイヤー数が NOISE_UNIT_NUM になる
export function readNoiseBytes(n: Noise, bytes: Uint8Array): PxtnErr {
  const res = n.read(new MemoryIo(bytes));
  if (res !== PxtnErr.OK) return res;
  padNoiseUnits(n);
  return PxtnErr.OK;
}

const tabs = createDocTabs<NoiseDoc>({
  snapshot: snapshotNoise,
  restore: (d, bytes) => readNoiseBytes(d.noise, bytes) === PxtnErr.OK,
});

// ノイズのバイト列スナップショット (undo / Collage への追加で共用)
export function snapshotNoise(d: NoiseDoc): Uint8Array | null {
  const io = new MemoryIo();
  if (!d.noise.write(io)) return null;
  return io.toUint8Array();
}

export const noises = tabs.docs;
export const currentNoiseId = tabs.currentId;
// 編集・保存のたびに進む。未保存ドラフトの退避トリガー (drafts.ts が購読する)
export const noiseRevision = tabs.revision;

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

// 現在のタブを未編集の状態に戻す (Collage へ変更を適用したときなど)。
// link アイコンの色 (dirty 表示) も通常色に戻る。undo スタックはそのまま残す
export function markNoiseClean(): void {
  const d = currentNoise();
  if (d) tabs.markClean(d);
}

// ビルド履歴を現在のタブへ1件追加する (連続編集は直前のエントリを置き換える)。
// 履歴はタブごとに独立しているため、別ファイルの履歴は混ざらない
export function pushNoiseHistory(pcm: Float32Array, label: string): void {
  const d = currentNoise();
  if (!d) return;
  const io = new MemoryIo();
  if (!d.noise.write(io)) return;
  const entry: NoiseHistoryEntry = { label, bytes: io.toUint8Array(), pcm };
  d.historyAtMs = pushHistoryEntry(d.history, d.historyAtMs, Date.now(), entry);
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
  return tabs.add({
    fileName: "",
    dirty: false,
    initial: false,
    noise: markRaw(createDefaultNoise()),
    undoStack: [],
    redoStack: [],
    history: [],
    historyAtMs: 0,
  });
}

// アプリ起動時に1つ目のデフォルトノイズを作る (既にタブがある場合は何もしない)
export function ensureInitialNoise(): void {
  if (noises.value.length === 0) {
    // 初期タブはファイルを開くときに置き換えてよい (無題のファイルを開いたタブとは別扱い)
    newNoise().initial = true;
  }
}

// .ptnoise バイト列から新規タブを開く。エラーメッセージを返す (成功時 null)。
// link は「音色を編集」で開いた場合の元 Collage 音色 (適用先)
export function openNoise(bytes: Uint8Array, name: string, link?: WoiceLink): string | null {
  const n = new Noise();
  const res = readNoiseBytes(n, bytes);
  if (res !== PxtnErr.OK) return pxtnErrorMessage(res);
  tabs.replaceInitialIfPossible();
  tabs.add({
    fileName: name,
    dirty: false,
    initial: false,
    noise: markRaw(n),
    undoStack: [],
    redoStack: [],
    history: [],
    historyAtMs: 0,
    link,
  });
  return null;
}

// Collage の音色 (PTN) 内のノイズを ptnoise バイト列化して新規タブで開く ("音色を編集" 用)。
// 成功時 true。編集内容はコピーであり、元の Collage の音色には影響しない
// (変更を適用するまで。適用先は link で保持する)
export function openPtnAsNoise(n: Noise, name: string, link?: WoiceLink): boolean {
  const io = new MemoryIo();
  if (!n.write(io)) return false;
  return openNoise(io.toUint8Array(), name, link) === null;
}

export function closeNoise(id: number): void {
  tabs.close(id);
}

// 全てのノイズタブを閉じ、起動時と同じ空の初期タブを開き直す
export function closeAllNoises(): void {
  for (const n of [...noises.value]) closeNoise(n.id);
  ensureInitialNoise();
}

export function switchNoise(id: number): void {
  tabs.switchTo(id);
}

// 現在のノイズを .ptnoise として保存 (asNew でファイル名入力を促す)。
// 名前を付けて保存したら単独ファイルとして扱い、Collage とのリンクを解除する
export async function saveNoise(asNew: boolean): Promise<boolean> {
  const d = currentNoise();
  if (!d) return false;
  const saved = await tabs.save(d, asNew, ".ptnoise");
  if (saved && asNew) d.link = undefined;
  return saved;
}
