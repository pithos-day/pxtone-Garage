<script setup lang="ts">
// File > 環境設定 > キー設定 のモーダルダイアログ。
// 外見の配置は Blockbench のキー設定ダイアログを参考にしている (コードは流用していない)。
// 左にカテゴリ、右に「動作 ─ キー」の行を並べ、キーをクリックすると
// 入力待ちのオーバーレイを出して次のキー入力で割り当てる。
import { computed, onMounted, ref } from "vue";
import { Plus, RotateCcw, Search } from "@lucide/vue";
import KeyBindingChip from "./KeyBindingChip.vue";
import KeyRecordOverlay from "./KeyRecordOverlay.vue";
import ModalDialog from "./ModalDialog.vue";
import {
  SHORTCUTS,
  bindingLabel,
  type ShortcutArea,
  type ShortcutCommand,
  type ShortcutEntry,
} from "../../lib/shortcuts";
import {
  bindings,
  isDefaultBinding,
  removeBinding,
  resetAllBindings,
  resetBinding,
} from "../../state/keybindings";
import { t } from "../../i18n";

const emit = defineEmits<{ (e: "close"): void }>();

const AREA_LABELS: Record<ShortcutArea, string> = {
  app: t("keys.areaApp"),
  collage: t("keys.areaCollage"),
};

const pages = (Object.keys(AREA_LABELS) as ShortcutArea[]).map((area) => ({
  area,
  label: AREA_LABELS[area],
  count: SHORTCUTS.filter((s) => s.area === area).length,
}));

const searchRef = ref<HTMLInputElement | null>(null);
const page = ref<ShortcutArea>("app");
const query = ref("");

const isSearching = computed(() => query.value.trim().length > 0);
const title = computed(() => (isSearching.value ? t("keys.searchResults") : AREA_LABELS[page.value]));

// 検索時は全カテゴリから、動作名・コマンド ID・カテゴリ名・現在のキーを空白区切りの AND で探す
const entries = computed<readonly ShortcutEntry[]>(() => {
  if (!isSearching.value) return SHORTCUTS.filter((s) => s.area === page.value);
  const words = query.value.trim().toLowerCase().split(/\s+/);
  return SHORTCUTS.filter((s) => {
    const keys = (bindings[s.command] ?? []).map((b) => bindingLabel(b)).join(" ");
    const text = `${t(`shortcut.${s.command}`)} ${s.command} ${AREA_LABELS[s.area]} ${keys}`.toLowerCase();
    return words.every((w) => text.includes(w));
  });
});

function openPage(area: ShortcutArea): void {
  page.value = area;
  query.value = "";
}

// 割り当て待ちの対象 (index="new" は追加ボタンから)
const recording = ref<{ command: ShortcutCommand; index: number | "new" } | null>(null);

function startRecording(command: ShortcutCommand, index: number | "new"): void {
  recording.value = { command, index };
}

onMounted(() => searchRef.value?.focus());
</script>

<template>
  <ModalDialog label="key-settings" width="820px" body-gap="0" body-padding="0" @close="emit('close')">
    <template #title>{{ t("keys.title") }}</template>
    <div class="keys-layout">
      <nav class="keys-sidebar">
        <div class="keys-pages">
          <button
            v-for="p in pages"
            :key="p.area"
            type="button"
            class="keys-page"
            :class="{ active: !isSearching && page === p.area }"
            @click="openPage(p.area)"
          >
            <span>{{ p.label }}</span>
            <span class="keys-page-count">{{ p.count }}</span>
          </button>
        </div>
        <button type="button" class="btn btn-sm keys-reset-all" @click="resetAllBindings">
          <RotateCcw :size="13" />
          {{ t("keys.resetAll") }}
        </button>
      </nav>
      <div class="keys-main">
        <header class="keys-header">
          <h2 class="keys-title">{{ title }}</h2>
          <label class="keys-search">
            <Search :size="14" class="keys-search-icon" aria-hidden="true" />
            <input ref="searchRef" v-model="query" type="search" :placeholder="t('keys.search')" :aria-label="t('keys.search')" />
          </label>
        </header>
        <ul :key="isSearching ? 'search' : page" class="keys-list">
          <li v-for="entry in entries" :key="entry.command" class="keys-row">
            <div class="keys-name">
              <span class="keys-action">{{ t(`shortcut.${entry.command}`) }}</span>
              <span v-if="isSearching" class="keys-area">{{ AREA_LABELS[entry.area] }}</span>
              <span class="keys-guide" aria-hidden="true" />
            </div>
            <div class="keys-slot">
              <button
                v-if="(bindings[entry.command]?.length ?? 0) === 0"
                type="button"
                class="keys-unassigned"
                @click="startRecording(entry.command, 'new')"
              >
                {{ t("keys.unassigned") }}
              </button>
              <KeyBindingChip
                v-for="(b, i) in bindings[entry.command]"
                :key="i"
                :binding="b"
                :action-label="t(`shortcut.${entry.command}`)"
                @edit="startRecording(entry.command, i)"
                @remove="removeBinding(entry.command, i)"
              />
            </div>
            <button
              type="button"
              class="keys-tool"
              :title="t('keys.add')"
              :aria-label="t('keys.add')"
              @click="startRecording(entry.command, 'new')"
            >
              <Plus :size="15" />
            </button>
            <button
              type="button"
              class="keys-tool"
              :title="t('keys.reset')"
              :aria-label="t('keys.reset')"
              :disabled="isDefaultBinding(entry.command)"
              @click="resetBinding(entry.command)"
            >
              <RotateCcw :size="14" />
            </button>
          </li>
          <li v-if="entries.length === 0" class="keys-empty">{{ t("keys.empty") }}</li>
        </ul>
        <p class="keys-hint">{{ t("keys.hint") }}</p>
      </div>
    </div>
    <KeyRecordOverlay v-if="recording" :command="recording.command" :index="recording.index" @close="recording = null" />
    <template #buttons>
      <button class="btn" @click="emit('close')">{{ t("common.close") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.keys-layout {
  display: flex;
  height: min(540px, calc(100vh - 130px));
  margin-bottom: 12px;
  border-bottom: 1px solid var(--border);
}

/* ---- カテゴリ ---- */
.keys-sidebar {
  flex: none;
  width: 170px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: var(--space-md);
  padding: var(--space-lg);
  background: var(--muted);
}

.keys-pages {
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.keys-page {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  padding: 6px 10px;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--foreground);
  font-size: var(--text-md);
  text-align: left;
  cursor: pointer;
}

.keys-page:hover {
  background: var(--control-surface);
}

.keys-page.active {
  background: var(--primary);
  color: var(--primary-foreground);
}

.keys-page-count {
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  opacity: 0.7;
}

.keys-reset-all {
  background: transparent;
  border-color: var(--control-track);
}

/* ---- 一覧 ---- */
.keys-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.keys-header {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xl);
  padding: 12px 14px 8px;
}

.keys-title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: bold;
  color: var(--foreground);
}

.keys-search {
  flex: 0 1 240px;
  position: relative;
  display: flex;
  align-items: center;
}

.keys-search-icon {
  position: absolute;
  left: 8px;
  color: var(--muted-foreground);
  pointer-events: none;
}

.keys-search input {
  width: 100%;
  height: 28px;
  padding: 0 8px 0 28px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--muted);
  color: var(--foreground);
  font-size: var(--text-sm);
}

.keys-search input:focus {
  outline: none;
  border-color: var(--primary);
}

.keys-list {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0 8px 0 14px;
  overflow-y: auto;
  scrollbar-color: var(--control-thumb) transparent;
  list-style: none;
}

.keys-row {
  display: flex;
  align-items: center;
  gap: var(--space-2xs);
  padding: 2px 0;
}

.keys-name {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding-right: var(--space-sm);
}

.keys-action {
  color: var(--foreground);
  font-size: var(--text-md);
}

.keys-area {
  flex: none;
  color: var(--muted-foreground);
  font-size: var(--text-xs);
}

/* 動作名とキーを目で結ぶガイド線 */
.keys-guide {
  flex: 1;
  min-width: 12px;
  border-bottom: 2px solid var(--muted);
}

.keys-slot {
  flex: none;
  width: 48%;
  min-height: 32px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-xs);
  padding: var(--space-xs);
  border-radius: var(--radius);
  background: var(--muted);
}

.keys-unassigned {
  flex: 1;
  height: 22px;
  padding: 0 4px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}

.keys-unassigned:hover {
  color: var(--foreground);
}

.keys-tool {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: var(--radius);
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
}

.keys-tool:hover:not(:disabled) {
  background: var(--muted);
  color: var(--foreground);
}

.keys-tool:disabled {
  opacity: 0.3;
  cursor: default;
}

.keys-empty {
  padding: 12px 0;
  color: var(--muted-foreground);
  font-size: var(--text-sm);
}

.keys-hint {
  flex: none;
  margin: 0;
  padding: 8px 14px;
  color: var(--muted-foreground);
  font-size: var(--text-xs);
}

@media (max-width: 640px) {
  .keys-layout {
    flex-direction: column;
  }

  .keys-sidebar {
    width: auto;
    flex-direction: row;
    align-items: center;
  }

  .keys-pages {
    flex-direction: row;
    min-width: 0;
  }

  .keys-reset-all {
    white-space: nowrap;
  }

  .keys-row {
    flex-wrap: wrap;
  }

  .keys-name {
    flex-basis: 100%;
  }

  .keys-slot {
    flex: 1;
    width: auto;
  }
}
</style>
