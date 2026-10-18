// アプリ全体の UI 状態 (モーダルダイアログの表示カウンタ)。
// ダイアログ表示中はショートカットを止めるために使う (ModalDialog が加減算する)
import { ref } from "vue";

const modalDepth = ref(0);

export function pushModal(): void {
  modalDepth.value++;
}

export function popModal(): void {
  modalDepth.value = Math.max(0, modalDepth.value - 1);
}

// モーダルダイアログが 1 つでも表示中か
export function isModalOpen(): boolean {
  return modalDepth.value > 0;
}
