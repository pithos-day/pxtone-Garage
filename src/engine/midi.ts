// MIDI (SMF) ファイルを ptcop に変換する。
// SMF のサブセット (MThd/MTrk・可変長数量・ランニングステータス・ノート/テンポ/拍子/プログラムチェンジ) を
// 自前でパースし、チャンネル単位でユニット化して ptcop バイト列を組み立てる。
// 対応外: SMPTE タイムコード・ピッチベンド・コントローラ
// (テンポ/拍子の途中変更は最初の値のみ使用。ptcop は曲全体で固定のため)
import { Service, PxtnErr, MemoryIo, SEEK_SET, EventKind, WoiceType, PXTN_MAX_EVENT_NUM } from "pxtone-ts";
import { EXE_VER } from "../state/service";
import { createDefaultWoice } from "../state/voice";
import { encodeShiftJis } from "../lib/sjis";

// クロック/拍 (ptcop は beatClock=480 固定)
const CLOCK_PER_BEAT = 480;
// pxtone KEY 値のベース (MIDI ノート 0 = 0x1B00)
const KEY_BASE = 0x1b00;
// 1分のマイクロ秒 (テンポ µs/4分音符 → BPM 変換用)
const MICROS_PER_MINUTE = 60000000;
// SMF メタイベントのタイプ
const META_TEMPO = 0x51;
const META_TIME_SIGNATURE = 0x58;

// General MIDI 1 楽器名 (プログラム番号 0..127)
const GM_INSTRUMENTS: readonly string[] = [
  "Acoustic Grand Piano", "Bright Acoustic Piano", "Electric Grand Piano",
  "Honky-tonk Piano", "Electric Piano 1", "Electric Piano 2",
  "Harpsichord", "Clavinet", "Celesta", "Glockenspiel",
  "Music Box", "Vibraphone", "Marimba", "Xylophone",
  "Tubular Bells", "Dulcimer", "Drawbar Organ", "Percussive Organ",
  "Rock Organ", "Church Organ", "Reed Organ", "Accordion",
  "Harmonica", "Tango Accordion", "Acoustic Guitar (nylon)", "Acoustic Guitar (steel)",
  "Electric Guitar (jazz)", "Electric Guitar (clean)", "Electric Guitar (muted)", "Overdriven Guitar",
  "Distortion Guitar", "Guitar Harmonics", "Acoustic Bass", "Electric Bass (finger)",
  "Electric Bass (pick)", "Fretless Bass", "Slap Bass 1", "Slap Bass 2",
  "Synth Bass 1", "Synth Bass 2", "Violin", "Viola",
  "Cello", "Contrabass", "Tremolo Strings", "Pizzicato Strings",
  "Orchestral Harp", "Timpani", "String Ensemble 1", "String Ensemble 2",
  "Synth Strings 1", "Synth Strings 2", "Choir Aahs", "Voice Oohs",
  "Synth Voice", "Orchestra Hit", "Trumpet", "Trombone",
  "Tuba", "Muted Trumpet", "French Horn", "Brass Section",
  "Synth Brass 1", "Synth Brass 2", "Soprano Sax", "Alto Sax",
  "Tenor Sax", "Baritone Sax", "Oboe", "English Horn",
  "Bassoon", "Clarinet", "Piccolo", "Flute",
  "Recorder", "Pan Flute", "Blown Bottle", "Shakuhachi",
  "Whistle", "Ocarina", "Lead 1 (square)", "Lead 2 (sawtooth)",
  "Lead 3 (calliope)", "Lead 4 (chiff)", "Lead 5 (charang)", "Lead 6 (voice)",
  "Lead 7 (fifths)", "Lead 8 (bass + lead)", "Pad 1 (new age)", "Pad 2 (warm)",
  "Pad 3 (polysynth)", "Pad 4 (choir)", "Pad 5 (bowed)", "Pad 6 (metallic)",
  "Pad 7 (halo)", "Pad 8 (sweep)", "FX 1 (rain)", "FX 2 (soundtrack)",
  "FX 3 (crystal)", "FX 4 (atmosphere)", "FX 5 (brightness)", "FX 6 (goblins)",
  "FX 7 (echoes)", "FX 8 (sci-fi)", "Sitar", "Banjo",
  "Shamisen", "Koto", "Kalimba", "Bagpipe",
  "Fiddle", "Shanai", "Tinkle Bell", "Agogo",
  "Steel Drums", "Woodblock", "Taiko Drum", "Melodic Tom",
  "Synth Drum", "Reverse Cymbal", "Guitar Fret Noise", "Breath Noise",
  "Seashore", "Bird Tweet", "Telephone Ring", "Helicopter",
  "Applause", "Gunshot",
];

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
  // チャンネルごとのプログラム番号 (Program Change が無ければ 0)
  programByChannel: Map<number, number>;
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
  let chunkPos = 0;
  const readChunk = (): { id: string; length: number; start: number } | null => {
    if (chunkPos + 8 > bytes.length) return null;
    const id = String.fromCharCode(bytes[chunkPos]!, bytes[chunkPos + 1]!, bytes[chunkPos + 2]!, bytes[chunkPos + 3]!);
    const length =
      (bytes[chunkPos + 4]! << 24) | (bytes[chunkPos + 5]! << 16) | (bytes[chunkPos + 6]! << 8) | bytes[chunkPos + 7]!;
    chunkPos += 8;
    return { id, length, start: chunkPos };
  };

  const header = readChunk();
  if (!header || header.id !== "MThd" || header.length < 6) return null;
  const ntrks = (bytes[header.start + 2]! << 8) | bytes[header.start + 3]!;
  const division = (bytes[header.start + 4]! << 8) | bytes[header.start + 5]!;
  chunkPos = header.start + 6;
  if (division & 0x8000) return null; // SMPTE タイムコードは非対応
  const ppq = division;
  if (ppq <= 0) return null;

  const notes: MidiNote[] = [];
  // 発音中のノート (チャンネル → ノート番号 → オン情報)
  const pendingNotes = new Map<number, Map<number, { clock: number; velocity: number }>>();
  // チャンネルごとのプログラム番号 (Program Change で設定)
  const programByChannel = new Map<number, number>();
  let tempo = 120;
  let beatNum = 4;
  let tempoSet = false;
  let beatNumSet = false;
  let maxClock = 0;

  const toClock = (tick: number): number => Math.round((tick * CLOCK_PER_BEAT) / ppq);

  const closeNote = (ch: number, note: number, clock: number): void => {
    const p = pendingNotes.get(ch)?.get(note);
    if (!p) return;
    pendingNotes.get(ch)!.delete(note);
    const length = noteEndLength(clock, p.clock);
    notes.push({ channel: ch, clock: p.clock, key: midiNoteKey(note), velocity: p.velocity, length });
    if (clock > maxClock) maxClock = clock;
  };

  for (let t = 0; t < ntrks; t++) {
    const chunk = readChunk();
    if (!chunk || chunk.id !== "MTrk") return null;
    let eventPos = chunk.start;
    const end = chunk.start + chunk.length;
    let tick = 0;
    let runningStatus = 0;

    while (eventPos < end) {
      const vlq = readVlq(bytes, eventPos);
      if (!vlq) return null;
      eventPos = vlq.pos;
      tick += vlq.value;
      let status = bytes[eventPos]!;
      if (status & 0x80) {
        eventPos++;
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
        const note = bytes[eventPos]!;
        const vel = bytes[eventPos + 1]!;
        eventPos += 2;
        if (type === 0x8 || vel === 0) {
          closeNote(ch, note, clock);
        } else {
          // 同一ノートの重なりは先に閉じる
          closeNote(ch, note, clock);
          if (!pendingNotes.has(ch)) pendingNotes.set(ch, new Map());
          pendingNotes.get(ch)!.set(note, { clock, velocity: vel });
        }
      } else if (type === 0xf) {
        if (status === 0xff) {
          // メタイベント (ランニングステータスは解除される)
          const metaType = bytes[eventPos]!;
          eventPos++;
          const len = readVlq(bytes, eventPos);
          if (!len) return null;
          eventPos = len.pos;
          if (metaType === META_TEMPO && len.value >= 3 && !tempoSet) {
            // テンポ (µs/4分音符)。最初の値のみ使用
            const mpq = (bytes[eventPos]! << 16) | (bytes[eventPos + 1]! << 8) | bytes[eventPos + 2]!;
            if (mpq > 0) {
              const bpm = MICROS_PER_MINUTE / mpq;
              tempo = Math.max(1, Math.min(400, Math.round(bpm)));
              tempoSet = true;
            }
          } else if (metaType === META_TIME_SIGNATURE && len.value >= 2 && !beatNumSet) {
            // 拍子 (nn/dd)。分子のみ使用
            beatNum = Math.max(1, Math.min(16, bytes[eventPos]!));
            beatNumSet = true;
          }
          eventPos += len.value;
          runningStatus = 0;
        } else {
          // SysEx (ランニングステータスは解除される)
          const len = readVlq(bytes, eventPos);
          if (!len) return null;
          eventPos = len.pos + len.value;
          runningStatus = 0;
        }
      } else if (type === 0xc) {
        // プログラムチェンジ (データ1バイト: プログラム番号)
        const program = bytes[eventPos]!;
        programByChannel.set(ch, program);
        eventPos += 1;
      } else {
        // ポリプレッシャー/CC/チャンネルプレッシャー/ピッチベンド
        eventPos += channelMessageDataLen(type);
      }
    }
    // 次のトラックのチャンクヘッダを読めるよう、位置をトラック終端へ進める
    chunkPos = end;
  }

  // ノートオフの無い未閉じノートを末尾で閉じる
  for (const [ch, map] of pendingNotes) {
    for (const [note, p] of map) {
      const length = noteEndLength(maxClock, p.clock);
      notes.push({ channel: ch, clock: p.clock, key: midiNoteKey(note), velocity: p.velocity, length });
    }
  }

  return { tempo, beatNum, notes, maxClock, programByChannel };
}

// MIDI ノート番号 → pxtone KEY 値
function midiNoteKey(note: number): number {
  return KEY_BASE + note * 0x100;
}

// ノート長 (クロック)。最低 1 クロック (負や 0 を防ぐ)
function noteEndLength(endClock: number, onClock: number): number {
  return Math.max(1, endClock - onClock);
}

// チャンネルメッセージ (0x8n..0xEn) のデータバイト数。0xCn/0xDn は1、他は2
function channelMessageDataLen(type: number): number {
  return type === 0xc || type === 0xd ? 1 : 2;
}

export interface MidiConvertOptions {
  // 同一チャンネルで同時に鳴るノート (和音) を別ユニットに分割する。
  // 未指定時は 1 チャンネル = 1 ユニット (和音は1つに統合される)
  splitOverlap?: boolean;
}

// ユニット数の上限 (pxtone の PXTN_MAX_TUNE_UNIT_STRUCT)
const MAX_UNIT_NUM = 50;

interface AssignedNote {
  note: MidiNote;
  unit: number;
}

// チャンネルごとにノートを開始クロック順でスロット (ユニット) へ割り当てる。
// splitChords 時は空きスロットを再利用し、重なるノートがあれば新規スロットを作る。
// ユニット名は channel-{ch} (分割時は channel-{ch}-{slot})。ユニット数は MAX_UNIT_NUM でクランプ
function assignUnits(notes: MidiNote[], splitChords: boolean): { unitNames: string[]; assigned: AssignedNote[] } {
  const byChannel = new Map<number, MidiNote[]>();
  for (const n of notes) {
    if (!byChannel.has(n.channel)) byChannel.set(n.channel, []);
    byChannel.get(n.channel)!.push(n);
  }
  const channels = [...byChannel.keys()].sort((a, b) => a - b);

  const unitNames: string[] = [];
  const assigned: AssignedNote[] = [];
  for (const ch of channels) {
    const channelNotes = byChannel.get(ch)!.slice().sort((a, b) => a.clock - b.clock);
    const slots: { freeAt: number; unit: number }[] = [];
    for (const n of channelNotes) {
      const slot = allocateSlot(slots, unitNames, ch, n.clock, splitChords);
      slots[slot]!.freeAt = n.clock + n.length;
      assigned.push({ note: n, unit: slots[slot]!.unit });
    }
  }
  return { unitNames, assigned };
}

// ノートを割り当てるスロットのインデックスを返す (常に有効)。
// splitChords 時: 終了済みスロットを再利用、無ければ新規作成 (ユニット上限まで、超過はスロット0へ統合)。
// それ以外: チャンネルごとに最初のスロットのみを使う (1 チャンネル = 1 ユニット)
function allocateSlot(
  slots: { freeAt: number; unit: number }[],
  unitNames: string[],
  ch: number,
  clock: number,
  splitChords: boolean,
): number {
  if (!splitChords) {
    if (slots.length === 0) {
      const unit = unitNames.length;
      slots.push({ freeAt: 0, unit });
      unitNames.push(`channel-${ch}`);
    }
    return 0;
  }
  for (let i = 0; i < slots.length; i++) {
    if (slots[i]!.freeAt <= clock) return i;
  }
  if (unitNames.length < MAX_UNIT_NUM) {
    const unit = unitNames.length;
    slots.push({ freeAt: 0, unit });
    unitNames.push(`channel-${ch}-${unit}`);
    return slots.length - 1;
  }
  return 0; // ユニット上限超過はスロット0へ統合
}

// MIDI バイト列を ptcop に変換する。失敗時 null
export function convertMidiToPtcop(bytes: Uint8Array, options: MidiConvertOptions = {}): Uint8Array | null {
  const song = parseMidi(bytes);
  if (!song) return null;
  const splitChords = !!options.splitOverlap;

  const s = new Service();
  if (s.initCollage(PXTN_MAX_EVENT_NUM) !== PxtnErr.OK) return null;

  // ノートをユニットへ割り当て (和音の分割可否でユニット数が変わる)
  const { unitNames, assigned } = assignUnits(song.notes, splitChords);

  // 使用チャンネルを収集して、チャンネルごとにデフォルト音色を作成
  const usedChannels = [...new Set(assigned.map((a) => a.note.channel))].sort((a, b) => a - b);
  // チャンネル番号 → woice スロット番号のマッピング
  const channelToWoiceIdx = new Map<number, number>();
  for (let i = 0; i < usedChannels.length; i++) {
    const ch = usedChannels[i]!;
    const program = song.programByChannel.get(ch) ?? 0;
    const instrumentName = ch === 9 ? "GM Drums" : (GM_INSTRUMENTS[program] ?? "Unknown");
    const woiceName = `${String(ch).padStart(3, "0")}-${instrumentName}`;
    const w = createDefaultWoice();
    w.setNameBuf(encodeShiftJis(woiceName), 16);
    const wio = new MemoryIo();
    if (w.ptvWrite(wio) < 0) return null;
    if (!wio.seek(SEEK_SET, 0)) return null;
    if (s.woiceRead(i, wio, WoiceType.PTV) !== PxtnErr.OK) return null;
    channelToWoiceIdx.set(ch, i);
  }

  for (let u = 0; u < unitNames.length; u++) {
    if (!s.unitAddNew()) return null;
  }
  unitNames.forEach((name, u) => s.unitGet(u)?.setNameBuf(name));

  // 各ユニットの VOICENO を、ユニットに含まれるノートのチャンネルに対応する音色に設定
  // (全ノートが同一チャンネルである前提で、最初のノートのチャンネルから woice idx を引く)
  const unitChannel = new Map<number, number>();
  for (const { note, unit } of assigned) {
    if (!unitChannel.has(unit)) unitChannel.set(unit, note.channel);
  }
  for (let u = 0; u < unitNames.length; u++) {
    const ch = unitChannel.get(u) ?? 0;
    const wIdx = channelToWoiceIdx.get(ch) ?? 0;
    s.evels.recordAddI(0, u, EventKind.VOICENO, wIdx);
  }
  for (const { note, unit } of assigned) {
    s.evels.recordAddI(note.clock, unit, EventKind.KEY, note.key);
    s.evels.recordAddI(note.clock, unit, EventKind.VELOCITY, note.velocity);
    s.evels.recordAddI(note.clock, unit, EventKind.ON, note.length);
  }

  s.master.set(song.beatNum, song.tempo, 480);
  s.master.setMeasNum(1);
  s.adjustMeasNum();

  const io = new MemoryIo();
  if (s.write(io, false, EXE_VER) !== PxtnErr.OK) return null;
  return io.toUint8Array();
}
