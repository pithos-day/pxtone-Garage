// ドロップダウンメニュー (MenuBar) の開閉管理。
// メニュー外クリック・Escape で閉じる (useCtxMenuClose の一般化)
import { onBeforeUnmount, onMounted, ref } from "vue";

export function useDropdownMenu<T extends string>() {
  const openMenu = ref<T | null>(null);
  const openSubIndex = ref(-1);

  function close(): void {
    openMenu.value = null;
    openSubIndex.value = -1;
  }
  function toggleMenu(name: T): void {
    openMenu.value = openMenu.value === name ? null : name;
    openSubIndex.value = -1;
  }
  function hoverMenu(name: T): void {
    if (openMenu.value) {
      openMenu.value = name;
      openSubIndex.value = -1;
    }
  }

  // メニュー外クリック / Escape で閉じる
  const onGlobalClick = (e: MouseEvent): void => {
    if (!(e.target as HTMLElement).closest(".menu-bar")) close();
  };
  const onGlobalKeydown = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && openMenu.value) close();
  };
  onMounted(() => {
    window.addEventListener("click", onGlobalClick);
    window.addEventListener("keydown", onGlobalKeydown);
  });
  onBeforeUnmount(() => {
    window.removeEventListener("click", onGlobalClick);
    window.removeEventListener("keydown", onGlobalKeydown);
  });

  return { openMenu, openSubIndex, toggleMenu, hoverMenu, close };
}
