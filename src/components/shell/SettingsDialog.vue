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
  addUserTheme,
  removeUserTheme,
  isUserTheme,
} from "../../state/theme";
import {
  BUNDLED_FONTS,
  localFonts,
  fontFamily,
  setFont,
  loadLocalFonts,
} from "../../state/fonts";
import { lang, setLanguage, type Language } from "../../i18n";
import { t } from "../../i18n";

const emit = defineEmits<{ (e: "close"): void }>();

// ---- テーマインポート ----
const importing = ref(false);
const importName = ref("");
const importCss = ref("");
const importError = ref("");

function toggleImport(): void {
  importing.value = !importing.value;
  if (importing.value) {
    importError.value = "";
    importName.value = "";
    importCss.value = "";
  }
}

function onImportFile(e: Event): void {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  void f.text().then((text) => {
    importCss.value = text;
    if (!importName.value) {
      importName.value = f.name.replace(/\.css$/i, "").trim();
    }
  });
}

function doImport(): void {
  const th = addUserTheme(importCss.value, importName.value);
  if (!th) {
    importError.value = t("settings.importFailed");
    return;
  }
  setThemeName(th.id);
  importing.value = false;
  importCss.value = "";
  importName.value = "";
}

function onDeleteTheme(): void {
  if (isUserTheme(theme.name)) removeUserTheme(theme.name);
}

// ---- ローカルフォント ----
const localFontLoading = ref(false);
const localFontMsg = ref("");

async function onLoadLocalFonts(): Promise<void> {
  localFontLoading.value = true;
  localFontMsg.value = "";
  const { granted } = await loadLocalFonts();
  localFontLoading.value = false;
  localFontMsg.value = granted
    ? t("settings.loadLocalFontsDone").replace("{n}", String(localFonts.value.length))
    : t("settings.loadLocalFontsFallback");
}

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
        <button class="disclosure" @click="toggleImport">
          <span class="disclosure-arrow">{{ importing ? "▾" : "▸" }}</span>
          {{ t("settings.importTheme") }}
        </button>
        <div v-if="importing" class="import-box">
          <div class="row">
            <label>{{ t("settings.importThemeName") }}</label>
            <input v-model="importName" type="text" class="grow" maxlength="40" />
          </div>
          <textarea v-model="importCss" class="import-css" :placeholder="t('settings.importThemeCss')" spellcheck="false" />
          <div class="row">
            <label class="file-label btn btn-sm">
              {{ t("settings.loadFile") }}
              <input type="file" accept=".css,text/css" @change="onImportFile" />
            </label>
            <span v-if="importError" class="import-err">{{ importError }}</span>
            <span class="spacer" />
            <button class="btn btn-accent btn-sm" @click="doImport">{{ t("settings.import") }}</button>
            <button class="btn btn-sm" @click="importing = false">{{ t("common.cancel") }}</button>
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
  background: rgb(0 0 0 / 55%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.dlg {
  width: 460px;
  background: var(--background);
  border: 1px solid var(--border);
  box-shadow: 4px 4px 16px rgb(0 0 0 / 0.35);
}

.dlg-title {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: bold;
  color: var(--foreground);
  background: var(--background);
  border-bottom: 1px solid var(--border);
}

.dlg-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

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

/* テーマインポート (展開/折りたたみ) */
.disclosure {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  border: 1px solid var(--border);
  background: var(--background);
  color: var(--foreground);
  font-size: 12px;
  padding: 5px 8px;
  cursor: pointer;
  border-radius: var(--radius);
}

.disclosure:hover {
  background: var(--accent);
  color: var(--accent-foreground);
}

.disclosure-arrow {
  font-size: 9px;
  color: var(--muted-foreground);
}

/* テーマインポート */
.import-box {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  border: 1px solid var(--border);
  background: var(--background);
}

.import-css {
  width: 100%;
  height: 120px;
  resize: vertical;
  font-family: monospace;
  font-size: 11px;
}

.file-label {
  cursor: pointer;
}

.file-label input {
  display: none;
}

.import-err {
  color: var(--destructive);
  font-size: 11px;
}

.import-msg {
  color: var(--muted-foreground);
  font-size: 11px;
}

.spacer {
  flex: 1;
}

.dlg-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 0 12px 12px;
}
</style>
