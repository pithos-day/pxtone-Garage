// グローバルキーハンドラ (window) の共通登録。
// - active() が false のモードでは無視する (他モードでの誤動作防止)
// - 文字入力欄と SELECT の上では発火しない。スライダーなど文字を打てない部品の上では、
//   その部品が使わない Ctrl 付きのキーだけ発火する
import { onBeforeUnmount, onMounted } from "vue";

const NON_TEXT_INPUT_TYPES = new Set(["range", "checkbox", "radio", "button", "color", "file"]);

// キー入力をフォーム要素に任せる (グローバルのショートカットとして扱わない) か
export function isKeyForFormControl(e: { target: EventTarget | null; ctrlKey: boolean; metaKey: boolean }): boolean {
  const el = e.target as { tagName?: string; type?: string } | null;
  if (el?.tagName === "TEXTAREA" || el?.tagName === "SELECT") return true;
  if (el?.tagName !== "INPUT") return false;
  return !NON_TEXT_INPUT_TYPES.has(el.type ?? "text") || !(e.ctrlKey || e.metaKey);
}

export function useGlobalKeys(
  active: () => boolean,
  handlers: { keydown?: (e: KeyboardEvent) => void; keyup?: (e: KeyboardEvent) => void },
): void {
  const shouldIgnore = (e: KeyboardEvent): boolean => {
    return !active() || isKeyForFormControl(e);
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
