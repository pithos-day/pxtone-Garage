// Shift_JIS エンコーダ。
// TextDecoder("shift_jis") で全 SJIS コードをデコードし、逆マップを実行時に構築する。
// (Web 標準の TextEncoder は UTF-8 のみのため)
let encodeTable: Map<string, number> | null = null;

// CP932 には存在するが WHATWG の shift_jis 逆引き表では引けない記号 (JIS X 0208 のコードで書く)。
// Windows の CP932 では全角形 (U+FF5E など) として扱われるため、本家の往復と一致する
const CP932_EXTRA: ReadonlyArray<readonly [string, number]> = [
  ["\u00a2", 0x8191], // ¢ (CP932 では U+FFE0 の位置)
  ["\u00a3", 0x8192], // £ (同 U+FFE1)
  ["\u00ac", 0x81ca], // ¬ (同 U+FFE2)
  ["\u2016", 0x8161], // ‖ (同 U+2225)
  ["\u2212", 0x817c], // − (同 U+FF0D)
  ["\u301c", 0x8160], // 〜 (同 U+FF5E)。日本語入力で頻出
];

function buildTable(): void {
  const decoder = new TextDecoder("shift_jis");
  const map = new Map<string, number>();
  const add = (hi: number, lo: number): void => {
    const s = decoder.decode(new Uint8Array([hi, lo]));
    if (s.length === 1 && s !== "\uFFFD") map.set(s, (hi << 8) | lo);
  };
  // 2バイト領域 (JIS X 0208)
  for (let hi = 0x81; hi <= 0x9f; hi++) {
    for (let lo = 0x40; lo <= 0xfc; lo++) add(hi, lo);
  }
  for (let hi = 0xe0; hi <= 0xef; hi++) {
    for (let lo = 0x40; lo <= 0xfc; lo++) add(hi, lo);
  }
  // 半角カナ
  for (let b = 0xa1; b <= 0xdf; b++) {
    const s = decoder.decode(new Uint8Array([b]));
    if (s.length === 1 && s !== "\uFFFD") map.set(s, b);
  }
  // CP932 の記号のうち、WHATWG の復号表 (shift_jis) からは逆引きできない文字。
  // 本家は WideCharToMultiByte(CP932) で書き出すため、これらも JIS X 0208 側の
  // コードで書けるようにしておく (既存の対応は上書きしない)
  for (const [ch, code] of CP932_EXTRA) {
    if (!map.has(ch)) map.set(ch, code);
  }
  encodeTable = map;
}

// 文字列を Shift_JIS バイト列へ。変換できない文字は '?' (0x3F) に置換
export function encodeShiftJis(text: string): Uint8Array {
  if (!encodeTable) buildTable();
  const out: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code < 0x80) {
      out.push(code);
      continue;
    }
    const sjis = encodeTable!.get(ch);
    if (sjis !== undefined) {
      if (sjis < 0x100) out.push(sjis);
      else {
        out.push(sjis >> 8);
        out.push(sjis & 0xff);
      }
    } else {
      out.push(0x3f);
    }
  }
  return new Uint8Array(out);
}

// Shift_JIS バイト列を max バイト以内に切り詰める。
// 2 バイト文字 (0x81-0x9F / 0xE0-0xEF が先頭) の途中で切らない
// (本家 pxShiftJIS_check_size 相当)
export function truncateShiftJis(bytes: Uint8Array, max: number): Uint8Array {
  let size = 0;
  while (size < bytes.length && size < max) {
    const b = bytes[size]!;
    const width = (b >= 0x81 && b <= 0x9f) || (b >= 0xe0 && b <= 0xef) ? 2 : 1;
    if (size + width > max) break;
    size += width;
  }
  return bytes.subarray(0, size);
}
