// 単音プレビュー (試聴)。
// worklet の preview メッセージは未実装のため、メインスレッドで
// 一時 Service にプロジェクト全体を読み込み、対象ユニットのみの
// ノートをオフライン短レンダリング → AudioBuffer 再生で実現する。
import { Service, PxtnErr, MemoryIo, EventKind, PXTN_MAX_EVENT_NUM } from "pxtone-ts";
import { exportBytes } from "../state/project";
import { getService } from "../state/project";

const DEFAULT_VELOCITY = 104;
const DEFAULT_VOLUME = 104;

// プレビューの再生時間 (秒)
export const PREVIEW_SEC = 2.5;

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

export interface PreviewTarget {
  unitNo: number | null; // null のとき woiceIdx で新しいユニットを作る
  woiceIdx: number | null;
}

// プロジェクトバイト列から単音をレンダリング。
// 対象ユニット以外を削除し、clock 0 に VOICENO/KEY/VELOCITY/ON を置く
// (音色は VOICENO イベントで割り当てる — read 直後の unit には woice が未設定)
export function renderPreview(
  projectBytes: Uint8Array,
  target: PreviewTarget,
  key: number,
  velocity: number,
  durSec: number,
  sps: number,
): Float32Array | null {
  const s = new Service();
  if (s.initCollage(PXTN_MAX_EVENT_NUM) !== PxtnErr.OK) return null;
  if (s.read(new MemoryIo(projectBytes)) !== PxtnErr.OK) return null;

  // 対象ユニットの音色番号 (VOICENO イベントの最後の値) を整理前に取得
  let voiceNo = target.woiceIdx ?? 0;
  if (target.unitNo !== null && target.unitNo >= 0) {
    for (const e of s.evels.records) {
      if (e.kind === EventKind.VOICENO && e.unitNo === target.unitNo) voiceNo = e.value;
    }
  }

  if (target.unitNo !== null && target.unitNo >= 0) {
    for (let u = s.unitNum - 1; u >= 0; u--) {
      if (u !== target.unitNo) s.unitRemove(u);
    }
  } else {
    while (s.unitNum > 0) s.unitRemove(s.unitNum - 1);
    if (!s.unitAddNew()) return null;
  }
  if (!s.unitGet(0)) return null;

  s.master.set(4, 120, 480);
  s.master.setMeasNum(2);
  s.evels.clear();
  // clockRate = 60*sps/(tempo*beatClock) = sps/960
  const durClocks = Math.max(1, Math.round(durSec * 960));
  s.evels.recordAddI(0, 0, EventKind.VOICENO, voiceNo);
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

// バッファを再生する。連続呼び出しは前の音を中断する
function playBuffer(work: Float32Array, sps: number, serial: number): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
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

// ユニットの音色で単音をプレビュー。
// 音色は read 直後の unit には未設定 (VOICENO イベントで決まる) ため、
// renderPreview 側で VOICENO から割り当てる。ここではユニット存在のみ確認
export function previewUnit(unitNo: number, key: number, velocity: number = DEFAULT_VELOCITY, durSec = PREVIEW_SEC): void {
  const svc = getService();
  if (!svc) return;
  if (!svc.unitGet(unitNo)) return;
  const bytes = exportBytes();
  if (!bytes) return;
  const serial = ++previewSerial;
  const ctx = getCtx();
  if (!ctx) return;
  const work = renderPreview(bytes, { unitNo, woiceIdx: null }, key, velocity, durSec, ctx.sampleRate);
  if (!work) return;
  playBuffer(work, ctx.sampleRate, serial);
}

// 音色単体で単音をプレビュー (プロジェクト内の音色をそのまま使う)
export function previewWoice(woiceIdx: number, key: number, velocity: number = DEFAULT_VELOCITY, durSec = PREVIEW_SEC): void {
  const svc = getService();
  if (!svc) return;
  if (!svc.woiceGet(woiceIdx)) return;
  const bytes = exportBytes();
  if (!bytes) return;
  const serial = ++previewSerial;
  const ctx = getCtx();
  if (!ctx) return;
  const work = renderPreview(bytes, { unitNo: null, woiceIdx }, key, velocity, durSec, ctx.sampleRate);
  if (!work) return;
  playBuffer(work, ctx.sampleRate, serial);
}

// ---- 押下中サステイン (押している間ループ再生) ----

let holdSource: AudioBufferSourceNode | null = null;

// レンダリング済みバッファをループ再生で開始する
function startHold(work: Float32Array, ctx: AudioContext): void {
  stopPreview();
  if (ctx.state === "suspended") void ctx.resume();

  // ループ点のクリック軽減: 先頭/末尾 10ms フェード
  const fade = Math.min(Math.trunc(ctx.sampleRate * 0.01), Math.trunc(work.length / 4));
  if (fade > 0) {
    for (let i = 0; i < fade; i++) {
      const g = i / fade;
      work[i * 2]! *= g;
      work[i * 2 + 1]! *= g;
      const last = work.length / 2 - 1 - i;
      work[last * 2]! *= g;
      work[last * 2 + 1]! *= g;
    }
  }

  const buf = ctx.createBuffer(2, work.length / 2, ctx.sampleRate);
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.getChannelData(1);
  for (let i = 0; i < ch0.length; i++) {
    ch0[i] = work[i * 2]!;
    ch1[i] = work[i * 2 + 1]!;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const g = ctx.createGain();
  g.gain.value = 1;
  src.connect(g);
  g.connect(ctx.destination);
  holdSource = src;
  src.onended = () => {
    if (holdSource === src) holdSource = null;
  };
  src.start();
}

// ユニットの音色をループ再生で開始する。pointerup まで鳴り続ける
export function previewUnitHold(
  unitNo: number,
  key: number,
  velocity: number = DEFAULT_VELOCITY,
  durSec = PREVIEW_SEC,
): void {
  const svc = getService();
  if (!svc) return;
  if (!svc.unitGet(unitNo)) return;
  const bytes = exportBytes();
  if (!bytes) return;
  const ctx = getCtx();
  if (!ctx) return;
  const work = renderPreview(bytes, { unitNo, woiceIdx: null }, key, velocity, durSec, ctx.sampleRate);
  if (!work) return;
  startHold(work, ctx);
}

// 音色単体をループ再生で開始する。pointerup まで鳴り続ける
export function previewWoiceHold(
  woiceIdx: number,
  key: number,
  velocity: number = DEFAULT_VELOCITY,
  durSec = PREVIEW_SEC,
): void {
  const svc = getService();
  if (!svc) return;
  if (!svc.woiceGet(woiceIdx)) return;
  const bytes = exportBytes();
  if (!bytes) return;
  const ctx = getCtx();
  if (!ctx) return;
  const work = renderPreview(bytes, { unitNo: null, woiceIdx }, key, velocity, durSec, ctx.sampleRate);
  if (!work) return;
  startHold(work, ctx);
}

// 押下中サステインを停止する
export function stopPreview(): void {
  if (holdSource) {
    try {
      holdSource.stop();
    } catch {
      /* noop */
    }
    holdSource = null;
  }
}

// ベロシティ・音量のデフォルト値
export function defaultVelocity(): number {
  return DEFAULT_VELOCITY;
}

export function defaultVolume(): number {
  return DEFAULT_VOLUME;
}
