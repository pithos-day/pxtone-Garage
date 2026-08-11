<script setup lang="ts">
// テーマインポートの展開ブロック (SettingsDialog から分割)
import { useThemeImport } from "../../composables/useThemeImport";
import { t } from "../../i18n";

const { importState, toggleImport, onImportFile, onImport } = useThemeImport();
</script>

<template>
  <button class="disclosure" @click="toggleImport">
    <span class="disclosure-arrow">{{ importState.open ? "▾" : "▸" }}</span>
    {{ t("settings.importTheme") }}
  </button>
  <div v-if="importState.open" class="import-box">
    <div class="row">
      <label>{{ t("settings.importThemeName") }}</label>
      <input v-model="importState.name" type="text" class="grow" maxlength="40" />
    </div>
    <textarea v-model="importState.css" class="import-css" :placeholder="t('settings.importThemeCss')" spellcheck="false" />
    <div class="row">
      <label class="file-label btn btn-sm">
        {{ t("settings.loadFile") }}
        <input type="file" accept=".css,text/css" @change="onImportFile" />
      </label>
      <span v-if="importState.error" class="import-err">{{ importState.error }}</span>
      <span class="spacer" />
      <button class="btn btn-accent btn-sm" @click="onImport">{{ t("settings.import") }}</button>
      <button class="btn btn-sm" @click="importState.open = false">{{ t("common.cancel") }}</button>
    </div>
  </div>
</template>

<style scoped>
.disclosure {
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 0;
  text-align: left;
}

.disclosure-arrow {
  display: inline-block;
  width: 12px;
}

.import-box {
  border: 1px solid var(--border);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.import-css {
  min-height: 90px;
  font-family: monospace;
  font-size: 10px;
  resize: vertical;
}

.file-label {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}

.file-label input {
  display: none;
}

.import-err {
  color: var(--danger);
  font-size: 11px;
}

.spacer {
  flex: 1;
}
</style>
