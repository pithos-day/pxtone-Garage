// ピアノロール (KeyField) のノートとドラッグ中の表示の描画。座標はフィールド左端を 0 とする
import { EventKind, EVENTDEFAULT_KEY, EVENTDEFAULT_VELOCITY, EVENTDEFAULT_VOLUME, type EveRecord } from "pxtone-ts";
import { KEY_HEIGHT, clockToX, keyValueToRow, type ClockView } from "./clock";
import { fillRect } from "./draw";
import { iterNoteDraws, visibleClockWindow } from "./records";
import { shiftKeyValue, smartPlacement, type SmartDrag, type SmartNote, type SmartNoteEvent } from "./smart-note";
import { COLORS, getUnitColor } from "./theme";

// フィールド描画コンテキスト (draw で共通。w は鍵盤ストリップを除いた幅)
export interface FieldCtx {
  w: number;
  top: number;
  h: number;
  view: ClockView;
  scrollX: number; // 横スクロール (px)
  scrollY: number; // 縦スクロール (px)
}

// 矩形選択の枠 (キャンバス px)
export interface Marquee {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// 選択中のノートのグループ移動
export interface GroupDrag {
  notes: { note: SmartNote; evs: SmartNoteEvent[] }[];
  offset: number; // 時間の移動量 (クロック)
  rowDelta: number; // 音程の移動量 (行)
  lastRow: number; // 直前のポインタの行 (移動判定用)
}

// ノートの横棒。行 y は中央の座標、head を指定すると先頭の目印も描く
function fillNoteBar(ctx: CanvasRenderingContext2D, x1: number, x2: number, y: number, color: string, head = false): void {
  fillRect(ctx, x1, y - 3, x2 - x1, 7, color);
  if (head) fillRect(ctx, x1, y - 3, 2, 7, COLORS.noteHead);
}

export function drawNotes(
  ctx: CanvasRenderingContext2D,
  records: EveRecord[],
  unitNo: number,
  field: FieldCtx,
  isFocus: boolean,
  playClock: number,
  hideSpans?: readonly { head: number; end: number }[], // ドラッグ中に隠すノートの範囲
): void {
  const { w, top: fieldTop, h: fieldH, view, scrollX, scrollY } = field;
  const { startClock, endClock } = visibleClockWindow(view, scrollX, w);

  const color = getUnitColor(unitNo);

  // クリップ (translate 後の座標系なので 0..w がフィールド幅)
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, fieldTop, w, fieldH);
  ctx.clip();
  // 非フォーカスユニットは半透明 (色分けして重ねて表示)
  if (!isFocus) ctx.globalAlpha = 0.45;

  // ON/KEY イベント列 → 描画レコード変換は lib/records の iterNoteDraws
  for (const d of iterNoteDraws(records, unitNo, { startClock, endClock }, EVENTDEFAULT_KEY)) {
    if (hideSpans?.some((span) => d.clock >= span.head && d.clock < span.end)) continue;
    if (d.kind === "key") {
      // KEY: 縦線 + 点
      const row = keyValueToRow(d.key);
      const y = fieldTop + row * KEY_HEIGHT - scrollY + KEY_HEIGHT / 2;
      const x = clockToX(view, d.clock) - scrollX;
      fillRect(ctx, x - 1, y - 4, 2, 8, COLORS.noteHead);
      fillRect(ctx, x - 1, y - 4, 2, 2, COLORS.noteHead);
      continue;
    }
    const row = keyValueToRow(d.key);
    const y = fieldTop + row * KEY_HEIGHT - scrollY + KEY_HEIGHT / 2;
    const x1 = clockToX(view, Math.max(startClock, d.clock)) - scrollX;
    const x2 = clockToX(view, Math.min(endClock, d.clock + d.len)) - scrollX;
    if (x2 <= x1) continue;
    if (d.kind === "off") {
      fillRect(ctx, x1, y - 1, x2 - x1, 2, color.shadow(false, EVENTDEFAULT_VELOCITY, EVENTDEFAULT_VOLUME));
    } else {
      const playing = playClock >= d.clock && playClock < d.clock + d.len;
      fillNoteBar(ctx, x1, x2, y, color.note(playing, EVENTDEFAULT_VELOCITY, EVENTDEFAULT_VOLUME), true);
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// 選択中のノートの枠 (グループ移動中は移動先に描く)
export function drawNoteSelection(
  ctx: CanvasRenderingContext2D,
  field: FieldCtx,
  unitNo: number,
  notes: readonly SmartNote[],
  group: GroupDrag | null,
): void {
  if (notes.length === 0) return;
  const { w, top, h, view, scrollX, scrollY } = field;
  const offset = group?.offset ?? 0;
  const rowDelta = group?.rowDelta ?? 0;
  const moved = offset !== 0 || rowDelta !== 0;
  const color = getUnitColor(unitNo);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, w, h);
  ctx.clip();
  ctx.strokeStyle = COLORS.focusOrange;
  ctx.lineWidth = 1;
  for (const n of notes) {
    const x1 = clockToX(view, n.head + offset) - scrollX;
    const x2 = Math.max(x1 + 1, clockToX(view, n.end + offset) - scrollX);
    const y = top + (keyValueToRow(n.key) + rowDelta) * KEY_HEIGHT - scrollY + KEY_HEIGHT / 2;
    if (moved) {
      ctx.globalAlpha = 0.75;
      fillNoteBar(ctx, x1, x2, y, color.note(false, EVENTDEFAULT_VELOCITY, EVENTDEFAULT_VOLUME));
      ctx.globalAlpha = 1;
    }
    ctx.strokeRect(x1 - 0.5, y - 3.5, x2 - x1 + 1, 8);
  }
  ctx.restore();
}

// 矩形選択の枠 (座標はキャンバス px。呼び出し時はフィールド座標系に translate 済み)
export function drawMarquee(ctx: CanvasRenderingContext2D, m: Marquee, stripW: number): void {
  ctx.save();
  ctx.strokeStyle = COLORS.focusOrange;
  ctx.lineWidth = 1;
  ctx.strokeRect(Math.min(m.x1, m.x2) - stripW + 0.5, Math.min(m.y1, m.y2) + 0.5, Math.abs(m.x2 - m.x1), Math.abs(m.y2 - m.y1));
  ctx.restore();
}

// pen / スマート書き込みドラッグの確定前ノート (ゴースト) 描画。
// ドラッグ中はイベント列を触らないため、[押下..現在] の範囲に置くノートを予告として描く
export function drawNoteGhost(
  ctx: CanvasRenderingContext2D,
  field: FieldCtx,
  unitNo: number,
  c1: number,
  c2: number,
  row: number,
): void {
  const color = getUnitColor(unitNo);
  const { w, top, h, view, scrollX, scrollY } = field;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, w, h);
  ctx.clip();
  // 確定前の目印として半透明で描く
  ctx.globalAlpha = 0.75;
  const x1 = clockToX(view, c1) - scrollX;
  const x2 = Math.max(x1 + 1, clockToX(view, c2) - scrollX);
  const y = top + row * KEY_HEIGHT - scrollY + KEY_HEIGHT / 2;
  fillNoteBar(ctx, x1, x2, y, color.note(false, EVENTDEFAULT_VELOCITY, EVENTDEFAULT_VOLUME), true);
  ctx.restore();
}

// スマートドラッグのゴースト (確定後の配置) 描画。
// 配置 (head/len/KEY 値) は lib/smart-note の smartPlacement を commitSmartDrag と共有する
export function drawSmartGhost(
  ctx: CanvasRenderingContext2D,
  field: FieldCtx,
  unitNo: number,
  st: SmartDrag,
  dragClock2: number,
  grid: number,
): void {
  const note = st.note;
  const place = smartPlacement(st, dragClock2, grid);
  if (!note || !place) return;
  const color = getUnitColor(unitNo);
  const { w, top, h, view, scrollX, scrollY } = field;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, w, h);
  ctx.clip();
  // 確定前の目印として半透明で描く
  ctx.globalAlpha = 0.75;
  const row = keyValueToRow(place.rowKey);
  const x1 = clockToX(view, place.head) - scrollX;
  const x2 = Math.max(x1 + 1, clockToX(view, place.head + place.len) - scrollX);
  const y = top + row * KEY_HEIGHT - scrollY + KEY_HEIGHT / 2;
  fillNoteBar(ctx, x1, x2, y, color.note(false, EVENTDEFAULT_VELOCITY, EVENTDEFAULT_VOLUME), true);
  // 掴みで動くノート内部の KEY 目印 (端の調整では位置を変えない)。
  // 移動量は配置と同じ値を使い、確定後の位置とずれないようにする
  const grab = st.mode === "grab";
  const offset = place.head - note.head;
  for (const ev of st.evs) {
    if (ev.kind !== EventKind.KEY || ev.clock === note.head) continue;
    const evRow = keyValueToRow(grab ? shiftKeyValue(ev.value, st.rowDelta) : ev.value);
    const evClock = ev.clock + (grab ? offset : 0);
    if (evClock < place.head || evClock >= place.head + place.len) continue;
    fillRect(ctx, clockToX(view, evClock) - scrollX - 1, top + evRow * KEY_HEIGHT - scrollY + KEY_HEIGHT / 2 - 4, 2, 8, COLORS.noteHead);
  }
  ctx.restore();
}
