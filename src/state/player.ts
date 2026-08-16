// 再生状態の管理。worklet プレイヤーとの橋渡し
import { computed, ref, watch } from "vue";
import { RealtimePlayer } from "../engine/realtime-player";
import { decodeProjectBytes } from "../engine/oggv";
import { getService, exportBytes, doc } from "./project";

export const player = new RealtimePlayer({
  onPosition: (sample) => {
    positionSample.value = sample;
  },
  onEnded: () => {
    isPlaying.value = false;
    positionSample.value = player.totalSample;
  },
});

export const isPlaying = ref(false);
export const positionSample = ref(0);
export const loop = ref(true);
export const masterVolume = ref(1.0);

// ミュート/ソロ切替を再生中も worklet へ即時反映する。
// getter が毎回プレーン配列を生成するため postMessage にも安全。
watch(
  () => [...doc.muted],
  (muted) => {
    if (isPlaying.value) player.setMutedUnits(muted);
  },
);

// クロック ↔ 秒の換算に必要なマスター設定
export interface MasterClock {
  master: {
    beatTempo: number;
    beatClock: number;
    playMeas: number;
    beatNum: number;
  };
}

// 現在の再生位置 (クロック)
export const currentClock = computed(() => {
  const s = getService();
  if (!s) return 0;
  return secToClock(s, positionSample.value / player.sampleRate);
});

// worklet にロード済みのバイト列が対応するリビジョン
let loadedRev = -1;

// プロジェクト切替時に呼ぶ: worklet のロード状態を破棄する
export function resetLoaded(): void {
  loadedRev = -1;
  if (isPlaying.value) stop();
  positionSample.value = 0;
}

// リビジョンが変わっていればバイト列をロードし直し、再生位置を引き継ぐ
async function ensureLoaded(bytes: Uint8Array): Promise<void> {
  if (loadedRev === doc.rev) return;
  const pos = positionSample.value;
  const decoded = await decodeProjectBytes(bytes);
  if (!decoded) return;
  const ok = await player.load(decoded, doc.playStart, doc.playEnd);
  if (ok) loadedRev = doc.rev;
  if (pos > 0) player.seekSec(pos / player.sampleRate);
}

// 再生中に編集 (doc.rev 変更) が入ったら worklet へ再ロードし、
// 再生位置を維持して変更を即時反映する (音色変更・イベント編集など)
let refreshing = false;
watch(
  () => doc.rev,
  () => {
    if (isPlaying.value) void refreshWhilePlaying();
  },
);

async function refreshWhilePlaying(): Promise<void> {
  if (refreshing) return;
  if (typeof AudioContext === "undefined") return; // テスト環境 (node) では再生がないため何もしない
  refreshing = true;
  try {
    // ロード中にさらに編集されたら、最新の rev がロードできるまで繰り返す
    let revAtStart = -1;
    while (revAtStart !== doc.rev) {
      if (!getService()) return;
      revAtStart = doc.rev;
      const bytes = exportBytes();
      if (!bytes) return;
      const decoded = await decodeProjectBytes(bytes);
      if (!decoded) return;
      if (!(await player.load(decoded, doc.playStart, doc.playEnd))) return;
    }
    loadedRev = doc.rev;
    const pos = player.getCurrentSample();
    if (pos > 0) player.seekSec(pos / player.sampleRate);
    applyPlaybackState();
  } finally {
    refreshing = false;
  }
}

// ループ・音量・ミュートを適用して再生を開始する
// (Vue の reactive proxy は postMessage で複製できないため、プレーン配列へ)
function applyPlaybackState(): void {
  player.setLoop(loop.value);
  player.setMasterVolume(masterVolume.value);
  player.setMutedUnits([...doc.muted]);
  player.play();
}

// 編集用再生範囲の開始位置より前なら Start まで移動する
function clampToPlayStart(s: NonNullable<ReturnType<typeof getService>>): void {
  if (doc.playStart < 0) return;
  const startClock = doc.playStart * s.master.beatNum * s.master.beatClock;
  const startSample = Math.trunc(clockToSec(s, startClock) * player.sampleRate);
  if (positionSample.value < startSample) {
    positionSample.value = startSample;
    player.seekSec(startSample / player.sampleRate);
  }
}

let rafId = 0;
function tick(): void {
  if (isPlaying.value) {
    positionSample.value = player.getCurrentSample();
    rafId = requestAnimationFrame(tick);
  }
}

export async function play(): Promise<void> {
  const s = getService();
  if (!s) return;
  const bytes = exportBytes();
  if (!bytes) return;
  await ensureLoaded(bytes);
  clampToPlayStart(s);
  applyPlaybackState();
  isPlaying.value = true;
  cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(tick);
}

export function stop(): void {
  player.stop();
  isPlaying.value = false;
  cancelAnimationFrame(rafId);
}

export function togglePlay(): void {
  if (isPlaying.value) stop();
  else void play();
}

// クロック → 秒。rate = 60*sps/(tempo*beatClock) は samples/clock なので
// sec = clock × rate / sps = clock × 60/(tempo×beatClock)
export function clockToSec(master: MasterClock, clock: number): number {
  return (clock * 60) / (master.master.beatTempo * master.master.beatClock);
}

export function secToClock(master: MasterClock, sec: number): number {
  return Math.trunc((sec * master.master.beatTempo * master.master.beatClock) / 60);
}

// 曲の長さ (クロック) = 再生終端小節 × 拍数 × 分解能
export function songLengthClock(master: MasterClock): number {
  return master.master.playMeas * master.master.beatNum * master.master.beatClock;
}

export function seekToClock(clock: number): void {
  const s = getService();
  if (!s) return;
  // 曲の長さを超えないようにクランプ
  const maxClock = songLengthClock(s);
  const c = Math.max(0, Math.min(maxClock, Math.trunc(clock)));
  const sec = clockToSec(s, c);
  player.seekSec(sec);
  positionSample.value = Math.trunc(sec * player.sampleRate);
}

export function setLoop(b: boolean): void {
  loop.value = b;
  player.setLoop(b);
}

export function setMasterVolume(v: number): void {
  masterVolume.value = v;
  player.setMasterVolume(v);
}
