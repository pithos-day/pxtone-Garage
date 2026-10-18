<script setup lang="ts">
// モード切替 (W/U) + ツールボタン
import { ref } from "vue";
import { Plus, Music2, Piano } from "@lucide/vue";
import { doc, addWoice, detectWoiceType } from "../../state/project";
import { WOICE_FILE_ACCEPT, WOICE_FILE_EXT_RE } from "../../lib/woice";
import AddUnitDialog from "./AddUnitDialog.vue";
import { openFileDialog, readBlobAndApply } from "../../engine/io";
import { formatShortcut } from "../../lib/shortcuts";
import { t } from "../../i18n";

const errorMsg = ref("");
const showAddUnit = ref(false);

async function onAddWoice(): Promise<void> {
  const opened = await openFileDialog(WOICE_FILE_ACCEPT, WOICE_FILE_EXT_RE);
  if (!opened) return;
  // 読み込み (実進捗) → 適用 (解析・追加)。キャンセル時は null
  const err = await readBlobAndApply(t("progress.woiceTitle"), opened.file, (bytes) =>
    addWoice(bytes, detectWoiceType(bytes), opened.name),
  );
  if (err) {
    errorMsg.value = err;
    setTimeout(() => (errorMsg.value = ""), 4000);
  }
}
</script>

<template>
  <div class="toolpanel">
    <div class="tool-mode">
      <button class="btn btn-sm mode" :class="{ on: doc.mode === 'W' }" :title="`${t('tool.woiceManage')} (${formatShortcut('modeW')})`" @click="doc.mode = 'W'"><Music2 :size="16" /></button>
      <button class="btn btn-sm mode" :class="{ on: doc.mode === 'U' }" :title="`${t('tool.unitManage')} (${formatShortcut('modeU')})`" @click="doc.mode = 'U'"><Piano :size="16" /></button>
    </div>
    <div class="tool-buttons">
      <template v-if="doc.mode === 'W'">
        <button class="btn btn-sm" :disabled="doc.readOnly" @click="onAddWoice"><Plus :size="16" /></button>
        <span v-if="errorMsg" class="tool-err">{{ errorMsg }}</span>
      </template>
      <template v-else>
        <button class="btn btn-sm" :disabled="doc.readOnly" @click="showAddUnit = true"><Plus :size="16" /></button>
      </template>
    </div>
    <AddUnitDialog v-if="showAddUnit" @close="showAddUnit = false" />
  </div>
</template>

<style scoped>
.toolpanel {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  padding: 4px 6px 6px;
  border-bottom: 1px solid var(--border);
  background: var(--background);
  user-select: none;
}

.tool-mode {
  display: flex;
  gap: var(--space-2xs);
}

.tool-mode .btn {
  flex: 1;
}

.tool-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

.tool-err {
  color: var(--destructive);
  font-size: var(--text-xs);
}
</style>
