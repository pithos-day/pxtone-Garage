// クロック ↔ ピクセル変換・グリッド計算

export const ZOOM_TABLE = [24, 48, 96, 192] as const;
export const DIVI_TABLE = [1, 2, 3, 4, 6, 8, 12, 16, 24, 48] as const;

// 本家 ptCollage のピアノロール規則を再現
export const KEYNUM = 88; // コード 21..108
export const KEY_CODE_TOP = 108;
export const KEY_CODE_BOTTOM = 21;
export const KEY_HEIGHT = 16;

// code%12 がこの集合なら白鍵 (本家の描画規則を忠実に再現)
const WHITE_KEYS = new Set([0, 1, 3, 5, 7, 8, 10]);

export function isWhiteKey(code: number): boolean {
  return WHITE_KEYS.has(((code % 12) + 12) % 12);
}

// ピアノロールの行番号 (0=最上段) ベースの白鍵判定 (本家 if_KeyField の i%12 判定)
export function isWhiteRow(row: number): boolean {
  return WHITE_KEYS.has(((row % 12) + 12) % 12);
}

// ロー上のコード (0=最上段=コード108)
export function rowToCode(row: number): number {
  return KEY_CODE_TOP - row;
}

export function codeToRow(code: number): number {
  return KEY_CODE_TOP - code;
}

// ---- KEY イベント値 (0x8700 ベース) ↔ 行 ----
// 本家 ptCollage の生成式: value = 0x6C00 + 0x6000 - row*0x100 - EVENTDEFAULT_BASICKEY(0x4500)
//   = 0x8700 - row*0x100 (if_Cursor_KeyField.cpp)。KEY_CODE_TOP (108) ベースの
//   codeToRow/rowToCode (ピッチ番号用・マーカー/スクロール) とは別座標系なので注意。
export function rowToKeyValue(row: number): number {
  return 0x8700 - row * 0x100;
}

export function keyValueToRow(value: number): number {
  return (0x8700 - value) / 0x100;
}

export interface ClockView {
  beatClock: number;
  beatNum: number;
  zoom: number; // 1拍のピクセル幅
  measNum?: number; // グリッド描画範囲 (省略時は制限なし)
}

export function clockToX(view: ClockView, clock: number): number {
  return (clock / view.beatClock) * view.zoom;
}

export function xToClock(view: ClockView, x: number): number {
  return (x / view.zoom) * view.beatClock;
}

export function measOfClock(view: ClockView, clock: number): number {
  return Math.floor(clock / (view.beatClock * view.beatNum));
}

export function snapClock(view: ClockView, divi: number, clock: number): number {
  const unit = view.beatClock / divi;
  return Math.round(clock / unit) * unit;
}

export function clockToMeasBeatClock(view: ClockView, clock: number): [number, number, number] {
  const beatClock = view.beatClock;
  const m = Math.floor(clock / (beatClock * view.beatNum));
  const rem = clock - m * beatClock * view.beatNum;
  const b = Math.floor(rem / beatClock);
  const c = rem - b * beatClock;
  return [m, b, c];
}

export function formatClock(view: ClockView, clock: number): string {
  const [m, b, c] = clockToMeasBeatClock(view, clock);
  return `${m + 1}:${b + 1}:${c}`;
}

// 拍数を mm:ss 形式に (再生時間表示用)
export function beatsToTime(beat: number, beatTempo: number): string {
  const sec = (beat / beatTempo) * 60;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 10);
  return `${m}:${String(s).padStart(2, "0")}.${ms}`;
}
