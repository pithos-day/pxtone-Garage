// PWA の Service Worker の登録と更新通知。
// 新しい版は待機させ、ユーザーが選ぶまで切り替えない (編集中に勝手に再読み込みしない)
import { ref } from "vue";
import { shouldRegisterServiceWorker } from "../lib/pwa";

export const updateReady = ref(false);

let reloadToUpdate: ((reload?: boolean) => Promise<void>) | null = null;

export async function initPwa(): Promise<void> {
  if (!shouldRegisterServiceWorker(location.protocol, "serviceWorker" in navigator, import.meta.env.PROD)) return;
  const { registerSW } = await import("virtual:pwa-register");
  reloadToUpdate = registerSW({
    onNeedRefresh() {
      updateReady.value = true;
    },
    onRegisterError(err) {
      console.warn("Service Worker を登録できませんでした", err);
    },
  });
}

export function applyUpdate(): void {
  void reloadToUpdate?.(true);
}

export function dismissUpdate(): void {
  updateReady.value = false;
}
