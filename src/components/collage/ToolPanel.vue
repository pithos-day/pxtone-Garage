<script setup lang="ts">
// モード切替 (W/U) + ツールボタン
import { ref } from "vue";
import { doc, units, addUnit, addWoice, WoiceType } from "../../state/project";
import { openFileDialog } from "../../engine/io";
import { t } from "../../i18n";

const errorMsg = ref("");

async function onAddWoice(): Promise<void> {
  const file = await openFileDialog(".ptvoice,.ptnoise,.wav");
  if (!file) return;
  const head = String.fromCharCode(...file.bytes.subarray(0, 8));
  let type = WoiceType.PCM;
  if (head === "PTVOICE-") type = WoiceType.PTV;
  else if (head === "PTNOISE-") type = WoiceType.PTN;
  const err = addWoice(file.bytes, type);
  if (err) {
    errorMsg.value = err;
    setTimeout(() => (errorMsg.value = ""), 4000);
  }
}
</script>

<template>
  <div class="toolpanel">
    <div class="tool-mode">
      <button class="btn btn-sm" :class="{ on: doc.mode === 'W' }" :title="t('tool.woiceManage')" @click="doc.mode = 'W'">W</button>
      <button class="btn btn-sm" :class="{ on: doc.mode === 'U' }" :title="t('tool.unitManage')" @click="doc.mode = 'U'">U</button>
    </div>
    <div class="tool-buttons">
      <template v-if="doc.mode === 'W'">
        <button class="btn btn-sm" @click="onAddWoice">{{ t("tool.addWoice") }}</button>
        <span v-if="errorMsg" class="tool-err">{{ errorMsg }}</span>
      </template>
      <template v-else>
        <button class="btn btn-sm" @click="addUnit(`unit ${units.length + 1}`)">{{ t("tool.addUnit") }}</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.toolpanel {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 6px 6px;
  border-bottom: 1px solid var(--border);
  background: var(--secondary);
  user-select: none;
}

.tool-mode {
  display: flex;
  gap: 2px;
}

.tool-mode .btn {
  flex: 1;
}

.tool-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tool-err {
  color: var(--danger-text);
  font-size: 10px;
}
</style>
