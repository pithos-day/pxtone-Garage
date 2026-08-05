// フローティングパネルの開閉状態 (ページ埋め込み用)
import { reactive } from "vue";

export interface PanelState {
  open: boolean;
}

export const panels = reactive<Record<string, PanelState>>({
  player: { open: true },
  projector: { open: true },
  effector: { open: false },
  copier: { open: false },
});
