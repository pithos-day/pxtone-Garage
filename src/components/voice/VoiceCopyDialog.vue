// A/B 面コピーの確認ダイアログ。はい/いいえでコピー実行を選択する。
<script setup lang="ts">
import { computed } from "vue";
import ModalDialog from "../shell/ModalDialog.vue";
import { t } from "../../i18n";

const props = defineProps<{ direction: "AB" | "BA" }>();
const emit = defineEmits<{ (e: "yes"): void; (e: "close"): void }>();

const message = computed(() => t(props.direction === "AB" ? "voice.copyABMessage" : "voice.copyBAMessage"));
</script>

<template>
  <ModalDialog label="voice-copy" width="320px" @close="emit('close')">
    <template #title>{{ t("voice.copyTitle") }}</template>
    <p class="msg">{{ message }}</p>
    <template #buttons>
      <button class="btn btn-accent" @click="emit('yes')">{{ t("common.yes") }}</button>
      <button class="btn" @click="emit('close')">{{ t("common.no") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.msg {
  margin: 0;
  font-size: var(--text-base);
  color: var(--foreground);
}
</style>
