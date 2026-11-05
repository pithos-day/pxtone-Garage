// クオンタイズのダイアログ。対象は選択中のノート > 選択範囲 > フォーカス / 選択ユニットの全ノート
<script setup lang="ts">
import { computed, ref } from "vue";
import { DIVI_TABLE } from "../../lib/clock";
import { doc, hasNoteSelection, quantize } from "../../state/project";
import { t } from "../../i18n";
import ModalDialog from "./ModalDialog.vue";
import { clamp } from "../../lib/clamp";

const emit = defineEmits<{ (e: "close"): void }>();

const divi = ref<number>(doc.divi);
const strength = ref(100);
const quantizeEnd = ref(false);

const target = computed(() => {
  if (hasNoteSelection()) return t("quantize.targetNotes");
  return doc.scope2 > doc.scope1 ? t("quantize.targetScope") : t("quantize.targetAll");
});

function onSubmit(): void {
  const percent = Number.isFinite(strength.value) ? clamp(strength.value, 0, 100) : 100;
  quantize(divi.value, percent / 100, quantizeEnd.value);
  emit("close");
}
</script>

<template>
  <ModalDialog label="quantize" width="360px" body-gap="8px" @close="emit('close')">
    <template #title>{{ t("quantize.title") }}</template>
    <div class="row dim">
      <label>{{ t("quantize.target") }}</label>
      <span>{{ target }}</span>
    </div>
    <div class="row">
      <label>{{ t("quantize.grid") }}</label>
      <select v-model.number="divi">
        <option v-for="d in DIVI_TABLE" :key="d" :value="d">{{ d === 1 ? "1" : `1/${d}` }}</option>
      </select>
    </div>
    <div class="row">
      <label>{{ t("quantize.strength") }}</label>
      <input v-model.number="strength" type="number" min="0" max="100" />
      <span class="unit">%</span>
    </div>
    <div class="row">
      <label>{{ t("quantize.end") }}</label>
      <input v-model="quantizeEnd" type="checkbox" />
    </div>
    <template #buttons>
      <button class="btn btn-accent" @click="onSubmit">{{ t("common.ok") }}</button>
      <button class="btn" @click="emit('close')">{{ t("common.cancel") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.dim {
  font-size: var(--text-sm);
}

.dim span {
  color: var(--muted-foreground);
}
</style>
