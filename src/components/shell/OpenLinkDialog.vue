// File > リンクから開く のモーダルダイアログ。
// URL の取得と形式判定は呼び出し側 (AppShell) が行い、ここは入力と進捗表示だけを担当する。
<script setup lang="ts">
import { onMounted, ref } from "vue";
import ModalDialog from "./ModalDialog.vue";
import { t } from "../../i18n";

const props = defineProps<{
  // URL を開く。成功時 null、失敗時は表示するエラーメッセージ
  open: (url: string) => Promise<string | null>;
}>();

const emit = defineEmits<{ (e: "close"): void }>();

const url = ref("");
const error = ref("");
const loading = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);

onMounted(() => inputRef.value?.focus());

async function onSubmit(): Promise<void> {
  if (loading.value) return;
  const value = url.value.trim();
  if (!value) {
    error.value = t("openLink.empty");
    return;
  }
  error.value = "";
  loading.value = true;
  try {
    const message = await props.open(value);
    if (message) {
      error.value = message;
      return;
    }
    emit("close");
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <ModalDialog label="open-link" width="520px" body-gap="10px" @close="emit('close')">
    <template #title>{{ t("openLink.title") }}</template>
    <div class="row">
      <label>{{ t("openLink.url") }}</label>
      <input
        ref="inputRef"
        v-model="url"
        type="url"
        class="grow"
        placeholder="https://example.com/song.ptcop"
        :disabled="loading"
        @keydown.enter.prevent="onSubmit"
      />
    </div>
    <p class="hint">{{ t("openLink.hint") }}</p>
    <p v-if="error" class="error">{{ error }}</p>
    <template #buttons>
      <button class="btn btn-accent" :disabled="loading" @click="onSubmit">{{ t("openLink.open") }}</button>
      <button class="btn" :disabled="loading" @click="emit('close')">{{ t("common.cancel") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.hint {
  margin: 0;
  color: var(--muted-foreground);
  font-size: var(--text-sm);
}

.error {
  margin: 0;
  color: var(--destructive);
  font-size: var(--text-sm);
}
</style>
