// OGGV 対応の共通ヘルパー。
// OGGV 音色は未デコードのままでは再生できない (toneReady が OGG_NO_SUPPORTED) ため、
// 再生・プレビュー・WAV 書き出しの前に、プロジェクトバイト列を PCM 化する必要がある。
// この変換はメインスレッドで行い、worklet にはデコード済みバイト列を渡す。
import { Service, PxtnErr, MemoryIo, WoiceType, convertOggvToPcm, defaultOggvDecoder } from "pxtone-ts";
import { type ProgressTask } from "../state/progress";

// プロジェクトバイト列を OGGV デコード済み (PCM 化) の一時バイト列へ変換する。
// OGGV を含まないプロジェクトはそのまま返る。失敗時 null。
// exeVer は書き出し ptcop のヘッダに入るエディタバージョン (既定 0 = pxtone-ts の従来挙動)。
// task を渡すと音色ごとに進捗を報告し、音色の区切りでキャンセルできる
// (pxtone-ts の convertOggvToPcm はデコーダを差し込めないため、同じ手順を自前で行う)
export async function decodeProjectBytes(bytes: Uint8Array, exeVer?: number, task?: ProgressTask): Promise<Uint8Array | null> {
  if (!task) return convertOggvToPcm(bytes, exeVer);

  const s = new Service();
  if (s.init() !== PxtnErr.OK) return null;
  if (s.read(new MemoryIo(bytes)) !== PxtnErr.OK) return null;
  // デコード対象の OGGV 音色数 (進捗の分母)
  const targets: number[] = [];
  for (let i = 0; i < s.woiceNum; i++) {
    if (s.woiceGet(i)?.type === WoiceType.OGGV) targets.push(i);
  }
  if (targets.length === 0) return bytes;
  let done = 0;
  task.set(0);
  const res = await s.decodeOggvAll({
    decode: async (data: Uint8Array) => {
      // 音色の区切り = キャンセルのチェックポイント
      task.throwIfCancelled();
      const decoded = await defaultOggvDecoder.decode(data);
      done++;
      task.set(done / targets.length);
      return decoded;
    },
  });
  if (res !== PxtnErr.OK) return null;
  const out = new MemoryIo();
  if (s.write(out, false, exeVer ?? 0) !== PxtnErr.OK) return null;
  return out.toUint8Array();
}
