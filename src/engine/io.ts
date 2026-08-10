// ファイルの開く・保存・書き出し
import { Service, PxtnErr, MemoryIo, NoiseBuilder } from "pxtone-ts";
import type { Noise } from "pxtone-ts";
import { EXE_VER } from "../state/service";
import { exportBytes } from "../state/project";
import { t } from "../i18n";

// Uint8Array が ArrayBuffer の部分ビューでも Blob/postMessage に渡せる ArrayBuffer へ
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function downloadBytes(bytes: Uint8Array, fileName: string, mime = "application/octet-stream"): void {
  const buf = toArrayBuffer(bytes);
  const blob = new Blob([buf], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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

// ptcop のダウンロード発火 (保存)
export function downloadProjectFile(fileName: string): Uint8Array | null {
  const bytes = exportBytes();
  if (!bytes) return null;
  downloadBytes(bytes, sanitizeFileName(fileName, ".ptcop"));
  return bytes;
}

// pttune 書き出し (bTune=true)
export function exportPttune(bytes: Uint8Array, fileName: string): boolean {
  const s = new Service();
  if (s.init() !== PxtnErr.OK) return false;
  if (s.read(new MemoryIo(bytes)) !== PxtnErr.OK) return false;
  const io = new MemoryIo();
  if (s.write(io, true, EXE_VER) !== PxtnErr.OK) return false;
  downloadBytes(io.toUint8Array(), sanitizeFileName(fileName, ".pttune"));
  return true;
}

// WAV 書き出し (オフライン全曲レンダリング)
export function exportWav(bytes: Uint8Array, fileName: string, sps = 44100): string | null {
  const s = new Service();
  if (s.init() !== PxtnErr.OK) return t("error.engineInit");
  if (s.read(new MemoryIo(bytes)) !== PxtnErr.OK) return t("error.loadFailed");
  if (s.tonesReady() !== PxtnErr.OK) return t("error.tonesReady");
  if (!s.setDestinationQuality(2, sps)) return t("error.quality");
  if (!s.mooPreparation(null)) return t("error.prepare");
  const total = s.mooGetSamplingEnd();
  const pcm = new Int16Array(total * 2);
  const CHUNK = 44100;
  for (let pos = 0; pos < total; pos += CHUNK) {
    const n = Math.min(CHUNK, total - pos);
    s.Moo(pcm.subarray(pos * 2), n);
  }
  const wav = makeWav(pcm, sps, 2, 16);
  downloadBytes(wav, sanitizeFileName(fileName, ".wav"), "audio/wav");
  return null;
}

// ノイズを WAV として書き出し (本家 ptNoise の .wave 保存相当)。
// エラーメッセージを返す (成功時 null)
export function exportNoiseWav(noise: Noise, fileName: string, sps = 44100): string | null {
  const bldr = new NoiseBuilder();
  if (!bldr.init()) return t("error.engineInit");
  const pcm = bldr.buildNoise(noise, 2, sps, 16);
  if (!pcm) return t("error.noiseBuild");
  const buf = pcm.devolveSamplingBuffer();
  if (!buf) return t("error.noiseBuild");
  const s16 = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength >> 1);
  const wav = makeWav(s16, sps, 2, 16);
  downloadBytes(wav, sanitizeFileName(fileName, ".wav"), "audio/wav");
  return null;
}

// WAV ヘッダ (44 バイト = RIFF 12 + fmt 24 + data 8)。fmt チャンクは PCM で固定 16 バイト
const WAV_HEADER_SIZE = 44;
const WAV_FMT_CHUNK_SIZE = 16;

// pcm は 16bit サンプル前提 (dataSize はチャンネル込みバイト数)。
// bps はヘッダの blockAlign/bitsPerSample にのみ使われる
export function makeWav(pcm: Int16Array, sps: number, chNum: number, bps: number): Uint8Array {
  const dataSize = pcm.length * 2;
  const buf = new ArrayBuffer(WAV_HEADER_SIZE + dataSize);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const writeStr = (off: number, s: string): void => {
    for (let i = 0; i < s.length; i++) u8[off + i] = s.charCodeAt(i);
  };
  writeStr(0, "RIFF");
  dv.setUint32(4, WAV_FMT_CHUNK_SIZE + 20 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  dv.setUint32(16, WAV_FMT_CHUNK_SIZE, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, chNum, true);
  dv.setUint32(24, sps, true);
  dv.setUint32(28, (sps * chNum * bps) / 8, true);
  dv.setUint16(32, (chNum * bps) / 8, true);
  dv.setUint16(34, bps, true);
  writeStr(36, "data");
  dv.setUint32(40, dataSize, true);
  new Int16Array(buf, WAV_HEADER_SIZE).set(pcm);
  return u8;
}
