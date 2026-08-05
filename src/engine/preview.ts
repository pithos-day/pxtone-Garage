// 単音プレビュー (試聴)。
// worklet の preview メッセージは未実装のため、メインスレッドで
// 一時 Service を作りオフライン短レンダリング → AudioBuffer 再生で実現する。
import { Service, PxtnErr, MemoryIo, WoiceType, EventKind, type Woice } from "pxtone-ts";
import { woiceBytes } from "../state/project";

const DEFAULT_VELOCITY = 104;
const DEFAULT_VOLUME = 104;

let previewCtx: AudioContext | null = null;
let gainNode: GainNode | null = null;

function getCtx(): AudioContext | null {
  if (previewCtx) return previewCtx;
  try {
    previewCtx = new AudioContext();
    gainNode = previewCtx.createGain();
    gainNode.connect(previewCtx.destination);
    return previewCtx;
  } catch {
    return null;
  }
}

// mate セクションバイト列から一時 Service で単音をレンダリング
function renderNote(
  mateBytes: Uint8Array,
  type: WoiceType,
  key: number,
  velocity: number,
  durSec: number,
  sps: number,
): Float32Array | null {
  const s = new Service();
  if (s.initCollage(4096) !== PxtnErr.OK) return null;
  const io = new MemoryIo(mateBytes);
  if (s.woiceRead(0, io, type) !== PxtnErr.OK) return null;
  if (!s.unitAddNew()) return null;
  const unit = s.unitGet(0);
  if (!unit) return null;
  if (!unit.setWoice(s.woiceGet(0)!)) return null;
  unit.setNameBuf("preview");
  s.master.set(4, 120, 480);
  s.master.setMeasNum(2);
  s.evels.clear();
  // clockRate = 60*sps/(tempo*beatClock) = sps/960
  const durClocks = Math.max(1, Math.round(durSec * 960));
  s.evels.recordAddI(0, 0, EventKind.KEY, key);
  s.evels.recordAddI(0, 0, EventKind.VELOCITY, velocity);
  s.evels.recordAddI(0, 0, EventKind.ON, durClocks);
  if (s.tonesReady() !== PxtnErr.OK) return null;
  if (!s.setDestinationQuality(2, sps)) return null;
  if (!s.mooPreparation(null)) return null;
  const n = Math.min(Math.trunc(durSec * sps), s.mooGetSamplingEnd());
  const out = new Int16Array(n * 2);
  s.Moo(out, n);
  const f = new Float32Array(n * 2);
  for (let i = 0; i < out.length; i++) f[i] = out[i]! / 32768;
  return f;
}

let lastSrc: AudioBufferSourceNode | null = null;
let previewSerial = 0;

// woice の単音をプレビュー再生する。連続呼び出しは前の音を中断する
export function previewWoice(
  woice: Woice | null,
  woiceIdx: number,
  key: number,
  velocity: number = DEFAULT_VELOCITY,
  durSec = 1.2,
): void {
  const ctx = getCtx();
  if (!ctx || !woice) return;
  if (ctx.state === "suspended") void ctx.resume();
  const mate = woiceBytes(woiceIdx);
  if (!mate) return;
  const type = woice.type;
  const serial = ++previewSerial;
  const sps = ctx.sampleRate;
  const work = renderNote(mate, type, key, velocity, durSec, sps);
  if (!work) return;
  if (serial !== previewSerial) return;
  const buf = ctx.createBuffer(2, work.length / 2, sps);
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.getChannelData(1);
  for (let i = 0; i < ch0.length; i++) {
    ch0[i] = work[i * 2]!;
    ch1[i] = work[i * 2 + 1]!;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  // 末尾フェードでクリックノイズ回避
  const fade = Math.min(Math.trunc(ch0.length / 2), Math.trunc(sps * 0.05));
  g.gain.setValueAtTime(1, ctx.currentTime);
  g.gain.linearRampToValueAtTime(0, ctx.currentTime + fade / sps);
  src.connect(g);
  g.connect(ctx.destination);
  if (lastSrc) {
    try {
      lastSrc.stop();
    } catch {
      /* noop */
    }
  }
  lastSrc = src;
  src.onended = () => {
    if (lastSrc === src) lastSrc = null;
  };
  src.start();
}

// ベロシティ・音量のデフォルト値
export function defaultVelocity(): number {
  return DEFAULT_VELOCITY;
}

export function defaultVolume(): number {
  return DEFAULT_VOLUME;
}
