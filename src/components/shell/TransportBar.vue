// 再生コントロールバー。Player パネルから移設した再生・停止・リピート・音量・位置表示と、
// グリッドスナップ・ズーム・Effector/Copier パネルのトグル (右揃え)。
<script setup lang="ts">
import { Play, Pause, Square, Repeat, ArrowBigRightDash, Metronome } from "@lucide/vue";
import { isPlaying, togglePlay, stopAndRewind, loop, setLoop, masterVolume, setMasterVolume, positionSample, player, currentClock, followPlayback, metronome, setMetronome } from "../../state/player";
import { doc, getService, clockContext } from "../../state/project";
import { panels, PANEL_DEFS as PANELS } from "../../state/panels";
import { DIVI_TABLE, ZOOM_SLIDER_MAX, formatClock, formatTime, sliderToZoom, zoomToSlider } from "../../lib/clock";
import { formatShortcut } from "../../state/keybindings";
import { t } from "../../i18n";
import LevelMeter from "./LevelMeter.vue";

function timeLabel(): string {
  const s = getService();
  if (!s) return "0:00 / 0:00";
  const totalSec = player.totalSample / player.sampleRate;
  const curSec = positionSample.value / player.sampleRate;
  return `${formatTime(curSec)} / ${formatTime(totalSec)}`;
}

// フォーム要素にフォーカスが残ると Space などのショートカットが効かないので、確定時に外す
function releaseFocus(e: Event): void {
  (e.target as HTMLElement).blur();
}
</script>

<template>
  <div class="transport">
    <button class="btn btn-accent play-btn" @click="togglePlay" :title="`${isPlaying ? t('transport.pause') : t('transport.play')} (${formatShortcut('playToggle')})`">
      <Pause v-if="isPlaying" :size="18" /><Play v-else :size="18" />
    </button>
    <button class="btn" @click="stopAndRewind" :title="t('transport.stop')"><Square :size="16" /></button>
    <button class="btn" :class="{ on: loop }" @click="setLoop(!loop)" :title="t('transport.loop')"><Repeat :size="16" /></button>
    <button class="btn" :class="{ on: metronome }" @click="setMetronome(!metronome)" :title="t('transport.metronome')"><Metronome :size="16" /></button>
    <button class="btn" :class="{ on: followPlayback }" @click="followPlayback = !followPlayback" :title="t('transport.followPlayback')"><ArrowBigRightDash :size="16" /></button>
    <span class="sep" />
    <label class="vol-label">{{ t("transport.volume") }}</label>
    <input
      type="range"
      :title="t('transport.volume')"
      min="0"
      max="1"
      step="0.01"
      :value="masterVolume"
      @input="setMasterVolume(parseFloat(($event.target as HTMLInputElement).value))"
    />
    <span class="pct">{{ Math.round(masterVolume * 100) }}%</span>
    <LevelMeter />
    <span class="sep" />
    <span class="time">{{ timeLabel() }}</span>
    <span class="clock">{{ formatClock(clockContext(), currentClock) }}</span>
    <span class="transport-spacer" />
    <label class="vol-label" for="transport-snap">{{ t("menu.edit.gridSnap") }}</label>
    <select
      id="transport-snap"
      class="snap-select"
      :title="t('menu.edit.gridSnap')"
      :value="doc.divi"
      :disabled="doc.readOnly"
      @change="doc.divi = Number(($event.target as HTMLSelectElement).value); releaseFocus($event)"
    >
      <option v-for="d in DIVI_TABLE" :key="d" :value="d">{{ d === 1 ? "1" : `1/${d}` }}</option>
    </select>
    <label class="vol-label" for="transport-zoom">{{ t("menu.view.zoom") }}</label>
    <input
      id="transport-zoom"
      :title="t('menu.view.zoom')"
      type="range"
      min="0"
      :max="ZOOM_SLIDER_MAX"
      :value="zoomToSlider(doc.zoom)"
      @input="doc.zoom = sliderToZoom(Number(($event.target as HTMLInputElement).value))"
      @change="releaseFocus"
    />
    <span class="pct">{{ Math.round(doc.zoom) }}px</span>
    <span class="sep" />
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
  height: 40px;
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
  width: 44px;
}

/* 値切替 (ループ / 追従 / パネル開閉)。モード切替とは別に塗りで選択を示す */
.btn.on {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}

.sep {
  width: 1px;
  height: 21px;
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
  width: 36px;
}

.snap-select {
  font-size: var(--text-sm);
  padding: 1px 3px;
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

/* 再生中に桁数が変わっても、後ろの部品やスライダーの幅が動かないように幅を確保する */
.time {
  min-width: 13ch;
}

.clock {
  min-width: 10ch;
}

/* 文字は折り返さず、幅が足りないときはスライダーを縮める */
.vol-label,
.pct,
.time,
.clock,
.panel-label {
  flex: none;
  white-space: nowrap;
}

.transport input[type="range"] {
  flex: 0 1 110px;
  min-width: 48px;
  width: 110px;
}

/* スライダーを縮めても入らない幅では、部品のツールチップで分かる見出しを隠して右端のボタンを残す */
@media (max-width: 1240px) {
  .vol-label,
  .panel-label {
    display: none;
  }
}

.panel-label {
  font-size: var(--text-sm);
  color: var(--muted-foreground);
  margin-right: 2px;
}

.btn-sm {
  padding: 2px 10px;
  font-size: var(--text-sm);
}

.btn-sm.on {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-foreground);
}
</style>
