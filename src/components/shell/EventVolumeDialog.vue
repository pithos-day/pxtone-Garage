// イベント音量ダイアログ (本家の dlg_EventVolume 相当)。
// ベロシティ / パン(時間差) / パン(音量) / ボリューム の値を範囲内で加算する。
<script setup lang="ts">
import { computed, onMounted, reactive } from "vue";
import { doc, getService, clockView as projectClockView, changeEventValue } from "../../state/project";
import { clockToMeasBeatClock } from "../../lib/clock";
import { EventKind } from "pxtone-ts";
import { t } from "../../i18n";

const props = defineProps<{ mode: "velocity" | "pantime" | "panvolume" | "volume" }>();
const emit = defineEmits<{ (e: "close"): void }>();

const form = reactive({
  fromMeas: 1,
  fromBeat: 1,
  fromClock: 0,
  toMeas: 1,
  toBeat: 1,
  toClock: 0,
  value: 0,
});

const TITLES: Record<string, string> = {
  velocity: "menu.edit.velocity",
  pantime: "menu.edit.panTime",
  panvolume: "menu.edit.panVolume",
  volume: "menu.edit.volume",
};

const KINDS: Record<string, EventKind> = {
  velocity: EventKind.VELOCITY,
  pantime: EventKind.PAN_TIME,
  panvolume: EventKind.PAN_VOLUME,
  volume: EventKind.VOLUME,
};

const title = computed(() => t(TITLES[props.mode]!));

const beatClock = (): number => getService()?.master.beatClock ?? 480;
const beatNum = (): number => getService()?.master.beatNum ?? 4;

function toClock(meas: number, beat: number, clock: number): number {
  return (Math.max(1, meas) - 1) * beatNum() * beatClock() + (Math.max(1, beat) - 1) * beatClock() + Math.max(0, clock);
}

onMounted(() => {
  const view = projectClockView();
  if (doc.scope2 > doc.scope1) {
    const [m1, b1, c1] = clockToMeasBeatClock(view, doc.scope1);
    const [m2, b2, c2] = clockToMeasBeatClock(view, doc.scope2 - 1);
    form.fromMeas = m1 + 1;
    form.fromBeat = b1 + 1;
    form.fromClock = c1;
    form.toMeas = m2 + 1;
    form.toBeat = b2 + 1;
    form.toClock = c2;
  }
});

function onOk(): void {
  const c1 = toClock(form.fromMeas, form.fromBeat, form.fromClock);
  const c2 = toClock(form.toMeas, form.toBeat, form.toClock);
  changeEventValue(c1, c2, KINDS[props.mode]!, form.value);
  emit("close");
}

function onOverlayClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).classList.contains("dlg-overlay")) emit("close");
}
</script>

<template>
  <div class="dlg-overlay" @click="onOverlayClick">
    <div class="dlg" role="dialog" aria-label="event-volume">
      <div class="dlg-title">{{ title }}</div>
      <div class="dlg-body">
        <div class="range">
          <label>{{ t("copymeas.meas") }}</label><input v-model.number="form.fromMeas" type="number" min="1" />
          <label>{{ t("copymeas.beat") }}</label><input v-model.number="form.fromBeat" type="number" min="1" :max="beatNum()" />
          <label>{{ t("copymeas.clock") }}</label><input v-model.number="form.fromClock" type="number" min="0" :max="beatClock() - 1" />
          <span class="dash">〜</span>
          <label>{{ t("copymeas.meas") }}</label><input v-model.number="form.toMeas" type="number" min="1" />
          <label>{{ t("copymeas.beat") }}</label><input v-model.number="form.toBeat" type="number" min="1" :max="beatNum()" />
          <label>{{ t("copymeas.clock") }}</label><input v-model.number="form.toClock" type="number" min="0" :max="beatClock() - 1" />
        </div>
        <div class="row">
          <label>{{ t("eventvol.value") }}</label>
          <input v-model.number="form.value" type="number" min="-96" max="96" />
          <span class="hint">-96..96</span>
        </div>
      </div>
      <div class="dlg-buttons">
        <button class="btn btn-accent" @click="onOk">{{ t("common.ok") }}</button>
        <button class="btn" @click="emit('close')">{{ t("common.cancel") }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dlg-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.dlg {
  width: 460px;
  background: var(--popover);
  border: 1px solid var(--border-strong);
  box-shadow: 4px 4px 16px var(--shadow);
}

.dlg-title {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: bold;
  color: var(--foreground);
  background: var(--muted);
  border-bottom: 1px solid var(--border);
}

.dlg-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.range {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-wrap: wrap;
}

.range label {
  font-size: 10px;
  color: var(--muted-foreground);
  min-width: 0;
}

.range input {
  width: 48px;
}

.dash {
  color: var(--muted-foreground);
}

.row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.row label {
  font-size: 11px;
  color: var(--muted-foreground);
  min-width: 56px;
}

.row input {
  width: 70px;
}

.hint {
  font-size: 10px;
  color: var(--muted-foreground);
}

.dlg-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 0 12px 12px;
}
</style>
