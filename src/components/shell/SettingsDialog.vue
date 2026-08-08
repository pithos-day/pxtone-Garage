// File > 環境設定... のモーダルダイアログ。
// テーマ・ライト/ダーク・言語を設定する (変更は即時反映)。
<script setup lang="ts">
import { THEMES, theme, setThemeName, setDark } from "../../state/theme";
import { lang, setLanguage, type Language } from "../../i18n";
import { t } from "../../i18n";

const emit = defineEmits<{ (e: "close"): void }>();

const themeLabel = (id: string): string => (id === "pxtone" ? t("settings.themePxtone") : t("settings.themeIndigo"));

function onOverlayClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).classList.contains("dlg-overlay")) emit("close");
}
</script>

<template>
  <div class="dlg-overlay" @click="onOverlayClick">
    <div class="dlg" role="dialog" aria-label="settings">
      <div class="dlg-title">{{ t("settings.title") }}</div>
      <div class="dlg-body">
        <div class="row">
          <label>{{ t("settings.theme") }}</label>
          <div class="radios">
            <label v-for="id in THEMES" :key="id" class="radio-item">
              <input type="radio" name="settings-theme" :value="id" :checked="theme.name === id" @change="setThemeName(id)" />
              {{ themeLabel(id) }}
            </label>
          </div>
        </div>
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
      </div>
      <div class="dlg-buttons">
        <button class="btn" @click="emit('close')">{{ t("common.close") }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dlg-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.dlg {
  width: 420px;
  background: var(--popover);
  border: 1px solid var(--border-strong);
  box-shadow: 4px 4px 16px var(--shadow);
}

.dlg-title {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: bold;
  color: var(--foreground);
  background: var(--muted);
  border-bottom: 1px solid var(--border);
}

.dlg-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
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

.dlg-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 0 12px 12px;
}
</style>
