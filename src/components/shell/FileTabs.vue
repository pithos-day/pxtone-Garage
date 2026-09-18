// ファイルタブバー。モード (collage/voice/noise) に応じて対応するコレクションを表示する。
// collage = ptcop プロジェクト、voice = .ptvoice、noise = .ptnoise。
<script setup lang="ts">
import { X, Plus, Eye } from "@lucide/vue";
import type { AppMode } from "../../lib/modes";
import { computed } from "vue";
import {
  projects,
  currentProjectId,
  switchProject,
  newProjectInTab,
  closeProject,
} from "../../state/projects";
import {
  voices,
  currentVoiceId,
  switchVoice,
  newVoice,
  closeVoice,
} from "../../state/voice";
import {
  noises,
  currentNoiseId,
  switchNoise,
  newNoise,
  closeNoise,
} from "../../state/noise";
import { t } from "../../i18n";

const props = defineProps<{ mode: AppMode }>();

// モード別のタブ一覧 (id / title / dirty / active / select / close)
const tabs = computed(() => {
  if (props.mode === "voice") {
    return voices.value.map((v) => ({
      id: v.id,
      title: v.fileName || t("common.untitled"),
      dirty: v.dirty,
      readonly: false,
      active: v.id === currentVoiceId.value,
      select: () => switchVoice(v.id),
      close: () => closeVoice(v.id),
    }));
  }
  if (props.mode === "noise") {
    return noises.value.map((n) => ({
      id: n.id,
      title: n.fileName || t("common.untitled"),
      dirty: n.dirty,
      readonly: false,
      active: n.id === currentNoiseId.value,
      select: () => switchNoise(n.id),
      close: () => closeNoise(n.id),
    }));
  }
  return projects.value.map((p) => ({
    id: p.id,
    title: p.fileName || t("common.untitled"),
    dirty: p.dirty,
    // pttune 再生専用タブは eye アイコンを表示する
    readonly: p.kind === "tune",
    active: p.id === currentProjectId.value,
    select: () => switchProject(p.id),
    close: () => closeProject(p.id),
  }));
});

// モード別の新規作成
function onNew(): void {
  if (props.mode === "voice") newVoice();
  else if (props.mode === "noise") newNoise();
  else newProjectInTab();
}

// 閉じる前の未保存確認は各 close 側 (projects/voice/noise の closeProject 等) では
// 行わないため、ここで dirty 確認してから呼ぶ
function onClose(id: number): void {
  const entry = tabs.value.find((x) => x.id === id);
  if (!entry) return;
  if (entry.dirty && !window.confirm(t("confirm.close"))) return;
  entry.close();
}
</script>

<template>
  <div class="file-tabs">
    <button
      v-for="p in tabs"
      :key="p.id"
      class="file-tab"
      :class="{ active: p.active }"
      :title="p.title"
      @click="p.select"
    >
      <Eye v-if="p.readonly" :size="12" class="tab-ro-icon" />
      <span v-if="p.dirty" class="dirty-dot" />
      <span class="tab-name">{{ p.title }}</span>
      <span
        v-if="tabs.length > 1"
        class="tab-close"
        @click.stop="onClose(p.id)"
      ><X :size="12" /></span>
    </button>
    <button class="tab-new" :title="t('common.newProject')" @click="onNew"><Plus :size="14" /></button>
  </div>
</template>

<style scoped>
.file-tabs {
  display: flex;
  align-items: stretch;
  height: 32px;
  background: var(--background);
  border-bottom: 1px solid var(--border);
  user-select: none;
  z-index: 20;
}

.file-tab {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 0 10px;
  border: none;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--muted-foreground);
  font-size: var(--text-md);
  cursor: pointer;
  max-width: 200px;
}

.file-tab:hover {
  background: var(--card);
  color: var(--card-foreground);
}

.file-tab.active {
  background: var(--background);
  color: var(--foreground);
  box-shadow: inset 0 2px 0 var(--primary);
}

.tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tab-ro-icon {
  flex: none;
  color: var(--muted-foreground);
}

.dirty-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--primary);
  flex: none;
}

.tab-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--muted-foreground);
  padding: 0 3px;
  border-radius: 2px;
  flex: none;
}

.tab-close:hover {
  background: var(--destructive);
  color: var(--destructive-foreground);
}

.tab-new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 12px;
  border: none;
  border-right: 1px solid var(--border);
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
}

.tab-new:hover {
  background: var(--card);
  color: var(--card-foreground);
}
</style>
