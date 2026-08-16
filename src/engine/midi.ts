// MIDI (SMF) ファイルを ptcop に変換する。
// SMF のサブセット (MThd/MTrk・可変長数量・ランニングステータス・ノート/テンポ/拍子) を
// 自前でパースし、チャンネル単位でユニット化して ptcop バイト列を組み立てる。
// 対応外: SMPTE タイムコード・ピッチベンド・コントローラ・プログラムチェンジ
// (テンポ/拍子の途中変更は最初の値のみ使用。ptcop は曲全体で固定のため)
import { Service, PxtnErr, MemoryIo, SEEK_SET, EventKind, WoiceType, PXTN_MAX_EVENT_NUM } from "pxtone-ts";
import { EXE_VER } from "../state/service";
import { createDefaultWoice } from "../state/voice";

export interface MidiNote {
  channel: number; // MIDI チャンネル (0..15)
  clock: number; // ノートオン位置 (クロック)
  key: number; // pxtone KEY 値 (0x1B00 + note*0x100)
  velocity: number;
  length: number; // クロック
}

export interface MidiSong {
  tempo: number; // BPM
  beatNum: number;
  notes: MidiNote[];
  maxClock: number;
}

// 可変長数量 (VLQ) の読み取り
function readVlq(bytes: Uint8Array, pos: number): { value: number; pos: number } | null {
  let value = 0;
  for (let i = 0; i < 4; i++) {
    const b = bytes[pos++];
    if (b === undefined) return null;
    value = (value << 7) | (b & 0x7f);
    if (!(b & 0x80)) return { value, pos };
  }
  return null;
}

// SMF をパースする。失敗時 null
export function parseMidi(bytes: Uint8Array): MidiSong | null {
  if (bytes.length < 14) return null;
  let pos = 0;
  const readChunk = (): { id: string; length: number; start: number } | null => {
    if (pos + 8 > bytes.length) return null;
    const id = String.fromCharCode(bytes[pos]!, bytes[pos + 1]!, bytes[pos + 2]!, bytes[pos + 3]!);
    const length = (bytes[pos + 4]! << 24) | (bytes[pos + 5]! << 16) | (bytes[pos + 6]! << 8) | bytes[pos + 7]!;
    pos += 8;
    return { id, length, start: pos };
  };

  const header = readChunk();
  if (!header || header.id !== "MThd" || header.length < 6) return null;
  const ntrks = (bytes[header.start + 2]! << 8) | bytes[header.start + 3]!;
  const division = (bytes[header.start + 4]! << 8) | bytes[header.start + 5]!;
  pos = header.start + 6;
  if (division & 0x8000) return null; // SMPTE タイムコードは非対応
  const ppq = division;
  if (ppq <= 0) return null;

  const notes: MidiNote[] = [];
  // 発音中のノート (チャンネル → ノート番号 → オン情報)
  const pending = new Map<number, Map<number, { clock: number; velocity: number }>>();
  let tempo = 120;
  let beatNum = 4;
  let tempoSet = false;
  let beatNumSet = false;
  let maxClock = 0;

  const toClock = (tick: number): number => Math.round((tick * 480) / ppq);

  const closeNote = (ch: number, note: number, clock: number): void => {
    const p = pending.get(ch)?.get(note);
    if (!p) return;
    pending.get(ch)!.delete(note);
    const length = Math.max(1, clock - p.clock);
    notes.push({ channel: ch, clock: p.clock, key: 0x1b00 + note * 0x100, velocity: p.velocity, length });
    if (clock > maxClock) maxClock = clock;
  };

  for (let t = 0; t < ntrks; t++) {
    const chunk = readChunk();
    if (!chunk || chunk.id !== "MTrk") return null;
    let p = chunk.start;
    const end = chunk.start + chunk.length;
    let tick = 0;
    let runningStatus = 0;

    while (p < end) {
      const vlq = readVlq(bytes, p);
      if (!vlq) return null;
      p = vlq.pos;
      tick += vlq.value;
      let status = bytes[p]!;
      if (status & 0x80) {
        p++;
        runningStatus = status;
      } else {
        status = runningStatus;
      }
      if (!status) return null;
      const type = status >> 4;
      const ch = status & 0x0f;
      const clock = toClock(tick);

      if (type === 0x8 || type === 0x9) {
        // ノートオン/オフ (vel 0 はオフ)
        const note = bytes[p]!;
        const vel = bytes[p + 1]!;
        p += 2;
        if (type === 0x8 || vel === 0) {
          closeNote(ch, note, clock);
        } else {
          // 同一ノートの重なりは先に閉じる
          closeNote(ch, note, clock);
          if (!pending.has(ch)) pending.set(ch, new Map());
          pending.get(ch)!.set(note, { clock, velocity: vel });
        }
      } else if (type === 0xf) {
        if (status === 0xff) {
          // メタイベント (ランニングステータスは解除される)
          const metaType = bytes[p]!;
          p++;
          const len = readVlq(bytes, p);
          if (!len) return null;
          p = len.pos;
          if (metaType === 0x51 && len.value >= 3 && !tempoSet) {
            // テンポ (µs/4分音符)。最初の値のみ使用
            const mpq = (bytes[p]! << 16) | (bytes[p + 1]! << 8) | bytes[p + 2]!;
            if (mpq > 0) {
              const bpm = 60000000 / mpq;
              tempo = Math.max(1, Math.min(400, Math.round(bpm)));
              tempoSet = true;
            }
          } else if (metaType === 0x58 && len.value >= 2 && !beatNumSet) {
            // 拍子 (nn/dd)。分子のみ使用
            beatNum = Math.max(1, Math.min(16, bytes[p]!));
            beatNumSet = true;
          }
          p += len.value;
          runningStatus = 0;
        } else {
          // SysEx (ランニングステータスは解除される)
          const len = readVlq(bytes, p);
          if (!len) return null;
          p = len.pos + len.value;
          runningStatus = 0;
        }
      } else {
        // ポリプレッシャー/CC/プログラムチェンジ/チャンネルプレッシャー/ピッチベンド
        p += type === 0xc || type === 0xd ? 1 : 2;
      }
    }
  }

  // ノートオフの無い未閉じノートを末尾で閉じる
  for (const [ch, map] of pending) {
    for (const [note, p] of map) {
      const length = Math.max(1, maxClock - p.clock);
      notes.push({ channel: ch, clock: p.clock, key: 0x1b00 + note * 0x100, velocity: p.velocity, length });
    }
  }

  return { tempo, beatNum, notes, maxClock };
}

// MIDI バイト列を ptcop に変換する。失敗時 null
export function convertMidiToPtcop(bytes: Uint8Array): Uint8Array | null {
  const song = parseMidi(bytes);
  if (!song) return null;

  const s = new Service();
  if (s.initCollage(PXTN_MAX_EVENT_NUM) !== PxtnErr.OK) return null;

  // デフォルト音声 (ptVoice の初期音声) を音色 0 に注入して無音を回避する
  const w = createDefaultWoice();
  const wio = new MemoryIo();
  if (w.ptvWrite(wio) < 0) return null;
  if (!wio.seek(SEEK_SET, 0)) return null;
  if (s.woiceRead(0, wio, WoiceType.PTV) !== PxtnErr.OK) return null;

  // チャンネル単位でユニット化 (ノートのあるチャンネルのみ)
  const channels = [...new Set(song.notes.map((n) => n.channel))].sort((a, b) => a - b);
  const unitOf = new Map<number, number>();
  for (const ch of channels) {
    unitOf.set(ch, s.unitNum);
    if (!s.unitAddNew()) return null;
  }

  // VOICENO (デフォルト音声) → ノート
  for (const u of unitOf.values()) s.evels.recordAddI(0, u, EventKind.VOICENO, 0);
  for (const n of song.notes) {
    const u = unitOf.get(n.channel)!;
    s.evels.recordAddI(n.clock, u, EventKind.KEY, n.key);
    s.evels.recordAddI(n.clock, u, EventKind.VELOCITY, n.velocity);
    s.evels.recordAddI(n.clock, u, EventKind.ON, n.length);
  }

  s.master.set(song.beatNum, song.tempo, 480);
  s.master.setMeasNum(1);
  s.adjustMeasNum();

  const io = new MemoryIo();
  if (s.write(io, false, EXE_VER) !== PxtnErr.OK) return null;
  return io.toUint8Array();
}
