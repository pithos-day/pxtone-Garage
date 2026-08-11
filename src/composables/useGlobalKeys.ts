// グローバルキーハンドラ (window) の共通登録。
// - active() が false のモードでは無視する (他モードでの誤動作防止)
// - フォーム要素 (INPUT/TEXTAREA/SELECT) 上では発火しない
import { onBeforeUnmount, onMounted } from "vue";

export function useGlobalKeys(
  active: () => boolean,
  handlers: { keydown?: (e: KeyboardEvent) => void; keyup?: (e: KeyboardEvent) => void },
): void {
  const shouldIgnore = (e: KeyboardEvent): boolean => {
    if (!active()) return true;
    const tag = (e.target as HTMLElement)?.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  };
  const onKeydown = (e: KeyboardEvent): void => {
    if (shouldIgnore(e)) return;
    handlers.keydown?.(e);
  };
  const onKeyup = (e: KeyboardEvent): void => {
    if (shouldIgnore(e)) return;
    handlers.keyup?.(e);
  };
  onMounted(() => {
    window.addEventListener("keydown", onKeydown);
    if (handlers.keyup) window.addEventListener("keyup", onKeyup);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("keydown", onKeydown);
    if (handlers.keyup) window.removeEventListener("keyup", onKeyup);
  });
}
