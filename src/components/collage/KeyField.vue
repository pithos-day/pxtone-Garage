// ピアノロール (K モード)
// 左ドラッグ: 音符 (KEY+ON+VELOCITY) 生成、右ドラッグ: 削除、鍵盤クリック: 試聴
// スマートツール: 空き地で書き込み / ノートを掴んで移動 / 両端 1 グリッドで開始・終了調整
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
import { writeNote, eraseNote } from "../../lib/editing";
import { STRIP_W } from "../../lib/layout";
import {
  doc,
  getService,
  clockContext,
  addEvent,
  deleteEvents,
  setEventValue,
  projectWriteOps,
  setScope,
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
  for (const u of rollUnits) {
    drawNotes(ctx, s, u, field, u === focus);
  }

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

// スマートツールの操作モード (押下位置の状態で確定する)
// write: 空き地にノートを書き込む (pen と同じ)。grab: ノートを掴んで移動。
// head: 左端の移動 (長さ維持)。tail: 右端の移動 (長さ変更)
type SmartMode = "write" | "grab" | "head" | "tail";

// 掴み / 端調整の対象ノート (drawn の ON)
interface SmartNote {
  head: number; // 先頭クロック (ON イベント位置)
  end: number; // 末尾クロック (head + len)
  key: number; // 描画上の音程 (KEY 値)
}

// スマートツールのドラッグ状態
interface SmartState {
  mode: SmartMode;
  note: SmartNote | null;
  // 掴み / 端調整で移動再配置するイベント列 (clock は絶対値)。
  // 実在しない KEY (前の KEY の余韻で鳴っている音程) は保存用の KEY としてここに載せる
  evs: { clock: number; kind: EventKind; value: number }[];
  // 直前の applyDrag で置いたイベント (次の適用前に消してから置き直す)。
  // 初期値は押下時の位置にある実在イベント
  placed: { clock: number; kind: EventKind }[];
  // 掴み移動で前回適用した音程差 (試聴の再トリガ判定用)
  lastDelta?: number;
}

type KeyDrag = {
  button: number;
  clock1: number;
  clock2: number;
  row: number;
  // スマートツール専用の状態 (pen/hand では省略)
  smart?: SmartState;
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

// スマートツールの押下開始。押した位置の状態でモードを決める。
// - 空き地: ノート書き込み (pen と同じ動作)
// - ノート両端 1 グリッド: 開始 (head) / 終了 (tail) の調整
// - それ以外のノート上: 掴んで移動 (横 = クロック / 縦 = 音程)
// 2 グリッド以下の短いノートは常に掴み (端調整の余地を残すため端判定を省略する)
function beginSmartDrag(u: number, clock: number, row: number): KeyDrag {
  const grid = beatGrid();
  const note = noteAt(u, clock, row);
  const s = getService()!;
  const evs: SmartState["evs"] = [];
  // 実在イベントの配置管理 (初回 applyDrag で消す対象)。余韻保存用の KEY は含めない
  const placed: SmartState["placed"] = [];
  let mode: SmartMode = "write";
  if (note) {
    if (note.end - note.head > grid * 2) {
      // 両端 1 グリッドを端の調整にし、その間を掴みにする (3 グリッド以上)
      if (clock === note.head) mode = "head";
      else if (clock >= note.end - grid) mode = "tail";
      else mode = "grab";
    } else {
      // 2 グリッド以下の短いノートは常に掴み (両端と掴みの判別がつかないため)
      mode = "grab";
    }
    if (mode === "tail") {
      // 終了調整: ON の長さだけを書き換える
      for (const e of s.evels.records) {
        if (e.clock > note.head) break;
        if (e.clock === note.head && e.unitNo === u && e.kind === EventKind.ON) {
          evs.push({ clock: e.clock, kind: e.kind, value: e.value });
          placed.push({ clock: e.clock, kind: e.kind });
        }
      }
    } else {
      // 掴み / 開始調整: 対象は先頭クロックの KEY/VELOCITY/ON。
      // 掴みでは残り (範囲内の KEY/VELOCITY) も一体で動かす (範囲内の ON は別ノートなので対象外)
      const atHeadOnly = mode === "head";
      for (const e of s.evels.records) {
        if (e.clock >= note.end) break;
        if (e.clock < note.head || (atHeadOnly && e.clock !== note.head)) continue;
        if (e.unitNo !== u) continue;
        if (e.kind !== EventKind.KEY && e.kind !== EventKind.VELOCITY && e.kind !== EventKind.ON) continue;
        if (e.kind === EventKind.ON && e.clock !== note.head) continue;
        evs.push({ clock: e.clock, kind: e.kind, value: e.value });
        placed.push({ clock: e.clock, kind: e.kind });
      }
      // 押した行の音程を担う KEY が無い (前の KEY の余韻) 場合、移動先に KEY を
      // 補って音程を保存する (元の KEY は移動させないので対象 evs にだけ載せる)
      if (!evs.some((e) => e.kind === EventKind.KEY && e.clock === note.head)) {
        evs.push({ clock: note.head, kind: EventKind.KEY, value: note.key });
      }
    }
  }
  if (mode === "write") {
    // 空き地: pen と同じく押下位置にスコープを立てる (試聴は beginDrag 側で行う)
    setScope(clock, clock + Math.max(1, doc.divi));
  }
  return { button: 0, clock1: clock, clock2: clock, row, smart: { mode, note, evs, placed } };
}

// スマートツールのドラッグ適用 (掴み移動 / 端調整)。
// 前回配置分を消してノート (イベント群) を移動先に置き直す (毎回フル再配置)
function applySmartDrag(u: number, d: KeyDrag, pt?: { x: number; y: number }): void {
  const st = d.smart!;
  const note = st.note!;
  const grid = beatGrid();

  // 前回の配置を消す (初回は押下時の位置にある実在イベント)
  for (const p of st.placed) deleteEvents(p.clock, p.clock + 1, u, p.kind);
  st.placed = [];

  // 掴み移動の音程変化 (縦ドラッグ)。端の調整では音程を変えない。
  // 音程が変わったら新しい行の音を改めて試聴する (押下中サステインが切り替わる)
  let rowDelta = 0;
  if (pt && st.mode === "grab") {
    rowDelta = rowAt(pt.y) - d.row;
    if (rowDelta !== st.lastDelta) {
      st.lastDelta = rowDelta;
      const row = Math.max(0, Math.min(KEYNUM - 1, rowAt(pt.y)));
      const focus = doc.focusUnit;
      if (focus >= 0) previewUnitHold(focus, rowToKeyValue(row), EVENTDEFAULT_VELOCITY);
    }
  }
  const clockOffset = d.clock2 - d.clock1;

  for (const ev of st.evs) {
    const clock = ev.clock + (st.mode === "tail" ? 0 : clockOffset);
    if (st.mode === "tail" && ev.kind === EventKind.ON) {
      // 終了位置: 押下クロックまで延伸 / 縮小 (最短 1 グリッド)
      const len = Math.max(grid, d.clock2 - note.head);
      if (len !== ev.value) addEvent(clock, u, ev.kind, len);
    } else {
      if (clock < 0) continue; // 負クロックには置けない
      let value = ev.value;
      if (ev.kind === EventKind.KEY) {
        // 音程は押下行との差で動かす (KEY 値は 0x8700 - row*0x100 のため行が
        // 下がるほど減る。KEY 範囲 0..49151 にクランプ)
        value = Math.max(0, Math.min(49151, ev.value - rowDelta * 0x100));
      }
      addEvent(clock, u, ev.kind, value);
    }
    st.placed.push({ clock, kind: ev.kind });
  }
}

function applyDrag(d: KeyDrag, pt?: { x: number; y: number }): void {
  // 読み取り専用タブでは書き込まない (シーク用の onClick のみ有効)
  if (doc.readOnly) return;
  const s = getService();
  if (!s) return;
  const u = doc.focusUnit;
  if (u < 0) return;
  // スマートのノート操作 (掴み / 端調整)。書き込み (write) は pen と同じ経路
  if (d.smart && d.smart.mode !== "write") {
    applySmartDrag(u, d, pt);
    doc.rev++;
    return;
  }
  const c1 = Math.min(d.clock1, d.clock2);
  const c2 = Math.max(d.clock1, d.clock2);
  if (c2 <= c1) {
    if (d.button === 0) setScope(c1, c1 + Math.max(1, doc.divi));
    return;
  }
  setScope(c1, c2);
  const value = rowToKeyValue(d.row);
  const keyOnly = doc.tool === "hand";
  if (d.button === 0) {
    if (keyOnly) {
      // 手ツール: KEY の書き換えのみ
      setEventValue(c1, c2, u, EventKind.KEY, value);
      addEvent(c1, u, EventKind.KEY, value);
    } else {
      writeNote(projectWriteOps, c1, c2, u, value, EVENTDEFAULT_VELOCITY);
    }
  } else {
    eraseNote(projectWriteOps, c1, c2, u, { key: true, onVel: !keyOnly });
  }
  doc.rev++;
}

const { onPointerDown, onPointerMove, onPointerUp } = useCanvasDrag<KeyDrag>({
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
        const d = beginSmartDrag(focus, clock, row);
        previewAt(pt.y);
        return d;
      }
      setScope(clock, clock + Math.max(1, doc.divi));
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
  // スマートの掴み / 端調整は縦方向 (音程) だけのドラッグでも適用する
  isMove(d, pt, clock) {
    if (d.smart && d.smart.mode !== "write") return clock !== d.clock2 || rowAt(pt.y) !== d.row;
    return clock !== d.clock2;
  },
  onClick(d) {
    if (d.button !== 0) return;
    // スマート: ノート上のクリック (掴み / 端調整) は無操作。空き地は
    // 1 グリッド分のノートを書き込む (長押しで鳴らした分の最短形)
    if (d.smart && d.smart.mode !== "write") return;
    if (d.smart) {
      const u = doc.focusUnit;
      if (u >= 0 && !doc.readOnly) {
        const value = rowToKeyValue(d.row);
        mutate(() => writeNote(projectWriteOps, d.clock1, d.clock1 + beatGrid(), u, value, EVENTDEFAULT_VELOCITY));
      }
      seekToClock(d.clock1);
      return;
    }
    // ドラッグなしのクリック = シーク
    seekToClock(d.clock1);
  },
  onEnd() {
    hold.onRelease(); // 押下中サステインを停止
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
