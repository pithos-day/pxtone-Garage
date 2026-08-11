// 範囲選択フォームの共通処理 (CopyMeasDialog / EventVolumeDialog)
import { onMounted } from "vue";
import { doc, clockContext } from "../state/project";
import { clockToMeasBeatClock } from "../lib/clock";

// 範囲フォームが持つべきフィールド (meas/beat は 1-based UI 値)
export interface ScopeRangeForm {
  fromMeas: number;
  fromBeat: number;
  fromClock: number;
  toMeas: number;
  toBeat: number;
  toClock: number;
}

// 選択範囲 (半開区間 [scope1, scope2)) をフォームへ初期化する。範囲未選択なら何もしない。
// afterInit は追加の書き込み用 (コピー先 dest など。引数は 1-based の to 値)
export function useScopeRangeForm(
  form: ScopeRangeForm,
  afterInit?: (toMeas: number, toBeat: number, toClock: number) => void,
): void {
  onMounted(() => {
    if (doc.scope2 <= doc.scope1) return;
    const view = clockContext();
    const [m1, b1, c1] = clockToMeasBeatClock(view, doc.scope1);
    const [m2, b2, c2] = clockToMeasBeatClock(view, doc.scope2 - 1);
    form.fromMeas = m1 + 1;
    form.fromBeat = b1 + 1;
    form.fromClock = c1;
    form.toMeas = m2 + 1;
    form.toBeat = b2 + 1;
    form.toClock = c2;
    afterInit?.(m2 + 1, b2 + 1, c2);
  });
}
