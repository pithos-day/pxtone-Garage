// 音色のプロパティダイアログ (本家 ptCollage の dlg_Woice 相当)。
// 名前 / チューニング / 基本キー / フラグ (Loop / Smooth / Beat Fit) を編集する。
// PTV は本家同様、基本キーとフラグを編集しない (非表示)
<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  WoiceType,
  PTV_VOICEFLAG_WAVELOOP,
  PTV_VOICEFLAG_SMOOTH,
  PTV_VOICEFLAG_BEATFIT,
} from "pxtone-ts";
import { getService, setWoiceProperties, woiceNameRaw, woiceTypeName } from "../../state/project";
import { woiceSummary } from "../../lib/woice";
import { t } from "../../i18n";
import ModalDialog from "../shell/ModalDialog.vue";

const props = defineProps<{ woiceIdx: number }>();
const emit = defineEmits<{ (e: "close"): void }>();

// 基本キーの範囲 (コード。本家 dlg_Woice のクランプと同じ)
const KEY_MIN = 21;
const KEY_MAX = 108;

const typeName = ref("");
const status = ref("");
const name = ref("");
const tuning = ref("1.000");
const basicKey = ref(60);
const waveLoop = ref(false);
const smooth = ref(false);
const beatFit = ref(false);
const isPtv = ref(false);

onMounted(() => {
  const w = getService()?.woiceGet(props.woiceIdx);
  const vc = w?.getVoice(0);
  if (!w || !vc) {
    emit("close");
    return;
  }
  isPtv.value = w.type === WoiceType.PTV;
  typeName.value = woiceTypeName(w.type);
  status.value = woiceSummary(w);
  name.value = woiceNameRaw(w);
  tuning.value = vc.tuning.toFixed(3);
  basicKey.value = vc.basicKey >> 8;
  waveLoop.value = (vc.voiceFlags & PTV_VOICEFLAG_WAVELOOP) !== 0;
  smooth.value = (vc.voiceFlags & PTV_VOICEFLAG_SMOOTH) !== 0;
  beatFit.value = (vc.voiceFlags & PTV_VOICEFLAG_BEATFIT) !== 0;
});

// 基本キーの ± ボタン (本家同様 ±12 半音。範囲外は何もしない)
function shiftBasicKey(delta: number): void {
  const next = basicKey.value + delta;
  if (next < KEY_MIN || next > KEY_MAX) return;
  basicKey.value = next;
}

function onSubmit(): void {
  const tune = Number(tuning.value);
  setWoiceProperties(props.woiceIdx, {
    name: name.value,
    tuning: Number.isFinite(tune) ? tune : 1,
    basicKey: basicKey.value,
    waveLoop: waveLoop.value,
    smooth: smooth.value,
    beatFit: beatFit.value,
  });
  emit("close");
}
</script>

<template>
  <ModalDialog label="woice-property" width="360px" body-gap="8px" @close="emit('close')">
    <template #title>{{ t("woiceProp.title") }}</template>
    <div class="row">
      <label>{{ t("woiceProp.type") }}</label>
      <span>{{ typeName }}</span>
    </div>
    <div class="row">
      <label>{{ t("woiceProp.status") }}</label>
      <span class="summary">{{ status }}</span>
    </div>
    <div class="row">
      <label>{{ t("woiceProp.name") }}</label>
      <input v-model="name" type="text" class="grow" maxlength="16" @keydown.enter="onSubmit" @keydown.esc="emit('close')" />
    </div>
    <div v-if="!isPtv" class="row">
      <label>{{ t("woiceProp.basicKey") }}</label>
      <input v-model.number="basicKey" type="number" :min="KEY_MIN" :max="KEY_MAX" />
      <button class="btn key-btn" @click="shiftBasicKey(-12)">-</button>
      <button class="btn key-btn" @click="shiftBasicKey(12)">+</button>
    </div>
    <div class="row">
      <label>{{ t("woiceProp.tuning") }}</label>
      <input v-model="tuning" type="number" min="0" max="256" step="0.001" />
    </div>
    <template v-if="!isPtv">
      <div class="row checks">
        <label class="check"><input v-model="waveLoop" type="checkbox" />{{ t("woiceProp.loop") }}</label>
        <label class="check"><input v-model="smooth" type="checkbox" />{{ t("woiceProp.smooth") }}</label>
        <label class="check"><input v-model="beatFit" type="checkbox" />{{ t("woiceProp.beatFit") }}</label>
      </div>
    </template>
    <template #buttons>
      <button class="btn btn-accent" @click="onSubmit">{{ t("common.ok") }}</button>
      <button class="btn" @click="emit('close')">{{ t("common.cancel") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.summary {
  font-size: var(--text-sm);
}

.key-btn {
  padding: 3px 8px;
}

.checks {
  flex-wrap: wrap;
}

.check {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
</style>
