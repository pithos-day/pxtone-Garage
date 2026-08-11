// 押下中サステイン再生の共通定型。
// pointerdown → onPress()、pointerup → onRelease() を呼ぶ。
// minMs を指定すると、短押しでも最低限その時間は鳴らし続ける (stopPreview を遅延実行)
import { stopPreview } from "../engine/preview";

export function useHoldPreview(minMs = 0): { onPress: () => void; onRelease: (keepHeld?: () => boolean) => void } {
  let pressAt = 0;
  return {
    onPress(): void {
      pressAt = performance.now();
    },
    onRelease(keepHeld: () => boolean = () => false): void {
      const wait = Math.max(0, minMs - (performance.now() - pressAt));
      if (wait > 0) {
        window.setTimeout(() => {
          if (!keepHeld()) stopPreview();
        }, wait);
      } else {
        stopPreview();
      }
    },
  };
}
