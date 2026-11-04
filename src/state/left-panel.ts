// コラージュの左パネル幅 (ドラッグで変更し、localStorage に保存する)
import { computed, ref } from "vue";
import { LEFT_W_DEFAULT, STRIP_W, clampLeftW } from "../lib/layout";
import { readStorage, writeStorage } from "../lib/storage";

const STORAGE_KEY = "pxtone-garage-left-panel-w";

function loadLeftW(): number {
  const raw = readStorage(STORAGE_KEY);
  return raw === null ? LEFT_W_DEFAULT : clampLeftW(Number(raw));
}

export const leftW = ref(loadLeftW());
// PinnedLanes のユニット名領域幅と Volume パネル幅 (左パネル + 鍵盤)
export const nameW = computed(() => leftW.value + STRIP_W);

export function setLeftW(w: number): void {
  leftW.value = clampLeftW(w);
}

export function saveLeftW(): void {
  writeStorage(STORAGE_KEY, String(leftW.value));
}
