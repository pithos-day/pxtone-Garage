// 未保存の変更があるタブを閉じる際の確認ダイアログ。
// 保存 / 保存しない / キャンセル の 3 択を出す。
<script setup lang="ts">
import ModalDialog from "./ModalDialog.vue";
import { t } from "../../i18n";

const props = defineProps<{
  name: string;
  canSave: boolean;
  busy?: boolean;
}>();

const emit = defineEmits<{
  (e: "save"): void;
  (e: "discard"): void;
  (e: "cancel"): void;
}>();

function onCancel(): void {
  if (!props.busy) emit("cancel");
}
</script>

<template>
  <ModalDialog label="unsaved" width="440px" body-gap="10px" @close="onCancel">
    <template #title>{{ t("unsaved.title") }}</template>
    <p class="message">{{ t("unsaved.message").replace("{name}", name) }}</p>
    <p class="hint">{{ t("unsaved.hint") }}</p>
    <template #buttons>
      <button v-if="canSave" class="btn btn-accent" :disabled="busy" @click="emit('save')">
        {{ busy ? t("unsaved.saving") : t("common.save") }}
      </button>
      <button class="btn" :disabled="busy" @click="emit('discard')">{{ t("unsaved.discard") }}</button>
      <button class="btn" :disabled="busy" @click="onCancel">{{ t("common.cancel") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.message {
  margin: 0;
  color: var(--foreground);
  font-size: var(--text-md);
}

.hint {
  margin: 0;
  color: var(--muted-foreground);
  font-size: var(--text-sm);
}
</style>
