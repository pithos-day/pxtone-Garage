// ユニット追加ダイアログ。
// 音色を1つ選び、名前を指定して追加する (名前のデフォルトは "u-音色名")。
<script setup lang="ts">
import { units, woices, addUnitWithWoice } from "../../state/project";
import { useWoiceNameForm } from "../../composables/useWoiceNameForm";
import { t } from "../../i18n";
import ModalDialog from "../shell/ModalDialog.vue";

const emit = defineEmits<{ (e: "close"): void }>();

const hasWoice = (): boolean => woices.value.length > 0;

function defaultName(idx: number): string {
  if (idx >= 0 && idx < woices.value.length) {
    const w = woices.value[idx]!;
    return `u-${w.name}`;
  }
  return `unit ${units.value.length + 1}`;
}

const { woiceIdx, name, onNameInput, onSubmit } = useWoiceNameForm({
  initWoice: () => (hasWoice() ? 0 : -1),
  initName: defaultName,
  autoName: true,
  submit: (idx, n) => {
    addUnitWithWoice(n || defaultName(idx), hasWoice() ? Math.max(0, idx) : -1);
    emit("close");
  },
});
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

