// ピアノロールのスマートツール (ノートの掴み移動 / 端の調整) の配置計算と確定処理。
// プレビュー (KeyField のゴースト描画) と確定 (pointerup) が同じ計算を共有し、
// 見た目と実際の確定がずれないようにする。書き込み先は EventWriteOps で抽象化し、
// state 層へ依存しない (node テストから直接呼べる)
import { EventKind, type EveRecord } from "pxtone-ts";
import { dropShortPrevNote, type EventWriteOps } from "./editing";
import { iterNoteDraws } from "./records";
import { KEYNUM, clockToX, keyValueToRow, type ClockView } from "./clock";
import { clamp } from "./clamp";

// KEY イベント値の上限 (本家の KEY 値域)。音程移動のクランプに使う
export const KEY_VALUE_MAX = 49151;

// スマートツールの操作モード (押下位置の状態で決まる)
// write: 空き地にノートを書き込む (pen と同じ)。grab: ノートを掴んで移動。
// head: 左端の調整 (開始のみ。終了は固定)。tail: 右端の調整 (終了のみ。開始は固定)
export type SmartMode = "write" | "grab" | "head" | "tail";

// 掴み / 端調整の対象ノート (描画上の ON)
export interface SmartNote {
  head: number; // 先頭クロック (ON イベント位置)
  end: number; // 末尾クロック (head + len)
  key: number; // 描画上の音程 (KEY 値)
}

// 掴み / 端調整で再配置するイベント列 (clock は絶対値)。
// 余韻で鳴っていた音程を保存するための KEY (実在しない) もここに載せる
export interface SmartNoteEvent {
  clock: number;
  kind: EventKind;
  value: number;
}

// 配置計算と確定が共有するドラッグ状態 (note は write モードでは null)
export interface SmartDrag {
  mode: SmartMode;
  note: SmartNote | null;
  evs: SmartNoteEvent[];
  offset: number; // 押下位置からの移動量 (クロック)
  rowDelta: number; // 掴みの音程移動量 (行)
}

// 移動後の配置 (ゴースト描画と確定が共有する)
export interface SmartPlacement {
  head: number; // ノート先頭クロック
  len: number; // ノート長 (クロック)
  rowKey: number; // 代表 KEY 値 (掴みでは音程移動を反映)
}

// KEY 値を rowDelta 行ぶん移動する (KEY 値は 0x8700 - row*0x100 のため行が下がるほど減る)
export function shiftKeyValue(value: number, rowDelta: number): number {
  return clamp(value - rowDelta * 0x100, 0, KEY_VALUE_MAX);
}

// 掴みの移動量を「ノート先頭が負のクロックにならない」範囲にクランプする。
// 負のクロックにはイベントを置けないため、クランプしないとプレビュー (先頭 0 に描画) と
// 確定 (先頭成分を置けずノートが消える) がずれる (本家 if_Cursor.cpp の 0 クランプ相当)
export function clampSmartOffset(offset: number, noteHead: number): number {
  return Math.max(offset, -noteHead);
}

// 移動後の配置。ノートを持たない write モードでは null
export function smartPlacement(d: SmartDrag, dragClock2: number, grid: number): SmartPlacement | null {
  const note = d.note;
  if (!note) return null;
  // 余韻で鳴っている音程も保存用 KEY として配置に含める
  const rowKey = d.evs.find((e) => e.kind === EventKind.KEY && e.clock === note.head)?.value ?? note.key;
  if (d.mode === "tail") {
    // 終了調整: 先頭は固定で押下クロックを末尾にする (最短 1 グリッド)
    return { head: note.head, len: Math.max(grid, dragClock2 - note.head), rowKey };
  }
  if (d.mode === "head") {
    // 開始調整: 終了は固定で押下クロックに開始を合わせる (最短 1 グリッド)
    const head = clamp(dragClock2, 0, note.end - grid);
    return { head, len: note.end - head, rowKey };
  }
  // 掴み: 全体移動 + 音程移動
  return { head: note.head + clampSmartOffset(d.offset, note.head), len: note.end - note.head, rowKey: shiftKeyValue(rowKey, d.rowDelta) };
}

// スマートドラッグの確定 (pointerup)。プレビューしていた配置をイベント列へ 1 回だけ反映する。
// ドラッグ中は 1 度も書き換えないため、周囲のノートを巻き込むのはこの 1 回だけ。
// getRecords は呼び出しのたびに最新のレコード列を返すこと (削除の反映後にまたぐノートを
// 探し直すため)。grid は最短ノート長 (1 グリッド)
export function commitSmartDrag(
  ops: EventWriteOps,
  getRecords: () => EveRecord[],
  unit: number,
  d: SmartDrag,
  dragClock2: number,
  grid: number,
): void {
  const note = d.note;
  const place = smartPlacement(d, dragClock2, grid);
  if (!note || !place) return;
  if (d.mode === "tail") {
    // 終了位置: 押下クロックを新しい末尾にする (最短 1 グリッド)
    if (place.len === note.end - note.head) return;
    ops.deleteEvents(note.head, note.head + 1, unit, EventKind.ON);
    // 延伸で呑み込まれるノート: ON は追加時 (テール連鎖処理) に消えるが
    // 先頭成分 (KEY/VELOCITY) が孤児で残る。孤児 KEY は後続ノートの音程を
    // 化けさせ、描画上の off (余韻) を ON に重ねて見せるため、自ノートの
    // 先頭スロットを除いて掃除しておく
    const tailEnd = place.head + place.len;
    for (const e of getRecords()) {
      if (e.unitNo !== unit || e.kind !== EventKind.ON) continue;
      if (e.clock >= tailEnd) break;
      if (e.clock <= note.head) continue;
      for (const kind of [EventKind.KEY, EventKind.VELOCITY]) {
        ops.deleteEvents(e.clock, e.clock + 1, unit, kind);
      }
    }
    ops.addEvent(note.head, unit, EventKind.ON, place.len);
    return;
  }
  if (d.mode === "head") {
    // 開始位置: 終了 (note.end) は固定。押下クロックを新しい開始にし、
    // 先頭クロックに置かれていたノート成分 (KEY/VELOCITY/ON) を移す
    if (place.head === note.head) return;
    for (const kind of [EventKind.KEY, EventKind.VELOCITY, EventKind.ON]) {
      ops.deleteEvents(note.head, note.head + 1, unit, kind);
    }
    const records = getRecords();
    // 開始を右へ動かすと、間にあった KEY/VELOCITY が新しい開始より左に残る。
    // 残った KEY は単独マーカーとして描かれ、後続ノートの音程の元になるため掃除する
    // (他ノートの先頭成分 = 同じクロックに ON があるものは残す)
    for (const ev of d.evs) {
      if (ev.clock <= note.head || ev.clock >= place.head) continue;
      if (records.some((r) => r.unitNo === unit && r.kind === EventKind.ON && r.clock === ev.clock)) continue;
      ops.deleteEvents(ev.clock, ev.clock + 1, unit, ev.kind);
    }
    // 挿入位置の直前ノートが超短い断片になる (隣に張り付いて重なって見える) ときは消す
    dropShortPrevNote(ops, records, place.head, unit, grid);
    for (const ev of d.evs) {
      if (ev.clock !== note.head || ev.kind === EventKind.ON) continue;
      ops.addEvent(place.head, unit, ev.kind, ev.value);
    }
    ops.addEvent(place.head, unit, EventKind.ON, place.len);
    return;
  }
  // 掴み: 押下時の配置から動いていなければ何もしない (左端で止まっただけの掴みで
  // 移動先のノートを巻き込まない)。動いていればノート全体を新しい位置へ
  // 載せ替える (移動元の範囲を消してから置く)
  if (place.head === note.head && d.rowDelta === 0) return;
  // 移動量は配置と揃える (クランプにより先頭は負にならない)
  const offset = place.head - note.head;
  for (const kind of [EventKind.KEY, EventKind.VELOCITY, EventKind.ON]) {
    ops.deleteEvents(note.head, Math.max(note.head + 1, note.end), unit, kind);
  }
  // ドロップは完全置き換え。またぐ直前ノートは丸ごと消し (切り詰めの断片を
  // 残さない)、呑み込まれたノートは ON が消えても先頭成分 (KEY/VELOCITY) が
  // 孤児で残る (後続の音程を化けさせ、off を重ねて描かせる) ので範囲ごと消す。
  // 自ノートの成分はこの後に d.evs から再配置する
  const targetEnd = place.head + place.len;
  dropShortPrevNote(ops, getRecords(), place.head, unit, Number.MAX_SAFE_INTEGER);
  for (const kind of [EventKind.KEY, EventKind.VELOCITY]) {
    ops.deleteEvents(place.head, Math.max(place.head + 1, targetEnd), unit, kind);
  }
  for (const ev of d.evs) {
    ops.addEvent(ev.clock + offset, unit, ev.kind, ev.kind === EventKind.KEY ? shiftKeyValue(ev.value, d.rowDelta) : ev.value);
  }
}

// ---- 複数ノートの操作 (選択中のノートの移動 / 貼り付け / クオンタイズで共有) ----

// ユニットの全ノート (ON イベント単位。同じユニット・同じクロックに ON は 1 つ)
export function notesInUnit(records: EveRecord[], unit: number, defaultKey: number): SmartNote[] {
  const notes: SmartNote[] = [];
  for (const d of iterNoteDraws(records, unit, { startClock: 0, endClock: Number.MAX_SAFE_INTEGER }, defaultKey)) {
    if (d.kind === "on") notes.push({ head: d.clock, end: d.clock + d.len, key: d.key });
  }
  return notes;
}

// ノートを構成するイベント (先頭の KEY/VELOCITY/ON + 範囲内の KEY/VELOCITY)。
// 範囲内の ON は別ノートなので含めない。先頭に KEY が無い (前の KEY の余韻で鳴っている)
// 場合は、移動先でも音程を保てるよう KEY を補う
export function collectNoteEvents(records: EveRecord[], unit: number, note: SmartNote): SmartNoteEvent[] {
  const evs: SmartNoteEvent[] = [];
  for (const e of records) {
    if (e.clock >= note.end) break;
    if (e.clock < note.head) continue;
    if (e.unitNo !== unit) continue;
    if (e.kind !== EventKind.KEY && e.kind !== EventKind.VELOCITY && e.kind !== EventKind.ON) continue;
    if (e.kind === EventKind.ON && e.clock !== note.head) continue;
    evs.push({ clock: e.clock, kind: e.kind, value: e.value });
  }
  if (!evs.some((e) => e.kind === EventKind.KEY && e.clock === note.head)) {
    evs.push({ clock: note.head, kind: EventKind.KEY, value: note.key });
  }
  return evs;
}

// 矩形 (クロックは半開区間、行は両端を含む) に重なるノート
export function notesInRect(notes: readonly SmartNote[], c1: number, c2: number, row1: number, row2: number): SmartNote[] {
  return notes.filter((n) => {
    const row = keyValueToRow(n.key);
    return n.head < c2 && n.end > c1 && row >= row1 && row <= row2;
  });
}

// グループ移動量を「どのノートの先頭も負のクロックにならない」範囲にクランプする
export function clampGroupOffset(offset: number, heads: readonly number[]): number {
  return Math.max(offset, -Math.min(...heads));
}

// グループの音程移動量を「すべての KEY が鍵盤の範囲に収まる」範囲にクランプする。
// 個別にクランプすると和音や旋律の形が崩れるため、全体を同じ量で止める
export function clampGroupRowDelta(rowDelta: number, keyValues: readonly number[]): number {
  const rows = keyValues.map(keyValueToRow);
  return clamp(rowDelta, -Math.min(...rows), KEYNUM - 1 - Math.max(...rows));
}

// 配置するノート。evs の clock は絶対値で、origin (元の先頭) からの相対位置を保って head へ置く
export interface NotePlacement {
  origin: number;
  evs: readonly SmartNoteEvent[];
  head: number;
  len: number;
  rowDelta: number;
}

// ノートをイベント列から消す
export function clearNotes(ops: EventWriteOps, unit: number, notes: readonly SmartNote[]): void {
  for (const note of notes) {
    for (const kind of [EventKind.KEY, EventKind.VELOCITY, EventKind.ON]) {
      ops.deleteEvents(note.head, Math.max(note.head + 1, note.end), unit, kind);
    }
  }
}

// ノートを置く。既定では置き先と重なるノートを丸ごと置き換える (単一ノートの掴みと同じ規則)。
// 片付けを全部済ませてから書くので、片付けが今回置くノートを巻き込まない。
// prevDropLen は「またぐ直前ノートを丸ごと消す」長さの閾値で、0 なら切り詰めるだけで消さない
export function placeNotes(
  ops: EventWriteOps,
  getRecords: () => EveRecord[],
  unit: number,
  placements: readonly NotePlacement[],
  prevDropLen = Number.MAX_SAFE_INTEGER,
): void {
  const sorted = [...placements].sort((a, b) => a.head - b.head);
  for (const p of sorted) {
    dropShortPrevNote(ops, getRecords(), p.head, unit, prevDropLen);
    ops.deleteEvents(p.head, p.head + 1, unit, EventKind.ON);
    for (const kind of [EventKind.KEY, EventKind.VELOCITY]) {
      ops.deleteEvents(p.head, Math.max(p.head + 1, p.head + p.len), unit, kind);
    }
  }
  for (const p of sorted) {
    const offset = p.head - p.origin;
    for (const ev of p.evs) {
      const clock = ev.clock + offset;
      if (clock >= p.head + p.len) continue; // 短くなったノートの外へ出るイベントは捨てる
      if (ev.kind === EventKind.ON) ops.addEvent(clock, unit, ev.kind, p.len);
      else ops.addEvent(clock, unit, ev.kind, ev.kind === EventKind.KEY ? shiftKeyValue(ev.value, p.rowDelta) : ev.value);
    }
  }
}

// ---- 押下位置の判定 (fieldX はフィールド左端を 0 とする px) ----

// スマートツールの端判定幅 (CSS px)。端からこれ以内は端の調整、それ以外は掴み。
// グリッド基準の端判定だと書き込み 1 つ分の短いノートで端が掴めないため px 基準にする
const EDGE_PX = 8;

// 押下位置で掴み / 開始 / 終了を決める。
// ノート幅が端判定幅以下の短いノートは左右半分で開始/終了を分ける
export function smartModeAt(note: SmartNote, fieldX: number, view: ClockView, scrollX: number): SmartMode {
  const leftPx = clockToX(view, note.head) - scrollX;
  const rightPx = clockToX(view, note.end) - scrollX;
  if (rightPx - leftPx <= EDGE_PX * 2) {
    return fieldX < (leftPx + rightPx) / 2 ? "head" : "tail";
  }
  if (fieldX <= leftPx + EDGE_PX) return "head";
  if (fieldX >= rightPx - EDGE_PX) return "tail";
  return "grab";
}

// 押下位置 (clock, row) が重なる描画ノート (ON) を探す。
// 重なるもののうち records 上で最も後ろにあるもの (見た目で上に重なっているもの) を返す
function noteAt(records: EveRecord[], unit: number, clock: number, row: number, defaultKey: number): SmartNote | null {
  let hit: SmartNote | null = null;
  for (const note of notesInUnit(records, unit, defaultKey)) {
    if (clock < note.head || note.end <= clock) continue;
    if (keyValueToRow(note.key) === row) hit = note;
  }
  return hit;
}

// スマートツールの押下対象ノートを決める。
// 右端ぎりぎりの押下はスナップで clock == end (ノート外) に丸められ noteAt では
// 見つからないため、先に「押下 x がノートの範囲内 / 端から EDGE_PX 以内」の
// 同一行ノートを探してから noteAt に落とす。範囲内のノートを最優先し、
// 範囲外の押下は端との距離が最も近いノートを端調整の対象にする
export function noteNear(
  records: EveRecord[],
  unit: number,
  clock: number,
  row: number,
  fieldX: number,
  view: ClockView,
  scrollX: number,
  defaultKey: number,
): SmartNote | null {
  let edge: SmartNote | null = null;
  let edgeDist = Number.POSITIVE_INFINITY;
  for (const note of notesInUnit(records, unit, defaultKey)) {
    if (keyValueToRow(note.key) !== row) continue;
    const leftPx = clockToX(view, note.head) - scrollX;
    const rightPx = clockToX(view, note.end) - scrollX;
    if (fieldX >= leftPx && fieldX < rightPx) return note; // 本体上の押下 (掴み/端は smartModeAt で判定)
    const dist = Math.min(Math.abs(fieldX - leftPx), Math.abs(fieldX - rightPx));
    if (dist <= EDGE_PX && dist < edgeDist) {
      edgeDist = dist;
      edge = note;
    }
  }
  return edge ?? noteAt(records, unit, clock, row, defaultKey);
}
