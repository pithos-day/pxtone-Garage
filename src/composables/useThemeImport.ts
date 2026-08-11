// テーマインポートフォーム (SettingsDialog)
import { reactive } from "vue";
import { addUserTheme, setThemeName } from "../state/theme";
import { t } from "../i18n";

export function useThemeImport() {
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
    importState.open = false;
    resetImport();
  }

  return { importState, toggleImport, onImportFile, onImport };
}
