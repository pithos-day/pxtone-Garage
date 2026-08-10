// イベント音量ダイアログ (本家の dlg_EventVolume 相当)。
// ベロシティ / パン(時間差) / パン(音量) / ボリューム の値を範囲内で加算する。
<script setup lang="ts">
import { computed, onMounted, reactive } from "vue";
import { doc, getService, clockView as projectClockView, changeEventValue } from "../../state/project";
import { clockToMeasBeatClock, measBeatClockToClock } from "../../lib/clock";
import { EventKind } from "pxtone-ts";
import { t } from "../../i18n";
import ModalDialog from "./ModalDialog.vue";

// 対象イベント種別 (MenuBar/AppShell と共有する)
export type EventVolumeMode = "velocity" | "pantime" | "panvolume" | "volume";

const props = defineProps<{ kind: EventVolumeMode }>();
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

const TITLES: Record<EventVolumeMode, string> = {
  velocity: "menu.edit.velocity",
  pantime: "menu.edit.panTime",
  panvolume: "menu.edit.panVolume",
  volume: "menu.edit.volume",
};

const KINDS: Record<EventVolumeMode, EventKind> = {
  velocity: EventKind.VELOCITY,
  pantime: EventKind.PAN_TIME,
  panvolume: EventKind.PAN_VOLUME,
  volume: EventKind.VOLUME,
};

const title = computed(() => t(TITLES[props.kind]));

const beatClock = (): number => getService()?.master.beatClock ?? 480;
const beatNum = (): number => getService()?.master.beatNum ?? 4;
const view = (): ReturnType<typeof projectClockView> => projectClockView();

// 選択範囲 (半開区間 [scope1, scope2)) を from/to フォームに初期化
function initFromScope(): void {
  if (doc.scope2 <= doc.scope1) return;
  const [m1, b1, c1] = clockToMeasBeatClock(view(), doc.scope1);
  const [m2, b2, c2] = clockToMeasBeatClock(view(), doc.scope2 - 1);
  form.fromMeas = m1 + 1;
  form.fromBeat = b1 + 1;
  form.fromClock = c1;
  form.toMeas = m2 + 1;
  form.toBeat = b2 + 1;
  form.toClock = c2;
}

onMounted(initFromScope);

function onOk(): void {
  const c1 = measBeatClockToClock(view(), form.fromMeas, form.fromBeat, form.fromClock);
  const c2 = measBeatClockToClock(view(), form.toMeas, form.toBeat, form.toClock);
  changeEventValue(c1, c2, KINDS[props.kind], form.value);
  emit("close");
}
</script>

<template>
  <ModalDialog label="event-volume" width="460px" body-gap="10px" @close="emit('close')">
    <template #title>{{ title }}</template>
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
    <template #buttons>
      <button class="btn btn-accent" @click="onOk">{{ t("common.ok") }}</button>
      <button class="btn" @click="emit('close')">{{ t("common.cancel") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
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
</style>
