// タブ付きドキュメント (ptVoice / ptNoise) の共通管理。
// タブごとに独立した実体と undo スタックを持ち、undo はバイト列スナップショット方式。
// voice.ts / noise.ts は実体の読み書き (codec) とタブ生成だけを提供する。
// (本家と同じく、この層はコラージュの projects.ts とはタブ管理方式が異なる)
import { ref, type Ref } from "vue";
import { downloadBytes, sanitizeFileName, stripFileExt, supportsSavePicker } from "../engine/io";
import { t } from "../i18n";

const MAX_UNDO = 100;

export interface TabDocBase {
  id: number;
  fileName: string;
  dirty: boolean;
  undoStack: Uint8Array[];
  redoStack: Uint8Array[];
}

// 実体のバイト列化・復元 (voice: ptvWrite/ptvRead、noise: write/read)
export interface DocCodec<D extends TabDocBase> {
  snapshot(d: D): Uint8Array | null;
  restore(d: D, bytes: Uint8Array): boolean;
}

export function createDocTabs<D extends TabDocBase>(codec: DocCodec<D>) {
  const docs = ref<D[]>([]) as Ref<D[]>;
  const currentId = ref(-1);
  let nextId = 1;

  return {
    docs,
    currentId,

    current(): D | null {
      return docs.value.find((d) => d.id === currentId.value) ?? null;
    },

    // タブを追加して切り替える (id はここで振る)
    add(d: Omit<D, "id"> & Partial<Pick<D, "id">>): D {
      const doc = { ...d, id: nextId++ } as D;
      docs.value.push(doc);
      currentId.value = doc.id;
      return doc;
    },

    close(id: number): void {
      const idx = docs.value.findIndex((d) => d.id === id);
      if (idx < 0) return;
      docs.value.splice(idx, 1);
      if (currentId.value === id) {
        const next = docs.value[Math.min(idx, docs.value.length - 1)];
        currentId.value = next?.id ?? -1;
      }
    },

    switchTo(id: number): void {
      if (currentId.value !== id) currentId.value = id;
    },

    // 編集前のスナップショットを undo スタックへ
    pushUndo(d: D): void {
      const b = codec.snapshot(d);
      if (!b) return;
      d.undoStack.push(b);
      if (d.undoStack.length > MAX_UNDO) d.undoStack.shift();
      d.redoStack.length = 0;
    },

    // 1回の編集操作 (undo 1エントリ + dirty 化)
    edit(d: D, fn: () => void): void {
      this.pushUndo(d);
      fn();
      d.dirty = true;
    },

    // stack から pop したスナップショットへ戻し、現在状態を pushTo へ積む (undo/redo 共通)
    restoreFrom(d: D, stack: Uint8Array[], pushTo: Uint8Array[]): boolean {
      const b = stack.pop();
      if (!b) return false;
      const cur = codec.snapshot(d);
      if (cur) pushTo.push(cur);
      if (!codec.restore(d, b)) return false;
      d.dirty = true;
      return true;
    },

    // タブをファイルとして保存 (asNew でファイル名入力を促す)。
    // 通常保存 (asNew=false) はダイアログを開かずダウンロードを発火し、
    // 名前を付けて保存 (asNew=true) は対応ブラウザでピッカーを開く
    async save(d: D, asNew: boolean, ext: string): Promise<boolean> {
      let name = d.fileName || "untitled";
      if (asNew && !supportsSavePicker()) {
        const input = window.prompt(t("prompt.fileName"), name);
        if (input === null) return false;
        name = input.trim() || "untitled";
      }
      const bytes = codec.snapshot(d);
      if (!bytes) return false;
      // キャンセル時 (null) はファイル名を更新しない。ピッカーで変更された名前は反映する
      // (タブ表示は拡張子なしのため、拡張子を除いて記録する)
      const saved = await downloadBytes(bytes, { fileName: sanitizeFileName(name, ext), usePicker: asNew });
      if (!saved) return false;
      d.fileName = stripFileExt(saved);
      d.dirty = false;
      return true;
    },
  };
}
