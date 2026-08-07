<script setup lang="ts">
// モード切替 (W/U) + ツールボタン
import { ref } from "vue";
import { doc, units, addUnit, addWoice, WoiceType } from "../../state/project";
import { openFileDialog } from "../../engine/io";

const errorMsg = ref("");

async function onAddWoice(): Promise<void> {
  const bytes = await openFileDialog(".ptvoice,.ptnoise,.wav");
  if (!bytes) return;
  const head = String.fromCharCode(...bytes.subarray(0, 8));
  let type = WoiceType.PCM;
  if (head === "PTVOICE-") type = WoiceType.PTV;
  else if (head === "PTNOISE-") type = WoiceType.PTN;
  const err = addWoice(bytes, type);
  if (err) {
    errorMsg.value = err;
    setTimeout(() => (errorMsg.value = ""), 4000);
  }
}

// フォーカスユニット以外をミュート
function onSolo(): void {
  const focus = doc.focusUnit >= 0 ? doc.focusUnit : 0;
  if (doc.muted.includes(focus)) {
    doc.muted = doc.muted.filter((u) => u !== focus);
  }
  for (const u of units.value) {
    if (u.index !== focus && !doc.muted.includes(u.index)) doc.muted.push(u.index);
  }
}

function onAllSelect(): void {
  doc.operated = units.value.map((u) => u.index);
}
</script>

<template>
  <div class="toolpanel">
    <div class="tool-mode">
      <button class="btn btn-sm" :class="{ on: doc.mode === 'W' }" title="音色管理 (F1)" @click="doc.mode = 'W'">W</button>
      <button class="btn btn-sm" :class="{ on: doc.mode === 'U' }" title="ユニット (F2)" @click="doc.mode = 'U'">U</button>
    </div>
    <div class="tool-buttons">
      <template v-if="doc.mode === 'W'">
        <button class="btn btn-sm" @click="onAddWoice">＋音色</button>
        <span v-if="errorMsg" class="tool-err">{{ errorMsg }}</span>
      </template>
      <template v-else>
        <button class="btn btn-sm" @click="addUnit(`unit ${units.length + 1}`)">＋ユニット</button>
        <button class="btn btn-sm" @click="onSolo">ソロ</button>
        <button class="btn btn-sm" @click="onAllSelect">全選択</button>
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
  background: var(--panel-light);
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
  color: var(--danger-text, #ff8888);
  font-size: 10px;
}
</style>
