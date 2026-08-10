// Canvas フィールドの共通セットアップ (DPR対応・リサイズ・再描画スケジューリング)
import { onBeforeUnmount, watch, type Ref } from "vue";

export interface CanvasHost {
  schedule(): void;
}

export function useCanvas(
  canvasRef: Ref<HTMLCanvasElement | null>,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  deps: (() => unknown)[] = [],
): CanvasHost {
  let pendingRaf: number | null = null;
  let observer: ResizeObserver | null = null;

  function render(): void {
    const c = canvasRef.value;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth;
    const h = c.clientHeight;
    if (w === 0 || h === 0) return;
    const tw = Math.round(w * dpr);
    const th = Math.round(h * dpr);
    if (c.width !== tw || c.height !== th) {
      c.width = tw;
      c.height = th;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    draw(ctx, w, h);
  }

  function schedule(): void {
    if (pendingRaf !== null) return;
    pendingRaf = requestAnimationFrame(() => {
      pendingRaf = null;
      render();
    });
  }

  watch(canvasRef, (c, old) => {
    if (c === old) return;
    observer?.disconnect();
    observer = null;
    if (c) {
      observer = new ResizeObserver(() => schedule());
      observer.observe(c);
      schedule();
    }
  });

  for (const d of deps) {
    watch(d, () => schedule(), { immediate: true });
  }

  onBeforeUnmount(() => {
    observer?.disconnect();
    observer = null;
    if (pendingRaf !== null) cancelAnimationFrame(pendingRaf);
  });

  return { schedule };
}
