// ptweb / 本家ピストンコラージュの配色を踏襲したダークテーマ定義
import { EVENTDEFAULT_VELOCITY, EVENTDEFAULT_VOLUME, WoiceType } from "pxtone-ts";

export const BGCOLOR = "#000010";

export const COLORS = {
  bg: BGCOLOR,
  panel: "#14142a",
  panelDark: "#0c0c1e",
  panelLight: "#1e1e38",
  border: "#343255",
  borderLight: "#69656d",
  text: "#9d9784",
  textBright: "#d8d2b8",
  textDim: "#6a6574",
  accent: "#00F080",
  accentDark: "#009c50",
  danger: "#f00",
  playhead: "#ffffff",
  measureLine: "rgba(240,240,240,0.35)",
  beatLine: "rgba(128,128,128,0.16)",
  diviLine: "rgba(128,128,128,0.07)",
  measureBox: "#606060",
  scope: "rgba(0,240,128,0.35)",
  scopeBorder: "#00f080",
  fieldBg: "#101020",
  unitRowBg: "#400070",
  whiteKey: "#404040",
  blackKey: "#202020",
  keyEdge: "#000000",
  focusOrange: "#f08000",
  focusText: "#f08000",
  muted: "#202028",
  rulerBg: "#181830",
  headerBg: "#0e0e20",
} as const;

// ユニット7色 (ptweb colors.js の note/key 3色)
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

export function getUnitColor(unitNo: number): NoteColorGen {
  const cs = UNIT_COLORS[((unitNo % 7) + 7) % 7]!;
  const solid = (which: "note" | "key") => {
    const c = cs[which].map(fromHex) as [number, number, number][];
    return (playing: boolean, vel: number, vol: number): string => {
      if (!playing) return rgb(c[0]!);
      let p = Math.min((0.15 + (0.85 * vel) / EVENTDEFAULT_VELOCITY) * (vol / EVENTDEFAULT_VOLUME), 1);
      if (p < 1) return rgb(lerp(c[0]!, c[1]!, p));
      const defP = (EVENTDEFAULT_VELOCITY * EVENTDEFAULT_VOLUME) / 128 / 128;
      const rawP = (vel * vol) / 128 / 128;
      p = Math.max(0, (rawP - defP) / (1 - defP));
      return rgb(lerp(c[1]!, c[2]!, p));
    };
  };
  return { note: solid("note"), shadow: solid("key") };
}

// 音色タイプ別の表示色 (W モードのトレイ用)
export function woiceTypeColor(type: number): string {
  switch (type) {
    case WoiceType.PCM:
      return "#00BDFF";
    case WoiceType.PTV:
      return "#FF775D";
    case WoiceType.PTN:
      return "#00C060";
    case WoiceType.OGGV:
      return "#FFC400";
    default:
      return "#808080";
  }
}
