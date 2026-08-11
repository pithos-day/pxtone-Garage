// 小節コピーダイアログ (本家の dlg_CopyMeas 相当)。
// コピー元範囲・コピー先・回数・イベント種類を指定してコピーする。
<script setup lang="ts">
import { reactive } from "vue";
import { copyMeas, clockContext } from "../../state/project";
import { measBeatClockToClock } from "../../lib/clock";
import { EventKind } from "pxtone-ts";
import { t } from "../../i18n";
import { useScopeRangeForm } from "../../composables/useScopeRangeForm";
import ModalDialog from "./ModalDialog.vue";
import MeasBeatClockRange from "./MeasBeatClockRange.vue";

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

// 種類チェックの定義 (ON は VELOCITY と連結)。
// チェックボックス表示と copyMeas への渡し分けを1つのテーブルで管理する
const KIND_CHECKS = [
  { key: "onKind", label: "ON", defaultOn: true, eventKinds: [EventKind.ON, EventKind.VELOCITY] },
  { key: "key", label: "KEY", defaultOn: true, eventKinds: [EventKind.KEY] },
  { key: "panTime", label: "PAN_TIME", defaultOn: false, eventKinds: [EventKind.PAN_TIME] },
  { key: "panVolume", label: "PAN_VOLUME", defaultOn: true, eventKinds: [EventKind.PAN_VOLUME] },
  { key: "volume", label: "VOLUME", defaultOn: true, eventKinds: [EventKind.VOLUME] },
  { key: "portament", label: "PORTAMENT", defaultOn: true, eventKinds: [EventKind.PORTAMENT] },
  { key: "voiceNo", label: "VOICENO", defaultOn: true, eventKinds: [EventKind.VOICENO] },
  { key: "groupNo", label: "GROUPNO", defaultOn: true, eventKinds: [EventKind.GROUPNO] },
  { key: "tuning", label: "TUNING", defaultOn: true, eventKinds: [EventKind.TUNING] },
] as const;

const kinds = reactive<Record<string, boolean>>({});
for (const k of KIND_CHECKS) kinds[k.key] = k.defaultOn;

// 選択範囲から from/to を初期化。コピー先 dest は選択範囲の終端に初期化
// (本家同様、末尾への追記を想定)
useScopeRangeForm(form, (m, b, c) => {
  form.destMeas = m;
  form.destBeat = b;
  form.destClock = c;
});

function enabledKinds(): number[] {
  return KIND_CHECKS.flatMap((k) => (kinds[k.key] ? [...k.eventKinds] : []));
}

function onSubmit(): void {
  const c1 = measBeatClockToClock(clockContext(), form.fromMeas, form.fromBeat, form.fromClock);
  const c2 = measBeatClockToClock(clockContext(), form.toMeas, form.toBeat, form.toClock);
  const dest = measBeatClockToClock(clockContext(), form.destMeas, form.destBeat, form.destClock);
  const times = Math.max(1, form.times);
  copyMeas(c1, c2, dest, times, enabledKinds());
  emit("close");
}
</script>

<template>
  <ModalDialog label="copy-meas" width="420px" body-gap="8px" @close="emit('close')">
    <template #title>{{ t("copymeas.title") }}</template>
    <div class="section">
      <div class="section-title">{{ t("copymeas.from") }}</div>
      <div class="range">
        <MeasBeatClockRange
          v-model:meas="form.fromMeas"
          v-model:beat="form.fromBeat"
          v-model:clock="form.fromClock"
        />
      </div>
    </div>
    <div class="section">
      <div class="section-title">{{ t("copymeas.to") }}</div>
      <div class="range">
        <MeasBeatClockRange
          v-model:meas="form.toMeas"
          v-model:beat="form.toBeat"
          v-model:clock="form.toClock"
        />
      </div>
    </div>
    <div class="section">
      <div class="section-title">{{ t("copymeas.dest") }}</div>
      <div class="range">
        <MeasBeatClockRange
          v-model:meas="form.destMeas"
          v-model:beat="form.destBeat"
          v-model:clock="form.destClock"
        />
        <label>{{ t("copymeas.times") }}</label><input v-model.number="form.times" type="number" min="1" />
      </div>
    </div>
    <div class="section">
      <div class="section-title">{{ t("copymeas.kinds") }}</div>
      <div class="kinds">
        <label v-for="k in KIND_CHECKS" :key="k.key">
          <input type="checkbox" v-model="kinds[k.key]" /> {{ k.label }}
        </label>
      </div>
    </div>
    <template #buttons>
      <button class="btn btn-accent" @click="onSubmit">{{ t("common.ok") }}</button>
      <button class="btn" @click="emit('close')">{{ t("common.cancel") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
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
</style>
