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

export function seekToClock(clock: number): void {
  const s = getService();
  if (!s) return;
  const sec = clockToSec(s, clock);
  player.seek(sec);
  positionSample.value = Math.trunc(sec * player.sampleRate);
}

export function clockToSec(s: { master: { beatTempo: number; beatClock: number } }, clock: number): number {
  const rate = (60 * player.sampleRate) / (s.master.beatTempo * s.master.beatClock);
  return clock / rate;
}

export function secToClock(s: { master: { beatTempo: number; beatClock: number } }, sec: number): number {
  const rate = (60 * player.sampleRate) / (s.master.beatTempo * s.master.beatClock);
  return Math.trunc(sec * rate);
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
