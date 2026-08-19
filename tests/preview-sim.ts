// プレビュー音声制御 (preview.ts) のシミュレーションテスト。
// AudioContext をモックして、キー変更時の「前の音の停止」を検証する。
import type { Woice } from "pxtone-ts";
import { previewWoiceObjectHold, stopPreview, renderWoice } from "../src/engine/preview";
import { createDefaultWoice } from "../src/state/voice";

// ---- モック AudioContext ----
// AudioBufferSourceNode は stop の 2 回目で InvalidStateError を投げる (Web Audio 仕様)。
// GainNode は setValueAtTime / linearRampToValueAtTime / cancelScheduledValues を記録する。
class FakeParam {
  value = 0.5;
  events: Array<{ type: string; time: number; value: number }> = [];
  cancelScheduledValues(t: number): void {
    this.events = this.events.filter((e) => e.time < t);
  }
  setValueAtTime(v: number, t: number): void {
    this.events.push({ type: "set", time: t, value: v });
    this.value = v;
  }
  linearRampToValueAtTime(v: number, t: number): void {
    this.events.push({ type: "ramp", time: t, value: v });
  }
  setTargetAtTime(v: number, t: number): void {
    this.events.push({ type: "target", time: t, value: v });
  }
}

class FakeSource {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  started = false;
  stopCalls = 0;
  connect(): void {}
  start(): void {
    this.started = true;
  }
  stop(): void {
    this.stopCalls++;
    if (this.stopCalls > 1) throw new Error("InvalidStateError");
    this.onended?.();
  }
}

class FakeContext {
  sampleRate = 44100;
  state = "running";
  currentTime = 0;
  destination = {};
  sources: FakeSource[] = [];
  params: FakeParam[] = [];
  resume(): void {
    this.state = "running";
  }
  createBuffer(ch: number, len: number): { getChannelData: (i: number) => Float32Array } {
    return { getChannelData: () => new Float32Array(len) };
  }
  createGain(): { gain: FakeParam; connect: () => void } {
    const g = new FakeParam();
    this.params.push(g);
    return { gain: g, connect: () => {} };
  }
  createBufferSource(): FakeSource {
    const s = new FakeSource();
    this.sources.push(s);
    return s;
  }
}

declare global {
  // eslint-disable-next-line no-var
  var AudioContext: new () => FakeContext;
}
let lastCtx: FakeContext | null = null;
globalThis.AudioContext = class extends FakeContext {
  constructor() {
    super();
    lastCtx = this;
  }
} as unknown as new () => FakeContext;

let pass = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  pass++;
  console.log("ok:", msg);
}

// 長い Release (10 秒) を持つ音色。本家: release データ 1000 / fps=100
function longReleaseWoice(): Woice {
  const w = createDefaultWoice();
  const vc = w.getVoice(0)!;
  vc.envelope.fps = 100;
  vc.envelope.headNum = 0;
  vc.envelope.bodyNum = 0;
  vc.envelope.tailNum = 1;
  vc.envelope.points = [{ x: 1000, y: 0 }];
  return w;
}

// 1. キー A → B → C と変更したとき、前の音が Release を鳴らさず即座に切られること
{
  const w = longReleaseWoice();
  previewWoiceObjectHold(w, 60, 104);
  assert(lastCtx!.sources.length === 1, "A: 1 ソース生成");
  assert(lastCtx!.sources[0]!.started, "A: start 済み");

  previewWoiceObjectHold(w, 64, 104);
  const srcA = lastCtx!.sources[0]!;
  const gA = lastCtx!.params[0]!;
  // A はスケジュール済み stop のため 2 回目の stop は失敗するが、ゲイン 0 で確実に消える
  assert(srcA.stopCalls === 2, "B: A への stop はスケジュール + 即時カット試行の 2 回");
  assert(gA.events.some((e) => e.type === "set" && e.value === 0), "B: A のゲインが即座に 0 にされる");
  assert(!gA.events.some((e) => e.type === "ramp" && e.time >= 10), "B: A に 10 秒の Release 減衰は設定されない");

  previewWoiceObjectHold(w, 67, 104);
  const srcB = lastCtx!.sources[1]!;
  const gB = lastCtx!.params[1]!;
  assert(srcB.stopCalls === 2, "C: B への stop は 2 回 (1 回目はスケジュール)");
  assert(gB.events.some((e) => e.type === "set" && e.value === 0), "C: B のゲインが即座に 0 にされる");

  // 2. 押下解除: 音色の Release 区間 (10 秒) で減衰すること
  stopPreview();
  const srcC = lastCtx!.sources[2]!;
  const gC = lastCtx!.params[2]!;
  const rampC = gC.events.filter((e) => e.type === "ramp");
  assert(rampC.length === 1 && rampC[0]!.time >= 10, "押下解除: Release 区間 (10 秒) で減衰");
  assert(srcC.stopCalls === 1, "押下解除: C に stop(when) が 1 回");

  // 3. 減衰中に新しいキーを押すと、減衰中の音が即時カットされること
  previewWoiceObjectHold(w, 72, 104);
  assert(gC.events.some((e) => e.type === "set" && e.value === 0), "減衰中の新しいプレビュー: ゲイン 0 で即時カット");
}

// 4. renderWoice の実測 (1 回のレンダリングがどの程度ブロックするか)
{
  const w = createDefaultWoice();
  const t0 = performance.now();
  const work = renderWoice(w, 60, 104, 2.5, 44100);
  const ms = performance.now() - t0;
  assert(work !== null && work.length >= 2, "renderWoice: 結果あり");
  console.log(`renderWoice: ${ms.toFixed(1)}ms (len=${work?.length})`);
}

console.log(`ALL PASS (${pass} assertions)`);