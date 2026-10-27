// テーマ CSS ソース → トークンマップ変換 (純関数)。
// shadcn ジェネレーター出力 (Tailwind ディレクティブ付き) と素の :root/.dark の
// 両方に対応する。@規則ブロックはスキップし、:root 系 (ライト) と .dark 系
// (ダーク) のブロックから --xxx: value のみを抽出・サニタイズする。

export interface ThemeTokens {
  light: Record<string, string>;
  dark: Record<string, string>;
}

// 値のサニタイズ: インジェクション (url()/@/式/構造破壊) を拒否する。
// 許容: 色 (hex/oklch/hsl/rgb)、calc()/var()、数値、% 等
const SAFE_VALUE = /^[#()\[\],.%+\-/*\w\s"'':]+$/;

// ジェネレーター由来でアプリが使わないトークン (接頭辞で判定)。
// これらはベース (pxtone) テーマから継承される。
// --shadow* はジェネレーターが「白グロー」を定義するため除外
// (アプリの --shadow はダイアログの影に使う)。
const DENY_PREFIXES = ["--color-", "--shadow", "--tracking-", "--chart-", "--sidebar-", "--radius-sm", "--radius-md", "--radius-lg", "--radius-xl"];

function sanitizeValue(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/url\s*\(/i.test(v)) return null;
  if (/[@{<>`;]/u.test(v)) return null;
  if (/expression/i.test(v)) return null;
  if (!SAFE_VALUE.test(v)) return null;
  return v;
}

// セレクタ判定: ":root", ":root[data-theme=...]" などは light 扱い。
// ".dark", ".dark:not(.light)" などは dark 扱い
function blockKind(selector: string): "light" | "dark" | null {
  const s = selector.trim().replace(/\[[^\]]*\]/g, "").replace(/:not\([^)]*\)/g, "").trim();
  if (s === ":root") return "light";
  if (s === ".dark" || s === "html.dark") return "dark";
  return null;
}

/**
 * CSS ソースをパースしてテーマトークンを抽出する。
 * @returns ライト/ダークのトークンマップ (トークン名 → 値)。失敗時は null
 */
export function parseThemeCss(source: string): ThemeTokens | null {
  const n = source.length;
  let pos = 0;
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};

  const skipToMatchingBrace = (): void => {
    let depth = 1;
    pos++; // '{' を飛ばす
    while (pos < n && depth > 0) {
      if (source[pos] === "{") depth++;
      else if (source[pos] === "}") depth--;
      pos++;
    }
  };

  while (pos < n) {
    // 空白・コメントをスキップ
    while (pos < n && /\s/.test(source[pos]!)) pos++;
    while (pos < n && source.startsWith("/*", pos)) {
      const end = source.indexOf("*/", pos + 2);
      pos = end < 0 ? n : end + 2;
      while (pos < n && /\s/.test(source[pos]!)) pos++;
    }
    if (pos >= n) break;

    if (source[pos] === "@") {
      // @規則: ';' で終わる文、または { } ブロック。どちらもスキップ
      let i = pos;
      while (i < n && source[i] !== "{" && source[i] !== ";") i++;
      if (i < n && source[i] === "{") {
        pos = i;
        skipToMatchingBrace();
      } else {
        pos = i + 1;
      }
      continue;
    }

    // 通常のブロック: セレクタ { body }
    const braceIdx = source.indexOf("{", pos);
    if (braceIdx < 0) break;
    const head = source.slice(pos, braceIdx).trim();
    pos = braceIdx;
    skipToMatchingBrace();
    const body = source.slice(braceIdx + 1, pos - 1);

    const kind = blockKind(head);
    if (!kind) continue;

    // ブロック内のコメントを除去してから宣言を処理する
    // (コメントが宣言と同セグメントになると抽出漏れするため)
    const cleanBody = body.replace(/\/\*[\s\S]*?\*\//g, "");
    parseDeclarations(cleanBody, kind, light, dark);
  }

  if (Object.keys(light).length === 0 && Object.keys(dark).length === 0) return null;
  return { light, dark };
}

// ブロック本文からカスタムプロパティ宣言のみを抽出してマップへ書き込む。
// フォント系・ジェネレーターのユーティリティ専用トークンは対象外
function parseDeclarations(body: string, kind: "light" | "dark", light: Record<string, string>, dark: Record<string, string>): void {
  for (const decl of body.split(";")) {
    const m = /^(\s*)(--[a-zA-Z0-9-]+)\s*:\s*(.*)$/.exec(decl);
    if (!m) continue;
    const name = m[2]!.trim();
    // フォント系トークンは対象外 (フォントは独立設定のため)
    if (name.startsWith("--font-")) continue;
    // ジェネレーターのユーティリティ専用トークンは対象外
    if (DENY_PREFIXES.some((p) => name.startsWith(p))) continue;
    const value = sanitizeValue(m[3]!);
    if (!value) continue;
    (kind === "light" ? light : dark)[name] = value;
  }
}

/**
 * ベーステーマのトークンに上書きをマージする。
 * 未定義トークンはベースの値が継承される。
 */
export function mergeTokens(
  base: ThemeTokens,
  override: ThemeTokens,
): ThemeTokens {
  return {
    light: { ...base.light, ...override.light },
    dark: { ...base.dark, ...override.dark },
  };
}

// トークンマップを CSS ブロック本文 (インデント済みの宣言行) にする
function tokenLines(tokens: Record<string, string>): string {
  return Object.entries(tokens)
    .map(([k, v]) => `  ${k}: ${v};`)
    .join("\n");
}

/**
 * トークンマップからスコープ付き CSS を生成する。
 * セレクタ: :root[data-theme="id"] (ライト) / .dark[data-theme="id"] (ダーク)
 */
export function buildThemeCss(id: string, tokens: ThemeTokens): string {
  return `:root[data-theme="${id}"] {\n${tokenLines(tokens.light)}\n}\n.dark[data-theme="${id}"] {\n${tokenLines(tokens.dark)}\n}`;
}

/**
 * 単体で読み込めるテーマ CSS (:root / .dark の素の形) を生成する。
 * エクスポート用で、そのままインポートし直せる (parseThemeCss が解釈する形)。
 * 空のトークン側はブロックごと省略する
 */
export function buildStandaloneThemeCss(name: string, tokens: ThemeTokens): string {
  // コメントを壊す "*/" は名前から除去する (パース時にスキップされる)
  const safeName = name.replace(/\*\//g, "");
  const parts = [`/* pxtone Garage theme: ${safeName} */`];
  if (Object.keys(tokens.light).length > 0) parts.push(`:root {\n${tokenLines(tokens.light)}\n}`);
  if (Object.keys(tokens.dark).length > 0) parts.push(`.dark {\n${tokenLines(tokens.dark)}\n}`);
  return `${parts.join("\n\n")}\n`;
}
