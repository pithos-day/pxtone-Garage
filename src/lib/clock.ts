// クロック ↔ ピクセル変換・グリッド計算

// ズームは 1 拍あたりのピクセル幅。メニューのプリセットは ZOOM_TABLE に残し、
// ホイールでは ZOOM_MIN..ZOOM_MAX の範囲で連続的に変化させる
export const ZOOM_TABLE = [24, 48, 96, 192] as const;
export const ZOOM_MIN = 8;
export const ZOOM_MAX = 512;

// ズーム倍率を有効範囲へ丸める (0 除算・NaN を避ける)。
// 表示や保存を考えて小数 2 桁までに揃える
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return ZOOM_TABLE[1];
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) * 100) / 100;
}

export const DIVI_TABLE = [1, 2, 3, 4, 6, 8, 12, 16, 24, 48] as const;

// 本家 ptCollage のピアノロール規則を再現
export const KEYNUM = 88; // コード 21..108
export const KEY_CODE_TOP = 108;
export const KEY_CODE_BOTTOM = 21;
export const KEY_HEIGHT = 16;

// code%12 がこの集合なら白鍵 (本家の描画規則を忠実に再現)
// 行番号 (row) とコード (code) は 108 差だが mod 12 では一致するため、
// ピアノロールの行ベース判定もこの関数をそのまま使う
const WHITE_KEYS = new Set([0, 1, 3, 5, 7, 8, 10]);

export function isWhiteKey(code: number): boolean {
  return WHITE_KEYS.has(((code % 12) + 12) % 12);
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

// 小節:拍:クロック (meas/beat は 1-based UI 値) → クロック。範囲外は 1/1/0 にクランプ
export function measBeatClockToClock(view: ClockView, meas: number, beat: number, clock: number): number {
  return (Math.max(1, meas) - 1) * view.beatNum * view.beatClock + (Math.max(1, beat) - 1) * view.beatClock + Math.max(0, clock);
}

export function formatClock(view: ClockView, clock: number): string {
  const [m, b, c] = clockToMeasBeatClock(view, clock);
  return `${m + 1}:${b + 1}:${c}`;
}

// 小節番号 (0-based) → その小節の開始クロック
export function measStartClock(view: ClockView, meas: number): number {
  return meas * view.beatNum * view.beatClock;
}

// 秒 → mm:ss (再生時間表示用)
export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const ss = Math.floor(sec % 60);
  return `${m}:${String(ss).padStart(2, "0")}`;
}
