// 音色の安定した識別子。「音色を編集」の書き戻し先は index だと並べ替えや削除、undo でズレるため、
// Woice オブジェクトに結び付けたキーで指す。並べ替えや削除ではオブジェクトごと動くので
// キーも自動で追従する。undo はスナップショットの読み戻しでオブジェクトが作り直されるため、
// UndoEntry にキーの並びを持たせて復元する
import type { Service, Woice } from "pxtone-ts";

// どの音色にも一致しないキー
export const NO_WOICE_KEY = 0;

const keys = new WeakMap<Woice, number>();
let nextKey = NO_WOICE_KEY + 1;

function woiceKeyOf(w: Woice): number {
  let key = keys.get(w);
  if (key === undefined) {
    key = nextKey++;
    keys.set(w, key);
  }
  return key;
}

export function woiceKeyAt(s: Service, index: number): number {
  const w = s.woiceGet(index);
  return w ? woiceKeyOf(w) : NO_WOICE_KEY;
}

export function woiceKeysOf(s: Service): number[] {
  return Array.from({ length: s.woiceNum }, (_, i) => woiceKeyAt(s, i));
}

// スナップショットを読み戻した Service の音色へ、取得時のキーを付け直す
export function restoreWoiceKeys(s: Service, woiceKeys: readonly number[]): void {
  woiceKeys.forEach((key, i) => {
    const w = s.woiceGet(i);
    if (w) keys.set(w, key);
  });
}

// キーの音色の現在の index。削除済みなどで見つからなければ -1
export function findWoiceIndex(s: Service, key: number): number {
  return woiceKeysOf(s).indexOf(key);
}
