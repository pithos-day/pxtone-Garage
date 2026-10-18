// ループ再生用バッファの整形 (純関数)。
// 末尾フェード + 先頭フェードで両端を 0 に落とすと、ループのたびに音量が落ち込む
// (ノッチ) ため、末尾の素材を先頭へクロスフェードで混ぜて継ぎ目を滑らかにする。

// ループ点 (末尾 → 先頭) の継ぎ目を滑らかにする。
// 1. 末尾サンプルに最も近い値の位置を末尾付近 (maxFade 以内) から探す
// 2. 先頭の fade サンプルを、末尾側の素材とクロスフェードで混ぜる
// maxFade は探索・クロスフェードの上限サンプル数 (バッファ長の 1/4 を超えない)
export function loopCrossfade(ch0: Float32Array, ch1: Float32Array, maxFade: number): void {
  const n = ch0.length;
  if (n < 8 || maxFade < 2) return;
  const limit = Math.min(maxFade, Math.trunc(n / 4));
  if (limit < 2) return;

  // 末尾サンプル (L/R 和) に近い位置を探す。近いほどループ点の段差が小さくなる
  const last = ch0[n - 1]! + ch1[n - 1]!;
  let fade = limit;
  let best = Infinity;
  for (let l = 2; l <= limit; l++) {
    const d = Math.abs(ch0[n - l]! + ch1[n - l]! - last);
    if (d < best) {
      best = d;
      fade = l;
    }
  }

  // 先頭を末尾側の素材でクロスフェード (重みは先頭側 0→1)
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    ch0[i] = ch0[i]! * w + ch0[n - fade + i]! * (1 - w);
    ch1[i] = ch1[i]! * w + ch1[n - fade + i]! * (1 - w);
  }
}
