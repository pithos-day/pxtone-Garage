// フローティングパネルの開閉・位置状態
import { reactive } from "vue";

export interface PanelState {
  open: boolean;
  x: number;
  y: number;
}

export const panels = reactive<Record<string, PanelState>>({
  player: { open: true, x: 560, y: 180 },
  projector: { open: true, x: 280, y: 120 },
  effector: { open: false, x: 280, y: 300 },
  copier: { open: false, x: 560, y: 300 },
});
