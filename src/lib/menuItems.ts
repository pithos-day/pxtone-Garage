// メニューバー (MenuBar.vue) のメニュー項目組み立て。
// モード別メニュー定義の構築ロジックを SFC から分離する
import { FilePlus2, FileSearch2, Save, SavePlus, SquareX, Undo, Redo, ZoomIn } from "@lucide/vue";
import type { Component } from "vue";
import { ZOOM_TABLE } from "./clock";
import { t } from "../i18n";
import type { AppMode } from "./modes";

// トップメニューの名前 (表示ラベルとモード別表示順もここで定義)
export type MenuName = "file" | "edit" | "view";

// トップメニューの表示ラベル
export const MENU_LABELS: Record<MenuName, string> = {
  file: "File",
  edit: "Edit",
  view: "View",
};

// モード別のトップメニュー (voice/noise は File + Edit。Edit には undo/redo と
// A/B コピー (voice) があるため表示する)
export function menuNamesFor(mode: AppMode): MenuName[] {
  return mode === "collage" ? ["file", "edit", "view"] : ["file", "edit"];
}

export interface MenuItem {
  icon?: Component;
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

// File メニュー。共通 5 項目 (new/open/save/saveAs + 区切り) + モード固有項目 (extra) + close
export function buildFileMenu(ops: ModeMenuOps, extra: MenuItem[]): MenuItem[] {
  return [
    { label: t("menu.file.new"), icon: FilePlus2, action: ops.new },
    { label: t("menu.file.open"), icon: FileSearch2, action: ops.open },
    { sep: true },
    { label: t("menu.file.save"), icon: Save, action: ops.save },
    { label: t("menu.file.saveAs"), icon: SavePlus, action: ops.saveAs },
    { sep: true },
    ...extra,
    { label: t("menu.file.close"), icon: SquareX, action: ops.close },
  ];
}

// Edit メニュー。undo/redo + モード固有項目 (extra)
export function buildEditMenu(ops: ModeMenuOps, extra: MenuItem[]): MenuItem[] {
  return [
    { label: t("menu.edit.undo"), icon: Undo, action: ops.undo, disabled: !ops.canUndo() },
    { label: t("menu.edit.redo"), icon: Redo, action: ops.redo, disabled: !ops.canRedo() },
    ...extra,
  ];
}

// View メニュー (collage 固定)
export function buildViewMenu(args: {
  allVisible: boolean;
  zoom: number;
  onToggleAll: () => void;
  onZoom: (z: number) => void;
}): MenuItem[] {
  return [
    { label: t("menu.view.showAllUnits"), action: args.onToggleAll, checked: args.allVisible },
    { sep: true },
    {
      label: t("menu.view.zoom"),
      icon: ZoomIn,
      sub: ZOOM_TABLE.map((z) => ({ label: `${z}px`, action: () => args.onZoom(z), checked: args.zoom === z })),
    },
  ];
}
