<script setup lang="ts">
// キー設定の入力待ちオーバーレイ。次のキー入力を対象コマンドへ割り当てる (Esc でキャンセル)
import { onBeforeUnmount, onMounted, ref } from "vue";
import { Keyboard } from "@lucide/vue";
import {
  bindingEquals,
  bindingFromEvent,
  bindingParts,
  modifierParts,
  type KeyBinding,
  type ShortcutCommand,
} from "../../lib/shortcuts";
import { addBinding, bindings, conflictFor, setBinding } from "../../state/keybindings";
import { t } from "../../i18n";

const props = defineProps<{
  command: ShortcutCommand;
  index: number | "new"; // 置き換える割り当ての位置 ("new" は追加)
}>();
const emit = defineEmits<{ (e: "close"): void }>();

const recordKeys = ref<string[]>([]); // 入力欄に出すキーキャップ
const recordError = ref("");

// 同じコマンド内で既に使われている割り当てか (編集対象の自分自身は除く)
function isDuplicate(binding: KeyBinding): boolean {
  return (bindings[props.command] ?? []).some((b, i) => (props.index === "new" || i !== props.index) && bindingEquals(b, binding));
}

function heldModifiers(e: KeyboardEvent): string[] {
  return modifierParts({ ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey, alt: e.altKey });
}

function onRecordKeyDown(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat) return;
  if (e.key === "Escape") {
    emit("close");
    return;
  }
  recordError.value = "";
  const binding = bindingFromEvent(e);
  if (!binding) {
    // 修飾キー単独では確定せず、押している修飾キーだけ見せる
    recordKeys.value = heldModifiers(e);
    return;
  }
  recordKeys.value = bindingParts(binding);
  if (isDuplicate(binding)) {
    recordError.value = t("keys.duplicate");
    return;
  }
  const conflict = conflictFor(props.command, binding);
  if (conflict) {
    recordError.value = `${t("keys.conflict")}: ${t(`shortcut.${conflict}`)}`;
    return;
  }
  if (props.index === "new") addBinding(props.command, binding);
  else setBinding(props.command, props.index, binding);
  emit("close");
}

// 修飾キーを離したら表示から消す (エラー表示中は拒否したキーを残す)
function onRecordKeyUp(e: KeyboardEvent): void {
  e.preventDefault();
  e.stopPropagation();
  if (!recordError.value) recordKeys.value = heldModifiers(e);
}

// 記録中はどの要素にフォーカスがあってもキーを拾う (capture)
onMounted(() => {
  window.addEventListener("keydown", onRecordKeyDown, true);
  window.addEventListener("keyup", onRecordKeyUp, true);
});
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onRecordKeyDown, true);
  window.removeEventListener("keyup", onRecordKeyUp, true);
});
</script>

<template>
  <div class="keys-record" @click.self="emit('close')">
    <div class="keys-record-box" role="alertdialog" :aria-label="t('keys.recordTitle')">
      <h3 class="keys-record-title">
        <Keyboard :size="18" aria-hidden="true" />
        {{ t("keys.recordTitle") }}
      </h3>
      <p class="keys-record-action">{{ t(`shortcut.${command}`) }}</p>
      <div class="keys-record-input" :class="{ error: recordError }" aria-live="polite">
        <template v-if="recordKeys.length > 0">
          <kbd v-for="part in recordKeys" :key="part">{{ part }}</kbd>
        </template>
        <span v-else class="keys-record-placeholder">{{ t("keys.recordPlaceholder") }}</span>
      </div>
      <p class="keys-record-message" :class="{ error: recordError }">{{ recordError || t("keys.recordHint") }}</p>
      <button type="button" class="btn" @click="emit('close')">{{ t("common.cancel") }}</button>
    </div>
  </div>
</template>

<style scoped>
.keys-record {
  position: fixed;
  inset: 0;
  z-index: 1;
  display: flex;
  justify-content: center;
  padding: 96px 16px 16px;
  background: rgb(0 0 0 / 80%);
}

.keys-record-box {
  width: 420px;
  max-width: 100%;
  align-self: flex-start;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-lg);
  text-align: center;
  color: #fff;
}

.keys-record-title {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  margin: 0;
  font-size: var(--text-lg);
}

.keys-record-action {
  margin: 0;
  font-size: var(--text-md);
}

.keys-record-input {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--space-xs);
  padding: var(--space-md);
  border: 1px solid var(--primary);
  border-radius: var(--radius);
  background: var(--muted);
}

.keys-record-input.error {
  border-color: var(--destructive);
}

.keys-record-placeholder {
  color: var(--muted-foreground);
  font-size: var(--text-sm);
}

.keys-record-message {
  margin: 0;
  font-size: var(--text-sm);
}

/* 暗いオーバーレイ上の文字はテーマの destructive だと沈むので、白のまま太字にする (赤は入力欄の枠で示す) */
.keys-record-message.error {
  font-weight: bold;
}
</style>
