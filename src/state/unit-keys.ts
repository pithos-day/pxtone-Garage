// ユニットの安定した識別子。undo はスナップショットの読み戻しでユニットを作り直し、番号も
// 変わることがあるため、番号で持っているミュートや選択をオブジェクトに結び付けたキーで引き継ぐ
// (考え方は音色の woice-keys と同じ)
import type { Service } from "pxtone-ts";

// どのユニットにも一致しないキー
export const NO_UNIT_KEY = 0;

const keys = new WeakMap<object, number>();
let nextKey = NO_UNIT_KEY + 1;

export function unitKeysOf(s: Service): number[] {
  return Array.from({ length: s.unitNum }, (_, i) => {
    const unit = s.unitGet(i);
    if (!unit) return NO_UNIT_KEY;
    let key = keys.get(unit);
    if (key === undefined) {
      key = nextKey++;
      keys.set(unit, key);
    }
    return key;
  });
}

// スナップショットを読み戻した Service のユニットへ、取得時のキーを付け直す
export function restoreUnitKeys(s: Service, unitKeys: readonly number[]): void {
  unitKeys.forEach((key, i) => {
    const unit = s.unitGet(i);
    if (unit) keys.set(unit, key);
  });
}
