// 再生コントロールバー。Player パネルから移設した再生・停止・リピート・音量・位置表示と、
// Effector/Copier パネルのトグル (右揃え)。
<script setup lang="ts">
import { isPlaying, togglePlay, stop, loop, setLoop, masterVolume, setMasterVolume, positionSample, player, currentClock } from "../../state/player";
import { getService, clockContext } from "../../state/project";
import { panels } from "../../state/panels";
import { formatClock } from "../../lib/clock";
import { t } from "../../i18n";

// 秒 → mm:ss
function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}

function timeLabel(): string {
  const s = getService();
  if (!s) return "0:00 / 0:00";
  const totalSec = player.totalSample / player.sampleRate;
  const curSec = positionSample.value / player.sampleRate;
  return `${formatTime(curSec)} / ${formatTime(totalSec)}`;
}

// パネルトグルボタンの表示ラベル
const PANEL_LABELS = { effector: "Effector", copier: "Copier" } as const;
const PANEL_IDS = ["effector", "copier"] as const;
</script>

<template>
  <div class="transport">
    <button class="btn btn-accent play-btn" @click="togglePlay" :title="isPlaying ? t('transport.pause') : t('transport.play')">
      {{ isPlaying ? "⏸" : "▶" }}
    </button>
    <button class="btn" @click="stop" :title="t('transport.stop')">⏹</button>
    <button class="btn" :class="{ on: loop }" @click="setLoop(!loop)" :title="t('transport.loop')">⟳</button>
    <span class="sep" />
    <label class="vol-label">{{ t("transport.volume") }}</label>
    <input
      type="range"
      min="0"
      max="1"
      step="0.01"
      :value="masterVolume"
      @input="setMasterVolume(parseFloat(($event.target as HTMLInputElement).value))"
    />
    <span class="pct">{{ Math.round(masterVolume * 100) }}%</span>
    <span class="sep" />
    <span class="time">{{ timeLabel() }}</span>
    <span class="clock">{{ formatClock(clockContext(), currentClock) }}</span>
    <span class="transport-spacer" />
    <span class="panel-label">{{ t("transport.panels") }}</span>
    <button
      v-for="p in PANEL_IDS"
      :key="p"
      class="btn btn-sm"
      :class="{ on: panels[p].open }"
      @click="panels[p].open = !panels[p].open"
    >
      {{ PANEL_LABELS[p] }}
    </button>
  </div>
</template>

<style scoped>
.transport {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 8px;
  background: var(--background);
  border-bottom: 1px solid var(--border);
  user-select: none;
  z-index: 20;
}

.play-btn {
  width: 38px;
}

.btn.on {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}

.sep {
  width: 1px;
  height: 18px;
  background: var(--border);
  margin: 0 4px;
}

.vol-label {
  font-size: 11px;
  color: var(--muted-foreground);
}

.pct {
  font-size: 10px;
  color: var(--muted-foreground);
  width: 30px;
}

.time {
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
  font-size: 12px;
}

.clock {
  color: var(--muted-foreground);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

.transport-spacer {
  flex: 1;
}

.panel-label {
  font-size: 11px;
  color: var(--muted-foreground);
  margin-right: 2px;
}

.btn-sm {
  padding: 1px 8px;
  font-size: 11px;
}

.btn-sm.on {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}
</style>
