// メトロノームのクリック音。ptnoise (Noise) をコード上で定義し、NoiseBuilder で波形にする。
// (engine/preview は state/player に依存するため、循環 import を避けて renderNoise は使わない)
import { Noise, NoiseBuilder, WaveType } from "pxtone-ts";

const CLICK_MS = 60;

// 小節頭は高く強い音、それ以外の拍は低く弱い音にする
const TONES = {
  high: { freq: 1760, volume: 80 },
  low: { freq: 1175, volume: 55 },
} as const;

// クリック 1 発の ptnoise。Sine の本体に数 ms の Random を重ねてアタックを立たせる
export function createMetronomeNoise(tone: keyof typeof TONES): Noise {
  const { freq, volume } = TONES[tone];
  const n = new Noise();
  n.allocate(2, 2);
  n.setSmpNum44k(Math.round((44100 * CLICK_MS) / 1000));
  const layer = (u: number, type: WaveType, f: number, vol: number, decayMs: number): void => {
    const unit = n.getUnit(u)!;
    unit.bEnable = true;
    unit.pan = 0;
    unit.enveNum = 2;
    unit.enves = [
      { x: 0, y: 100 },
      { x: decayMs, y: 0 },
    ];
    unit.main = { type, freq: f, volume: vol, offset: 0, bRev: false };
    unit.freq = { type: WaveType.None, freq: 1, volume: 0, offset: 0, bRev: false };
    unit.volu = { type: WaveType.None, freq: 1, volume: 100, offset: 0, bRev: false };
  };
  layer(0, WaveType.Sine, freq, volume, CLICK_MS - 10);
  layer(1, WaveType.Random, 4000, volume / 3, 4);
  return n;
}

export interface MetronomeTones {
  high: Float32Array; // ステレオインターリーブ
  low: Float32Array;
}

function renderTone(bldr: NoiseBuilder, noise: Noise, sps: number): Float32Array | null {
  const buf = bldr.buildNoise(noise, 2, sps, 16)?.devolveSamplingBuffer();
  if (!buf) return null;
  const pcm = new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength >> 1);
  return Float32Array.from(pcm, (v) => v / 32768);
}

// 出力レート sps のクリック音を生成する。失敗時 null
export function buildMetronomeTones(sps: number): MetronomeTones | null {
  const bldr = new NoiseBuilder();
  if (!bldr.init()) return null;
  const high = renderTone(bldr, createMetronomeNoise("high"), sps);
  const low = renderTone(bldr, createMetronomeNoise("low"), sps);
  return high && low ? { high, low } : null;
}
