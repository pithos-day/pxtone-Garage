// 再生パネル (フローティング)
<script setup lang="ts">
import FloatingPanel from "./FloatingPanel.vue";
import { isPlaying, togglePlay, stop, loop, setLoop, masterVolume, setMasterVolume, currentClock, positionSample, player } from "../../state/player";
import { getService, clockView as projectClockView } from "../../state/project";
import { formatClock } from "../../lib/clock";

function timeLabel(): string {
  const s = getService();
  if (!s) return "0:00";
  const totalSec = player.totalSampleOf() / player.sampleRate;
  const curSec = positionSample.value / player.sampleRate;
  return `${fmt(curSec)} / ${fmt(totalSec)}`;
}

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}
</script>

<template>
  <FloatingPanel name="player" title="Player" :width="220">
    <div class="player-body">
      <div class="row">
        <button class="btn btn-accent play-btn" @click="togglePlay">{{ isPlaying ? "⏸" : "▶" }}</button>
        <button class="btn" @click="stop">⏹</button>
        <span class="time">{{ timeLabel() }}</span>
      </div>
      <div class="row">
        <label>ループ</label>
        <input type="checkbox" :checked="loop" @change="setLoop(($event.target as HTMLInputElement).checked)" />
      </div>
      <div class="row">
        <label>音量</label>
        <input type="range" min="0" max="1" step="0.01" :value="masterVolume" @input="setMasterVolume(parseFloat(($event.target as HTMLInputElement).value))" />
        <span class="pct">{{ Math.round(masterVolume * 100) }}%</span>
      </div>
      <div class="row">
        <label>位置</label>
        <span class="clock">{{ formatClock(projectClockView(), currentClock) }}</span>
      </div>
    </div>
  </FloatingPanel>
</template>

<style scoped>
.player-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.play-btn {
  width: 44px;
}

.time {
  font-variant-numeric: tabular-nums;
  color: var(--text-bright);
}

.pct {
  font-size: 10px;
  color: var(--text-dim);
}

.clock {
  color: var(--text-dim);
  font-size: 11px;
}
</style>
