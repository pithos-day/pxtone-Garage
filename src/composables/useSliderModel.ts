// スライダーモデル (computed get/set ファクトリ)。
// getter は rev を参照して undo/redo 後の再描画でも最新値を返す
import { computed, type Ref } from "vue";

export function useSliderModel(rev: Ref<number>, get: () => number, set: (v: number) => void) {
  return computed({
    get: () => {
      void rev.value;
      return get();
    },
    set,
  });
}
