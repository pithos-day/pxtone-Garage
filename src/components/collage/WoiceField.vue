// 音色プロパティ一覧 (W モード)
<script setup lang="ts">
import { useCanvas } from "../../composables/useCanvas";
import { ref } from "vue";
import { drawGrid, fillRect, fillText } from "../../lib/draw";
import { COLORS } from "../../lib/theme";
import { doc, woices, getService, woiceTypeName, woiceName, clockView as projectClockView } from "../../state/project";
import { woiceTypeColor } from "../../lib/theme";

const BAND = 12;
const ROW_H = 18;
const canvasRef = ref<HTMLCanvasElement | null>(null);

// カラム: NO / 名前 / 型 / 情報
const cols = [
  { x: 4, w: 30, label: "NO" },
  { x: 34, w: 110, label: "名前" },
  { x: 144, w: 30, label: "型" },
  { x: 174, w: 0, label: "情報" },
];

useCanvas(
  canvasRef,
  (ctx, w, h) => draw(ctx, w, h),
  [() => doc.rev, () => woices.value.length, () => doc.scrollX, () => doc.zoom],
);

function draw(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const s = getService();
  if (!s) return;
  const view = projectClockView();
  drawGrid(ctx, { w, h, scrollX: doc.scrollX, view, top: 0, bottom: BAND, showNumber: true, numberTop: 0 });
  fillRect(ctx, 0, BAND, w, h - BAND, COLORS.fieldBg);

  // ヘッダ行
  fillText(ctx, "音色リスト", 4, BAND + 10, COLORS.textBright, 11);
  for (const c of cols) {
    fillText(ctx, c.label, c.x, BAND + 24, COLORS.textDim, 9);
  }

  for (let i = 0; i < s.woiceNum; i++) {
    const w2 = s.woiceGet(i);
    if (!w2) continue;
    const y = BAND + 12 + (i + 1) * ROW_H;
    const vc = w2.getVoice(0);
    fillRect(ctx, 0, y, w, ROW_H, i % 2 ? "rgba(255,255,255,0.02)" : "transparent");
    fillRect(ctx, 0, y, 3, ROW_H, woiceTypeColor(w2.type));
    fillText(ctx, String(i), cols[0]!.x, y + 13, COLORS.text, 11);
    // 名前 (カラム幅でクリップ)
    ctx.save();
    ctx.beginPath();
    ctx.rect(cols[1]!.x, y, cols[1]!.w, ROW_H);
    ctx.clip();
    fillText(ctx, woiceName(w2), cols[1]!.x, y + 13, COLORS.textBright, 11);
    ctx.restore();
    fillText(ctx, woiceTypeName(w2.type), cols[2]!.x, y + 13, woiceTypeColor(w2.type), 11);
    let info = "";
    if (vc) {
      switch (w2.type) {
        case 1:
          info = `${vc.pcm.sps}Hz / ${vc.pcm.bps}bit / ${vc.pcm.ch}ch / ${(vc.pcm.sec * 1000).toFixed(0)}ms`;
          break;
        case 2:
          info = vc.type === 0 ? `座標波形 ${vc.wave.num}点` : vc.type === 1 ? `倍音 ${vc.wave.num}音` : "?";
          break;
        case 3:
          info = `${vc.ptn.unitNum}ユニット / ${(vc.ptn.sec * 1000).toFixed(0)}ms`;
          break;
      }
    }
    fillText(ctx, info, cols[3]!.x, y + 13, COLORS.text, 10);
  }
}
</script>

<template>
  <canvas ref="canvasRef" class="field-canvas" />
</template>
