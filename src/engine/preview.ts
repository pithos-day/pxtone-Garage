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
import { NOISE_BUILT_SPS } from "../lib/noise";
import { loopCrossfade } from "../lib/loop";

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
  // 本家と同じく出力レートを確定してから tones_ready する
  // (逆順だとエンベロープ/ディレイが 44100 基準で前計算され、長さがずれる)
  if (!s.setDestinationQuality(2, sps)) return null;
  if (s.tonesReady() !== PxtnErr.OK) return null;
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

// バッファ末尾をフェードし、終端のクリックノイズを避ける (単発再生用)
function applyTailFade(ch0: Float32Array, ch1: Float32Array, fade: number): void {
  if (fade <= 0) return;
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    ch0[ch0.length - 1 - i] *= g;
    ch1[ch1.length - 1 - i] *= g;
  }
}

// インターリーブされたステレオ PCM を AudioBuffer の各チャンネルへ展開し、
// prepare (フェード/クロスフェード) を適用して再生ソースを組み立てる (gain はマスター音量連動)
function makeBufferSource(
  ctx: AudioContext,
  work: Float32Array,
  sps: number,
  prepare: (ch0: Float32Array, ch1: Float32Array) => void,
): { src: AudioBufferSourceNode; gain: GainNode } {
  const buf = ctx.createBuffer(2, work.length / 2, sps);
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.getChannelData(1);
  deinterleave(work, ch0, ch1);
  prepare(ch0, ch1);
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
  const { src } = makeBufferSource(ctx, work, sps, (c0, c1) => applyTailFade(c0, c1, fade));
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

// ユニットの音色を event の VOICENO から解決する。
// unit.woice は setWoice で明示的に設定されない限り null のため、
// evels の最後の VOICENO イベントから音色を引く
function resolveUnitWoice(svc: Service, unitNo: number): Woice | null {
  const unit = svc.unitGet(unitNo);
  if (!unit) return null;
  if (unit.woice) return unit.woice;
  let voiceNo = 0;
  for (const e of svc.evels.records) {
    if (e.kind === EventKind.VOICENO && e.unitNo === unitNo) voiceNo = e.value;
  }
  return svc.woiceGet(voiceNo);
}

// ユニットの音色で単発再生。renderWoice を直接使い、フルプロジェクトの
// シリアライズ + パースをスキップして低レイテンシを実現する
export function previewUnit(unitNo: number, key: number, velocity: number = EVENTDEFAULT_VELOCITY, durSec = PREVIEW_SEC): void {
  const svc = getService();
  if (!svc) return;
  const ctx = getCtx();
  if (!ctx) return;
  const woice = resolveUnitWoice(svc, unitNo);
  if (!woice) return;
  const work = renderWoice(woice, key, velocity, durSec, ctx.sampleRate);
  if (!work || work.length < 2) return;
  playBuffer(work, ctx.sampleRate);
}

// 音色のループ再生を開始する。renderWoice の高速パスを試し、失敗したら
// プロジェクト全体のシリアライズ + レンダリング (previewFallback) へ回す
// (PCM 音色など ptvWrite が使えない場合に対応)
async function startWoiceHold(
  woice: Woice,
  target: PreviewTarget,
  key: number,
  velocity: number,
  durSec: number,
  ctx: AudioContext,
): Promise<void> {
  let work: Float32Array | null = null;
  try {
    work = renderWoice(woice, key, velocity, durSec, ctx.sampleRate);
  } catch {
    // ptvWrite が使えない音色 (PCM 等) では例外になることがある
  }
  if (work && work.length >= 2) {
    startHold(work, ctx, woiceReleaseSec(woice));
    return;
  }
  await previewFallback(target, key, velocity, durSec, ctx);
}

// ユニットの音色をループ再生で開始する。pointerup まで鳴り続ける
export async function previewUnitHold(unitNo: number, key: number, velocity: number = EVENTDEFAULT_VELOCITY, durSec = PREVIEW_SEC): Promise<void> {
  const svc = getService();
  if (!svc) return;
  const ctx = getCtx();
  if (!ctx) return;
  const woice = resolveUnitWoice(svc, unitNo);
  if (!woice) return;
  await startWoiceHold(woice, { unitNo, woiceIdx: null }, key, velocity, durSec, ctx);
}

// renderWoice の高速パスが使えない場合のフォールバック (旧 preview() パイプライン)。
// プロジェクト全体をシリアライズしてブレンドレンダリングし、ループ再生で開始する
async function previewFallback(target: PreviewTarget, key: number, velocity: number, durSec: number, ctx: AudioContext): Promise<void> {
  const svc = getService();
  if (!svc) return;
  const bytes = exportBytes();
  if (!bytes) return;
  const woice =
    target.woiceIdx !== null
      ? svc.woiceGet(target.woiceIdx)
      : target.unitNo !== null
        ? resolveUnitWoice(svc, target.unitNo)
        : null;
  const releaseSec = woiceReleaseSec(woice);
  const work = await renderPreview(bytes, target, key, velocity, durSec, ctx.sampleRate);
  if (!work) return;
  startHold(work, ctx, releaseSec);
}

// 音色単体をループ再生で開始する。pointerup まで鳴り続ける
export async function previewWoiceHold(woiceIdx: number, key: number, velocity: number = EVENTDEFAULT_VELOCITY, durSec = PREVIEW_SEC): Promise<void> {
  const svc = getService();
  if (!svc) return;
  const woice = svc.woiceGet(woiceIdx);
  if (!woice) return;
  const ctx = getCtx();
  if (!ctx) return;
  await startWoiceHold(woice, { unitNo: null, woiceIdx }, key, velocity, durSec, ctx);
}

// ---- 押下中サステイン (押している間ループ再生) ----

let holdSource: AudioBufferSourceNode | null = null;
let holdGain: GainNode | null = null;
let holdCtx: AudioContext | null = null;
// 押下解除時に適用する音色の Release 区間 (秒)
let holdReleaseSec = 0;

// 押下解除時の最小フェード時間 (秒) — 停止時のポップ (クリックノイズ) を避ける
const RELEASE_SEC = 0.03;

// リリース減衰中のソースとそのゲイン (新しいプレビューで即時中断するため追跡)
let fadingSource: AudioBufferSourceNode | null = null;
let fadingGain: GainNode | null = null;
let fadingCtx: AudioContext | null = null;

// リリース減衰中の音を止める。
// stopHold がスケジュール済みの src.stop(when) に任せるため、
// src.stop() は呼ばない (呼ぶとランプ完了前にソースが停止しプツッの原因になる)。
// gain ランプを再設定して滑らかに消す
function stopFadingSource(): void {
  const src = fadingSource;
  const g = fadingGain;
  const ctx = fadingCtx;
  fadingSource = null;
  fadingGain = null;
  fadingCtx = null;
  if (!src) return;
  if (g && ctx) {
    const t = ctx.currentTime;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    // 即時カット (gain=0) だとプツッというクリックノイズが発生するため、
    // 最小フェード時間で滑らかに消す。stop() は stopHold のスケジュールに任せる
    g.gain.linearRampToValueAtTime(0, t + RELEASE_SEC);
  }
}

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
  // 新しいプレビューで前の音は消える (本家準拠。Release 減衰は鳴らさない)
  stopHoldForNewPreview();
  if (ctx.state === "suspended") void ctx.resume();

  // ループ点の継ぎ目: 末尾の素材を先頭へクロスフェードで混ぜる。
  // 両端を 0 に落とす方式と違いループのたびに音量が落ちず、位相の近い位置を探すため段差も小さい
  const fade = Math.min(Math.trunc(ctx.sampleRate * 0.01), Math.trunc(work.length / 4));
  const { src, gain: g } = makeBufferSource(ctx, work, ctx.sampleRate, (c0, c1) => loopCrossfade(c0, c1, fade));
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
// VOICENO/KEY/VELOCITY/ON イベントを置いてレンダリングする。
// 毎回 clear() して 1 個の Service を使い回す (毎回の initCollage を省略)
let renderSvc: Service | null = null;

function getRenderService(): Service | null {
  if (renderSvc) return renderSvc;
  renderSvc = new Service();
  if (renderSvc.initCollage(PXTN_MAX_EVENT_NUM) !== PxtnErr.OK) {
    renderSvc = null;
    return null;
  }
  return renderSvc;
}

export function renderWoice(
  woice: Woice,
  key: number,
  velocity: number,
  durSec: number,
  sps: number,
): Float32Array | null {
  const s = getRenderService();
  if (!s) return null;
  // 使い回している Service から前回の音色/ユニット/イベントを消してから注入する。
  // initCollage 済みの Service は moo 有効フラグが立っている (pxtone-ts 側) ため、
  // 以前のように ptcop へシリアライズして読み直す必要はない
  if (!s.clear()) return null;
  const io = new MemoryIo();
  if (woice.ptvWrite(io) < 0) return null;
  // ptvWrite は位置を末尾へ進めるため、読み込み前に先頭へ戻す
  if (!io.seek(SEEK_SET, 0)) return null;
  if (s.woiceRead(0, io, WoiceType.PTV) !== PxtnErr.OK) return null;
  if (!s.unitAddNew()) return null;
  return renderEvents(s, 0, key, velocity, durSec, sps);
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

// ---- Voice 側: 音声単体プレビュー (LRU キャッシュ + 非同期集約レンダリング) ----
// レンダリングは (key, velocity, durSec) 単位でキャッシュし、再計算を避ける
// (音色を編集した場合は clearWoicePreviewCache() で破棄する)

const VOICE_PREVIEW_CACHE_MAX = 8;
const voicePreviewCache = new Map<string, Float32Array>();

// LRU キャッシュ: 使用時に末尾へ移動、上限超過で最古を破棄
function cacheGet(k: string): Float32Array | null {
  const w = voicePreviewCache.get(k);
  if (w) {
    voicePreviewCache.delete(k);
    voicePreviewCache.set(k, w);
  }
  return w ?? null;
}

function cacheSet(k: string, w: Float32Array): void {
  voicePreviewCache.delete(k);
  voicePreviewCache.set(k, w);
  while (voicePreviewCache.size > VOICE_PREVIEW_CACHE_MAX) {
    const oldest = voicePreviewCache.keys().next().value;
    if (oldest === undefined) break;
    voicePreviewCache.delete(oldest);
  }
}

export function clearWoicePreviewCache(): void {
  voicePreviewCache.clear();
  // 非同期レンダリングが保留中の場合、完了時に再生しないよう無効化する
  pendingRender = null;
}

// テスト用: キャッシュされた AudioContext を破棄し、次回 getCtx() で新規作成させる
export function resetPreviewContext(): void {
  previewCtx = null;
}

// 非同期レンダリングの保留 1 件分 (キー変更で上書きされ、実行時は最新の内容だけを処理する)
interface PendingRender {
  woice: Woice;
  key: number;
  velocity: number;
  durSec: number;
  ctx: AudioContext;
}

// 非同期集約レンダリング: キー変更時は最新キーのみを 1 回レンダリングする。
// 複数のキー変更がイベントループ内で積み上がった場合、最後のキーだけを処理する
let pendingRender: PendingRender | null = null;
let renderTimer: ReturnType<typeof setTimeout> | null = null;
// リリース後にレンダリングが完了した場合の停止指示 (startHold 直後に stopHold する)
let pendingStop: { releaseSec: number } | null = null;

export function previewWoiceObjectHold(woice: Woice, key: number, velocity: number = EVENTDEFAULT_VELOCITY, durSec = PREVIEW_SEC): void {
  const ctx = getCtx();
  if (!ctx) return;
  const k = `${key}-${velocity}-${durSec}`;
  // キャッシュヒット: レンダリング不要で即時再生
  const work = cacheGet(k);
  if (work && work.length >= 2) {
    pendingStop = null;
    startHold(work, ctx, woiceReleaseSec(woice));
    return;
  }
  // キャッシュミス: 前の音を即座に止め、最新キーのレンダリングを非同期でスケジュールする
  stopHoldForNewPreview();
  pendingStop = null;
  pendingRender = { woice, key, velocity, durSec, ctx };
  if (!renderTimer) {
    renderTimer = setTimeout(() => {
      renderTimer = null;
      const p = pendingRender;
      pendingRender = null;
      if (!p) return;
      let work2: Float32Array | null = null;
      try {
        work2 = renderWoice(p.woice, p.key, p.velocity, p.durSec, p.ctx.sampleRate);
      } catch {
        work2 = null;
      }
      if (work2 && work2.length >= 2) {
        cacheSet(`${p.key}-${p.velocity}-${p.durSec}`, work2);
        startHold(work2, p.ctx, woiceReleaseSec(p.woice));
        // リリース後にレンダリング完了した場合: startHold 直後に停止して
        // タップ音 (短い攻撃 + リリース) が鳴るようにする
        if (pendingStop) {
          const releaseSec = pendingStop.releaseSec;
          pendingStop = null;
          stopHold(releaseSec);
        }
      }
    }, 0);
  }
}

// レンダリング済み PCM を単発再生する (ノイズのクリック再生用。ループしない)。
// ノイズの PCM は常に NOISE_BUILT_SPS (44100) ベースなので、AudioBuffer も 44100 として
// 作る。デバイスレートで作ると 48kHz 環境で 48000/44100 倍速 (約 +1.5 半音) にずれる
// (本家は再生側で 44100/dst_sps を掛けて補正している)
export function playPcmOnce(pcm: Float32Array): void {
  const ctx = getCtx();
  if (!ctx) return;
  playBuffer(pcm, NOISE_BUILT_SPS);
}

// 現在のホールド音を指定リリースで停止し、フェード中の音として追跡する
function stopHold(releaseSec: number): void {
  const src = holdSource;
  const g = holdGain;
  const ctx = holdCtx;
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
      // 押下解除時は音色の Release 区間で減衰、新しいプレビューへの切替時は最小フェードのみ
      const dur = Math.max(RELEASE_SEC, releaseSec);
      g.gain.linearRampToValueAtTime(0, t + dur);
      src.stop(t + dur + 0.01);
    } else {
      src.stop();
    }
  } catch {
    /* noop */
  }
  // フェード中のソースを追跡する (新しいプレビューで中断できるように)
  fadingSource = src;
  fadingGain = g;
  fadingCtx = ctx;
  src.onended = () => {
    if (fadingSource === src) {
      fadingSource = null;
      fadingGain = null;
      fadingCtx = null;
    }
  };
}

// 押下中サステインを停止する。音色の Release 区間があればその区間で減衰し、
// なければ最小フェードのみで停止する (ポップ防止)。
// 非同期レンダリングが保留中の場合、完了後に startHold → 即 stopHold し、
// タップ音 (短い攻撃 + リリース) が鳴るようにする
export function stopPreview(): void {
  // レンダリング保留中なら、完了後の startHold 直後に停止してタップ音を鳴らす
  if (pendingRender) pendingStop = { releaseSec: woiceReleaseSec(pendingRender.woice) };
  stopHold(holdReleaseSec);
}

// 新しいプレビュー開始時の後始末。リリース減衰中の音を切ってから、現在の
// ホールドを最小フェードのみで停止する (音色の Release は押下解除時のみ適用)。
// キー変更時はレンダリングを待たずにこれを実行し、前の音を即座に止める
function stopHoldForNewPreview(): void {
  stopFadingSource();
  stopHold(0);
}
