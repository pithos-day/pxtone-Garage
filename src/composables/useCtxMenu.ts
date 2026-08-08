// アプリ固有のコンテキストメニュー (ctxmenu) を開いているとき、
// メニュー外の左クリックや Escape で閉じる。
// 右クリック (button 2) はメニューを開く操作なので対象外。
import { onBeforeUnmount, onMounted, type Ref } from "vue";

export function useCtxMenuClose(menu: Ref<unknown | null>): void {
  const onPointerDown = (e: PointerEvent): void => {
    if (e.button === 2) return;
    if (!menu.value) return;
    const target = e.target as HTMLElement | null;
    if (!target || !target.closest?.(".ctxmenu")) menu.value = null;
  };
  const onKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") menu.value = null;
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
