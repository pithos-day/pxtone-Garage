// Help > このアプリについて。バージョンとライセンス、依存ライブラリの表記への導線を表示する
<script setup lang="ts">
import { t } from "../../i18n";
import ModalDialog from "./ModalDialog.vue";

const emit = defineEmits<{ (e: "close"): void }>();

const version = __APP_VERSION__;
// pnpm build が dist 直下へ生成する
const noticesUrl = `${import.meta.env.BASE_URL}THIRD_PARTY_NOTICES.txt`;
</script>

<template>
  <ModalDialog label="about" width="440px" body-gap="10px" @close="emit('close')">
    <template #title>{{ t("about.title") }}</template>
    <div class="about-name">pxtone Garage <span class="about-version">v{{ version }}</span></div>
    <p>{{ t("about.description") }}</p>
    <p>
      {{ t("about.license") }}<br />
      Copyright 2026 Pithos
    </p>
    <p>
      {{ t("about.originalLicense") }}<br />
      (C) 2005-2025 Daisuke Amaya (開発室Pixel)
    </p>
    <div class="about-links">
      <a href="https://github.com/pithos-day/pxtone-garage" target="_blank" rel="noopener">{{ t("about.source") }}</a>
      <a href="https://pxtone.org/" target="_blank" rel="noopener">{{ t("about.original") }}</a>
      <a :href="noticesUrl" target="_blank" rel="noopener">{{ t("about.notices") }}</a>
    </div>
    <template #buttons>
      <button class="btn" @click="emit('close')">{{ t("common.close") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.about-name {
  font-size: var(--text-base);
  font-weight: bold;
}

.about-version {
  color: var(--muted-foreground);
  font-weight: normal;
}

p {
  margin: 0;
  font-size: var(--text-sm);
}

.about-links {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  font-size: var(--text-sm);
}

.about-links a {
  color: var(--primary);
}
</style>
