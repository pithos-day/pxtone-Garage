// ファイルタブバー (Blockbench の #tab_bar 相当)。
// 複数プロジェクトのタブ + 新規タブボタン。
<script setup lang="ts">
import {
  projects,
  currentProjectId,
  switchProject,
  newProjectInTab,
  closeProject,
} from "../../state/projects";

function onClose(id: number): void {
  const p = projects.value.find((x) => x.id === id);
  if (p?.dirty && !window.confirm("未保存の変更は破棄されます。閉じますか?")) return;
  closeProject(id);
}
</script>

<template>
  <div class="file-tabs">
    <button
      v-for="p in projects"
      :key="p.id"
      class="file-tab"
      :class="{ active: p.id === currentProjectId }"
      :title="p.fileName || '無題'"
      @click="switchProject(p.id)"
    >
      <span v-if="p.dirty" class="dirty-dot" />
      <span class="tab-name">{{ p.fileName || "無題" }}</span>
      <span
        v-if="projects.length > 1"
        class="tab-close"
        @click.stop="onClose(p.id)"
      >×</span>
    </button>
    <button class="tab-new" title="新規プロジェクト" @click="newProjectInTab()">＋</button>
  </div>
</template>

<style scoped>
.file-tabs {
  display: flex;
  align-items: stretch;
  height: 32px;
  background: var(--muted);
  border-bottom: 1px solid var(--border);
  user-select: none;
  z-index: 20;
}

.file-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: none;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--muted-foreground);
  font-size: 12px;
  cursor: pointer;
  max-width: 200px;
}

.file-tab:hover {
  background: var(--secondary);
}

.file-tab.active {
  background: var(--card);
  color: var(--foreground);
  box-shadow: inset 0 2px 0 var(--primary);
}

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dirty-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  flex: none;
}

.tab-close {
  color: var(--muted-foreground);
  font-size: 13px;
  padding: 0 3px;
  border-radius: 2px;
  flex: none;
}

.tab-close:hover {
  background: var(--destructive);
  color: var(--destructive-foreground);
}

.tab-new {
  padding: 0 12px;
  border: none;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--muted-foreground);
  font-size: 14px;
  cursor: pointer;
}

.tab-new:hover {
  background: var(--secondary);
  color: var(--foreground);
}
</style>
