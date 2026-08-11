// テーマ色の定義。Canvas 描画用の COLORS は src/theme/*.css が定義する
// CSS 変数 (shadcn 形式) から読み取る。テーマ切替時は syncThemeColors() を呼ぶ。
import { reactive } from "vue";
import { EVENTDEFAULT_VELOCITY, EVENTDEFAULT_VOLUME, WoiceType } from "pxtone-ts";

// Canvas 用の色。apply 時に CSS 変数から取り込まれる (テーマ非依存の
// ユニット7色は除く)。reactive なので書き換えが描画処理に伝わる。
export const COLORS = reactive({
  bg: "",
  panel: "",
  panelDark: "",
  panelLight: "",
  border: "",
  borderLight: "",
  text: "",
  textBright: "",
  textDim: "",
  accent: "",
  accentDark: "",
  danger: "",
  playhead: "",
  measureLine: "",
  beatLine: "",
  diviLine: "",
  measureBox: "",
  measureText: "",
  scope: "",
  scopeBorder: "",
  scopeFaint: "",
  fieldBg: "",
  unitRowBg: "",
  rowWhite: "",
  rowBlack: "",
  zebra: "",
  scaleLine: "",
  whiteKey: "",
  blackKey: "",
  keyEdge: "",
  focusOrange: "",
  focusText: "",
  focusRow: "",
  muted: "",
  rulerBg: "",
  headerBg: "",
  octaveText: "",
  noteHead: "",
  repeatMark: "",
  lastMark: "",
});

// <html> の data-theme / .dark に対応する CSS 変数を COLORS へ取り込む
export function syncThemeColors(): void {
  if (typeof document === "undefined") return;
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string): string => cs.getPropertyValue(name).trim();
  const bg = v("--background");
  const fg = v("--foreground");
  const primary = v("--primary");
  const border = v("--border");
  const destructive = v("--destructive");
  const mix = (a: string, b: string, pa: number): string =>
    `color-mix(in srgb, ${a} ${Math.round(pa * 100)}%, ${b})`;
  const alpha = (a: string, pa: number): string =>
    `color-mix(in srgb, ${a} ${Math.round(pa * 100)}%, transparent)`;
  COLORS.bg = bg;
  COLORS.panel = v("--card");
  COLORS.panelDark = v("--muted");
  COLORS.panelLight = v("--secondary");
  COLORS.border = border;
  COLORS.borderLight = border;
  COLORS.text = v("--muted-foreground");
  COLORS.textBright = fg;
  COLORS.textDim = v("--muted-foreground");
  COLORS.accent = primary;
  COLORS.accentDark = mix(primary, bg, 75);
  COLORS.danger = destructive;
  COLORS.playhead = v("--canvas-playhead");
  COLORS.measureLine = v("--canvas-measure-line");
  COLORS.beatLine = v("--canvas-beat-line");
  COLORS.diviLine = v("--canvas-divi-line");
  COLORS.measureBox = v("--canvas-measure-box");
  COLORS.measureText = v("--canvas-measure-text");
  COLORS.scope = v("--canvas-scope");
  COLORS.scopeBorder = v("--canvas-scope-border");
  COLORS.scopeFaint = v("--canvas-scope-faint");
  COLORS.fieldBg = v("--canvas-field-bg");
  COLORS.rowWhite = v("--canvas-row-white");
  COLORS.rowBlack = v("--canvas-row-black");
  COLORS.zebra = v("--canvas-zebra");
  COLORS.scaleLine = v("--canvas-scale-line");
  COLORS.whiteKey = v("--canvas-white-key");
  COLORS.blackKey = v("--canvas-black-key");
  COLORS.keyEdge = v("--canvas-key-edge");
  COLORS.focusOrange = v("--canvas-focus");
  COLORS.focusText = v("--canvas-focus");
  COLORS.focusRow = alpha(primary, 15);
  COLORS.muted = v("--canvas-muted");
  COLORS.rulerBg = v("--canvas-ruler-bg");
  COLORS.headerBg = v("--canvas-ruler-bg");
  COLORS.octaveText = v("--canvas-octave-text");
  COLORS.noteHead = v("--canvas-note-head");
  COLORS.repeatMark = destructive;
  COLORS.lastMark = primary;
}

// ユニット7色 (ptweb colors.js の note/key 3色) — アイデンティティ色のためテーマ非依存
export const UNIT_COLORS: { note: string[]; key: string[] }[] = [
  { note: ["#F08000", "#FFFF00", "#FFFF80"], key: ["#C06000", "#F08000", "#FFC400"] },
  { note: ["#FF775D", "#FFC39C", "#FFEDD9"], key: ["#D82E2E", "#FF775D", "#FFC39C"] },
  { note: ["#FC32CB", "#FFA9FF", "#FFE0FF"], key: ["#DF0083", "#FF4CD4", "#FFA9FF"] },
  { note: ["#6979FF", "#B4C9FF", "#D9E8FF"], key: ["#483EFF", "#6979FF", "#B4C9FF"] },
  { note: ["#00BDFF", "#CFE8FF", "#90FFFF"], key: ["#0093C6", "#00BDFF", "#CFE8FF"] },
  { note: ["#00C060", "#31FF98", "#C5FFE2"], key: ["#008041", "#00C060", "#00E874"] },
  { note: ["#5BB308", "#96FF33", "#DAFFB8"], key: ["#479100", "#5BB308", "#96FF33"] },
];

function fromHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const v = parseInt(h, 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function lerp(a: [number, number, number], b: [number, number, number], p: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * p, a[1] + (b[1] - a[1]) * p, a[2] + (b[2] - a[2]) * p];
}

function rgb(rgb: [number, number, number], a = 1): string {
  return `rgba(${Math.round(rgb[0])},${Math.round(rgb[1])},${Math.round(rgb[2])},${a})`;
}

export interface NoteColorGen {
  // playing: 発音中か、vel: ベロシティ(0..128), vol: 音量(0..128)
  note(playing: boolean, vel: number, vol: number): string;
  shadow(playing: boolean, vel: number, vol: number): string;
}

// 色の明度計算 (non-playing は暗色、playing は vel/vol に応じて明色側へ補間)
// 0.15 は最低明度、0.85 はベロシティが明度に寄与する割合。
// 色は (暗, 中, 明) の 3 段
function noteColor(c: [number, number, number][], playing: boolean, vel: number, vol: number): string {
  const [base, mid, hi] = c;
  if (!playing) return rgb(base);
  const velRatio = vel / EVENTDEFAULT_VELOCITY;
  const volRatio = vol / EVENTDEFAULT_VOLUME;
  const bright = Math.min((0.15 + 0.85 * velRatio) * volRatio, 1);
  if (bright < 1) return rgb(lerp(base, mid, bright));
  // 既定値 (MAX vel/vol) を超える分を基準に、最明色への補間割合を決める
  // (128 は MIDI 値の上限。既定の組み合わせが「標準の明るさ」を表す)
  const defP = (EVENTDEFAULT_VELOCITY * EVENTDEFAULT_VOLUME) / 128 / 128;
  const rawP = (vel * vol) / 128 / 128;
  const beyond = Math.max(0, (rawP - defP) / (1 - defP));
  return rgb(lerp(mid, hi, beyond));
}

export function getUnitColor(unitNo: number): NoteColorGen {
  const cs = UNIT_COLORS[((unitNo % 7) + 7) % 7]!;
  const solid = (which: "note" | "key") => {
    const c = cs[which].map(fromHex);
    return (playing: boolean, vel: number, vol: number): string => noteColor(c, playing, vel, vol);
  };
  return { note: solid("note"), shadow: solid("key") };
}

// 音色タイプ別の表示色 (W モードのトレイ用) — 本家のパレット (COLORINDEX_font_*) 準拠
export function woiceTypeColor(type: number): string {
  switch (type) {
    case WoiceType.PCM:
      return "#F9F4F1";
    case WoiceType.PTV:
      return "#FFFF80";
    case WoiceType.PTN:
      return "#D0D0FF";
    case WoiceType.OGGV:
      return "#FFDD66";
    default:
      return "#808080";
  }
}
