// 再生状態の管理。worklet プレイヤーとの橋渡し
import { computed, ref } from "vue";
import { RealtimePlayer } from "../engine/realtime-player";
import { getService, exportBytes, doc } from "./project";

export const player = new RealtimePlayer({
  onPosition: (sample) => {
    positionSample.value = sample;
  },
  onEnded: () => {
    isPlaying.value = false;
    positionSample.value = player.totalSampleOf();
  },
});

export const isPlaying = ref(false);
export const positionSample = ref(0);
export const loop = ref(false);
export const masterVolume = ref(1.0);

// 現在の再生位置 (クロック)
export const currentClock = computed(() => {
  const s = getService();
  if (!s) return 0;
  const rate = (60 * player.sampleRate) / (s.master.beatTempo * s.master.beatClock);
  return Math.trunc(positionSample.value / rate);
});

// worklet にロード済みのバイト列が対応するリビジョン
let loadedRev = -1;

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
  if (loadedRev !== doc.rev) {
    const pos = positionSample.value;
    const ok = await player.load(bytes);
    if (ok) loadedRev = doc.rev;
    if (pos > 0) player.seek(pos / player.sampleRate);
  }
  player.setLoop(loop.value);
  player.setMasterVolume(masterVolume.value);
  // Vue の reactive proxy は postMessage で複製できないため、プレーン配列へ
  player.setMutedUnits([...doc.muted]);
  player.play();
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
export function clockToSec(s: { master: { beatTempo: number; beatClock: number } }, clock: number): number {
  return (clock * 60) / (s.master.beatTempo * s.master.beatClock);
}

export function secToClock(s: { master: { beatTempo: number; beatClock: number } }, sec: number): number {
  return Math.trunc((sec * s.master.beatTempo * s.master.beatClock) / 60);
}

// 曲の長さ (クロック) = 再生終端小節 × 拍数 × 分解能
export function songLengthClock(s: { master: { playMeas: number; beatNum: number; beatClock: number } }): number {
  return s.master.playMeas * s.master.beatNum * s.master.beatClock;
}

export function seekToClock(clock: number): void {
  const s = getService();
  if (!s) return;
  // 曲の長さを超えないようにクランプ
  const maxClock = songLengthClock(s);
  const c = Math.max(0, Math.min(maxClock, Math.trunc(clock)));
  const sec = clockToSec(s, c);
  player.seek(sec);
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

export function getTotalSample(): number {
  return player.totalSampleOf();
}
