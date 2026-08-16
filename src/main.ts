import { createApp } from "vue";
import "./styles/global.css";
import "./styles/canvas.css";
import App from "./App.vue";
import { initTheme } from "./state/theme";
import { initFonts } from "./state/fonts";
import {
  openProject,
  newProject,
  doc,
  getService,
  mutate,
  beginEdit,
  commitEdit,
  exportBytes,
  setTextComment,
  setTextName,
  EVENTDEFAULT_VELOCITY,
} from "./state/project";
import { play, stop, seekToClock, player } from "./state/player";
import { undo, redo, pushUndo } from "./state/undo";
import { renderPreview, previewUnit, previewUnitHold, previewWoiceHold, stopPreview } from "./engine/preview";
import { MemoryIo } from "pxtone-ts";

// 内蔵フォント (SIL OFL 1.1)
import "@fontsource/dotgothic16/400.css";
import "@fontsource/m-plus-rounded-1c/400.css";
import "@fontsource/m-plus-rounded-1c/700.css";
import "@fontsource/zen-maru-gothic/400.css";
import "@fontsource/zen-maru-gothic/700.css";
import "@fontsource/noto-sans-jp/400.css";
import "@fontsource/noto-sans-jp/700.css";

// テーマ CSS ソース (?raw でテキストとして取り込み、実行時にパースして注入)
import pxtoneTheme from "./themes/pxtone.css?raw";
import indigoTheme from "./themes/indigo.css?raw";
import caffeineTheme from "./themes/caffeine.css?raw";
import zenTheme from "./themes/zen.css?raw";
import vintageTheme from "./themes/vintage.css?raw";
import roseTheme from "./themes/rose.css?raw";

initTheme({
  pxtone: pxtoneTheme,
  indigo: indigoTheme,
  caffeine: caffeineTheme,
  zen: zenTheme,
  vintage: vintageTheme,
  rose: roseTheme,
});
initFonts();
createApp(App).mount("#app");

// 開発・テスト用フック
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__pxtoneGarage = {
    MemoryIo,
    openProject,
    newProject,
    doc,
    getService,
    play,
    stop,
    seekToClock,
    player,
    undo,
    redo,
    pushUndo,
    mutate,
    beginEdit,
    commitEdit,
    exportBytes,
    setTextComment,
    setTextName,
    previewUnit,
    previewUnitHold,
    previewWoiceHold,
    stopPreview,
    // 単音プレビューのデバッグ用: { len, peak } を返す
    // (durSec=1.2 秒でレンダリングし、20サンプル間隔でピークを走査する)
    previewDebug: async (unitNo: number, key: number, velocity = EVENTDEFAULT_VELOCITY, sps = 44100) => {
      const bytes = exportBytes();
      if (!bytes) return { err: "no project" };
      const buf = await renderPreview(bytes, { unitNo, woiceIdx: null }, key, velocity, 1.2, sps);
      if (!buf) return { err: "renderPreview failed" };
      let peak = 0;
      for (let i = 0; i < buf.length; i += 20) {
        const v = Math.abs(buf[i]!);
        if (v > peak) peak = v;
      }
      return { len: buf.length, peak };
    },
  };
}
