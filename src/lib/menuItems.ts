// メニューバー (MenuBar.vue) のメニュー項目組み立て。
// モード別メニュー定義の構築ロジックを SFC から分離する
import { ZOOM_TABLE, DIVI_TABLE } from "./clock";
import { t } from "../i18n";

export interface MenuItem {
  label?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  sep?: boolean;
  sub?: MenuItem[];
}

// モード別に差し替わる操作 (File メニュー・undo/redo)
export interface ModeMenuOps {
  new: () => void;
  open: () => void;
  save: () => void;
  saveAs: () => void;
  close: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

// File メニュー。基本 5 項目 + モード固有項目 (extra) + close
export function buildFileMenu(ops: ModeMenuOps, extra: MenuItem[]): MenuItem[] {
  return [
    { label: t("menu.file.new"), action: ops.new },
    { label: t("menu.file.open"), action: ops.open },
    { label: t("menu.file.save"), action: ops.save },
    { label: t("menu.file.saveAs"), action: ops.saveAs },
    { sep: true },
    ...extra,
    { label: t("menu.file.close"), action: ops.close },
  ];
}

// Edit メニュー。undo/redo + モード固有項目 (extra)
export function buildEditMenu(ops: ModeMenuOps, extra: MenuItem[]): MenuItem[] {
  return [
    { label: t("menu.edit.undo"), action: ops.undo, disabled: !ops.canUndo() },
    { label: t("menu.edit.redo"), action: ops.redo, disabled: !ops.canRedo() },
    ...extra,
  ];
}

// View メニュー (collage 固定)
export function buildViewMenu(args: {
  allVisible: boolean;
  zoom: number;
  divi: number;
  onToggleAll: () => void;
  onZoom: (z: number) => void;
  onDivi: (d: number) => void;
}): MenuItem[] {
  return [
    { label: t("menu.view.showAllUnits"), action: args.onToggleAll, checked: args.allVisible },
    { sep: true },
    {
      label: t("menu.view.zoom"),
      sub: ZOOM_TABLE.map((z) => ({ label: `${z}px`, action: () => args.onZoom(z), checked: args.zoom === z })),
    },
    {
      label: t("menu.view.division"),
      sub: DIVI_TABLE.map((d) => ({ label: `${d}`, action: () => args.onDivi(d), checked: args.divi === d })),
    },
  ];
}
