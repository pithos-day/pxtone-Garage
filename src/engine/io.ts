// ファイルの開く・保存・書き出し
import { Service, PxtnErr, MemoryIo, NoiseBuilder, WoiceType, pxtnServiceMooCalcSampleNum } from "pxtone-ts";
import type { Noise, Woice } from "pxtone-ts";
import { EXE_VER } from "../state/service";
import { exportBytes } from "../state/project";
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
  return typeof window.showSaveFilePicker === "function";
}

// ファイル保存のオプション。
// usePicker: 対応ブラウザ (Chromium 系) で「名前を付けて保存」ピッカーを開くか (既定 true)。
// 通常保存では false を渡して従来どおりダウンロードを発火させる
export interface SaveOptions {
  fileName: string;
  mime?: string;
  usePicker?: boolean;
}

// ファイルを保存する。usePicker=true かつ対応ブラウザ (Chromium 系) では
// 「名前を付けて保存」ピッカーを開き、それ以外は従来どおりダウンロードを発火する。
// 保存が完了したら実際のファイル名、ユーザーがキャンセルしたら null を返す (書き込み失敗は throw)。
// ピッカーではファイル名を変更できるため、呼び出し側は戻り値で保存後の名前を把握できる
export async function downloadBytes(bytes: Uint8Array, options: SaveOptions): Promise<string | null> {
  const { fileName, mime = "application/octet-stream", usePicker = true } = options;
  const buf = toArrayBuffer(bytes);
  if (usePicker && supportsSavePicker()) {
    // File System Access API — 保存先・ファイル名をユーザーが選択して書き込む
    const dot = fileName.lastIndexOf(".");
    const ext = dot > 0 ? fileName.slice(dot) : "";
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: fileName,
        types: [{ description: fileName, accept: { [mime]: [ext] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(buf);
      await writable.close();
      return handle.name;
    } catch (e) {
      // キャンセル (AbortError) は「保存しなかった」として扱う
      if (e instanceof DOMException && e.name === "AbortError") return null;
      throw e;
    }
  }
  // フォールバック: 従来どおりダウンロード発火
  const blob = new Blob([buf], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}

export interface OpenedFile {
  name: string;
  bytes: Uint8Array;
}

// accept は拡張子のカンマ区切り (例 ".ptvoice,.ptnoise")。
// stripExts に一致する拡張子はタブ表示用ファイル名から除去する
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
      const name = f.name.replace(stripExts, "");
      void f
        .arrayBuffer()
        .then((buf) => resolve({ name, bytes: new Uint8Array(buf) }))
        .catch(() => resolve(null));
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

// ptcop の保存 (「名前を付けて保存」ピッカー / ダウンロード発火)。
// 保存したファイル名を返す (キャンセル・失敗時 null)
export async function downloadProjectFile(fileName: string, options: Pick<SaveOptions, "usePicker"> = {}): Promise<string | null> {
  const bytes = exportBytes();
  if (!bytes) return null;
  return downloadBytes(bytes, { fileName: sanitizeFileName(fileName, ".ptcop"), ...options });
}

// pttune 書き出し (bTune=true)。保存したファイル名を返す (キャンセル・失敗時 null)
export async function exportPttune(bytes: Uint8Array, fileName: string): Promise<string | null> {
  const s = new Service();
  if (s.init() !== PxtnErr.OK) return null;
  if (s.read(new MemoryIo(bytes)) !== PxtnErr.OK) return null;
  const io = new MemoryIo();
  if (s.write(io, true, EXE_VER) !== PxtnErr.OK) return null;
  return downloadBytes(io.toUint8Array(), { fileName: sanitizeFileName(fileName, ".pttune") });
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

// WAV のオフラインレンダリング (保存は行わない)。
// 本家 dlg_BuildProgress と同じ手順で PCM を作り、WAV バイト列を返す
export async function renderWav(bytes: Uint8Array, options: WavExportOptions): Promise<WavRenderResult> {
  const decoded = await decodeProjectBytes(bytes, EXE_VER);
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
  const CHUNK = 44100; // 一度に Moo へ渡すフレーム数
  const renderRange = (from: number, to: number): void => {
    for (let pos = from; pos < to; pos += CHUNK) {
      const n = Math.min(CHUNK, to - pos);
      s.Moo(pcm.subarray(pos * options.chNum), n);
    }
  };
  renderRange(0, endSample);
  if (fadeSamples > 0) {
    // 追加フェードアウトは末尾区間の先頭で開始を指示する
    // (本家の 1 サンプルずつのループで s == endSample のときに呼ぶのと同じ位置)
    s.mooSetFade(-1, options.extraFadeSec);
    renderRange(endSample, total);
  }
  return { wav: makeWav(pcm, options.sps, options.chNum, 16) };
}

// WAV 書き出し (オフライン全曲レンダリング + 保存)。
// エラーメッセージを返す (成功時 null)
export async function exportWav(bytes: Uint8Array, fileName: string, options: WavExportOptions): Promise<string | null> {
  const result = await renderWav(bytes, options);
  if ("error" in result) return result.error;
  try {
    await downloadBytes(result.wav, { fileName: sanitizeFileName(fileName, ".wav"), mime: "audio/wav" });
  } catch {
    return t("error.save");
  }
  return null;
}

// ノイズを WAV として書き出し (本家 ptNoise の .wave 保存相当)。
// エラーメッセージを返す (成功時 null)
export async function exportNoiseWav(noise: Noise, fileName: string, sps = 44100): Promise<string | null> {
  const bldr = new NoiseBuilder();
  if (!bldr.init()) return t("error.engineInit");
  const pcm = bldr.buildNoise(noise, 2, sps, 16);
  if (!pcm) return t("error.noiseBuild");
  const buf = pcm.devolveSamplingBuffer();
  if (!buf) return t("error.noiseBuild");
  const s16 = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength >> 1);
  const wav = makeWav(s16, sps, 2, 16);
  try {
    await downloadBytes(wav, { fileName: sanitizeFileName(fileName, ".wav"), mime: "audio/wav" });
  } catch {
    return t("error.save");
  }
  return null;
}

// 音声 (PTV) を単音レンダリングして WAV として書き出し。
// エラーメッセージを返す (成功時 null)
export async function exportVoiceWav(
  woice: Woice,
  fileName: string,
  key = 0x6000,
  velocity = 104,
  durSec = 1,
  sps = 44100,
): Promise<string | null> {
  // preview.ts は player と循環 import になるため動的 import する
  // (player → realtime-player → io → preview → player の循環を避ける)
  const { renderWoice } = await import("./preview");
  const pcm = renderWoice(woice, key, velocity, durSec, sps);
  if (!pcm) return t("error.tonesReady");
  const s16 = new Int16Array(pcm.length);
  for (let i = 0; i < pcm.length; i++) s16[i] = Math.round(pcm[i]! * 32767);
  const wav = makeWav(s16, sps, 2, 16);
  try {
    await downloadBytes(wav, { fileName: sanitizeFileName(fileName, ".wav"), mime: "audio/wav" });
  } catch {
    return t("error.save");
  }
  return null;
}

// 音色を元フォーマットのまま書き出す (ptvoice / ptnoise / ogg / wav)。
// PCM は保持しているサンプルを WAV 形式に包んで保存する。
// エラーメッセージを返す (成功時 null)
export async function exportWoiceFile(woice: Woice, fileName: string): Promise<string | null> {
  const fail = (): string => t("error.save");
  let bytes: Uint8Array | null = null;
  let ext = "";
  let mime: string | undefined;
  switch (woice.type) {
    case WoiceType.PTV: {
      const io = new MemoryIo();
      if (woice.ptvWrite(io) < 0) return fail();
      bytes = io.toUint8Array();
      ext = ".ptvoice";
      break;
    }
    case WoiceType.PTN: {
      // 元の ptnoise を持つのは先頭ボイスのみ。write は io への書き込みだけで非破壊
      const ptn = woice.getVoice(0)?.ptn;
      const io = new MemoryIo();
      if (!ptn || !ptn.write(io)) return fail();
      bytes = io.toUint8Array();
      ext = ".ptnoise";
      break;
    }
    case WoiceType.OGGV:
      // OGGV は読み込んだ生 OGG データをそのまま保存する
      bytes = woice.getVoice(0)?.oggv?.data ?? null;
      ext = ".ogg";
      mime = "audio/ogg";
      break;
    case WoiceType.PCM: {
      // PCM は格納サンプルのまま WAV で書き出す (devolveSamplingBuffer は破壊的なため使わない)
      const io = new MemoryIo();
      if (!woice.getVoice(0)?.pcm.write(io)) return fail();
      bytes = io.toUint8Array();
      ext = ".wav";
      mime = "audio/wav";
      break;
    }
    default:
      return fail();
  }
  if (!bytes || bytes.length === 0) return fail();
  try {
    await downloadBytes(bytes, { fileName: sanitizeFileName(fileName, ext), mime });
  } catch {
    return fail();
  }
  return null;
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
