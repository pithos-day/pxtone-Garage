// ユニット追加ダイアログ。
// 音色を1つ選び、名前を指定して追加する (名前のデフォルトは "u-音色名")。
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { units, woices, addUnitWithWoice } from "../../state/project";
import { t } from "../../i18n";

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

function onOk(): void {
  const idx = hasWoice() ? Math.max(0, woiceIdx.value) : -1;
  addUnitWithWoice(name.value.trim() || defaultName(idx), idx);
  emit("close");
}

function onOverlayClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).classList.contains("dlg-overlay")) emit("close");
}
</script>

<template>
  <div class="dlg-overlay" @click="onOverlayClick">
    <div class="dlg" role="dialog" aria-label="add-unit">
      <div class="dlg-title">{{ t("unit.addTitle") }}</div>
      <div class="dlg-body">
        <div class="row">
          <label>{{ t("unit.addWoice") }}</label>
          <select v-model.number="woiceIdx" class="grow">
            <option v-if="!hasWoice()" :value="-1">{{ t("unit.addWoiceNone") }}</option>
            <option v-for="w in woices" :key="w.index" :value="w.index">{{ w.index }}. {{ w.name }}</option>
          </select>
        </div>
        <div class="row">
          <label>{{ t("unit.addName") }}</label>
          <input v-model="name" type="text" class="grow" maxlength="16" @input="onNameInput" @keydown.enter="onOk" @keydown.esc="emit('close')" />
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
  background: rgb(0 0 0 / 55%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.dlg {
  width: 360px;
  background: var(--popover);
  border: 1px solid var(--border);
  box-shadow: 4px 4px 16px rgb(0 0 0 / 0.35);
}

.dlg-title {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: bold;
  color: var(--foreground);
  background: var(--background);
  border-bottom: 1px solid var(--border);
}

.dlg-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

.grow {
  flex: 1;
  min-width: 0;
}

.dlg-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 0 12px 12px;
}
</style>
