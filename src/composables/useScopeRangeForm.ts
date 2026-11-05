// 範囲選択フォームの共通処理 (CopyMeasDialog / EventVolumeDialog)
import { onMounted } from "vue";
import { doc, clockContext } from "../state/project";
import { clockToMeasBeatClock, type ClockView } from "../lib/clock";

// 範囲フォームが持つべきフィールド (meas/beat は 1-based UI 値)
export interface ScopeRangeForm {
  fromMeas: number;
  fromBeat: number;
  fromClock: number;
  toMeas: number;
  toBeat: number;
  toClock: number;
}

// 選択範囲 (半開区間 [scope1, scope2)) をフォームの値 (meas/beat は 1-based) にする。
// to は範囲の終端 scope2 そのもの (本家 if_ScopeField_GetSelected 準拠)。
// 受け取り側 (copyMeas / changeEventValue) は to を含まない終端として扱うため、
// scope2 - 1 を表示すると幅が 1 クロック短くなり、回数 2 以上の小節コピーがずれる
export function scopeRangeFields(view: ClockView, scope1: number, scope2: number): ScopeRangeForm {
  const [m1, b1, c1] = clockToMeasBeatClock(view, scope1);
  const [m2, b2, c2] = clockToMeasBeatClock(view, scope2);
  return { fromMeas: m1 + 1, fromBeat: b1 + 1, fromClock: c1, toMeas: m2 + 1, toBeat: b2 + 1, toClock: c2 };
}

// 選択範囲をフォームへ初期化する。範囲未選択なら何もしない。
// afterInit は追加の書き込み用 (コピー先 dest など。引数は 1-based の to 値)
export function useScopeRangeForm(
  form: ScopeRangeForm,
  afterInit?: (toMeas: number, toBeat: number, toClock: number) => void,
): void {
  onMounted(() => {
    if (doc.scope2 <= doc.scope1) return;
    const fields = scopeRangeFields(clockContext(), doc.scope1, doc.scope2);
    Object.assign(form, fields);
    afterInit?.(fields.toMeas, fields.toBeat, fields.toClock);
  });
}
