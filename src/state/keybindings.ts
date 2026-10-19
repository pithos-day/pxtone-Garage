// キーボードショートカットの実行時割り当て (ユーザーによる上書き)。
// 既定値は lib/shortcuts が持ち、ここでは状態の保持・localStorage への永続化・
// リアクティブな表示用ラッパーを提供する。
import { reactive } from "vue";
import {
  DEFAULT_BINDINGS,
  bindingConflict as findBindingConflict,
  formatShortcutWithBindings,
  shortcutCommand as matchShortcutCommand,
  type KeyBinding,
  type ShortcutBindings,
  type ShortcutCommand,
  type ShortcutContext,
  type ShortcutEvent,
} from "../lib/shortcuts";
import { readStorage, writeStorage } from "../lib/storage";

const STORAGE_KEY = "pxtone-garage-keybindings-v1";

function cloneBindings(source: ShortcutBindings): ShortcutBindings {
  const out = {} as ShortcutBindings;
  for (const command of Object.keys(source) as ShortcutCommand[]) {
    out[command] = (source[command] ?? []).map((b) => ({ ...b }));
  }
  return out;
}

// メニュー・ツールチップが購読するリアクティブな割り当て表
export const bindings = reactive(cloneBindings(DEFAULT_BINDINGS)) as ShortcutBindings;

// localStorage の上書きを読み込む (起動時に 1 回呼ぶ)。
// 壊れた値・未知のコマンドは無視して既定値へ落とす
export function initKeybindings(): void {
  const raw = readStorage(STORAGE_KEY);
  if (!raw) return;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return;
  }
  const saved = (parsed as { bindings?: unknown })?.bindings ?? parsed;
  if (typeof saved !== "object" || saved === null) return;

  for (const command of Object.keys(DEFAULT_BINDINGS) as ShortcutCommand[]) {
    const value = (saved as Record<string, unknown>)[command];
    if (!Array.isArray(value)) continue;
    const keys: KeyBinding[] = [];
    for (const item of value) {
      if (typeof item !== "object" || item === null) continue;
      const b = item as KeyBinding;
      if (typeof b.key !== "string" || b.key.length === 0) continue;
      keys.push({
        key: b.key,
        ...(b.ctrl ? { ctrl: true } : {}),
        ...(b.shift ? { shift: true } : {}),
        ...(b.alt ? { alt: true } : {}),
        ...(b.label ? { label: b.label } : {}),
      });
    }
    bindings[command] = keys;
  }
}

function persist(): void {
  writeStorage(STORAGE_KEY, JSON.stringify({ version: 1, bindings }));
}

// キー入力 → コマンド ID (現在の割り当てで判定)
export function shortcutCommand(e: ShortcutEvent, ctx: ShortcutContext): ShortcutCommand | null {
  return matchShortcutCommand(e, ctx, bindings);
}

// メニュー・ツールチップ併記用の表示 (現在の割り当てを購読する)
export function formatShortcut(command: ShortcutCommand, isMac?: boolean): string {
  return formatShortcutWithBindings(command, bindings, isMac);
}

export function setBinding(command: ShortcutCommand, index: number, binding: KeyBinding): void {
  const keys = bindings[command];
  if (!keys || index < 0 || index >= keys.length) return;
  keys[index] = { ...binding };
  persist();
}

export function addBinding(command: ShortcutCommand, binding: KeyBinding): void {
  bindings[command] = [...(bindings[command] ?? []), { ...binding }];
  persist();
}

export function removeBinding(command: ShortcutCommand, index: number): void {
  const keys = bindings[command];
  if (!keys) return;
  keys.splice(index, 1);
  persist();
}

export function resetBinding(command: ShortcutCommand): void {
  bindings[command] = (DEFAULT_BINDINGS[command] ?? []).map((b) => ({ ...b }));
  persist();
}

export function resetAllBindings(): void {
  for (const command of Object.keys(DEFAULT_BINDINGS) as ShortcutCommand[]) {
    bindings[command] = DEFAULT_BINDINGS[command].map((b) => ({ ...b }));
  }
  persist();
}

// 既定値から変更されているか (リセットボタンの表示判定)
export function isDefaultBinding(command: ShortcutCommand): boolean {
  const current = bindings[command] ?? [];
  const base = DEFAULT_BINDINGS[command] ?? [];
  if (current.length !== base.length) return false;
  return current.every((b, i) => {
    const d = base[i]!;
    return b.key === d.key && !!b.ctrl === !!d.ctrl && !!b.shift === !!d.shift && !!b.alt === !!d.alt;
  });
}

// 他コマンドとの競合を返す (同じコマンド内の重複は UI 側で別途確認する)
export function conflictFor(command: ShortcutCommand, binding: KeyBinding): ShortcutCommand | null {
  return findBindingConflict(bindings, command, binding);
}
