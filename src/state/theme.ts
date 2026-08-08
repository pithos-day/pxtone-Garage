// テーマ (名前 + ライト/ダーク) の状態管理。
// <html> の data-theme 属性と .dark クラスを切り替え、選択は localStorage に永続化。
// 初期のダーク/ライトは環境の prefers-color-scheme から決定する。
import { reactive } from "vue";
import { syncThemeColors } from "../lib/theme";
import { doc } from "./project";

export type ThemeName = "pxtone" | "indigo";

// 利用可能なテーマ id (表示名は i18n の settings.theme* を使用)
export const THEMES: ThemeName[] = ["pxtone", "indigo"];

const STORAGE_THEME = "pxtone-garage-theme";
const STORAGE_DARK = "pxtone-garage-dark";

export const theme = reactive<{ name: ThemeName; dark: boolean }>({
  name: "pxtone",
  dark: true,
});

export function setDark(dark: boolean): void {
  theme.dark = dark;
  apply();
}

export function setThemeName(name: ThemeName): void {
  theme.name = name;
  apply();
}

function apply(): void {
  const el = document.documentElement;
  el.dataset.theme = theme.name;
  el.classList.toggle("dark", theme.dark);
  try {
    localStorage.setItem(STORAGE_THEME, theme.name);
    localStorage.setItem(STORAGE_DARK, theme.dark ? "1" : "0");
  } catch {
    // localStorage 不可 (プライベートモード等) は無視
  }
  syncThemeColors();
  doc.rev++; // canvas の再描画を促す
}

export function initTheme(): void {
  let name: ThemeName = "pxtone";
  let dark: boolean | null = null;
  try {
    const saved = localStorage.getItem(STORAGE_THEME);
    if (saved === "pxtone" || saved === "indigo") name = saved;
    const savedDark = localStorage.getItem(STORAGE_DARK);
    if (savedDark === "1") dark = true;
    else if (savedDark === "0") dark = false;
  } catch {
    // 無視
  }
  // 保存値がなければ環境の設定を初期値にする
  if (dark === null) {
    dark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? true;
  }
  theme.name = name;
  theme.dark = dark;
  apply();
}
