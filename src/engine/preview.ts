// 単音プレビュー (試聴)。
// worklet の preview メッセージは未実装のため、メインスレッドで
// 一時 Service にプロジェクト全体を読み込み、対象ユニットのみの
// ノートをオフライン短レンダリング → AudioBuffer 再生で実現する。
import { Service, PxtnErr, MemoryIo, SEEK_SET, EventKind, PXTN_MAX_EVENT_NUM, EVENTDEFAULT_VELOCITY, WoiceType, NoiseBuilder } from "pxtone-ts";
import type { Woice, Noise } from "pxtone-ts";
import { exportBytes } from "../state/project";
import { decodeProjectBytes } from "./oggv";
import { getService } from "../state/project";
import { EXE_VER } from "../state/service";
import { watch } from "vue";
import { masterVolume } from "../state/player";

// プレビューの再生時間 (秒)
export const PREVIEW_SEC = 2.5;

let previewCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (previewCtx) return previewCtx;
  try {
    previewCtx = new AudioContext();
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
export async function renderPreview(
  projectBytes: Uint8Array,
  target: PreviewTarget,
  key: number,
  velocity: number,
  durSec: number,
  sps: number,
): Promise<Float32Array | null> {
  const decoded = await decodeProjectBytes(projectBytes, EXE_VER);
  if (!decoded) return null;
  const s = new Service();
  if (s.initCollage(PXTN_MAX_EVENT_NUM) !== PxtnErr.OK) return null;
  if (s.read(new MemoryIo(decoded)) !== PxtnErr.OK) return null;

  // 対象ユニットの音色番号 (VOICENO イベントの最後の値) を整理前に取得
  let voiceNo = target.woiceIdx ?? 0;
  if (target.unitNo !== null) {
    for (const e of s.evels.records) {
      if (e.kind === EventKind.VOICENO && e.unitNo === target.unitNo) voiceNo = e.value;
    }
  }

  if (target.unitNo !== null) {
    for (let u = s.unitNum - 1; u >= 0; u--) {
      if (u !== target.unitNo) s.unitRemove(u);
    }
  } else {
    while (s.unitNum > 0) s.unitRemove(s.unitNum - 1);
    if (!s.unitAddNew()) return null;
  }
  if (!s.unitGet(0)) return null;

  return renderEvents(s, voiceNo, key, velocity, durSec, sps);
}

// 単音レンダリングの共通部: clock 0 に VOICENO/KEY/VELOCITY/ON を置いて
// Moo で PCM 化する (tempo=120, beatClock=480 固定)
function renderEvents(
  s: Service,
  voiceNo: number,
  key: number,
  velocity: number,
  durSec: number,
  sps: number,
): Float32Array | null {
  s.master.set(4, 120, 480);
  s.master.setMeasNum(2);
  s.evels.clear();
  // clockRate (samples/clock) = 60*sps/(tempo*beatClock) = sps/960。
  // 960 は上記の tempo=120, beatClock=480 から導かれる clocks/秒
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
  return int16ToFloat32(out);
}

// Int16 (ステレオインターリーブ) → 0..1 に正規化した Float32
function int16ToFloat32(out: Int16Array): Float32Array {
  const f = new Float32Array(out.length);
  for (let i = 0; i < out.length; i++) f[i] = out[i]! / 32768;
  return f;
}

let lastSrc: AudioBufferSourceNode | null = null;

// インターリーブされたステレオ PCM を AudioBuffer の各チャンネルへ展開する
function deinterleave(work: Float32Array, ch0: Float32Array, ch1: Float32Array): void {
  for (let i = 0; i < ch0.length; i++) {
    ch0[i] = work[i * 2]!;
    ch1[i] = work[i * 2 + 1]!;
  }
}

// バッファの末尾 (head なら先頭も) をフェードし、ループ点・終端のクリックノイズを避ける
function applyFade(ch0: Float32Array, ch1: Float32Array, fade: number, head: boolean): void {
  if (fade <= 0) return;
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    ch0[ch0.length - 1 - i] *= g;
    ch1[ch1.length - 1 - i] *= g;
    if (head) {
      ch0[i] *= g;
      ch1[i] *= g;
    }
  }
}

// インターリーブされたステレオ PCM を AudioBuffer の各チャンネルへ展開し、
// フェードを適用して再生ソースを組み立てる (gain はマスター音量連動)
function makeBufferSource(
  ctx: AudioContext,
  work: Float32Array,
  sps: number,
  fade: number,
  head: boolean,
): { src: AudioBufferSourceNode; gain: GainNode } {
  const buf = ctx.createBuffer(2, work.length / 2, sps);
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.getChannelData(1);
  deinterleave(work, ch0, ch1);
  applyFade(ch0, ch1, fade, head);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const g = ctx.createGain();
  g.gain.value = masterVolume.value;
  src.connect(g);
  g.connect(ctx.destination);
  return { src, gain: g };
}

// バッファを再生する。連続呼び出しは前の音を中断する
function playBuffer(work: Float32Array, sps: number): void {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === "suspended") void ctx.resume();
  // 末尾フェードでクリックノイズ回避 (バッファ終端のサンプルを減衰)
  const fade = Math.min(Math.trunc(work.length / 4), Math.trunc(sps * 0.05));
  const { src } = makeBufferSource(ctx, work, sps, fade, false);
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
// (hold = false なら 1 回だけ再生、true なら pointerup までループ再生)
async function preview(target: PreviewTarget, key: number, velocity: number, durSec: number, hold: boolean): Promise<void> {
  const svc = getService();
  if (!svc) return;
  if (target.unitNo !== null) {
    if (!svc.unitGet(target.unitNo)) return;
  } else if (target.woiceIdx === null || !svc.woiceGet(target.woiceIdx)) {
    return;
  }
  const bytes = exportBytes();
  if (!bytes) return;
  const ctx = getCtx();
  if (!ctx) return;
  // 音色のリリース区間 (秒)。hold 解除時に Release を適用するため事前に取得
  const woice =
    target.woiceIdx !== null
      ? svc.woiceGet(target.woiceIdx)
      : target.unitNo !== null
        ? svc.unitGet(target.unitNo)?.woice ?? null
        : null;
  const releaseSec = woiceReleaseSec(woice);
  const work = await renderPreview(bytes, target, key, velocity, durSec, ctx.sampleRate);
  if (!work) return;
  if (hold) startHold(work, ctx, releaseSec);
  else playBuffer(work, ctx.sampleRate);
}

export async function previewUnit(unitNo: number, key: number, velocity: number = EVENTDEFAULT_VELOCITY, durSec = PREVIEW_SEC): Promise<void> {
  await preview({ unitNo, woiceIdx: null }, key, velocity, durSec, false);
}

// ユニットの音色をループ再生で開始する。pointerup まで鳴り続ける
export async function previewUnitHold(unitNo: number, key: number, velocity: number = EVENTDEFAULT_VELOCITY, durSec = PREVIEW_SEC): Promise<void> {
  await preview({ unitNo, woiceIdx: null }, key, velocity, durSec, true);
}

// 音色単体をループ再生で開始する。pointerup まで鳴り続ける
export async function previewWoiceHold(woiceIdx: number, key: number, velocity: number = EVENTDEFAULT_VELOCITY, durSec = PREVIEW_SEC): Promise<void> {
  await preview({ unitNo: null, woiceIdx }, key, velocity, durSec, true);
}

// ---- 押下中サステイン (押している間ループ再生) ----

let holdSource: AudioBufferSourceNode | null = null;
let holdGain: GainNode | null = null;
let holdCtx: AudioContext | null = null;
// 押下解除時に適用する音色の Release 区間 (秒)
let holdReleaseSec = 0;

// 押下解除時の最小フェード時間 (秒) — 停止時のポップ (クリックノイズ) を避ける
const RELEASE_SEC = 0.03;

// 音色のリリース区間 (秒) を返す。tail なし・fps 不正・区間 0 は 0 (即時カットオフ)
function woiceReleaseSec(woice: Woice | null): number {
  if (!woice) return 0;
  const vc = woice.getVoice(0);
  if (!vc) return 0;
  const e = vc.envelope;
  if (e.tailNum <= 0 || e.fps <= 0) return 0;
  const hc = e.headNum + e.bodyNum;
  const x = e.points[hc]?.x ?? 0;
  return x > 0 ? x / e.fps : 0;
}

// レンダリング済みバッファをループ再生で開始する
function startHold(work: Float32Array, ctx: AudioContext, releaseSec = 0): void {
  if (work.length < 2) return;
  stopPreview();
  if (ctx.state === "suspended") void ctx.resume();

  // ループ点のクリック軽減: 先頭/末尾 10ms フェード
  const fade = Math.min(Math.trunc(ctx.sampleRate * 0.01), Math.trunc(work.length / 4));
  const { src, gain: g } = makeBufferSource(ctx, work, ctx.sampleRate, fade, true);
  src.loop = true;
  holdSource = src;
  holdGain = g;
  holdCtx = ctx;
  holdReleaseSec = releaseSec;
  src.onended = () => {
    if (holdSource === src) holdSource = null;
  };
  src.start();
}

// プレイヤーの音量設定を押下中サステインの音量にも即時反映する
watch(masterVolume, (v) => {
  if (holdGain && holdCtx) holdGain.gain.setTargetAtTime(v, holdCtx.currentTime, 0.005);
});

// 単体 Woice をオフライン短レンダリングして Float32Array (ステレオインターリーブ) を得る。
// renderPreview と同一の手法で、音色スロット 0 に ptvWrite バイト列を注入してから
// VOICENO/KEY/VELOCITY/ON イベントを置いてレンダリングする
export function renderWoice(
  woice: Woice,
  key: number,
  velocity: number,
  durSec: number,
  sps: number,
): Float32Array | null {
  const s = new Service();
  if (s.initCollage(PXTN_MAX_EVENT_NUM) !== PxtnErr.OK) return null;
  const io = new MemoryIo();
  if (woice.ptvWrite(io) < 0) return null;
  // ptvWrite は位置を末尾へ進めるため、読み込み前に先頭へ戻す
  if (!io.seek(SEEK_SET, 0)) return null;
  if (s.woiceRead(0, io, WoiceType.PTV) !== PxtnErr.OK) return null;
  if (!s.unitAddNew()) return null;
  // read() を経由しないと _mooBValidData が立たず mooPreparation が失敗するため、
  // 一時プロジェクトを ptcop にシリアライズして読み直す (renderPreview と同じ経路。
  // bTune=false は ptcop 形式 — pttune 書き出しの io.ts exportPttune とは別経路)
  const out = new MemoryIo();
  if (s.write(out, false, EXE_VER) !== PxtnErr.OK) return null;
  const s2 = new Service();
  if (s2.initCollage(PXTN_MAX_EVENT_NUM) !== PxtnErr.OK) return null;
  if (s2.read(new MemoryIo(out.toUint8Array())) !== PxtnErr.OK) return null;
  return renderEvents(s2, 0, key, velocity, durSec, sps);
}

// ノイズを NoiseBuilder で波形化して Float32Array (ステレオインターリーブ) を得る
export function renderNoise(noise: Noise, sps: number): Float32Array | null {
  const bldr = new NoiseBuilder();
  if (!bldr.init()) return null;
  const pcm = bldr.buildNoise(noise, 2, sps, 16);
  if (!pcm) return null;
  const buf = pcm.devolveSamplingBuffer();
  if (!buf) return null;
  return int16ToFloat32(new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength >> 1));
}

// 音声単体 (コラージュ外の Woice オブジェクト) を押下中サステインで試聴開始する。
// レンダリングは (key, velocity) 単位でキャッシュし、再計算を避ける
// (音色を編集した場合は clearWoicePreviewCache() で破棄する)
let voicePreviewKey = "";
let voicePreviewWork: Float32Array | null = null;

export function clearWoicePreviewCache(): void {
  voicePreviewKey = "";
  voicePreviewWork = null;
}

export function previewWoiceObjectHold(woice: Woice, key: number, velocity: number = EVENTDEFAULT_VELOCITY, durSec = PREVIEW_SEC): void {
  const ctx = getCtx();
  if (!ctx) return;
  const k = `${key}-${velocity}-${durSec}`;
  if (voicePreviewKey !== k) {
    voicePreviewKey = k;
    try {
      voicePreviewWork = renderWoice(woice, key, velocity, durSec, ctx.sampleRate);
    } catch {
      voicePreviewWork = null;
    }
  }
  if (!voicePreviewWork || voicePreviewWork.length < 2) {
    // レンダリング失敗時はキャッシュを破棄して次回再試行する
    voicePreviewKey = "";
    voicePreviewWork = null;
    return;
  }
  startHold(voicePreviewWork, ctx, woiceReleaseSec(woice));
}

// レンダリング済み PCM を単発再生する (ノイズのクリック再生用。ループしない)
export function playPcmOnce(pcm: Float32Array): void {
  const ctx = getCtx();
  if (!ctx) return;
  playBuffer(pcm, ctx.sampleRate);
}

// 押下中サステインを停止する。音色の Release 区間があればその区間で減衰し、
// なければ最小フェードのみで停止する (ポップ防止)
export function stopPreview(): void {
  const src = holdSource;
  const g = holdGain;
  const ctx = holdCtx;
  const releaseSec = holdReleaseSec;
  holdSource = null;
  holdGain = null;
  holdCtx = null;
  holdReleaseSec = 0;
  if (!src) return;
  try {
    if (g && ctx) {
      const t = ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      // 音色の Release 区間で減衰する (tail なしは最小フェードのみ)
      const dur = Math.max(RELEASE_SEC, releaseSec);
      g.gain.linearRampToValueAtTime(0, t + dur);
      src.stop(t + dur + 0.01);
    } else {
      src.stop();
    }
  } catch {
    /* noop */
  }
}
