// ユニット追加ダイアログ。
// 音色を1つ選び、名前を指定して追加する (名前のデフォルトは "u-音色名")。
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { units, woices, addUnitWithWoice } from "../../state/project";
import { t } from "../../i18n";
import ModalDialog from "../shell/ModalDialog.vue";

const emit = defineEmits<{ (e: "close"): void }>();

const woiceIdx = ref(-1);
const name = ref("");
const nameDirty = ref(false);

const hasWoice = (): boolean => woices.value.length > 0;

function defaultName(idx: number): string {
  if (idx >= 0 && idx < woices.value.length) {
    const w = woices.value[idx]!;
    return `u-${w.name}`;
  }
  return `unit ${units.value.length + 1}`;
}

onMounted(() => {
  woiceIdx.value = hasWoice() ? 0 : -1;
  name.value = defaultName(woiceIdx.value);
});

watch(woiceIdx, (idx) => {
  if (!nameDirty.value) name.value = defaultName(idx);
});

function onNameInput(): void {
  nameDirty.value = true;
}

function onSubmit(): void {
  const idx = hasWoice() ? Math.max(0, woiceIdx.value) : -1;
  addUnitWithWoice(name.value.trim() || defaultName(idx), idx);
  emit("close");
}
</script>

<template>
  <ModalDialog label="add-unit" width="360px" body-gap="8px" @close="emit('close')">
    <template #title>{{ t("unit.addTitle") }}</template>
    <div class="row">
      <label>{{ t("unit.addWoice") }}</label>
      <select v-model.number="woiceIdx" class="grow">
        <option v-if="!hasWoice()" :value="-1">{{ t("unit.addWoiceNone") }}</option>
        <option v-for="w in woices" :key="w.index" :value="w.index">{{ w.index }}. {{ w.name }}</option>
      </select>
    </div>
    <div class="row">
      <label>{{ t("unit.addName") }}</label>
      <input v-model="name" type="text" class="grow" maxlength="16" @input="onNameInput" @keydown.enter="onSubmit" @keydown.esc="emit('close')" />
    </div>
    <template #buttons>
      <button class="btn btn-accent" @click="onSubmit">{{ t("common.ok") }}</button>
      <button class="btn" @click="emit('close')">{{ t("common.cancel") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.grow {
  flex: 1;
  min-width: 0;
}
</style>
