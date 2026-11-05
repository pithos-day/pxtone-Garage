// 音色の追加・削除・置き換えとプロパティ
import { EVENTDEFAULT_BASICKEY, EventKind, MemoryIo, PTV_VOICEFLAG_BEATFIT, PTV_VOICEFLAG_SMOOTH, PTV_VOICEFLAG_WAVELOOP, PxtnErr, Woice, WoiceType, ioPutFloatLE, ioPutInt32LE, ioPutUint16LE, ioPutUint32LE } from "pxtone-ts";
import { defaultOggvDecoder } from "pxtone-ts/oggv";
import { encodeShiftJis, truncateShiftJis } from "../../lib/sjis";
import { service } from "../service";
import { t } from "../../i18n";
import { clamp } from "../../lib/clamp";
import { doc, encodeUnitName, mutate, pxtnErrorMessage } from "./core";

// OGGV (mateOGGV チャンク) のヘッダサイズ (本家 _MATERIALSTRUCT_OGGV 相当)
const MATE_OGGV_STRUCT_SIZE = 12;
const PXTN_OGGV_HEADER_SIZE = 16;

// 生 OGG バイト列を mateOGGV チャンクとして io に書き込む。
// ch/sps/smpNum はデコード結果から取得する (本家 pxtnWoice::read の OGGV 分岐と同一の初期値)
function writeMateOggvChunk(io: MemoryIo, data: Uint8Array, ch: number, sps: number, smpNum: number): void {
  ioPutUint32LE(io, MATE_OGGV_STRUCT_SIZE + PXTN_OGGV_HEADER_SIZE + data.length);
  ioPutUint16LE(io, 0); // xxx
  ioPutUint16LE(io, EVENTDEFAULT_BASICKEY); // basicKey (本家 Voice_Allocate の初期値)
  ioPutUint32LE(io, PTV_VOICEFLAG_SMOOTH); // voiceFlags (本家の初期値)
  ioPutFloatLE(io, 1); // tuning
  ioPutInt32LE(io, ch);
  ioPutInt32LE(io, sps);
  ioPutInt32LE(io, smpNum);
  ioPutInt32LE(io, data.length);
  io.write(data, 1, data.length);
}

// 生 OGG バイト列を mateOGGV チャンク (未デコードのまま保持) に変換する。失敗時 null
async function oggBytesToMateChunk(bytes: Uint8Array): Promise<Uint8Array | null> {
  // チャンネル/サンプリングレート/サンプル数は OGG のヘッダ情報としてデコード結果から取得する
  const oggInfo = await defaultOggvDecoder.decode(bytes);
  const ch = oggInfo.ch;
  const sps = oggInfo.sps;
  const smpNum = oggInfo.samples[0]?.length ?? 0;
  if (ch <= 0 || sps <= 0 || smpNum <= 0) return null;
  const io = new MemoryIo();
  writeMateOggvChunk(io, bytes, ch, sps, smpNum);
  return io.toUint8Array();
}

// PTV/PTN/PCM/OGGV ファイルバイト列を音色として追加。エラーメッセージを返す (成功時 null)。
// マジックバイトで音色タイプを判別する (PTV/PTN/OGG はヘッダ、それ以外は PCM)
export function detectWoiceType(bytes: Uint8Array): WoiceType {
  const head = String.fromCharCode(...bytes.subarray(0, 8));
  if (head === "PTVOICE-") return WoiceType.PTV;
  if (head === "PTNOISE-") return WoiceType.PTN;
  if (head.startsWith("OggS")) return WoiceType.OGGV;
  return WoiceType.PCM;
}

// 指定 index に音色ファイルを読み込み、名前を設定する。エラー文字列を返す (成功時 null)。
// addWoice (追加) と replaceWoiceFile (置き換え) の共通処理
async function readWoiceFileInto(idx: number, bytes: Uint8Array, type: WoiceType, name?: string): Promise<string | null> {
  // OGGV のみ mateOGGV チャンク形式へ変換する (他はそのまま)
  const chunk = type === WoiceType.OGGV ? await oggBytesToMateChunk(bytes) : bytes;
  if (!chunk) return t("error.ogg");
  return (
    mutate(() => {
      const res = service.woiceRead(idx, new MemoryIo(chunk), type);
      if (res !== PxtnErr.OK) return pxtnErrorMessage(res);
      // 名前は本家形式 (ShiftJIS・最大 16 バイト) で設定する。
      // 2 バイト文字の途中で切れないよう truncateShiftJis を通す
      // (setNameBuf の bufSize はバイト数で切るだけなので、そのまま渡すと壊れた文字が残る)
      if (name) service.woiceGet(idx)?.setNameBuf(truncateShiftJis(encodeShiftJis(name), 16), 16);
      return null;
    }) ?? null
  );
}

// 音色ファイルを末尾に追加。name はファイル名 (拡張子なし) で音色名にする
export async function addWoice(bytes: Uint8Array, type: WoiceType, name?: string): Promise<string | null> {
  if (!doc.ready) return t("error.notReady");
  return readWoiceFileInto(service.woiceNum, bytes, type, name);
}

// 読み込みと変換を済ませた、まだプロジェクトへ追加していない音色
export interface PreparedWoice {
  name: string;
  type: WoiceType;
  chunk: Uint8Array;
}

// 音色ファイルを変換・検証する。読み込めなければエラーメッセージを返す
export async function prepareWoiceFile(bytes: Uint8Array, name: string): Promise<PreparedWoice | string> {
  const type = detectWoiceType(bytes);
  const chunk = type === WoiceType.OGGV ? await oggBytesToMateChunk(bytes) : bytes;
  if (!chunk) return t("error.ogg");
  const res = new Woice().read(new MemoryIo(chunk), type);
  return res === PxtnErr.OK ? { name, type, chunk } : pxtnErrorMessage(res);
}

// 変換済みの音色をまとめて末尾に追加する (全体で 1 undo)。追加できなかった分を返す
export function addWoices(items: readonly PreparedWoice[]): { name: string; error: string }[] {
  if (items.length === 0 || !doc.ready || doc.readOnly) return [];
  return (
    mutate(() => {
      const failures: { name: string; error: string }[] = [];
      for (const item of items) {
        const idx = service.woiceNum;
        const res = service.woiceRead(idx, new MemoryIo(item.chunk), item.type);
        if (res !== PxtnErr.OK) {
          failures.push({ name: item.name, error: pxtnErrorMessage(res) });
          continue;
        }
        service.woiceGet(idx)?.setNameBuf(truncateShiftJis(encodeShiftJis(item.name), 16), 16);
      }
      return failures;
    }) ?? []
  );
}

// woiceRemove は音色の配列を詰めるだけなので、VOICENO イベントの値も追従させる。
// 削除した音色を指すイベントは消え、後ろの音色を指すイベントは 1 つ前へずれる
export function removeWoice(idx: number): void {
  mutate(() => {
    if (service.woiceRemove(idx)) service.evels.recordValueOmit(EventKind.VOICENO, idx);
  });
}

// ドラッグ中など、undo を自前で管理する場合の音色の並べ替え。
// woiceReplace は音色の配列を動かすだけなので、VOICENO イベントの値も追従させる。
// VOICENO が無いユニットは先頭まで音色 0 で鳴る (エンジンの既定値) ため、音色 0 が
// 動く場合は clock 0 に明示してから動かし、並べ替えで音が変わらないようにする
export function replaceWoiceRaw(oldPlace: number, newPlace: number): void {
  if (doc.readOnly || oldPlace === newPlace) return;
  if (oldPlace < 0 || newPlace < 0 || oldPlace >= service.woiceNum || newPlace >= service.woiceNum) return;
  if (Math.min(oldPlace, newPlace) === 0) {
    const records = service.evels.records;
    for (let u = 0; u < service.unitNum; u++) {
      if (records.some((e) => e.unitNo === u && e.kind === EventKind.VOICENO && e.clock === 0)) continue;
      service.evels.recordAddI(0, u, EventKind.VOICENO, 0);
    }
  }
  service.woiceReplace(oldPlace, newPlace);
  service.evels.recordValueReplace(EventKind.VOICENO, oldPlace, newPlace);
}

// 既存の音色 index を別の音色ファイルで置き換える。ユニットは音色を index 参照するため、
// 同じ index に読み込めば、使用中のユニットも自動的に新しい音色を指す
export async function replaceWoiceFile(idx: number, bytes: Uint8Array, type: WoiceType, name?: string): Promise<string | null> {
  if (!doc.ready) return t("error.notReady");
  if (idx < 0 || idx >= service.woiceNum) return t("error.notReady");
  return readWoiceFileInto(idx, bytes, type, name);
}

// 音色フラグ (Loop / Smooth / Beat Fit) のビットマスク
const WOICE_FLAG_MASK = PTV_VOICEFLAG_WAVELOOP | PTV_VOICEFLAG_SMOOTH | PTV_VOICEFLAG_BEATFIT;

// 音色のプロパティ (本家 dlg_Woice 相当)
export interface WoiceProperties {
  name: string;
  tuning: number; // 0..256 (PTV では使わない)
  basicKey: number; // コード (21..108)。PTV では使わない
  waveLoop: boolean; // PTV 以外のみ
  smooth: boolean;
  beatFit: boolean;
}

// 音色のプロパティをまとめて変更 (1つの undo エントリ)。
// 本家 dlg_Woice と同じく、名前は全タイプ、tuning / basic key / フラグは
// PTV 以外に適用する (PTV の tuning はダイアログでも編集不可のため触らない)
export function setWoiceProperties(idx: number, props: WoiceProperties): void {
  mutate(() => {
    const w = service.woiceGet(idx);
    const vc = w?.getVoice(0);
    if (!w || !vc) return;
    // 音色名は ShiftJIS・最大 16 バイト (本家 pxtnMAX_TUNEWOICENAME)
    w.setNameBuf(truncateShiftJis(encodeShiftJis(props.name), 16), 16);
    if (w.type !== WoiceType.PTV) {
      vc.tuning = clamp(props.tuning, 0, 256);
      vc.basicKey = clamp(props.basicKey, 21, 108) * 0x100;
      let flags = vc.voiceFlags & ~WOICE_FLAG_MASK;
      if (props.waveLoop) flags |= PTV_VOICEFLAG_WAVELOOP;
      if (props.smooth) flags |= PTV_VOICEFLAG_SMOOTH;
      if (props.beatFit) flags |= PTV_VOICEFLAG_BEATFIT;
      vc.voiceFlags = flags;
    }
  });
}

// 再生・プレビューは VOICENO イベントから音色を決定するため、
// ユニットの全 VOICENO イベントを新しい音色に書き換える (無ければ clock 0 に追加)。
export function applyWoiceToUnitEvents(unitIdx: number, woiceIdx: number): void {
  const end = service.evels.records.reduce((m, e) => Math.max(m, e.clock + 1), 0);
  const changed = service.evels.recordValueSet(0, end, unitIdx, EventKind.VOICENO, woiceIdx);
  if (changed === 0) service.evels.recordAddI(0, unitIdx, EventKind.VOICENO, woiceIdx);
}

// ユニットの名前と音色をまとめて変更 (1つの undo エントリ)。
// name が空文字列の場合は名前を変更しない。
export function setUnitNameAndWoice(unitIdx: number, name: string, woiceIdx: number): void {
  mutate(() => {
    const u = service.unitGet(unitIdx);
    if (!u) return;
    const trimmed = name.trim();
    if (trimmed) u.setNameBuf(encodeUnitName(trimmed));
    const w = service.woiceGet(woiceIdx);
    if (!w) return;
    u.setWoice(w);
    applyWoiceToUnitEvents(unitIdx, woiceIdx);
  });
}
