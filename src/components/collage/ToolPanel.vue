<script setup lang="ts">
// モード切替 (W/U) + ツールボタン
import { ref } from "vue";
import { Plus, Music2, Piano, MousePointer2, Pencil, Pointer } from "@lucide/vue";
import { doc } from "../../state/project";
import { addWoiceFiles } from "../../state/open-files";
import { WOICE_FILE_ACCEPT, WOICE_FILE_EXT_RE } from "../../lib/woice";
import AddUnitDialog from "./AddUnitDialog.vue";
import { openFilesDialog } from "../../engine/io";
import { formatShortcut } from "../../state/keybindings";
import { t } from "../../i18n";

const showAddUnit = ref(false);

async function onAddWoice(): Promise<void> {
  const files = await openFilesDialog(WOICE_FILE_ACCEPT, WOICE_FILE_EXT_RE);
  if (files.length > 0) await addWoiceFiles(files);
}
</script>

<template>
  <div class="toolpanel">
    <div class="tool-mode">
      <button class="btn btn-sm mode" :class="{ on: doc.mode === 'W' }" :title="`${t('tool.woiceManage')} (${formatShortcut('modeW')})`" @click="doc.mode = 'W'"><Music2 :size="18" /></button>
      <button class="btn btn-sm mode" :class="{ on: doc.mode === 'U' }" :title="`${t('tool.unitManage')} (${formatShortcut('modeU')})`" @click="doc.mode = 'U'"><Piano :size="18" /></button>
      <span class="tool-sep" />
      <!-- ピアノロールのツールは W/U どちらのモードでも切り替えられる -->
      <button class="btn btn-sm mode" :class="{ on: doc.tool === 'smart' }" :title="`${t('tool.smart')} (${formatShortcut('toolSmart')})`" @click="doc.tool = 'smart'"><MousePointer2 :size="18" /></button>
      <button class="btn btn-sm mode" :class="{ on: doc.tool === 'pen' }" :title="`${t('tool.pen')} (${formatShortcut('toolPen')})`" @click="doc.tool = 'pen'"><Pencil :size="18" /></button>
      <button class="btn btn-sm mode" :class="{ on: doc.tool === 'hand' }" :title="`${t('tool.hand')} (${formatShortcut('toolHand')})`" @click="doc.tool = 'hand'"><Pointer :size="18" /></button>
    </div>
    <div class="tool-buttons">
      <template v-if="doc.mode === 'W'">
        <button class="btn btn-sm" :disabled="doc.readOnly" @click="onAddWoice"><Plus :size="18" /></button>
      </template>
      <template v-else>
        <button class="btn btn-sm" :disabled="doc.readOnly" @click="showAddUnit = true"><Plus :size="18" /></button>
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
  padding: 5px 7px 7px;
  border-bottom: 1px solid var(--border);
  background: var(--background);
  user-select: none;
}

.tool-mode {
  display: flex;
  align-items: stretch;
  gap: var(--space-2xs);
}

.tool-sep {
  flex: none;
  width: 1px;
  margin: 2px var(--space-sm);
  background: var(--border);
}

.tool-mode .btn {
  flex: 1;
}

.tool-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm);
}

</style>
