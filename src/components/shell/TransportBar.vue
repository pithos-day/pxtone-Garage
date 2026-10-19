// 再生コントロールバー。Player パネルから移設した再生・停止・リピート・音量・位置表示と、
// Effector/Copier パネルのトグル (右揃え)。
<script setup lang="ts">
import { Play, Pause, Square, Repeat, ArrowBigRightDash } from "@lucide/vue";
import { isPlaying, togglePlay, stopAndRewind, loop, setLoop, masterVolume, setMasterVolume, positionSample, player, currentClock, followPlayback } from "../../state/player";
import { doc, getService, clockContext } from "../../state/project";
import { panels, PANEL_DEFS as PANELS } from "../../state/panels";
import { formatClock, formatTime } from "../../lib/clock";
import { formatShortcut } from "../../state/keybindings";
import { t } from "../../i18n";

function timeLabel(): string {
  const s = getService();
  if (!s) return "0:00 / 0:00";
  const totalSec = player.totalSample / player.sampleRate;
  const curSec = positionSample.value / player.sampleRate;
  return `${formatTime(curSec)} / ${formatTime(totalSec)}`;
}

</script>

<template>
  <div class="transport">
    <button class="btn btn-accent play-btn" @click="togglePlay" :title="`${isPlaying ? t('transport.pause') : t('transport.play')} (${formatShortcut('playToggle')})`">
      <Pause v-if="isPlaying" :size="16" /><Play v-else :size="16" />
    </button>
    <button class="btn" @click="stopAndRewind" :title="t('transport.stop')"><Square :size="14" /></button>
    <button class="btn" :class="{ on: loop }" @click="setLoop(!loop)" :title="t('transport.loop')"><Repeat :size="14" /></button>
    <button class="btn" :class="{ on: followPlayback }" @click="followPlayback = !followPlayback" :title="t('transport.followPlayback')"><ArrowBigRightDash :size="14" /></button>
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
      v-for="p in PANELS"
      :key="p.id"
      class="btn btn-sm"
      :class="{ on: panels[p.id].open }"
      :disabled="doc.readOnly"
      @click="panels[p.id].open = !panels[p.id].open"
    >
      {{ p.label }}
    </button>
  </div>
</template>

<style scoped>
.transport {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  height: 34px;
  padding: 0 8px;
  background: var(--background);
  border-bottom: 1px solid var(--border);
  user-select: none;
  z-index: 20;
}

/* アイコンボタンの中央配置 (テキストボタンにも影響なし) */
.transport .btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.play-btn {
  width: 38px;
}

/* 値切替 (ループ / 追従 / パネル開閉)。モード切替とは別に塗りで選択を示す */
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
  font-size: var(--text-sm);
  color: var(--muted-foreground);
}

.pct {
  font-size: var(--text-xs);
  color: var(--muted-foreground);
  width: 30px;
}

.time {
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
  font-size: var(--text-md);
}

.clock {
  color: var(--muted-foreground);
  font-size: var(--text-sm);
  font-variant-numeric: tabular-nums;
}

.transport-spacer {
  flex: 1;
}

.panel-label {
  font-size: var(--text-sm);
  color: var(--muted-foreground);
  margin-right: 2px;
}

.btn-sm {
  padding: 1px 8px;
  font-size: var(--text-sm);
}

.btn-sm.on {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}
</style>
