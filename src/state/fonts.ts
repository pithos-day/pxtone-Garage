// フォント設定 (テーマとは独立したグローバル設定)。
// アプリ内蔵フォント (@fontsource で同梱、SIL OFL 1.1) とユーザーのローカル
// フォント (queryLocalFonts / フォールバック検出) から選択する。
// 選択は --font-sans として <html> に適用し、localStorage に永続化する。
import { ref } from "vue";

export interface FontOption {
  family: string; // font-family 名 (適用時にクォートする)
  label: string;
  source: "builtin" | "local";
}

// アプリ内蔵フォント (既定は DotGothic16)
export const BUNDLED_FONTS: FontOption[] = [
  { family: "DotGothic16", label: "DotGothic16", source: "builtin" },
  { family: "M PLUS Rounded 1c", label: "M PLUS Rounded 1c", source: "builtin" },
  { family: "Zen Maru Gothic", label: "Zen Maru Gothic", source: "builtin" },
  { family: "Noto Sans JP", label: "Noto Sans JP", source: "builtin" },
];

export const DEFAULT_FONT_FAMILY = "Noto Sans JP";

const STORAGE_FONT = "pxtone-garage-font";

export const fontFamily = ref<string>(DEFAULT_FONT_FAMILY);
export const localFonts = ref<FontOption[]>([]);

// ---- 適用・永続化 ----

export function setFont(family: string): void {
  fontFamily.value = family;
  document.documentElement.style.setProperty("--font-sans", `"${family}", sans-serif`);
  try {
    localStorage.setItem(STORAGE_FONT, family);
  } catch {
    // 無視
  }
}

// Canvas 描画用のフォントスタック (例: "DotGothic16", sans-serif)。
// ctx.font のファミリ部分にそのまま使える
export function canvasFontStack(): string {
  return `"${fontFamily.value}", sans-serif`;
}

export function initFonts(): void {
  let family = DEFAULT_FONT_FAMILY;
  try {
    const saved = localStorage.getItem(STORAGE_FONT);
    if (saved && typeof saved === "string" && saved.length > 0 && saved.length <= 100) family = saved;
  } catch {
    // 無視
  }
  setFont(family);
}

// ---- ローカルフォント列挙 ----

// Local Font Access API (Chromium のみ)
interface LocalFontMetadata {
  family: string;
  fullName: string;
  postscriptName: string;
}
declare global {
  interface Window {
    queryLocalFonts?: () => Promise<LocalFontMetadata[]>;
  }
}

// フォールバック検出用の候補リスト (システム + 日本語の主要フォント)
const FALLBACK_CANDIDATES = [
  "Arial", "Arial Black", "Helvetica", "Helvetica Neue", "Verdana", "Tahoma",
  "Trebuchet MS", "Segoe UI", "Calibri", "Cambria", "Georgia", "Times New Roman",
  "Courier New", "Consolas", "Lucida Console", "Monaco", "Menlo",
  "IBM Plex Sans", "Roboto", "Ubuntu", "DejaVu Sans", "Liberation Sans",
  "Cantarell", "Noto Sans", "Noto Sans JP", "M PLUS 1p", "M PLUS Rounded 1c",
  "Zen Maru Gothic", "Zen Kaku Gothic New", "BIZ UD Gothic", "BIZ UDPGothic",
  "Meiryo", "Yu Gothic", "Hiragino Sans", "Hiragino Kaku Gothic ProN",
  "MS Gothic", "MS PGothic", "Osaka", "Takao Gothic", "IPAex Gothic",
  "IPA Gothic", "VL Gothic", "DotGothic16", "Kosugi Maru", "Sawarabi Gothic",
  "Rounded Mplus 1c",
];

// Canvas の measureText 幅比較によるフォント利用可否検出 (クロスブラウザ)
function isFontAvailable(family: string): boolean {
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return false;
  const text = "mmmmmmmmmmlli";
  ctx.font = `16px "${family}", monospace`;
  const withFont = ctx.measureText(text).width;
  ctx.font = "16px monospace";
  const mono = ctx.measureText(text).width;
  return withFont !== mono;
}

function detectLocalCandidates(): FontOption[] {
  const builtin = new Set(BUNDLED_FONTS.map((f) => f.family));
  const out: FontOption[] = [];
  for (const family of FALLBACK_CANDIDATES) {
    if (builtin.has(family)) continue;
    if (isFontAvailable(family)) out.push({ family, label: family, source: "local" });
  }
  return out;
}

/**
 * ローカルフォントを読み込む。Chromium では queryLocalFonts (初回は権限
 * プロンプト)。それ以外・拒否時は候補リストからの検出にフォールバックする。
 * @returns granted = queryLocalFonts が成功したか (プロンプトが出たか)
 */
export async function loadLocalFonts(): Promise<{ granted: boolean }> {
  const q = window.queryLocalFonts;
  if (typeof q === "function") {
    try {
      const fonts = await q.call(window);
      const seen = new Set<string>();
      const opts: FontOption[] = [];
      for (const f of fonts) {
        const family = f.family;
        if (!family || seen.has(family)) continue;
        seen.add(family);
        opts.push({ family, label: family, source: "local" });
      }
      localFonts.value = opts;
      return { granted: true };
    } catch {
      // 権限拒否など → フォールバック検出へ
    }
  }
  localFonts.value = detectLocalCandidates();
  return { granted: false };
}
