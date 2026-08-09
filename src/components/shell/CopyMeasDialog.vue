// 小節コピーダイアログ (本家の dlg_CopyMeas 相当)。
// コピー元範囲・コピー先・回数・イベント種類を指定してコピーする。
<script setup lang="ts">
import { onMounted, reactive } from "vue";
import { doc, getService, clockView as projectClockView, copyMeas } from "../../state/project";
import { clockToMeasBeatClock } from "../../lib/clock";
import { EventKind } from "pxtone-ts";
import { t } from "../../i18n";

const emit = defineEmits<{ (e: "close"): void }>();

const form = reactive({
  fromMeas: 1,
  fromBeat: 1,
  fromClock: 0,
  toMeas: 1,
  toBeat: 1,
  toClock: 0,
  destMeas: 1,
  destBeat: 1,
  destClock: 0,
  times: 1,
});

// 種類チェック (ON は VELOCITY と連結)
const kinds = reactive({
  on: true,
  key: true,
  panTime: false,
  panVolume: true,
  volume: true,
  portament: true,
  voiceNo: true,
  groupNo: true,
  tuning: true,
});

const beatClock = (): number => getService()?.master.beatClock ?? 480;
const beatNum = (): number => getService()?.master.beatNum ?? 4;

// 小節:拍:クロック → クロック
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
    form.destMeas = m2 + 1;
    form.destBeat = b2 + 1;
    form.destClock = c2;
  }
});

function enabledKinds(): number[] {
  const out: number[] = [];
  if (kinds.on) out.push(EventKind.ON, EventKind.VELOCITY);
  if (kinds.key) out.push(EventKind.KEY);
  if (kinds.panTime) out.push(EventKind.PAN_TIME);
  if (kinds.panVolume) out.push(EventKind.PAN_VOLUME);
  if (kinds.volume) out.push(EventKind.VOLUME);
  if (kinds.portament) out.push(EventKind.PORTAMENT);
  if (kinds.voiceNo) out.push(EventKind.VOICENO);
  if (kinds.groupNo) out.push(EventKind.GROUPNO);
  if (kinds.tuning) out.push(EventKind.TUNING);
  return out;
}

function onOk(): void {
  const c1 = toClock(form.fromMeas, form.fromBeat, form.fromClock);
  const c2 = toClock(form.toMeas, form.toBeat, form.toClock);
  const dest = toClock(form.destMeas, form.destBeat, form.destClock);
  const times = Math.max(1, form.times);
  copyMeas(c1, c2, dest, times, enabledKinds());
  emit("close");
}

function onOverlayClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).classList.contains("dlg-overlay")) emit("close");
}
</script>

<template>
  <div class="dlg-overlay" @click="onOverlayClick">
    <div class="dlg" role="dialog" aria-label="copy-meas">
      <div class="dlg-title">{{ t("copymeas.title") }}</div>
      <div class="dlg-body">
        <div class="section">
          <div class="section-title">{{ t("copymeas.from") }}</div>
          <div class="range">
            <label>{{ t("copymeas.meas") }}</label><input v-model.number="form.fromMeas" type="number" min="1" />
            <label>{{ t("copymeas.beat") }}</label><input v-model.number="form.fromBeat" type="number" min="1" :max="beatNum()" />
            <label>{{ t("copymeas.clock") }}</label><input v-model.number="form.fromClock" type="number" min="0" :max="beatClock() - 1" />
          </div>
        </div>
        <div class="section">
          <div class="section-title">{{ t("copymeas.to") }}</div>
          <div class="range">
            <label>{{ t("copymeas.meas") }}</label><input v-model.number="form.toMeas" type="number" min="1" />
            <label>{{ t("copymeas.beat") }}</label><input v-model.number="form.toBeat" type="number" min="1" :max="beatNum()" />
            <label>{{ t("copymeas.clock") }}</label><input v-model.number="form.toClock" type="number" min="0" :max="beatClock() - 1" />
          </div>
        </div>
        <div class="section">
          <div class="section-title">{{ t("copymeas.dest") }}</div>
          <div class="range">
            <label>{{ t("copymeas.meas") }}</label><input v-model.number="form.destMeas" type="number" min="1" />
            <label>{{ t("copymeas.beat") }}</label><input v-model.number="form.destBeat" type="number" min="1" :max="beatNum()" />
            <label>{{ t("copymeas.clock") }}</label><input v-model.number="form.destClock" type="number" min="0" :max="beatClock() - 1" />
            <label>{{ t("copymeas.times") }}</label><input v-model.number="form.times" type="number" min="1" />
          </div>
        </div>
        <div class="section">
          <div class="section-title">{{ t("copymeas.kinds") }}</div>
          <div class="kinds">
            <label><input type="checkbox" v-model="kinds.on" /> ON</label>
            <label><input type="checkbox" v-model="kinds.key" /> KEY</label>
            <label><input type="checkbox" v-model="kinds.panTime" /> PAN_TIME</label>
            <label><input type="checkbox" v-model="kinds.panVolume" /> PAN_VOLUME</label>
            <label><input type="checkbox" v-model="kinds.volume" /> VOLUME</label>
            <label><input type="checkbox" v-model="kinds.portament" /> PORTAMENT</label>
            <label><input type="checkbox" v-model="kinds.voiceNo" /> VOICENO</label>
            <label><input type="checkbox" v-model="kinds.groupNo" /> GROUPNO</label>
            <label><input type="checkbox" v-model="kinds.tuning" /> TUNING</label>
          </div>
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
  width: 420px;
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
  gap: 8px;
  padding: 12px;
}

.section {
  border: 1px solid var(--border);
  padding: 6px;
}

.section-title {
  font-size: 10px;
  color: var(--muted-foreground);
  margin-bottom: 4px;
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

.kinds {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}

.kinds label {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--foreground);
  cursor: pointer;
}

.dlg-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 0 12px 12px;
}
</style>
