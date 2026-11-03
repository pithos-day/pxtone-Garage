// state/dialog のメッセージダイアログを表示する (alert / confirm / prompt 相当)。
// AppShell に 1 つだけ置く。他のダイアログの上に重なるよう、最後に配置すること
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ModalDialog from "./ModalDialog.vue";
import { acceptAppDialog, currentAppDialog, dismissAppDialog } from "../../state/dialog";
import { t } from "../../i18n";

const okRef = ref<HTMLButtonElement | null>(null);
const inputRef = ref<HTMLInputElement | null>(null);
const inputValue = ref("");
// 閉じたときにフォーカスを戻す先 (ダイアログを開く前の要素)
let returnFocus: HTMLElement | null = null;

watch(currentAppDialog, async (req, prev) => {
  if (req && !prev) returnFocus = document.activeElement as HTMLElement | null;
  if (!req) {
    returnFocus?.focus?.();
    returnFocus = null;
    return;
  }
  inputValue.value = req.kind === "prompt" ? req.defaultValue : "";
  await nextTick();
  if (req.kind === "prompt") inputRef.value?.select();
  else okRef.value?.focus();
});

function onAccept(): void {
  acceptAppDialog(inputValue.value);
}

function onInputEnter(e: KeyboardEvent): void {
  // IME の変換確定の Enter では閉じない
  if (e.isComposing) return;
  // 既定動作を止めないと、次のダイアログの OK へ移ったフォーカスが同じ Enter で押されてしまう
  e.preventDefault();
  onAccept();
}

// Esc はフォーカス位置によらず最前面のこのダイアログだけを閉じる
function onKeydown(e: KeyboardEvent): void {
  if (e.key !== "Escape" || e.isComposing || !currentAppDialog.value) return;
  e.preventDefault();
  e.stopPropagation();
  dismissAppDialog();
}

onMounted(() => window.addEventListener("keydown", onKeydown, true));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown, true));
</script>

<template>
  <ModalDialog
    v-if="currentAppDialog"
    :key="currentAppDialog.id"
    :label="`app-${currentAppDialog.kind}`"
    width="400px"
    @close="dismissAppDialog"
  >
    <template #title>{{ t(`dialog.${currentAppDialog.kind}Title`) }}</template>
    <p class="message">{{ currentAppDialog.message }}</p>
    <input
      v-if="currentAppDialog.kind === 'prompt'"
      ref="inputRef"
      v-model="inputValue"
      type="text"
      :aria-label="currentAppDialog.message"
      @keydown.enter="onInputEnter"
    />
    <template #buttons>
      <button ref="okRef" type="button" class="btn btn-accent" @click="onAccept">{{ t("common.ok") }}</button>
      <button v-if="currentAppDialog.kind !== 'alert'" type="button" class="btn" @click="dismissAppDialog">
        {{ t("common.cancel") }}
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.message {
  margin: 0;
  color: var(--foreground);
  font-size: var(--text-md);
  /* 複数行のエラーメッセージと、長いファイル名の折り返し */
  white-space: pre-line;
  overflow-wrap: anywhere;
}
</style>
