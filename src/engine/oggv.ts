// OGGV 対応の共通ヘルパー。
// OGGV 音色は未デコードのままでは再生できない (toneReady が OGG_NO_SUPPORTED) ため、
// 再生・プレビュー・WAV 書き出しの前に、プロジェクトバイト列を PCM 化する必要がある。
// この変換はメインスレッドで行い、worklet にはデコード済みバイト列を渡す。
import { convertOggvToPcm } from "pxtone-ts";

// プロジェクトバイト列を OGGV デコード済み (PCM 化) の一時バイト列へ変換する。
// OGGV を含まないプロジェクトはそのまま返る。失敗時 null
export async function decodeProjectBytes(bytes: Uint8Array): Promise<Uint8Array | null> {
  return convertOggvToPcm(bytes);
}
