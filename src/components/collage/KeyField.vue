// ピアノロール (K モード)
// 左ドラッグ: 音符 (KEY+ON+VELOCITY) 生成、右ドラッグ: 削除、鍵盤クリック: 試聴
// スマートツール: 空き地で書き込み / ノートを掴んで移動 / 左端で開始・右端で終了を調整
// (ドラッグ中はプレビュー (ゴースト) 表示のみで、イベントは離したときに 1 回書き換える)
// pen の左ドラッグ (音符生成) も同様に確定までプレビュー表示する
// 行 → コード: row = 108 - code、イベント値: value = 0x8700 - row*0x100 (本家準拠)
<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import { useCanvas } from "../../composables/useCanvas";
import { useCanvasDrag } from "../../composables/useCanvasDrag";
import { useHoldPreview } from "../../composables/useHoldPreview";
import { COLORS } from "../../lib/theme";
import { drawGrid, fillRect, fillText, drawPlayhead, drawScopeBand,
} from "../../lib/draw";
import { clockAtX, zoomOrPan } from "../../lib/field";
import { visibleClockWindow, iterNoteDraws } from "../../lib/records";
import {
  clockToX,
  KEY_HEIGHT,
  KEYNUM,
  isWhiteKey,
  codeToRow,
  rowToKeyValue,
  keyValueToRow,
} from "../../lib/clock";
import { EventKind } from "pxtone-ts";
import { writeNote, eraseNote, dropShortPrevNote, paintKeyDrag } from "../../lib/editing";
import {
  smartPlacement,
  commitSmartDrag,
  clampSmartOffset,
  shiftKeyValue,
  type SmartDrag,
  type SmartMode,
  type SmartNote,
} from "../../lib/smart-note";
import { STRIP_W } from "../../lib/layout";
import {
  doc,
  getService,
  clockContext,
  projectWriteOps,
  pianoRollUnits,
  mutate,
  EVENTDEFAULT_VELOCITY,
  EVENTDEFAULT_VOLUME,
  EVENTDEFAULT_KEY,
} from "../../state/project";
import { currentClock, seekToClock, isPlaying as isPlayingNow } from "../../state/player";
import { previewUnitHold } from "../../engine/preview";
import { getUnitColor } from "../../lib/theme";

// 鍵盤ストリップの幅。ピアノ風の単音プレビュー領域で、左パネル (300px) の右に置く。
// 本家 144px から半分以下に縮小 (lib/layout.ts の STRIP_W)
const canvasRef = ref<HTMLCanvasElement | null>(null);

// スマートプレビューの再描画要求。ドラッグ中はイベント列が変わらず doc.rev が
// 動かないため、ゴースト描画の更新をこれで通知する
const previewRev = ref(0);

// フォーカスユニットの音域を画面中央に (本家の ResetScroll/JustScroll 相当)
function centerScroll(): void {
  const s = getService();
  let row = 39; // 既定キー 0x6000 の行
  if (s && doc.focusUnit >= 0) {
    const u = s.unitGet(doc.focusUnit);
    const vc = u?.woice?.getVoice(0);
    if (vc) row = codeToRow(vc.basicKey >> 8);
  }
  const fieldH = canvasRef.value?.clientHeight ?? 600;
  const visible = Math.max(1, Math.ceil(fieldH / KEY_HEIGHT));
  doc.scrollYKey = Math.max(0, Math.min(KEYNUM - 1, row - Math.floor(visible / 2)));
}

onMounted(centerScroll);
watch(() => doc.focusUnit, centerScroll);

useCanvas(
  canvasRef,
  (ctx, w, h) => draw(ctx, w, h),
  [
    () => doc.rev,
    () => doc.scrollX,
    () => doc.scrollYKey,
    () => doc.zoom,
    () => doc.divi,
    () => doc.focusUnit,
    () => currentClock.value,
    () => doc.tool,
    () => doc.scope1,
    () => doc.scope2,
    () => previewRev.value,
  ],
);

function draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = getService();
  if (!s) return;
  const view = clockContext();
  const scrollX = doc.scrollX;
  const fieldW = w - STRIP_W; // フィールド幅 (鍵盤ストリップの右側)

  const fieldTop = 0;
  const fieldH = h - fieldTop;
  const scrollY = doc.scrollYKey * KEY_HEIGHT;
  const startRow = Math.floor(scrollY / KEY_HEIGHT);
  const endRow = Math.min(KEYNUM - 1, startRow + Math.ceil(fieldH / KEY_HEIGHT));
  const focus = doc.focusUnit;

  // 鍵盤ストリップ (画面左端) の背景
  fillRect(ctx, 0, fieldTop, STRIP_W, fieldH, COLORS.panelDark);

  // フィールド (グリッド・ノート・スコープ・プレイヘッド) は鍵盤ストリップの右側に描画
  ctx.save();
  ctx.translate(STRIP_W, 0);

  // フィールド背景 + グリッド (拍・小節線)。ルーラー帯は PlayField が担当
  drawGrid(ctx, { w: fieldW, h, scrollX, view, top: fieldTop, bottom: h, showNumber: false });

  // フィールド側の行色 (鍵盤の白鍵/黒鍵に合わせた縞)
  for (let row = startRow; row <= endRow; row++) {
    const y = fieldTop + row * KEY_HEIGHT - scrollY;
    const white = isWhiteKey(row);
    fillRect(ctx, 0, y, fieldW, KEY_HEIGHT, white ? COLORS.rowWhite : COLORS.rowBlack);
  }

  // グリッド線を行色の上に再描画 (行色に覆われないように)
  drawGrid(ctx, { w: fieldW, h, scrollX, view, top: fieldTop, bottom: h, showNumber: false, fillBackground: false });

  // イベント (フォーカス + 表示 + ピン留めユニットを色分け表示)
  const rollUnits = pianoRollUnits();
  const field = { w: fieldW, top: fieldTop, h: fieldH, view, scrollX, scrollY };
  // スマートドラッグ中は対象ノートの実描画を隠し、確定後の配置をゴーストで示す
  const dv = dragState.value;
  const smartDrag = dv?.smart && dv.smart.mode !== "write" ? dv : null;
  // pen / スマート書き込みの確定前ノート (ゴースト)。
  // スマートの掴み / 端調整は対象ノートのゴースト (smartDrag) で見せるため、
  // 書き込みゴーストを重ねない (新規ノートが同時に書かれているように見える)
  const writeGhost = dv && !smartDrag && !doc.readOnly && dv.button === 0 && dv.clock2 !== dv.clock1 && doc.tool !== "hand" ? dv : null;
  for (const u of rollUnits) {
    const hide = u === focus ? (smartDrag?.smart?.note ?? undefined) : undefined;
    drawNotes(ctx, s, u, field, u === focus, hide);
  }
  if (smartDrag?.smart?.note) drawSmartGhost(ctx, smartDrag, field, focus);
  if (writeGhost) drawNoteGhost(ctx, writeGhost, field, focus);

  // スコープ帯
  if (doc.scope2 > doc.scope1) {
    const x1 = clockToX(view, doc.scope1) - scrollX;
    const x2 = clockToX(view, doc.scope2) - scrollX;
    drawScopeBand(ctx, x1, x2, fieldTop, fieldH, COLORS.scopeFaint);
  }

  // プレイヘッド
  if (isPlayingNow.value) {
    drawPlayhead(ctx, clockToX(view, currentClock.value) - scrollX, fieldW, h);
  }

  ctx.restore();

  // 鍵盤行 (ストリップ側) — フィールドのグリッドを覆う
  for (let row = startRow; row <= endRow; row++) {
    const y = fieldTop + row * KEY_HEIGHT - scrollY;
    const white = isWhiteKey(row);
    fillRect(ctx, 0, y, STRIP_W, KEY_HEIGHT, white ? COLORS.whiteKey : COLORS.blackKey);
  }

  // オクターブラベル (行 12*i に "7-i")
  for (let i = 0; i <= 8; i++) {
    const y = fieldTop + i * (KEY_HEIGHT * 12) - scrollY + 4;
    if (y >= fieldTop - 12 && y <= fieldTop + fieldH + 4) {
      fillText(ctx, String(7 - i), 6, y, COLORS.octaveText, 11);
    }
  }

  // 基本キーマーカー (フォーカスユニットの音色)
  const unit = focus >= 0 ? s.unitGet(focus) : null;
  if (unit?.woice) {
    const vc = unit.woice.getVoice(0);
    if (vc) {
      const basicRow = codeToRow(vc.basicKey >> 8);
      const y = fieldTop + basicRow * KEY_HEIGHT - scrollY + KEY_HEIGHT / 2;
      if (y > fieldTop && y < fieldTop + fieldH) {
        fillRect(ctx, STRIP_W - 16, y - 1, 16, 2, COLORS.focusOrange);
      }
    }
  }
}

// フィールド描画コンテキスト (draw で共通。w は鍵盤ストリップを除いた幅)
interface FieldCtx {
  w: number;
  top: number;
  h: number;
  view: ReturnType<typeof clockContext>;
  scrollX: number; // 横スクロール (px)
  scrollY: number; // 縦スクロール (px)
}

function drawNotes(
  ctx: CanvasRenderingContext2D,
  s: NonNullable<ReturnType<typeof getService>>,
  unitNo: number,
  field: FieldCtx,
  isFocus: boolean,
  hideSpan?: { head: number; end: number }, // スマートドラッグ中に隠すノートの範囲
): void {
  const { w, top: fieldTop, h: fieldH, view, scrollX, scrollY } = field;
  const records = s.evels.records;
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
    if (hideSpan && d.clock >= hideSpan.head && d.clock < hideSpan.end) continue;
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
      const playing = currentClock.value >= d.clock && currentClock.value < d.clock + d.len;
      fillRect(ctx, x1, y - 3, x2 - x1, 7, color.note(playing, EVENTDEFAULT_VELOCITY, EVENTDEFAULT_VOLUME));
      // ヘッド
      fillRect(ctx, x1, y - 3, 2, 7, COLORS.noteHead);
    }
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

// ---- ポインタ ----
// ドラッグの骨格 (pointerdown/move/up + キャプチャ + undo) は useCanvasDrag が担当し、
// 鍵盤試聴・イベント書き換え・クリックシークのみを注入する

// スマートツールのドラッグ状態。配置計算と確定は lib/smart-note が持ち、
// ここでは lastDelta (押下中サステインの再試聴判定) だけを UI 用に足す
interface SmartState extends SmartDrag {
  lastDelta: number; // 直前の rowDelta (試聴の再トリガ判定用)
}

type KeyDrag = {
  button: number;
  clock1: number;
  clock2: number;
  row: number;
  // スマートツール専用の状態 (pen/hand では省略)
  smart?: SmartState;
  // 手ツールが左端に挿した KEY のクロック。ドラッグで左端が動くたびに
  // 前の挿入 KEY を外して挿し直す (lib/editing の paintKeyDrag が更新する)
  insertedKeyClock?: number;
};

// 今のグリッド幅 (divi で拍を分割したクロック数)
function beatGrid(): number {
  return Math.max(1, Math.round(clockContext().beatClock / doc.divi));
}

// フィールド内の x → clock。フィールドは鍵盤ストリップ (STRIP_W) の右から始まる
function clockAt(x: number): number {
  return clockAtX(clockContext(), doc.divi, doc.scrollX, x, STRIP_W);
}

function rowAt(y: number): number {
  return Math.floor(y / KEY_HEIGHT) + Math.floor(doc.scrollYKey);
}

// 押下中サステインで試聴開始 (pointerup まで鳴り続ける)
const hold = useHoldPreview();
function previewAt(y: number): void {
  const s = getService();
  if (!s) return;
  const focus = doc.focusUnit;
  if (focus < 0) return;
  const row = Math.max(0, Math.min(KEYNUM - 1, rowAt(y)));
  const value = rowToKeyValue(row);
  hold.onPress();
  previewUnitHold(focus, value, EVENTDEFAULT_VELOCITY);
}

// 押下位置 (clock, row) が重なる描画ノート (ON) を探す。
// 重なるもののうち records 上で最も後ろにあるもの (見た目で上に重なっているもの) を返す
function noteAt(u: number, clock: number, row: number): SmartNote | null {
  const s = getService();
  if (!s) return null;
  let hit: SmartNote | null = null;
  for (const d of iterNoteDraws(s.evels.records, u, { startClock: 0, endClock: Number.MAX_SAFE_INTEGER }, EVENTDEFAULT_KEY)) {
    if (d.kind !== "on") continue;
    if (clock < d.clock || d.clock + d.len <= clock) continue;
    if (keyValueToRow(d.key) !== row) continue;
    hit = { head: d.clock, end: d.clock + d.len, key: d.key };
  }
  return hit;
}

// スマートツールの端判定幅 (CSS px)。端からこれ以内は端の調整、それ以外は掴み。
// グリッド基準の端判定だと書き込み 1 つ分の短いノートで端が掴めないため px 基準にする
const EDGE_PX = 8;

// 押下 x (キャンバス px) で掴み / 開始 / 終了を決める。
// ノート幅が端判定幅以下の短いノートは左右半分で開始/終了を分ける
function smartModeAt(note: SmartNote, x: number): SmartMode {
  const view = clockContext();
  const leftPx = clockToX(view, note.head) - doc.scrollX;
  const rightPx = clockToX(view, note.end) - doc.scrollX;
  const fx = x - STRIP_W;
  if (rightPx - leftPx <= EDGE_PX * 2) {
    return fx < (leftPx + rightPx) / 2 ? "head" : "tail";
  }
  if (fx <= leftPx + EDGE_PX) return "head";
  if (fx >= rightPx - EDGE_PX) return "tail";
  return "grab";
}

// スマートツールの押下対象ノートを決める。
// 右端ぎりぎりの押下はスナップで clock == end (ノート外) に丸められ noteAt では
// 見つからないため、先に「押下 x がノートの範囲内 / 端から EDGE_PX 以内」の
// 同一行ノートを探してから noteAt に落とす。範囲内のノートを最優先し、
// 範囲外の押下は端との距離が最も近いノートを端調整の対象にする
function noteNear(u: number, clock: number, row: number, x: number): SmartNote | null {
  const s = getService();
  if (!s) return null;
  const view = clockContext();
  const fx = x - STRIP_W;
  let edge: SmartNote | null = null;
  let edgeDist = Number.POSITIVE_INFINITY;
  for (const d of iterNoteDraws(s.evels.records, u, { startClock: 0, endClock: Number.MAX_SAFE_INTEGER }, EVENTDEFAULT_KEY)) {
    if (d.kind !== "on" || keyValueToRow(d.key) !== row) continue;
    const note = { head: d.clock, end: d.clock + d.len, key: d.key };
    const leftPx = clockToX(view, note.head) - doc.scrollX;
    const rightPx = clockToX(view, note.end) - doc.scrollX;
    if (fx >= leftPx && fx < rightPx) return note; // 本体上の押下 (掴み/端は smartModeAt で判定)
    const dist = Math.min(Math.abs(fx - leftPx), Math.abs(fx - rightPx));
    if (dist <= EDGE_PX && dist < edgeDist) {
      edgeDist = dist;
      edge = note;
    }
  }
  return edge ?? noteAt(u, clock, row);
}

// スマートツールの押下開始。押した位置の状態でモードを決める。
// - 空き地: ノート書き込み (pen と同じ動作)
// - ノートの端から EDGE_PX 以内: 左端は開始 (終了固定)、右端は終了 (開始固定) の調整
// - それ以外のノート上: 掴んで移動 (横 = クロック / 縦 = 音程)
function beginSmartDrag(u: number, clock: number, row: number, x: number): KeyDrag {
  const note = noteNear(u, clock, row, x);
  const s = getService()!;
  const evs: SmartState["evs"] = [];
  let mode: SmartMode = "write";
  if (note) {
    mode = smartModeAt(note, x);
    if (mode === "tail") {
      // 終了調整: ON の長さだけを入れ替える (KEY/VELOCITY は動かさない)
      for (const e of s.evels.records) {
        if (e.clock > note.head) break;
        if (e.clock === note.head && e.unitNo === u && e.kind === EventKind.ON) {
          evs.push({ clock: e.clock, kind: e.kind, value: e.value });
        }
      }
    } else {
      // 掴み / 開始調整: ノートを構成するイベント (先頭の KEY/VELOCITY/ON +
      // 範囲内の KEY/VELOCITY) を一体で扱う。範囲内の ON は別ノートなので対象外
      for (const e of s.evels.records) {
        if (e.clock >= note.end) break;
        if (e.clock < note.head) continue;
        if (e.unitNo !== u) continue;
        if (e.kind !== EventKind.KEY && e.kind !== EventKind.VELOCITY && e.kind !== EventKind.ON) continue;
        if (e.kind === EventKind.ON && e.clock !== note.head) continue;
        evs.push({ clock: e.clock, kind: e.kind, value: e.value });
      }
      // 押した行の音程を担う KEY が無い (前の KEY の余韻) 場合、移動先に KEY を
      // 補って音程を保存する (余韻元の KEY は動かせないためここで補う)
      if (!evs.some((e) => e.kind === EventKind.KEY && e.clock === note.head)) {
        evs.push({ clock: note.head, kind: EventKind.KEY, value: note.key });
      }
    }
  }
  return { button: 0, clock1: clock, clock2: clock, row, smart: { mode, note, evs, offset: 0, rowDelta: 0, lastDelta: 0 } };
}

// スマートのドラッグ適用 (プレビュー更新のみ)。
// ドラッグ中はイベント列を書き換えない。ON のテール連鎖処理がドラッグのたびに
// 周囲のノートを巻き込むため、配置はゴーストで見せてイベントへの反映は
// pointerup の commitSmartDrag で 1 回だけ行う
function updateSmartPreview(d: KeyDrag, pt?: { x: number; y: number }): void {
  const st = d.smart!;
  const row = pt ? rowAt(pt.y) : d.row;
  // 掴みの音程変化 (縦ドラッグ)。端の調整では音程を変えない。
  // 音程が変わったら新しい行の音を改めて試聴する (押下中サステインが切り替わる)
  st.rowDelta = st.mode === "grab" ? row - d.row : 0;
  if (st.mode === "grab" && st.rowDelta !== st.lastDelta) {
    const focus = doc.focusUnit;
    if (focus >= 0) {
      const r = Math.max(0, Math.min(KEYNUM - 1, row));
      previewUnitHold(focus, rowToKeyValue(r), EVENTDEFAULT_VELOCITY);
    }
  }
  st.lastDelta = st.rowDelta;
  // 掴みの移動量はノート先頭が負のクロックにならない範囲にクランプする
  // (負のクロックにはイベントを置けず、プレビューと確定がずれてしまうため)
  st.offset = st.note ? clampSmartOffset(d.clock2 - d.clock1, st.note.head) : 0;
  previewRev.value++;
}

// pen / スマート書き込みドラッグの確定前ノート (ゴースト) 描画。
// ドラッグ中はイベント列を触らないため、[押下..現在] の範囲に置くノートを予告として描く
function drawNoteGhost(ctx: CanvasRenderingContext2D, d: KeyDrag, field: FieldCtx, unitNo: number): void {
  const c1 = Math.min(d.clock1, d.clock2);
  const c2 = Math.max(d.clock1, d.clock2);
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
  const y = top + d.row * KEY_HEIGHT - scrollY + KEY_HEIGHT / 2;
  fillRect(ctx, x1, y - 3, x2 - x1, 7, color.note(false, EVENTDEFAULT_VELOCITY, EVENTDEFAULT_VOLUME));
  fillRect(ctx, x1, y - 3, 2, 7, COLORS.noteHead);
  ctx.restore();
}

// スマートドラッグのゴースト (確定後の配置) 描画。
// 配置 (head/len/KEY 値) は lib/smart-note の smartPlacement を commitSmartDrag と共有する
function drawSmartGhost(ctx: CanvasRenderingContext2D, d: KeyDrag, field: FieldCtx, unitNo: number): void {
  const st = d.smart!;
  const note = st.note;
  const place = smartPlacement(st, d.clock2, beatGrid());
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
  fillRect(ctx, x1, y - 3, x2 - x1, 7, color.note(false, EVENTDEFAULT_VELOCITY, EVENTDEFAULT_VOLUME));
  fillRect(ctx, x1, y - 3, 2, 7, COLORS.noteHead);
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

// pen / スマート書き込みドラッグの確定 (pointerup)。
// プレビューしていた [押下..現在] の範囲にノートを 1 回だけ書く。
// ドラッグ中に介入しないため、長押し中は周囲のノートが消えない
function commitNoteDrag(u: number, d: KeyDrag): void {
  const s = getService();
  if (!s) return;
  const c1 = Math.min(d.clock1, d.clock2);
  const c2 = Math.max(d.clock1, d.clock2);
  if (c2 <= c1) return;
  // 書込先の直前ノートが超短い断片になる (隣に張り付いて重なって見える) ときは消す
  dropShortPrevNote(projectWriteOps, s.evels.records, c1, u, beatGrid());
  writeNote(projectWriteOps, c1, c2, u, rowToKeyValue(d.row), EVENTDEFAULT_VELOCITY);
}

function applyDrag(d: KeyDrag, pt?: { x: number; y: number }): void {
  // 読み取り専用タブでは書き込まない (シーク用の onClick のみ有効)
  if (doc.readOnly) return;
  const s = getService();
  if (!s) return;
  const u = doc.focusUnit;
  if (u < 0) return;
  // スマートのノート操作 (掴み / 端調整) はプレビュー更新のみ。実書き換えは
  // pointerup の commit で 1 回行う (ドラッグ中に介入すると周囲のノートを巻き込む)
  if (d.smart && d.smart.mode !== "write") {
    updateSmartPreview(d, pt);
    return;
  }
  const c1 = Math.min(d.clock1, d.clock2);
  const c2 = Math.max(d.clock1, d.clock2);
  if (c2 <= c1) return;
  // ピアノロールのドラッグでスコープを書き換えない (範囲選択は ScopeField 側)
  const value = rowToKeyValue(d.row);
  const keyOnly = doc.tool === "hand";
  if (d.button === 0) {
    if (keyOnly) {
      // 手ツール: KEY の書き換えのみ (単純置換なのでプレビュー不要)。
      // 左端へ挿す KEY は 1 個だけ保つ (増やすとノートが細切れに見える)
      d.insertedKeyClock = paintKeyDrag(projectWriteOps, s.evels.records, c1, c2, u, value, d.insertedKeyClock);
      doc.rev++;
      return;
    }
    // pen / スマート書き込み: ドラッグ中はイベントを触らずゴーストで見せる
    // (長押し中に周囲のノートを切り詰めない)。書き込みは pointerup の
    // commitNoteDrag で 1 回だけ行う
    previewRev.value++;
    return;
  }
  // 右ドラッグ: 消去はその場で反映する (プレビューの必要がない)
  eraseNote(projectWriteOps, c1, c2, u, { key: true, onVel: !keyOnly });
  doc.rev++;
}

const { onPointerDown, onPointerMove, onPointerUp, drag: dragState } = useCanvasDrag<KeyDrag>({
  canvasRef,
  clockAt,
  beginDrag(e, pt) {
    const s = getService();
    if (!s) return null;
    const focus = doc.focusUnit;
    if (focus < 0 || !s.unitGet(focus)) return null;
    const row = Math.max(0, Math.min(KEYNUM - 1, rowAt(pt.y)));
    const clock = clockAt(pt.x);
    if (e.button === 0) {
      if (pt.x < STRIP_W) {
        // 鍵盤ストリップ: 試聴のみ (シークしない)
        previewAt(pt.y);
        return null;
      }
      if (doc.readOnly) {
        // 読み取り専用: 試聴のみ行い、クリック時はシークする (書き換えなし)
        previewAt(pt.y);
        return { button: 0, clock1: clock, clock2: clock, row };
      }
      // スマート: 押下位置の状態でモードを決める。空き地 / ノート上どちらも
      // 押下行の音を試聴する (掴み中の音程変化の再試聴は applySmartDrag 内)
      if (doc.tool === "smart") {
        const d = beginSmartDrag(focus, clock, row, pt.x);
        previewAt(pt.y);
        return d;
      }
      previewAt(pt.y);
      return { button: 0, clock1: clock, clock2: clock, row };
    }
    if (e.button === 2) {
      if (doc.readOnly) return null;
      return { button: 2, clock1: clock, clock2: clock, row };
    }
    return null;
  },
  applyDrag,
  // スマートの掴みは縦方向 (音程) だけのドラッグでも適用する (端の調整は横方向のみ)
  isMove(d, pt, clock) {
    if (d.smart && d.smart.mode === "grab") return clock !== d.clock2 || rowAt(pt.y) !== d.row;
    return clock !== d.clock2;
  },
  onClick(d) {
    if (d.button !== 0) return;
    // スマート: ノート上のクリック (掴み / 端調整) は無操作。空き地は
    // 1 グリッド分のノートを書き込む (長押しで鳴らした分の最短形)
    if (d.smart && d.smart.mode !== "write") return;
    if (d.smart) {
      const u = doc.focusUnit;
      const s = getService();
      if (u >= 0 && s && !doc.readOnly) {
        const value = rowToKeyValue(d.row);
        mutate(() => {
          // 既存ノートの途中への書き込みはそのノートを切り詰めるが、
          // 超短い断片になるなら丸ごと消す
          dropShortPrevNote(projectWriteOps, s.evels.records, d.clock1, u, beatGrid());
          writeNote(projectWriteOps, d.clock1, d.clock1 + beatGrid(), u, value, EVENTDEFAULT_VELOCITY);
        });
      }
      seekToClock(d.clock1);
      return;
    }
    // ドラッグなしのクリック = シーク
    seekToClock(d.clock1);
  },
  onEnd() {
    hold.onRelease(); // 押下中サステインを停止
    // ドラッグの実書き換えはここで確定する (ドラッグ中はイベントを触っていない)
    const dd = dragState.value;
    if (dd && !doc.readOnly) {
      const u = doc.focusUnit;
      const s = getService();
      if (u >= 0 && s) {
        if (dd.smart && dd.smart.mode !== "write") {
          // 確定は lib/smart-note 側 (プレビューと同じ配置計算を使う)。
          // またぐノートの探索は削除の反映後にやり直すため records は都度読む
          commitSmartDrag(projectWriteOps, () => s.evels.records, u, dd.smart, dd.clock2, beatGrid());
          doc.rev++;
        } else if (dd.button === 0 && doc.tool !== "hand" && dd.clock2 !== dd.clock1) {
          // pen (スマート書き込み含む): 確定時に 1 回だけ書く
          commitNoteDrag(u, dd);
          doc.rev++;
        }
      }
    }
  },
});

// ホイール: Ctrl=ズーム / Shift=横スクロール / それ以外は縦スクロール
function onWheel(e: WheelEvent): void {
  const { zoom, pan } = zoomOrPan(e, doc.zoom);
  if (zoom !== null) {
    doc.zoom = zoom;
    return;
  }
  if (pan !== null) {
    doc.scrollX = Math.max(0, doc.scrollX + pan);
    return;
  }
  doc.scrollYKey = Math.max(0, Math.min(KEYNUM - 1, doc.scrollYKey + Math.sign(e.deltaY)));
}
</script>

<template>
  <canvas
    ref="canvasRef"
    class="field-canvas"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
    @wheel="onWheel"
    @contextmenu.prevent
  />
</template>
