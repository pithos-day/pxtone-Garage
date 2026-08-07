// サイドバーパネルの開閉状態 (ページ埋め込み用)
import { reactive } from "vue";

export interface PanelState {
  open: boolean;
}

export const panels = reactive<Record<string, PanelState>>({
  effector: { open: false },
  copier: { open: false },
});
