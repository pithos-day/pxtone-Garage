// 多言語対応の最小実装。
// lang は localStorage に永続化し、UI は t() で参照する。未設定ならブラウザの言語に合わせる。
// このモジュールは state に依存しない (循環 import 防止のため vue のみ使用)。
import { ref } from "vue";
import ja from "./ja";
import en from "./en";
import { readStorage, writeStorage } from "../lib/storage";

export type Language = "ja" | "en";

const dicts: Record<Language, Record<string, string>> = { ja, en };

const STORAGE_LANG = "pxtone-garage-language";

export const lang = ref<Language>("ja");

// キーに対応する表示文字列を返す (未定義キーはキー名をそのまま返す)
export function t(key: string): string {
  return dicts[lang.value]?.[key] ?? key;
}

function applyLanguage(l: Language): void {
  lang.value = l;
  if (typeof document !== "undefined") document.documentElement.lang = l;
}

export function setLanguage(l: Language): void {
  applyLanguage(l);
  writeStorage(STORAGE_LANG, l);
}

// 保存値を優先し、無ければブラウザの言語から決める (日本語以外は英語)
export function resolveLanguage(saved: string | null, browserLanguage: string | undefined): Language {
  if (saved === "ja" || saved === "en") return saved;
  return browserLanguage?.toLowerCase().startsWith("ja") ? "ja" : "en";
}

export function initLanguage(): void {
  const browserLanguage = typeof navigator === "undefined" ? undefined : navigator.language;
  applyLanguage(resolveLanguage(readStorage(STORAGE_LANG), browserLanguage));
}
