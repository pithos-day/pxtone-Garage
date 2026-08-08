// 多言語対応の最小実装。
// 現時点では日本語のみ。lang は localStorage に永続化し、UI は t() で参照する。
// このモジュールは state に依存しない (循環 import 防止のため vue のみ使用)。
import { ref } from "vue";
import ja from "./ja";

export type Language = "ja";

const dicts: Record<Language, Record<string, string>> = { ja };

const STORAGE_LANG = "pxtone-garage-language";

export const lang = ref<Language>("ja");

// キーに対応する表示文字列を返す (未定義キーはキー名をそのまま返す)
export function t(key: string): string {
  return dicts[lang.value]?.[key] ?? key;
}

export function setLanguage(l: Language): void {
  lang.value = l;
  try {
    localStorage.setItem(STORAGE_LANG, l);
  } catch {
    // localStorage 不可は無視
  }
}

export function initLanguage(): void {
  try {
    const saved = localStorage.getItem(STORAGE_LANG);
    if (saved === "ja") lang.value = "ja";
  } catch {
    // 無視
  }
}
