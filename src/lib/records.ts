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
