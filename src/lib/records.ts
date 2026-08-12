// イベント記録 (EveRecord[]) の可視範囲走査ヘルパ。
// KeyField / PinnedLanes で重複していた「範囲フィルタ + break/continue」の定型を集約する
import { EventKind, type EveRecord } from "pxtone-ts";
import type { ClockView } from "./clock";
import { xToClock } from "./clock";

// 走査対象の可視クロック範囲。scrollX は px、marginClock は左側の余白 (クロック)
export function visibleClockWindow(
  view: ClockView,
  scrollX: number,
  w: number,
  marginClock = 10,
): { startClock: number; endClock: number } {
  return {
    startClock: Math.max(0, xToClock(view, scrollX) - marginClock),
    endClock: xToClock(view, scrollX + w),
  };
}

// records を時系列順に走査し、可視範囲の実イベントだけを返すジェネレータ。
// ON イベントは長さ (value) 込みで視認範囲を判定する。
// isTarget でユニットなどの対象絞り込みを行う
export function* iterVisibleRecords(
  records: EveRecord[],
  range: { startClock: number; endClock: number },
  isTarget: (e: EveRecord) => boolean = () => true,
): Generator<EveRecord> {
  for (const e of records) {
    if (e.kind === EventKind.NULL) continue;
    if (e.clock > range.endClock) break;
    if (e.clock + (e.kind === EventKind.ON ? e.value : 0) < range.startClock) continue;
    if (!isTarget(e)) continue;
    yield e;
  }
}

// ---- ピアノロール描画用のノートレコード変換 ----

// ノート描画レコード (KeyField の drawNotes で描画に使う)。
// ON/KEY イベント列を「発音区間と KEY 位置」へ変換したもの
export type NoteDraw =
  | { kind: "on"; clock: number; key: number; len: number } // ON による発音
  | { kind: "off"; clock: number; key: number; len: number } // 直前 KEY の余韻 (ON が無い区間)
  | { kind: "key"; clock: number; key: number }; // KEY イベント位置 (縦線)

// ON/KEY イベント列を時系列順にノート描画レコードへ変換するジェネレータ。
// 進行中の KEY (curKey) と直近の発音終端 (prevClock) を管理し、
// ON が無い区間は直前 KEY の音が続く (off) として出力する
export function* iterNoteDraws(
  records: EveRecord[],
  unitNo: number,
  range: { startClock: number; endClock: number },
  defKey: number,
): Generator<NoteDraw> {
  let curKey = defKey;
  let prevClock = range.startClock;
  for (const e of iterVisibleRecords(records, range, (e) => e.unitNo === unitNo)) {
    // ON/KEY 共通: 直近の発音終端からイベント位置までの空白区間は余韻 (off)。
    // curKey はどちらの分岐でもイベント処理前に使うため先に出力してよい
    if (e.clock > prevClock) yield { kind: "off", clock: prevClock, key: curKey, len: e.clock - prevClock };
    if (e.kind === EventKind.ON) {
      yield { kind: "on", clock: e.clock, key: curKey, len: e.value };
      prevClock = e.clock + e.value;
    } else if (e.kind === EventKind.KEY) {
      yield { kind: "key", clock: e.clock, key: e.value };
      curKey = e.value;
      prevClock = e.clock;
    }
  }
  // 末尾の余韻 (表示範囲の端まで)
  if (range.endClock > prevClock) {
    yield { kind: "off", clock: prevClock, key: curKey, len: range.endClock - prevClock };
  }
}
