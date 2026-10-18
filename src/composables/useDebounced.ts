// デバウンス付き実行 (NoiseEditor のリアルタイムビルド用)。
// 引数を渡すと、実行時は最後に呼ばれたときの引数だけを使う (連続呼び出しは最後の 1 回に集約)
import { onBeforeUnmount } from "vue";

export function useDebounced<A = void>(fn: (arg: A) => void, delayMs = 250): { run: (arg: A) => void } {
  let timer: number | null = null;
  let latest: A;
  function run(arg: A): void {
    latest = arg;
    if (timer !== null) clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = null;
      fn(latest);
    }, delayMs);
  }
  onBeforeUnmount(() => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  });
  return { run };
}
