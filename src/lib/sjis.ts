// Shift_JIS エンコーダ。
// TextDecoder("shift_jis") で全 SJIS コードをデコードし、逆マップを実行時に構築する。
// (Web 標準の TextEncoder は UTF-8 のみのため)
let encodeTable: Map<string, number> | null = null;

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
