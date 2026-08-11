// File > 環境設定... のモーダルダイアログ。
// テーマ (リストボックス + インポート)・ライト/ダーク・言語・フォントを設定する。
<script setup lang="ts">
import { ref } from "vue";
import {
  BUILTIN_THEMES,
  theme,
  userThemes,
  setThemeName,
  setDark,
  removeUserTheme,
  isUserTheme,
} from "../../state/theme";
import { BUNDLED_FONTS, localFonts, fontFamily, setFont, loadLocalFonts } from "../../state/fonts";
import { lang, setLanguage, type Language } from "../../i18n";
import { t } from "../../i18n";
import ModalDialog from "./ModalDialog.vue";
import ThemeImportSection from "./ThemeImportSection.vue";

const emit = defineEmits<{ (e: "close"): void }>();

function onDeleteTheme(): void {
  if (isUserTheme(theme.name)) removeUserTheme(theme.name);
}

// ---- ローカルフォント ----
const localFontLoading = ref(false);
const localFontMsg = ref("");

async function onLoadLocalFonts(): Promise<void> {
  localFontLoading.value = true;
  localFontMsg.value = "";
  try {
    const granted = await loadLocalFonts();
    localFontMsg.value = granted
      ? t("settings.loadLocalFontsDone").replace("{n}", String(localFonts.value.length))
      : t("settings.loadLocalFontsFallback");
  } finally {
    localFontLoading.value = false;
  }
}
</script>

<template>
  <ModalDialog label="settings" width="460px" body-gap="10px" @close="emit('close')">
    <template #title>{{ t("settings.title") }}</template>
    <div class="row">
      <label>{{ t("settings.theme") }}</label>
      <select class="grow" :value="theme.name" @change="setThemeName(($event.target as HTMLSelectElement).value)">
        <optgroup :label="t('settings.builtinThemes')">
          <option v-for="b in BUILTIN_THEMES" :key="b.id" :value="b.id">{{ b.name }}</option>
        </optgroup>
        <optgroup v-if="userThemes.length > 0" :label="t('settings.myThemes')">
          <option v-for="u in userThemes" :key="u.id" :value="u.id">{{ u.name }}</option>
        </optgroup>
      </select>
      <button v-if="isUserTheme(theme.name)" class="btn btn-sm" :title="t('settings.deleteTheme')" @click="onDeleteTheme">✕</button>
    </div>
    <ThemeImportSection />
    <div class="row">
      <label>{{ t("settings.mode") }}</label>
      <div class="radios">
        <label class="radio-item">
          <input type="radio" name="settings-dark" :checked="!theme.dark" @change="setDark(false)" />
          {{ t("settings.light") }}
        </label>
        <label class="radio-item">
          <input type="radio" name="settings-dark" :checked="theme.dark" @change="setDark(true)" />
          {{ t("settings.dark") }}
        </label>
      </div>
    </div>
    <div class="row">
      <label>{{ t("settings.language") }}</label>
      <select :value="lang" @change="setLanguage(($event.target as HTMLSelectElement).value as Language)">
        <option value="ja">{{ t("settings.languageJa") }}</option>
        <option value="en" disabled>{{ t("settings.languageEn") }}</option>
      </select>
    </div>
    <div class="row">
      <label>{{ t("settings.font") }}</label>
      <select class="grow" :value="fontFamily" @change="setFont(($event.target as HTMLSelectElement).value)">
        <optgroup :label="t('settings.builtinFonts')">
          <option v-for="f in BUNDLED_FONTS" :key="f.family" :value="f.family" :style="{ fontFamily: `'${f.family}', sans-serif` }">
            {{ f.label }}
          </option>
        </optgroup>
        <optgroup v-if="localFonts.length > 0" :label="t('settings.localFonts')">
          <option v-for="f in localFonts" :key="f.family" :value="f.family" :style="{ fontFamily: `'${f.family}', sans-serif` }">
            {{ f.label }}
          </option>
        </optgroup>
      </select>
    </div>
    <div class="row">
      <button class="btn btn-sm" :disabled="localFontLoading" @click="onLoadLocalFonts">
        {{ t("settings.loadLocalFonts") }}
      </button>
      <span v-if="localFontMsg" class="import-msg">{{ localFontMsg }}</span>
    </div>
    <template #buttons>
      <button class="btn" @click="emit('close')">{{ t("common.close") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.grow {
  flex: 1;
  min-width: 0;
}

select.grow,
select {
  max-width: 100%;
}

.radios {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.radio-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--foreground);
  cursor: pointer;
}

.radio-item input {
  accent-color: var(--primary);
}

/* テーマインポート */
.import-msg {
  color: var(--muted-foreground);
  font-size: 11px;
}
</style>
