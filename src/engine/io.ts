// ファイルの開く・保存・書き出し
import { Service, PxtnErr, MemoryIo, NoiseBuilder, WoiceType, pxtnServiceMooCalcSampleNum } from "pxtone-ts";
import type { Noise, Woice } from "pxtone-ts";
import { EXE_VER } from "../state/service";
import { ProgressCancelled, withProgress, type ProgressTask } from "../state/progress";
import { dueYield, nextFrame, nowMs, YIELD_INTERVAL_MS } from "../lib/async";
import { decodeProjectBytes } from "./oggv";
import { t } from "../i18n";

// バイト列が pttune 形式かを判定する (先頭 16byte のタグで判断)
const TUNE_TAGS = ["PTTUNE--20050608", "PTTUNE--20060115", "PTTUNE--20060930", "PTTUNE--20071119"];
export function isTuneFormat(bytes: Uint8Array): boolean {
  if (bytes.length < 16) return false;
  const tag = new TextDecoder("ascii").decode(bytes.subarray(0, 16));
  return TUNE_TAGS.includes(tag);
}

// Uint8Array が ArrayBuffer の部分ビューでも Blob/postMessage に渡せる ArrayBuffer へ
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// 「名前を付けて保存」ピッカー (File System Access API, Chromium 系のみ) が使えるか
export function supportsSavePicker(): boolean {
  return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
}

// ファイル保存のオプション。
// usePicker: 対応ブラウザ (Chromium 系) で「名前を付けて保存」ピッカーを開くか (既定 true)。
// 通常保存では false を渡して従来どおりダウンロードを発火させる
export interface SaveOptions {
  fileName: string;
  mime?: string;
  usePicker?: boolean;
}

// ファイル名の拡張子 (ピッカーの accept に渡す)
function fileExt(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  return dot > 0 ? fileName.slice(dot) : "";
}

export interface SaveDestination {
  kind: "file" | "download";
  name: string; // 保存名 (ピッカーで変更され得る)
  handle: FileSystemFileHandle | null;
}

// 保存先を決める。usePicker かつ対応ブラウザなら「名前を付けて保存」ピッカーを開く。
// ピッカーはユーザー操作 (transient activation) が必要なので、時間のかかる生成より
// 前に呼ぶこと (生成の後に呼ぶと SecurityError で開けない)。
// ユーザーがピッカーを閉じた場合は null。操作が切れていた場合もダウンロードへ落とす
export async function chooseSaveDestination(fileName: string, mime: string, usePicker: boolean): Promise<SaveDestination | null> {
  if (!usePicker || !supportsSavePicker()) {
    return { kind: "download", name: fileName, handle: null };
  }
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: fileName,
      types: [{ description: fileName, accept: { [mime]: [fileExt(fileName)] } }],
    });
    return { kind: "file", name: handle.name, handle };
  } catch (e) {
    // キャンセル (AbortError) は「保存しなかった」として扱う
    if (e instanceof DOMException && e.name === "AbortError") return null;
    // ユーザー操作が切れていた (SecurityError) 場合はダウンロードへフォールバック
    if (e instanceof DOMException && e.name === "SecurityError") {
      return { kind: "download", name: fileName, handle: null };
    }
    throw e;
  }
}

// FileSystemWritableFileStream.write は ArrayBuffer 裏付けのビューしか受け付けない型に
// なっているが、エンジン由来の Uint8Array は常に ArrayBuffer 上にある
// (SharedArrayBuffer は使わない) ため、コピーを避けてキャストで通す
function asWriteChunk(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

// 保存先へ書き込む。ピッカーのファイルは 1MB ずつ書き込んで進捗を報告し、
// キャンセル時は書きかけを破棄する (ピッカーは差し替え用の一時ファイルへ書くため、
// 中断しても元のファイルは壊れない)。ダウンロードの場合は進捗を出せない
export async function writeSaveDestination(
  dest: SaveDestination,
  bytes: Uint8Array,
  options: { mime?: string; task?: ProgressTask } = {},
): Promise<void> {
  const { mime = "application/octet-stream", task } = options;
  if (dest.kind === "file" && dest.handle) {
    // 作成の前にキャンセルを確認する (無駄な一時ファイルを作らない)
    task?.throwIfCancelled();
    const writable = await dest.handle.createWritable();
    const chunk = 1 << 20;
    try {
      for (let off = 0; off < bytes.length; off += chunk) {
        task?.throwIfCancelled();
        const end = Math.min(off + chunk, bytes.length);
        await writable.write(asWriteChunk(bytes.subarray(off, end)));
        task?.set(end / bytes.length);
      }
      await writable.close();
    } catch (e) {
      // 中断・失敗時は書きかけを捨てる (元のファイルは close するまで置き換わらない)
      await writable.abort().catch(() => {});
      throw e;
    }
    return;
  }
  // ダウンロード経路は一瞬で終わる (中断要求があれば保存しない)
  task?.throwIfCancelled();
  triggerDownload(bytes, dest.name, mime);
  task?.set(1);
}

// ダウンロードを発火する (ピッカー非対応ブラウザ用)
function triggerDownload(bytes: Uint8Array, fileName: string, mime: string): void {
  const blob = new Blob([toArrayBuffer(bytes)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ファイルを保存する。戻り値は実際のファイル名、ユーザーがキャンセルしたら null
// (書き込み失敗は throw)。ピッカーではファイル名を変更できるため、
// 呼び出し側は戻り値で保存後の名前を把握できる
export async function downloadBytes(bytes: Uint8Array, options: SaveOptions): Promise<string | null> {
  const { fileName, mime = "application/octet-stream", usePicker = true } = options;
  const dest = await chooseSaveDestination(fileName, mime, usePicker);
  if (!dest) return null;
  await writeSaveDestination(dest, bytes, { mime });
  return dest.name;
}

// Blob / File の必要最小限 (テストから stream を持つ偽物を渡せるようにする)
export interface BlobLike {
  size: number;
  stream?: () => ReadableStream<Uint8Array>;
  arrayBuffer: () => Promise<ArrayBuffer>;
}

// stream を分割して読む下限サイズ (これ未満は一括読み。進捗を出さないほど速い)
const STREAM_MIN_SIZE = 256 * 1024;

// Blob を読む (task があればバイト数で進捗を報告し、チャンクごとに中断を確認する)。
// キャンセル時は ProgressCancelled を投げる
export async function readBlobBytes(blob: BlobLike, task?: ProgressTask): Promise<Uint8Array> {
  if (!task || !blob.stream || blob.size < STREAM_MIN_SIZE) {
    return new Uint8Array(await blob.arrayBuffer());
  }
  const reader = blob.stream().getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;
  let lastYield = nowMs();
  try {
    for (;;) {
      task.throwIfCancelled();
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        read += value.byteLength;
        task.set(blob.size > 0 ? read / blob.size : 1);
      }
      if (dueYield(lastYield)) {
        lastYield = nowMs();
        await nextFrame();
      }
    }
  } finally {
    reader.releaseLock?.();
  }
  const out = new Uint8Array(read);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.byteLength;
  }
  return out;
}

// ファイルを読み込んで適用する (進捗つき・キャンセル可)。
// 読み込みはバイト数の実進捗、適用 (解析〜反映) は進捗が測れないため不定表示にする。
// 適用の直前にキャンセルを確認するので、中断時に半端な状態 (空のタブなど) は残らない。
// 戻り値 null はキャンセル
export async function readBlobAndApply<T>(
  title: string,
  blob: BlobLike,
  apply: (bytes: Uint8Array) => T | Promise<T>,
  labels: { read?: string; apply?: string } = {},
): Promise<T | null> {
  return withProgress(title, async (task) => {
    task.range(0, 0.6, labels.read ?? t("progress.reading"));
    const bytes = await readBlobBytes(blob, task);
    task.step(labels.apply ?? t("progress.parsing"));
    task.throwIfCancelled();
    return apply(bytes);
  });
}

export interface OpenedFile {
  name: string; // 表示用の名前 (stripExts で拡張子を除去済み)
  file: File;
}

// accept は拡張子のカンマ区切り (例 ".ptvoice,.ptnoise")。
// stripExts に一致する拡張子はタブ表示用ファイル名から除去する。
// 読み込み (進捗つき) は呼び出し側で readBlobBytes / readBlobAndApply を使う
export function openFileDialog(accept: string, stripExts: RegExp = /\.(ptcop|pttune)$/i): Promise<OpenedFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) {
        resolve(null);
        return;
      }
      resolve({ name: f.name.replace(stripExts, ""), file: f });
    };
    input.click();
  });
}

export function sanitizeFileName(name: string, ext: string): string {
  const base = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  return (base || "untitled") + ext;
}

// ファイル名から拡張子を除いた表示用ファイル名を返す (例 "song.ptcop" → "song")。
// 保存ピッカーで変更された実際のファイル名をタブ表示用に戻すために使う
export function stripFileExt(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

// 書き込みの失敗をエラーメッセージにする (キャンセルはそのまま伝える)
async function writeOrError(
  dest: SaveDestination,
  bytes: Uint8Array,
  mime: string,
  task: ProgressTask,
): Promise<string | null> {
  try {
    await writeSaveDestination(dest, bytes, { mime, task });
    return null;
  } catch (e) {
    if (e instanceof ProgressCancelled) throw e;
    return t("error.save");
  }
}

// pttune 書き出し (bTune=true)。保存したファイル名を返す (キャンセル・失敗時 null)
export async function exportPttune(bytes: Uint8Array, fileName: string): Promise<string | null> {
  const dest = await chooseSaveDestination(sanitizeFileName(fileName, ".pttune"), "application/octet-stream", true);
  if (!dest) return null;
  return withProgress(t("progress.pttuneTitle"), async (task) => {
    task.step(t("progress.serializing"));
    const s = new Service();
    if (s.init() !== PxtnErr.OK) return null;
    if (s.read(new MemoryIo(bytes)) !== PxtnErr.OK) return null;
    const io = new MemoryIo();
    if (s.write(io, true, EXE_VER) !== PxtnErr.OK) return null;
    task.range(0.5, 1, t("progress.writing"));
    await writeSaveDestination(dest, io.toUint8Array(), { task });
    return dest.name;
  });
}

// WAV 書き出しオプション (本家 dlg_BuildOption / ptConfig_Build 相当)
export type WavExportScope = "topLast" | "byTime";

export interface WavExportOptions {
  chNum: number; // 1=モノラル / 2=ステレオ
  sps: number; // 11025 / 22050 / 44100 / 48000
  scope: WavExportScope; // topLast=最初から最後まで / byTime=演奏時間で指定
  playTimeSec: number; // scope="byTime" の演奏時間 (秒)
  extraFadeSec: number; // 末尾に追加するフェードアウト (秒)
  volume: number; // マスターボリューム (0.01..1.00)
  muteByUnit: boolean; // 本家 "Enable Units Mute": ミュート中ユニットを鳴らさない
  mutedUnits: number[]; // muteByUnit=true のときミュートするユニット index
}

// 本家 ptConfig_Build::set_default と同じ既定値
export const WAV_EXPORT_DEFAULTS: WavExportOptions = {
  chNum: 2,
  sps: 44100,
  scope: "topLast",
  playTimeSec: 0,
  extraFadeSec: 0,
  volume: 1,
  muteByUnit: false,
  mutedUnits: [],
};

export type WavRenderResult = { wav: Uint8Array } | { error: string };

export interface WavRenderOptions {
  // 全体進捗のうちこのレンダリングに割り当てる区間 (既定 0..1)。
  // 先頭 10% を OGGV 変換が使う
  span?: readonly [number, number];
  yieldMs?: number; // ブラウザへ譲る間隔 (テスト用)
  chunkFrames?: number; // 1 回の Moo に渡すフレーム数 (テスト用)
}

// OGGV 変換に割り当てる進捗の割合 (残りがレンダリング)
const OGGV_SPAN = 0.1;

// WAV のオフラインレンダリング (保存は行わない)。
// 本家 dlg_BuildProgress と同じ手順で PCM を作り、WAV バイト列を返す。
// task を渡すと OGGV 変換 (音色単位) とレンダリング (チャンク単位) の進捗を報告し、
// キャンセル時は ProgressCancelled を投げる
export async function renderWav(
  bytes: Uint8Array,
  options: WavExportOptions,
  task?: ProgressTask,
  renderOptions: WavRenderOptions = {},
): Promise<WavRenderResult> {
  const [spanStart, spanEnd] = renderOptions.span ?? [0, 1];
  const span = spanEnd - spanStart;
  task?.range(spanStart, spanStart + span * OGGV_SPAN, t("progress.oggv"));
  const decoded = await decodeProjectBytes(bytes, EXE_VER, task);
  if (!decoded) return { error: t("error.ogg") };
  const s = new Service();
  if (s.init() !== PxtnErr.OK) return { error: t("error.engineInit") };
  if (s.read(new MemoryIo(decoded)) !== PxtnErr.OK) return { error: t("error.loadFailed") };
  // 本家 (ptCollage/MainProc.cpp) と同じく出力レートを確定してから tones_ready する。
  // 逆順だとエンベロープ/ディレイが 44100 基準で前計算され、48kHz 環境で長さがずれる
  if (!s.setDestinationQuality(options.chNum, options.sps)) return { error: t("error.quality") };
  if (s.tonesReady() !== PxtnErr.OK) return { error: t("error.tonesReady") };

  // 本家と同じ順序: mute / volume を設定してから preparation する
  s.mooSetMuteByUnit(options.muteByUnit);
  if (options.muteByUnit) {
    for (let u = 0; u < s.unitNum; u++) s.unitGet(u)?.setPlayed(!options.mutedUnits.includes(u));
  }
  s.mooSetMasterVolume(options.volume);
  if (!s.mooPreparation(null)) return { error: t("error.prepare") };

  // サンプル数は本家と同じ規則で決める (topLast は演奏データの末尾まで)
  const fadeSamples = Math.trunc(options.extraFadeSec * options.sps);
  const endSample =
    options.scope === "byTime"
      ? Math.trunc(options.playTimeSec * options.sps)
      : pxtnServiceMooCalcSampleNum(s.master.playMeas, s.master.beatNum, options.sps, s.master.beatTempo);
  const total = endSample + fadeSamples;
  if (total <= 0) return { error: t("error.prepare") };

  const pcm = new Int16Array(total * options.chNum);
  const chunkFrames = renderOptions.chunkFrames ?? 16384; // 一度に Moo へ渡すフレーム数
  const yieldMs = renderOptions.yieldMs ?? YIELD_INTERVAL_MS;
  task?.range(spanStart + span * OGGV_SPAN, spanEnd, t("progress.rendering"));
  // チャンクごとに進捗を報告し、yieldMs ごとにブラウザへ譲ってキャンセルを確認する
  // (task なしのときは従来どおり一気にレンダリングする)
  let lastYield = nowMs();
  const renderRange = async (from: number, to: number): Promise<void> => {
    for (let pos = from; pos < to; ) {
      const n = Math.min(chunkFrames, to - pos);
      s.Moo(pcm.subarray(pos * options.chNum, (pos + n) * options.chNum), n);
      pos += n;
      task?.set(pos / total);
      if (task && dueYield(lastYield, yieldMs)) {
        task.throwIfCancelled();
        await nextFrame();
        lastYield = nowMs();
      }
    }
  };
  await renderRange(0, endSample);
  if (fadeSamples > 0) {
    // 追加フェードアウトは末尾区間の先頭で開始を指示する
    // (本家の 1 サンプルずつのループで s == endSample のときに呼ぶのと同じ位置)
    s.mooSetFade(-1, options.extraFadeSec);
    await renderRange(endSample, total);
  }
  return { wav: makeWav(pcm, options.sps, options.chNum, 16) };
}

// ノイズを WAV として書き出し (本家 ptNoise の .wave 保存相当)。
// エラーメッセージを返す (成功時・キャンセル時 null)
export async function exportNoiseWav(noise: Noise, fileName: string, sps = 44100): Promise<string | null> {
  const dest = await chooseSaveDestination(sanitizeFileName(fileName, ".wav"), "audio/wav", true);
  if (!dest) return null;
  return withProgress(t("progress.noiseWavTitle"), async (task) => {
    task.step(t("progress.building"));
    const bldr = new NoiseBuilder();
    if (!bldr.init()) return t("error.engineInit");
    const pcm = bldr.buildNoise(noise, 2, sps, 16);
    if (!pcm) return t("error.noiseBuild");
    const buf = pcm.devolveSamplingBuffer();
    if (!buf) return t("error.noiseBuild");
    const s16 = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength >> 1);
    const wav = makeWav(s16, sps, 2, 16);
    task.range(0.5, 1, t("progress.writing"));
    return writeOrError(dest, wav, "audio/wav", task);
  });
}

// 音声 (PTV) を単音レンダリングして WAV として書き出し。
// エラーメッセージを返す (成功時・キャンセル時 null)
export async function exportVoiceWav(
  woice: Woice,
  fileName: string,
  key = 0x6000,
  velocity = 104,
  durSec = 1,
  sps = 44100,
): Promise<string | null> {
  const dest = await chooseSaveDestination(sanitizeFileName(fileName, ".wav"), "audio/wav", true);
  if (!dest) return null;
  return withProgress(t("progress.voiceWavTitle"), async (task) => {
    task.step(t("progress.building"));
    // preview.ts は player と循環 import になるため動的 import する
    // (player → realtime-player → io → preview → player の循環を避ける)
    const { renderWoice } = await import("./preview");
    const pcm = renderWoice(woice, key, velocity, durSec, sps);
    if (!pcm) return t("error.tonesReady");
    const s16 = new Int16Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) s16[i] = Math.round(pcm[i]! * 32767);
    const wav = makeWav(s16, sps, 2, 16);
    task.range(0.5, 1, t("progress.writing"));
    return writeOrError(dest, wav, "audio/wav", task);
  });
}

// 音色の書き出し形式 (元フォーマットのまま保存する)
function woiceFileFormat(woice: Woice): { ext: string; mime: string } | null {
  switch (woice.type) {
    case WoiceType.PTV:
      return { ext: ".ptvoice", mime: "application/octet-stream" };
    case WoiceType.PTN:
      return { ext: ".ptnoise", mime: "application/octet-stream" };
    case WoiceType.OGGV:
      return { ext: ".ogg", mime: "audio/ogg" };
    case WoiceType.PCM:
      return { ext: ".wav", mime: "audio/wav" };
    default:
      return null;
  }
}

// 音色のバイト列 (書き出し用)。PCM は保持しているサンプルを WAV 形式に包む。
// 元の ptnoise を持つのは先頭ボイスのみ (write は io への書き込みだけで非破壊)
function woiceFileBytes(woice: Woice): Uint8Array | null {
  const io = new MemoryIo();
  switch (woice.type) {
    case WoiceType.PTV:
      if (woice.ptvWrite(io) < 0) return null;
      return io.toUint8Array();
    case WoiceType.PTN: {
      const ptn = woice.getVoice(0)?.ptn;
      if (!ptn || !ptn.write(io)) return null;
      return io.toUint8Array();
    }
    case WoiceType.OGGV:
      // OGGV は読み込んだ生 OGG データをそのまま保存する
      return woice.getVoice(0)?.oggv?.data ?? null;
    case WoiceType.PCM:
      // PCM は格納サンプルのまま WAV で書き出す (devolveSamplingBuffer は破壊的なため使わない)
      if (!woice.getVoice(0)?.pcm.write(io)) return null;
      return io.toUint8Array();
    default:
      return null;
  }
}

// 音色を元フォーマットのまま書き出す (ptvoice / ptnoise / ogg / wav)。
// エラーメッセージを返す (成功時・キャンセル時 null)
export async function exportWoiceFile(woice: Woice, fileName: string): Promise<string | null> {
  const format = woiceFileFormat(woice);
  if (!format) return t("error.save");
  const dest = await chooseSaveDestination(sanitizeFileName(fileName, format.ext), format.mime, true);
  if (!dest) return null;
  return withProgress(t("progress.woiceFileTitle"), async (task) => {
    task.step(t("progress.serializing"));
    const bytes = woiceFileBytes(woice);
    if (!bytes || bytes.length === 0) return t("error.save");
    task.range(0.5, 1, t("progress.writing"));
    return writeOrError(dest, bytes, format.mime, task);
  });
}

// WAV ヘッダ (44 バイト = RIFF 12 + fmt 24 + data 8)。fmt チャンクは PCM で固定 16 バイト
const WAV_HEADER_SIZE = 44;
const WAV_FMT_CHUNK_SIZE = 16;

// pcm は 16bit サンプル前提 (dataSize はチャンネル込みバイト数)。
// bitsPerSample はヘッダの blockAlign/bitsPerSample にのみ使われる
export function makeWav(pcm: Int16Array, sps: number, chNum: number, bitsPerSample: number): Uint8Array {
  const dataSize = pcm.length * 2;
  const buf = new ArrayBuffer(WAV_HEADER_SIZE + dataSize);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const writeStr = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) u8[off + i] = s.charCodeAt(i);
  };
  writeStr(0, "RIFF");
  dv.setUint32(4, WAV_HEADER_SIZE - 8 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  dv.setUint32(16, WAV_FMT_CHUNK_SIZE, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, chNum, true);
  dv.setUint32(24, sps, true);
  dv.setUint32(28, (sps * chNum * bitsPerSample) / 8, true);
  dv.setUint16(32, (chNum * bitsPerSample) / 8, true);
  dv.setUint16(34, bitsPerSample, true);
  writeStr(36, "data");
  dv.setUint32(40, dataSize, true);
  new Int16Array(buf, WAV_HEADER_SIZE).set(pcm);
  return u8;
}
