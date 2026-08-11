// デバウンス付き実行 (NoiseEditor のリアルタイムビルド用)
import { onBeforeUnmount } from "vue";

export function useDebounced(fn: () => void, delayMs = 250): { run: () => void } {
  let timer: number | null = null;
  function run(): void {
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      fn();
    }, delayMs);
  }
  onBeforeUnmount(() => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  });
  return { run };
}
