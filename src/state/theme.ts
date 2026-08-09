// テーマ (名前 + ライト/ダーク) の状態管理。
// 組み込みテーマとユーザーテーマを CSS ソースとして保持し、パース・マージ・
// 検証した上で <style> に注入する。切替は <html> の data-theme 属性と
// .dark クラスで行い、選択は localStorage に永続化する。
// 初期のダーク/ライトは環境の prefers-color-scheme から決定する。
import { reactive, ref } from "vue";
import { syncThemeColors } from "../lib/theme";
import { parseThemeCss, mergeTokens, buildThemeCss, type ThemeTokens } from "../lib/themeParse";
import { doc } from "./project";

export interface ThemeDef {
  id: string;
  name: string;
  source: string;
  user?: boolean;
}

export interface UserTheme {
  id: string;
  name: string;
  css: string;
}

// 組み込みテーマの定義 (ソースは main.ts から ?raw import で渡す)
export const BUILTIN_THEMES: { id: string; name: string }[] = [
  { id: "pxtone", name: "ピストンコラージュ" },
  { id: "indigo", name: "Indigo" },
  { id: "astronauts", name: "Astronauts" },
  { id: "caffeine", name: "Caffeine" },
  { id: "zen", name: "Zen" },
  { id: "vintage", name: "Vintage" },
  { id: "rose", name: "Rose" },
];

export const DEFAULT_THEME = "pxtone";

const STORAGE_THEME = "pxtone-garage-theme";
const STORAGE_DARK = "pxtone-garage-dark";
const STORAGE_USER_THEMES = "pxtone-garage-user-themes";

export const theme = reactive<{ name: string; dark: boolean }>({
  name: DEFAULT_THEME,
  dark: true,
});

export const userThemes = ref<UserTheme[]>([]);

// id → テーマ定義 (組み込み + ユーザー)
const registry = new Map<string, ThemeDef>();
const parsed = new Map<string, ThemeTokens>();

function themeExists(id: string): boolean {
  return registry.has(id);
}

export function isUserTheme(id: string): boolean {
  return registry.get(id)?.user === true;
}

export function setDark(dark: boolean): void {
  theme.dark = dark;
  apply();
}

export function setThemeName(name: string): void {
  if (!themeExists(name)) name = DEFAULT_THEME;
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

// ---- テーマ注入 ----

let styleEl: HTMLStyleElement | null = null;

// 登録済みテーマのスコープ付き CSS を <style> に書き出す
// (ベース = pxtone テーマ。未定義トークンは pxtone の値を継承)
function injectThemes(): void {
  if (typeof document === "undefined") return;
  const baseSrc = registry.get(DEFAULT_THEME)?.source;
  if (!baseSrc) return;
  let base = parsed.get(DEFAULT_THEME);
  if (!base) {
    const parsedBase = parseThemeCss(baseSrc);
    if (!parsedBase) return;
    parsed.set(DEFAULT_THEME, parsedBase);
    base = parsedBase;
  }
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = "pxtone-theme-styles";
    document.head.appendChild(styleEl);
  }
  const parts: string[] = [];
  for (const t of registry.values()) {
    let tokens = parsed.get(t.id);
    if (!tokens) {
      const parsedTokens = parseThemeCss(t.source);
      if (!parsedTokens) continue;
      parsed.set(t.id, parsedTokens);
      tokens = parsedTokens;
    }
    parts.push(buildThemeCss(t.id, mergeTokens(base, tokens)));
  }
  styleEl.textContent = parts.join("\n");
}

// ---- ユーザーテーマ ----

function persistUserThemes(): void {
  try {
    localStorage.setItem(STORAGE_USER_THEMES, JSON.stringify(userThemes.value));
  } catch {
    // 容量超過などは無視
  }
}

function loadUserThemes(): void {
  try {
    const raw = localStorage.getItem(STORAGE_USER_THEMES);
    if (!raw) return;
    const list = JSON.parse(raw) as UserTheme[];
    if (!Array.isArray(list)) return;
    userThemes.value = list.filter(
      (t) => t && typeof t.id === "string" && typeof t.name === "string" && typeof t.css === "string",
    );
  } catch {
    userThemes.value = [];
  }
  for (const t of userThemes.value) {
    registry.set(t.id, { id: t.id, name: t.name, source: t.css, user: true });
  }
}

// ユーザーテーマを追加する。CSS が不正なら null を返す
export function addUserTheme(css: string, name: string): UserTheme | null {
  if (!parseThemeCss(css)) return null;
  const t: UserTheme = {
    id: `custom-${Date.now()}`,
    name: name.trim() || `Custom ${userThemes.value.length + 1}`,
    css,
  };
  userThemes.value.push(t);
  registry.set(t.id, { id: t.id, name: t.name, source: t.css, user: true });
  persistUserThemes();
  injectThemes();
  return t;
}

export function removeUserTheme(id: string): void {
  userThemes.value = userThemes.value.filter((t) => t.id !== id);
  registry.delete(id);
  parsed.delete(id);
  persistUserThemes();
  injectThemes();
  if (theme.name === id) setThemeName(DEFAULT_THEME);
}

// ---- 初期化 ----

// sources: 組み込みテーマ id → CSS ソース (?raw import)
export function initTheme(sources: Record<string, string>): void {
  registry.clear();
  parsed.clear();
  for (const b of BUILTIN_THEMES) {
    const src = sources[b.id];
    if (src) registry.set(b.id, { id: b.id, name: b.name, source: src });
  }
  loadUserThemes();
  injectThemes();

  let name = DEFAULT_THEME;
  let dark: boolean | null = null;
  try {
    const saved = localStorage.getItem(STORAGE_THEME);
    if (saved && themeExists(saved)) name = saved;
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
