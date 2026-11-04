// ノートのクオンタイズの配置計算 (state 層に依存しない純関数)

export interface QuantizeOptions {
  grid: number; // グリッド幅 (クロック)
  strength: number; // 寄せる強さ (0..1)
  quantizeEnd: boolean; // 終端もグリッドへ揃えるか
}

export interface QuantizedNote {
  head: number; // 元の先頭
  newHead: number;
  newLen: number;
  dropped: boolean; // 先頭が前のノートと重なって消えるノート
}

function snap(clock: number, { grid, strength }: QuantizeOptions): number {
  return Math.round(clock + (Math.round(clock / grid) * grid - clock) * strength);
}

// 時間順のノート列の配置を計算する。先頭が同じ位置に重なったら時間順で先のノートを残し、
// 次のノートにかかる長さは切り詰める (1 ユニットは同時に 1 音のため)
export function quantizeNotes(notes: readonly { head: number; end: number }[], opts: QuantizeOptions): QuantizedNote[] {
  const out: QuantizedNote[] = [];
  let prev: QuantizedNote | null = null;
  for (const n of notes) {
    const newHead = Math.max(0, snap(n.head, opts));
    if (prev && newHead <= prev.newHead) {
      out.push({ head: n.head, newHead, newLen: 0, dropped: true });
      continue;
    }
    if (prev && prev.newHead + prev.newLen > newHead) prev.newLen = newHead - prev.newHead;
    const newEnd = opts.quantizeEnd ? snap(n.end, opts) : newHead + (n.end - n.head);
    const cur: QuantizedNote = { head: n.head, newHead, newLen: newEnd > newHead ? newEnd - newHead : opts.grid, dropped: false };
    out.push(cur);
    prev = cur;
  }
  return out;
}
