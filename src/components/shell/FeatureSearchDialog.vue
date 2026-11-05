// Help > 機能を検索。現在のモードのメニュー項目とショートカットを検索し、メニュー項目はその場で実行する
<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue";
import { searchFeatures, type FeatureEntry } from "../../lib/menuItems";
import { formatShortcut } from "../../state/keybindings";
import { t } from "../../i18n";
import ModalDialog from "./ModalDialog.vue";

const props = defineProps<{ entries: FeatureEntry[] }>();
const emit = defineEmits<{ (e: "close"): void }>();

const query = ref("");
const activeIndex = ref(0);
const inputEl = ref<HTMLInputElement | null>(null);
const listEl = ref<HTMLElement | null>(null);

const results = computed(() => searchFeatures(props.entries, query.value));

onMounted(() => inputEl.value?.focus());

watch(query, () => {
  activeIndex.value = 0;
});

function moveActive(delta: number): void {
  const count = results.value.length;
  if (count === 0) return;
  activeIndex.value = (activeIndex.value + delta + count) % count;
  void nextTick(() => {
    listEl.value?.querySelector(".feature-row.active")?.scrollIntoView({ block: "nearest" });
  });
}

function run(entry: FeatureEntry | undefined): void {
  if (!entry?.action) return;
  emit("close");
  entry.action();
}
</script>

<template>
  <ModalDialog label="feature search" width="520px" @close="emit('close')">
    <template #title>{{ t("search.title") }}</template>
    <input
      ref="inputEl"
      v-model="query"
      type="search"
      class="feature-input"
      :placeholder="t('search.placeholder')"
      @keydown.down.prevent="moveActive(1)"
      @keydown.up.prevent="moveActive(-1)"
      @keydown.enter.prevent="run(results[activeIndex])"
      @keydown.esc.prevent="emit('close')"
    />
    <div ref="listEl" class="feature-list" role="listbox">
      <button
        v-for="(entry, i) in results"
        :key="i"
        class="feature-row"
        :class="{ active: i === activeIndex }"
        :disabled="!entry.action"
        role="option"
        :aria-selected="i === activeIndex"
        @mouseenter="activeIndex = i"
        @click="run(entry)"
      >
        <span class="feature-path">{{ entry.path }}</span>
        <span v-if="entry.command" class="feature-key">{{ formatShortcut(entry.command) }}</span>
      </button>
      <div v-if="results.length === 0" class="feature-empty">{{ t("search.empty") }}</div>
    </div>
    <template #buttons>
      <button class="btn" @click="emit('close')">{{ t("common.close") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.feature-input {
  width: 100%;
  box-sizing: border-box;
}

.feature-list {
  display: flex;
  flex-direction: column;
  height: min(360px, 50vh);
  overflow-y: auto;
  border: 1px solid var(--border);
}

.feature-row {
  display: flex;
  flex: none;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 8px;
  border: none;
  background: transparent;
  color: var(--foreground);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
}

.feature-row.active {
  background: var(--accent);
  color: var(--accent-foreground);
}

.feature-row:disabled {
  color: var(--muted-foreground);
  cursor: default;
}

.feature-key {
  flex: none;
  color: var(--muted-foreground);
}

.feature-empty {
  padding: 12px;
  color: var(--muted-foreground);
  font-size: var(--text-sm);
  text-align: center;
}
</style>
