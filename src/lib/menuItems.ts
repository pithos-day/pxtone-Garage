// メニューバー (MenuBar.vue) のメニュー項目組み立て。
// モード別メニュー定義の構築ロジックを SFC から分離する
import { FilePlus2, FileSearch2, Keyboard, Link2, Palette, Save, SavePlus, Settings, SquareX, Undo, Redo, ZoomIn } from "@lucide/vue";
import type { Component } from "vue";
import { ZOOM_MAX, ZOOM_MIN, ZOOM_TABLE } from "./clock";
import type { ShortcutCommand } from "./shortcuts";
import { t } from "../i18n";
import type { AppMode } from "./modes";

// トップメニューの名前 (表示ラベルとモード別表示順もここで定義)
export type MenuName = "file" | "edit" | "view" | "tools";

// トップメニューの表示ラベル
export const MENU_LABELS: Record<MenuName, string> = {
  file: "File",
  edit: "Edit",
  view: "View",
  tools: "Tools",
};

// モード別のトップメニュー (voice/noise は View を持たないが、環境設定の Tools は共通)
export function menuNamesFor(mode: AppMode): MenuName[] {
  return mode === "collage" ? ["file", "edit", "view", "tools"] : ["file", "edit", "tools"];
}

export interface MenuItem {
  icon?: Component;
  label?: string;
  action?: () => void;
  disabled?: boolean;
  checked?: boolean;
  sep?: boolean;
  sub?: MenuItem[];
  // 数値を直接編集するスライダー行 (ズームの微調整用)。
  // メニュー項目クリックで閉じないよう、MenuItemRow 側で action とは別に描画する
  slider?: {
    min: number;
    max: number;
    step?: number;
    value: number;
    onInput: (value: number) => void;
    format?: (value: number) => string;
  };
  // ショートカット表示 (右寄せで併記する)。lib/shortcuts のコマンドを指す
  command?: ShortcutCommand;
}

// モード別に差し替わる操作 (File メニュー・undo/redo)
export interface ModeMenuOps {
  new: () => void;
  open: () => void;
  // URL を入力して開く (省略時はメニューに出さない)
  openFromLink?: () => void;
  save: () => void;
  saveAs: () => void;
  close: () => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  // 保存可否 (省略時は保存可。tune 再生専用タブ等で false を返す)
  canSave?: () => boolean;
  // 閉じる可否 (省略時は閉じられる。タブが 1 つで閉じられないときなど false)
  canClose?: () => boolean;
}

// File メニュー。共通 5 項目 (new/open/save/saveAs + 区切り) + 保存系の手前の固有項目
// (beforeSave) + モード固有項目 (extra) + close
export function buildFileMenu(ops: ModeMenuOps, extra: MenuItem[], beforeSave: MenuItem[] = []): MenuItem[] {
  const saveDisabled = ops.canSave ? !ops.canSave() : false;
  const closeDisabled = ops.canClose ? !ops.canClose() : false;
  return [
    { label: t("menu.file.new"), icon: FilePlus2, action: ops.new },
    { label: t("menu.file.open"), icon: FileSearch2, action: ops.open },
    ...(ops.openFromLink
      ? [{ label: t("menu.file.openFromLink"), icon: Link2, action: ops.openFromLink }]
      : []),
    { sep: true },
    ...beforeSave,
    { label: t("menu.file.save"), icon: Save, action: ops.save, disabled: saveDisabled, command: "save" },
    { label: t("menu.file.saveAs"), icon: SavePlus, action: ops.saveAs, disabled: saveDisabled, command: "saveAs" },
    { sep: true },
    ...extra,
    { label: t("menu.file.close"), icon: SquareX, action: ops.close, disabled: closeDisabled },
  ];
}

// Edit メニュー。undo/redo + モード固有項目 (extra)
export function buildEditMenu(ops: ModeMenuOps, extra: MenuItem[]): MenuItem[] {
  return [
    { label: t("menu.edit.undo"), icon: Undo, action: ops.undo, disabled: !ops.canUndo(), command: "undo" },
    { label: t("menu.edit.redo"), icon: Redo, action: ops.redo, disabled: !ops.canRedo(), command: "redo" },
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
      sub: [
        ...ZOOM_TABLE.map((z) => ({
          label: `${z}px`,
          action: () => args.onZoom(z),
          checked: Math.abs(args.zoom - z) < 0.5,
        })),
        { sep: true },
        {
          slider: {
            min: ZOOM_MIN,
            max: ZOOM_MAX,
            step: 1,
            value: args.zoom,
            onInput: args.onZoom,
            format: (z) => `${Math.round(z)}px`,
          },
        },
      ],
    },
  ];
}

// Tools メニュー (collage/voice/noise 共通)。
// 環境設定はフォルダのようにサブメニュー化し、外観設定・キー設定をその中へ入れる
export function buildToolsMenu(args: { onAppearance: () => void; onKeys: () => void }): MenuItem[] {
  return [
    {
      label: t("menu.tools.settings"),
      icon: Settings,
      sub: [
        { label: t("menu.tools.appearance"), icon: Palette, action: args.onAppearance },
        { label: t("menu.tools.keys"), icon: Keyboard, action: args.onKeys },
      ],
    },
  ];
}
