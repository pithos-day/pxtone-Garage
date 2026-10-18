// AudioWorklet プレイヤー (player-worklet.ts) のシミュレーションテスト (node で直接実行)。
// process() に渡るブロック長 (レンダークォンタム) が 128 以外でも描画が壊れないことを、
// 同じプロジェクトをブロック長 128 と 256 で描画して出力が一致するかで検証する。
import "./worklet-mock";
import { registered, messages, type MockProcessor } from "./worklet-mock";
import { EventKind, WoiceType } from "pxtone-ts";
import { newProjectInTab } from "../src/state/projects";
import { addUnitWithWoice, addWoice, exportBytes } from "../src/state/project";
import { service } from "../src/state/service";
import { buildPcmWav } from "./fixtures/pcm-wav";
import "../src/engine/player-worklet";

let pass = 0;
function assert(cond: boolean, msg: string): void {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  pass++;
  console.log("ok:", msg);
}

void (async () => {
  // PCM 音色 + ノート 1 つ (4拍) のプロジェクトを用意して ptcop バイト列を作る
  newProjectInTab();
  const woiceErr = await addWoice(buildPcmWav(), WoiceType.PCM, "WorkletTest");
  assert(woiceErr === null, "worklet: PCM 音色を追加できる");
  const woiceIdx = service.woiceNum - 1;
  assert(addUnitWithWoice("W", woiceIdx), "worklet: ユニットを追加できる");
  service.evels.recordAddI(0, 0, EventKind.VOICENO, woiceIdx);
  service.evels.recordAddI(0, 0, EventKind.KEY, 0x6000);
  service.evels.recordAddI(0, 0, EventKind.VELOCITY, 100);
  service.evels.recordAddI(0, 0, EventKind.ON, 480 * 4);
  const bytes = exportBytes();
  assert(bytes !== null, "worklet: ptcop を書き出せる");

  const Ctor = registered["pxtone-player"] as (new () => MockProcessor) | undefined;
  assert(typeof Ctor === "function", "worklet: registerProcessor が呼ばれている");

  // load (再生位置 0) → play まで済ませたプロセッサを作る
  const start = (): MockProcessor => {
    const p = new Ctor!();
    p.port.onmessage!({
      data: { type: "load", bytes: bytes!.slice().buffer, sps: 44100, playStartMeas: -1, playEndMeas: -1 },
    });
    p.port.onmessage!({ data: { type: "play" } });
    return p;
  };
  const run = (p: MockProcessor, block: number): Float32Array[] => {
    const out = [new Float32Array(block), new Float32Array(block)];
    p.process([], [out]);
    return out;
  };

  const first = start();
  assert(messages.some((m) => (m as { type?: string }).type === "loaded" && (m as { ok?: boolean }).ok === true), "worklet: load が成功する");

  // ブロック長 128 × 2 回 と ブロック長 256 × 1 回 が同じサンプル列になること
  const a1 = run(first, 128);
  const a2 = run(first, 128);
  const second = start();
  const b1 = run(second, 256);
  let same = true;
  let firstDiff = "";
  for (let ch = 0; ch < 2 && same; ch++) {
    for (let i = 0; i < 256; i++) {
      const av = i < 128 ? a1[ch]![i]! : a2[ch]![i - 128]!;
      if (av !== b1[ch]![i]!) {
        same = false;
        firstDiff = `ch=${ch} i=${i} block128=${av} block256=${b1[ch]![i]}`;
        break;
      }
    }
  }
  assert(same, `worklet: ブロック長 128 と 256 で出力が一致する ${firstDiff}`);

  // NaN が混入せず、後半も鳴っていること
  let hasNaN = false;
  let energySecondHalf = 0;
  for (let ch = 0; ch < 2; ch++) {
    for (let i = 0; i < 256; i++) {
      const v = b1[ch]![i]!;
      if (Number.isNaN(v)) hasNaN = true;
      if (i >= 128) energySecondHalf += Math.abs(v);
    }
  }
  assert(!hasNaN, "worklet: NaN が混入しない");
  assert(energySecondHalf > 0, "worklet: ブロック後半も描画される");

  console.log(`ALL PASS (${pass} assertions)`);
})();
