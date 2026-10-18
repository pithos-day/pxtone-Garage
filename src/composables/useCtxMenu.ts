// アプリ固有のコンテキストメニュー (ctxmenu) を開いているとき、
// メニュー外の左クリック・Escape・キー操作 (修飾キー単独以外) で閉じる。
// キー操作でも閉じるのは、ショートカット実行時にメニューが残らないようにするため
// (本家 if_Menu_Scope_SetActive(false) 相当)。右クリック (button 2) はメニューを
// 開く操作なので対象外。
import { onBeforeUnmount, onMounted, type Ref } from "vue";
import { isModifierKey } from "../lib/shortcuts";

export function useCtxMenuClose(menu: Ref<unknown | null>): void {
  const onPointerDown = (e: PointerEvent): void => {
    if (e.button === 2) return;
    if (!menu.value) return;
    const target = e.target as HTMLElement | null;
    if (!target || !target.closest?.(".ctxmenu")) menu.value = null;
  };
  const onKeydown = (e: KeyboardEvent): void => {
    if (!menu.value || isModifierKey(e.key)) return;
    menu.value = null;
  };
  onMounted(() => {
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeydown);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("keydown", onKeydown);
  });
}
