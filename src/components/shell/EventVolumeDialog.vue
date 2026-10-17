// イベント音量ダイアログ (本家の dlg_EventVolume 相当)。
// ベロシティ / パン(時間差) / パン(音量) / ボリューム / 移調 の値を範囲内で加算する。
// 移調 (キーイベント一括変更) は入力 1 = 半音 (KEY 値 0x100)
<script setup lang="ts">
import { computed, reactive } from "vue";
import { changeEventValue, clockContext } from "../../state/project";
import { measBeatClockToClock } from "../../lib/clock";
import {
  EVENT_VOLUME_KINDS,
  EVENT_VOLUME_TITLES,
  EVENT_VOLUME_VALUE_SCALE,
  type EventVolumeMode,
} from "../../lib/eventVolume";
import { useScopeRangeForm } from "../../composables/useScopeRangeForm";
import { t } from "../../i18n";
import ModalDialog from "./ModalDialog.vue";
import MeasBeatClockRange from "./MeasBeatClockRange.vue";

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

const title = computed(() => t(EVENT_VOLUME_TITLES[props.kind]));
// 移調の単位は半音 (他モードはイベント値そのもの) をヒントに出す
const hint = computed(() => (props.kind === "transpose" ? t("eventvolume.semi") : "-96..96"));

useScopeRangeForm(form);

function onSubmit(): void {
  const c1 = measBeatClockToClock(clockContext(), form.fromMeas, form.fromBeat, form.fromClock);
  const c2 = measBeatClockToClock(clockContext(), form.toMeas, form.toBeat, form.toClock);
  changeEventValue(c1, c2, EVENT_VOLUME_KINDS[props.kind], form.value * EVENT_VOLUME_VALUE_SCALE[props.kind]);
  emit("close");
}
</script>

<template>
  <ModalDialog label="event-volume" width="460px" body-gap="10px" @close="emit('close')">
    <template #title>{{ title }}</template>
    <div class="range">
      <MeasBeatClockRange
        v-model:meas="form.fromMeas"
        v-model:beat="form.fromBeat"
        v-model:clock="form.fromClock"
      />
      <span class="dash">〜</span>
      <MeasBeatClockRange
        v-model:meas="form.toMeas"
        v-model:beat="form.toBeat"
        v-model:clock="form.toClock"
      />
    </div>
    <div class="row">
      <label>{{ t("eventvolume.value") }}</label>
      <input v-model.number="form.value" type="number" min="-96" max="96" />
      <span class="hint">{{ hint }}</span>
    </div>
    <template #buttons>
      <button class="btn btn-accent" @click="onSubmit">{{ t("common.ok") }}</button>
      <button class="btn" @click="emit('close')">{{ t("common.cancel") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.dash {
  color: var(--muted-foreground);
}

.row input {
  width: 70px;
}

.hint {
  font-size: var(--text-xs);
  color: var(--muted-foreground);
}
</style>
