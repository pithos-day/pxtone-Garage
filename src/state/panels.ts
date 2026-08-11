// サイドバーパネルの開閉状態 (ページ埋め込み用)
import { reactive } from "vue";

export interface PanelState {
  open: boolean;
}

// パネルトグルボタンの定義 (id + 表示ラベル)。TransportBar と panels で共用
export const PANEL_DEFS = [
  { id: "effector", label: "Effector" },
  { id: "copier", label: "Copier" },
] as const;

export const panels = reactive<Record<string, PanelState>>({
  effector: { open: false },
  copier: { open: false },
});
