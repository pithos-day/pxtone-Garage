// 行の並べ替えドラッグの表示。掴んだ行の半透明コピーをポインタに追従させ、カーソルを掴んでいる形にする
const START_DISTANCE_PX = 4; // クリックの手ぶれでは表示しない

export interface RowDragGhost {
  move(e: PointerEvent): void;
  remove(): void;
}

// 複製は押下の時点で作る (並べ替えが始まると同じ DOM 要素の中身が別の行に変わるため)
export function createRowDragGhost(row: HTMLElement, down: PointerEvent): RowDragGhost {
  const rect = row.getBoundingClientRect();
  const offsetX = down.clientX - rect.left;
  const offsetY = down.clientY - rect.top;
  const ghost = row.cloneNode(true) as HTMLElement;
  ghost.classList.add("row-drag-ghost");
  ghost.inert = true;
  ghost.style.width = `${rect.width}px`;
  // 同じ name のラジオボタンが増えると、元の行の選択が外れてしまう
  ghost.querySelectorAll("input").forEach((input) => input.removeAttribute("name"));

  let started = false;
  return {
    move(e) {
      if (!started) {
        if (Math.hypot(e.clientX - down.clientX, e.clientY - down.clientY) < START_DISTANCE_PX) return;
        started = true;
        document.body.classList.add("row-dragging");
        document.body.append(ghost);
      }
      ghost.style.transform = `translate(${e.clientX - offsetX}px, ${e.clientY - offsetY}px)`;
    },
    remove() {
      document.body.classList.remove("row-dragging");
      ghost.remove();
    },
  };
}
