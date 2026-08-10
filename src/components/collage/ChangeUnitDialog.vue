// ユニット設定ダイアログ。
// 対象ユニットの名前と音色をまとめて変更する (AddUnitDialog と同様の構成)。
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { units, woices, setUnitNameAndWoice } from "../../state/project";
import { t } from "../../i18n";
import ModalDialog from "../shell/ModalDialog.vue";

const props = defineProps<{ unitIdx: number }>();
const emit = defineEmits<{ (e: "close"): void }>();

const woiceIdx = ref(-1);
const name = ref("");

onMounted(() => {
  const u = units.value[props.unitIdx];
  if (u) {
    // 音色なしのユニットは先頭の音色を初期選択にする
    woiceIdx.value = u.woiceIndex >= 0 ? u.woiceIndex : 0;
    name.value = u.name;
  }
});

function onSubmit(): void {
  setUnitNameAndWoice(props.unitIdx, name.value, woiceIdx.value);
  emit("close");
}
</script>

<template>
  <ModalDialog label="change-unit" width="360px" body-gap="8px" @close="emit('close')">
    <template #title>{{ t("unit.changeTitle") }}</template>
    <div class="row">
      <label>{{ t("unit.addWoice") }}</label>
      <select v-model.number="woiceIdx" class="grow">
        <option v-for="w in woices" :key="w.index" :value="w.index">{{ w.index }}. {{ w.name }}</option>
      </select>
    </div>
    <div class="row">
      <label>{{ t("unit.addName") }}</label>
      <input v-model="name" type="text" class="grow" maxlength="16" @keydown.enter="onSubmit" @keydown.esc="emit('close')" />
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
