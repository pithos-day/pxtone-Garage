// ドット絵を、拡大率によらず 1 ドットが整数個の物理 px になるよう Canvas に描く。
// CSS px は拡大率 125% などで物理 px に割り切れず、ドットの太さが不揃いになる。
// SVG をそのまま縮尺して表示すると丸め次第でドットがずれるので、物理 px と 1:1 の Canvas を使う
import { onBeforeUnmount, onMounted, watch, type Ref } from "vue";
import { COLORS, themeRev } from "../lib/theme";

export interface PixelArtSpec {
  src: string;
  dotsX: number; // 横のドット数
  dotsY: number; // 縦のドット数
  cssPxPerDot: number; // 拡大率 100% のときの 1 ドットの大きさ
}

export function useCrispPixelArt(target: Ref<HTMLCanvasElement | null>, spec: PixelArtSpec): void {
  const image = new Image();
  let stopWatchingDpr = () => {};

  function draw(devicePxPerDot: number): void {
    const canvas = target.value;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !image.complete) return;
    // 大きさの代入で Canvas の中身と合成モードも初期化される
    canvas.width = spec.dotsX * devicePxPerDot;
    canvas.height = spec.dotsY * devicePxPerDot;
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    // 不透明なドットだけをテーマの色で塗る
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = COLORS.accent;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  function render(): void {
    const canvas = target.value;
    if (!canvas) return;
    const dpr = window.devicePixelRatio;
    const devicePxPerDot = Math.max(1, Math.round(spec.cssPxPerDot * dpr));
    canvas.style.width = `${(spec.dotsX * devicePxPerDot) / dpr}px`;
    canvas.style.height = `${(spec.dotsY * devicePxPerDot) / dpr}px`;
    // サイズを変えると右寄せの開始位置も動くので、サイズを決めてから物理 px の格子に揃える。
    // transform だとブラウザの描画時のスナップが効かず、わずかな縮尺でドットがずれるので left / top で動かす
    canvas.style.left = "0";
    canvas.style.top = "0";
    const { left, top } = canvas.getBoundingClientRect();
    canvas.style.left = `${Math.round(left * dpr) / dpr - left}px`;
    canvas.style.top = `${Math.round(top * dpr) / dpr - top}px`;
    draw(devicePxPerDot);
  }

  // resolution のメディアクエリは「今の値から変わった」を一度しか通知しないので、毎回張り直す。
  // 別の倍率のモニターへ移したときは resize が来ないことがあるので、これも見る
  function watchDpr(): void {
    const query = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    const onChange = () => {
      render();
      watchDpr();
    };
    query.addEventListener("change", onChange, { once: true });
    stopWatchingDpr = () => query.removeEventListener("change", onChange);
  }

  watch(themeRev, render);

  onMounted(() => {
    image.onload = render;
    image.src = spec.src;
    render();
    watchDpr();
    window.addEventListener("resize", render);
  });
  onBeforeUnmount(() => {
    image.onload = null;
    stopWatchingDpr();
    window.removeEventListener("resize", render);
  });
}
