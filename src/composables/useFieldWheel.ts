// キャンバスフィールド共通のホイール操作。
// Ctrl=ズーム (カーソル位置基準) / Shift=横スクロールを doc へ反映する
import { type Ref } from "vue";
import { zoomAnchorScrollX, zoomOrPan } from "../lib/field";
import { doc } from "../state/project";

// offsetX はフィールド左端の除外幅。ズームも横スクロールもしなければ false を返す
// (修飾なしのホイールは呼び出し側がフィールドごとに扱う)
export function applyFieldWheel(e: WheelEvent, canvasRef: Ref<HTMLCanvasElement | null>, offsetX = 0): boolean {
  const { zoom, pan } = zoomOrPan(e, doc.zoom);
  if (zoom !== null) {
    const rect = canvasRef.value?.getBoundingClientRect();
    if (rect) doc.scrollX = zoomAnchorScrollX(doc.zoom, zoom, doc.scrollX, e.clientX - rect.left, offsetX);
    doc.zoom = zoom;
    return true;
  }
  if (pan !== null) {
    doc.scrollX = Math.max(0, doc.scrollX + pan);
    return true;
  }
  return false;
}
