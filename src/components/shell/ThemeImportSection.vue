// テーマインポートの展開ブロック (SettingsDialog から分割)。
// インポート (展開ボックス + ファイル読込) と、現在のテーマのエクスポートを行う。
// 状態はこのコンポーネント内で完結させる (専用 composable に切り出すまでもない)
<script setup lang="ts">
import { reactive } from "vue";
import { ChevronDown, ChevronRight } from "@lucide/vue";
import { addUserTheme, currentThemeForExport, setThemeName } from "../../state/theme";
import { downloadBytes, sanitizeFileName } from "../../engine/io";
import { t } from "../../i18n";

const importState = reactive({
  open: false,
  name: "",
  css: "",
  error: "",
});

function resetImport(): void {
  importState.name = "";
  importState.css = "";
  importState.error = "";
}

function toggleImport(): void {
  importState.open = !importState.open;
  if (importState.open) resetImport();
}

function closeImport(): void {
  importState.open = false;
}

function onImportFile(e: Event): void {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  void f.text().then((text) => {
    importState.css = text;
    if (!importState.name) {
      importState.name = f.name.replace(/\.css$/i, "").trim();
    }
  });
}

function onImport(): void {
  const th = addUserTheme(importState.css, importState.name);
  if (!th) {
    importState.error = t("settings.importFailed");
    return;
  }
  setThemeName(th.id);
  closeImport();
  resetImport();
}

// 現在のテーマを <テーマ名>.css として直接ダウンロードする (ピッカーは開かない)
async function onExport(): Promise<void> {
  const th = currentThemeForExport();
  if (!th) return;
  try {
    await downloadBytes(new TextEncoder().encode(th.css), {
      fileName: sanitizeFileName(th.name, ".css"),
      mime: "text/css",
      usePicker: false,
    });
  } catch {
    window.alert(t("error.save"));
  }
}
</script>

<template>
  <div class="row">
    <button class="disclosure grow" @click="toggleImport">
      <span class="disclosure-arrow"><ChevronDown v-if="importState.open" :size="12" /><ChevronRight v-else :size="12" /></span>
      {{ t("settings.importTheme") }}
    </button>
    <button class="btn btn-sm" @click="onExport">{{ t("settings.exportTheme") }}</button>
  </div>
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
      <button class="btn btn-sm" @click="closeImport">{{ t("common.cancel") }}</button>
    </div>
  </div>
</template>

<style scoped>
.disclosure {
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: var(--text-md);
  cursor: pointer;
  padding: 2px 0;
  text-align: left;
}

.disclosure-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 12px;
}

.import-box {
  border: 1px solid var(--border);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.import-css {
  min-height: 90px;
  font-family: monospace;
  font-size: var(--text-xs);
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
  font-size: var(--text-sm);
}

.spacer {
  flex: 1;
}
</style>
