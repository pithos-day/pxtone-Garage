// ピアノロールのスマートツール (ノートの掴み移動 / 端の調整) の配置計算と確定処理。
// プレビュー (KeyField のゴースト描画) と確定 (pointerup) が同じ計算を共有し、
// 見た目と実際の確定がずれないようにする。書き込み先は EventWriteOps で抽象化し、
// state 層へ依存しない (node テストから直接呼べる)
import { EventKind, type EveRecord } from "pxtone-ts";
import { dropShortPrevNote, type EventWriteOps } from "./editing";

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
  return Math.max(0, Math.min(KEY_VALUE_MAX, value - rowDelta * 0x100));
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
    const head = Math.max(0, Math.min(note.end - grid, dragClock2));
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
    // 挿入位置の直前ノートが超短い断片になる (隣に張り付いて重なって見える) ときは消す
    dropShortPrevNote(ops, getRecords(), place.head, unit, grid);
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
