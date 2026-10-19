<script setup lang="ts">
// Tools > 環境設定 > キー設定 のモーダルダイアログ。
// 外見の配置は Blockbench のキー設定ダイアログを参考にしている (コードは流用していない)。
// 左に動作、右にキーのピルを並べ、ピルをクリックして次のキー入力で割り当てる。
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RotateCcw, X } from "@lucide/vue";
import ModalDialog from "./ModalDialog.vue";
import {
  SHORTCUTS,
  bindingEquals,
  bindingFromEvent,
  bindingLabel,
  shortcutEntry,
  type KeyBinding,
  type ShortcutCommand,
  type ShortcutEntry,
} from "../../lib/shortcuts";
import {
  addBinding,
  bindings,
  conflictFor,
  isDefaultBinding,
  removeBinding,
  resetAllBindings,
  resetBinding,
  setBinding,
} from "../../state/keybindings";
import { t } from "../../i18n";

const emit = defineEmits<{ (e: "close"): void }>();

const query = ref("");
const message = ref("");
// 割り当て待ちの対象 (index="new" は追加ボタンから)
const recording = ref<{ command: ShortcutCommand; index: number | "new" } | null>(null);

const AREA_LABELS: Record<ShortcutEntry["area"], string> = {
  app: t("keys.areaApp"),
  collage: t("keys.areaCollage"),
};

const groups = computed(() => {
  const q = query.value.trim().toLowerCase();
  const out: { area: ShortcutEntry["area"]; label: string; items: ShortcutEntry[] }[] = [];
  for (const entry of SHORTCUTS) {
    const label = AREA_LABELS[entry.area];
    if (q && !`${entry.action} ${entry.command} ${label}`.toLowerCase().includes(q)) continue;
    let group = out.find((g) => g.area === entry.area);
    if (!group) {
      group = { area: entry.area, label, items: [] };
      out.push(group);
    }
    group.items.push(entry);
  }
  return out;
});

function isRecording(command: ShortcutCommand, index: number | "new"): boolean {
  return recording.value?.command === command && recording.value.index === index;
}

function startRecording(command: ShortcutCommand, index: number | "new"): void {
  recording.value = { command, index };
  message.value = "";
}

// 同じコマンド内で既に使われている割り当てか (編集対象の自分自身は除く)
function isDuplicate(command: ShortcutCommand, target: number | "new", binding: KeyBinding): boolean {
  return (bindings[command] ?? []).some((b, i) => (target === "new" || i !== target) && bindingEquals(b, binding));
}

function onRecordKey(e: KeyboardEvent): void {
  const rec = recording.value;
  if (!rec) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  if (e.key === "Escape") {
    recording.value = null;
    return;
  }
  const binding = bindingFromEvent(e);
  if (!binding) return; // 修飾キー単独などは無視
  if (isDuplicate(rec.command, rec.index, binding)) {
    message.value = t("keys.duplicate");
    return;
  }
  const conflict = conflictFor(rec.command, binding);
  if (conflict) {
    message.value = `${t("keys.conflict")}: ${shortcutEntry(conflict).action}`;
    return;
  }
  if (rec.index === "new") addBinding(rec.command, binding);
  else setBinding(rec.command, rec.index, binding);
  recording.value = null;
  message.value = "";
}

function onResetAll(): void {
  resetAllBindings();
  recording.value = null;
  message.value = "";
}

// 記録中はどの要素にフォーカスがあってもキーを拾う (capture)
onMounted(() => window.addEventListener("keydown", onRecordKey, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onRecordKey, true));
</script>

<template>
  <ModalDialog label="key-settings" width="680px" body-gap="10px" @close="emit('close')">
    <template #title>{{ t("keys.title") }}</template>
    <div class="keys-toolbar">
      <input v-model="query" type="search" class="keys-search" :placeholder="t('keys.search')" />
      <button class="btn btn-sm" @click="onResetAll">{{ t("keys.resetAll") }}</button>
    </div>
    <p v-if="message" class="keys-message">{{ message }}</p>
    <div class="keys-list">
      <div v-for="group in groups" :key="group.area" class="keys-group">
        <div class="keys-group-title">{{ group.label }}</div>
        <div v-for="entry in group.items" :key="entry.command" class="keys-row">
          <div class="keys-action">{{ entry.action }}</div>
          <div class="keys-bindings">
            <template v-for="(b, i) in bindings[entry.command]" :key="i">
              <button
                class="key-pill"
                :class="{ recording: isRecording(entry.command, i) }"
                @click="startRecording(entry.command, i)"
              >
                {{ isRecording(entry.command, i) ? t("keys.press") : bindingLabel(b) }}
              </button>
              <span class="key-remove" :title="t('keys.remove')" @click="removeBinding(entry.command, i)">
                <X :size="11" />
              </span>
            </template>
            <span v-if="(bindings[entry.command]?.length ?? 0) === 0" class="keys-unassigned">{{ t("keys.unassigned") }}</span>
            <button class="key-add" :title="t('keys.add')" @click="startRecording(entry.command, 'new')">+</button>
          </div>
          <button
            v-if="!isDefaultBinding(entry.command)"
            class="keys-reset"
            :title="t('keys.reset')"
            @click="resetBinding(entry.command)"
          >
            <RotateCcw :size="13" />
          </button>
        </div>
      </div>
      <p v-if="groups.length === 0" class="keys-empty">{{ t("keys.empty") }}</p>
    </div>
    <p class="keys-hint">{{ t("keys.hint") }}</p>
    <template #buttons>
      <button class="btn" @click="emit('close')">{{ t("common.close") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.keys-toolbar {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.keys-search {
  flex: 1;
}

.keys-message {
  margin: 0;
  color: var(--destructive);
  font-size: var(--text-sm);
}

.keys-list {
  max-height: 420px;
  overflow-y: auto;
  border: 1px solid var(--border);
  background: var(--card);
}

.keys-group-title {
  padding: 4px 10px;
  color: var(--muted-foreground);
  background: var(--background);
  border-bottom: 1px solid var(--border);
  font-size: var(--text-sm);
  font-weight: bold;
  position: sticky;
  top: 0;
}

.keys-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: 5px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
}

.keys-row:last-child {
  border-bottom: none;
}

.keys-action {
  flex: 1;
  color: var(--card-foreground);
  font-size: var(--text-md);
}

.keys-bindings {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.key-pill {
  min-width: 44px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--background);
  color: var(--foreground);
  font-size: var(--text-sm);
  cursor: pointer;
  font-family: inherit;
}

.key-pill:hover {
  border-color: var(--primary);
}

.key-pill.recording {
  border-color: var(--primary);
  color: var(--primary);
}

.key-remove {
  display: inline-flex;
  align-items: center;
  color: var(--muted-foreground);
  cursor: pointer;
}

.key-remove:hover {
  color: var(--destructive);
}

.key-add {
  width: 22px;
  height: 22px;
  border: 1px dashed var(--border);
  border-radius: 3px;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
  line-height: 1;
}

.key-add:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.keys-unassigned {
  color: var(--muted-foreground);
  font-size: var(--text-sm);
}

.keys-reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 3px;
  border: none;
  background: transparent;
  color: var(--muted-foreground);
  cursor: pointer;
}

.keys-reset:hover {
  color: var(--primary);
}

.keys-empty {
  margin: 0;
  padding: 12px;
  color: var(--muted-foreground);
  font-size: var(--text-sm);
}

.keys-hint {
  margin: 0;
  color: var(--muted-foreground);
  font-size: var(--text-sm);
}
</style>
