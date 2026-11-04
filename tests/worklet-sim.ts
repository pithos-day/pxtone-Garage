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

  // ---- メトロノーム ----
  // 無音のプロジェクト (ノートはベロシティ 0) に、位置が分かる短いクリックを混ぜて検証する。
  // 120 BPM / 44100Hz なので 1 拍 = 22050 サンプル、4/4 で 1 小節 = 88200 サンプル
  {
    newProjectInTab();
    assert((await addWoice(buildPcmWav(), WoiceType.PCM, "Silent")) === null, "metronome: 音色を追加できる");
    assert(addUnitWithWoice("S", service.woiceNum - 1), "metronome: ユニットを追加できる");
    service.evels.recordAddI(0, 0, EventKind.VELOCITY, 0);
    service.evels.recordAddI(0, 0, EventKind.ON, 480 * 8);
    const silent = exportBytes()!;
    const beat = 22050;
    const beats = service.master.beatNum;
    const startM = (loop: boolean, enabled: boolean): MockProcessor => {
      const p = new Ctor!();
      p.port.onmessage!({ data: { type: "load", bytes: silent.slice().buffer, sps: 44100, playStartMeas: -1, playEndMeas: -1 } });
      p.port.onmessage!({ data: { type: "setLoop", loop } });
      p.port.onmessage!({ data: { type: "seek", sample: 0 } });
      // 高音 = +1、低音 = -1 の 1 フレームだけのクリック
      p.port.onmessage!({ data: { type: "setMetronomeTones", high: new Float32Array([1, 1]), low: new Float32Array([-1, -1]) } });
      p.port.onmessage!({ data: { type: "setMetronome", enabled } });
      p.port.onmessage!({ data: { type: "play" } });
      return p;
    };
    // 非ゼロのサンプル位置と符号を集める
    const collect = (p: MockProcessor, block: number, total: number): string[] => {
      const found: string[] = [];
      for (let at = 0; at < total; at += block) {
        const out = run(p, block);
        for (let i = 0; i < block; i++) {
          const v = out[0]![i]!;
          if (Math.abs(v) > 0.1) found.push(`${at + i}${v > 0 ? "H" : "L"}`);
        }
      }
      return found;
    };
    const measure = beat * beats;
    const end = measure * 2;
    const expected = Array.from({ length: beats * 2 }, (_, k) => `${k * beat}${k % beats === 0 ? "H" : "L"}`);

    const b128 = collect(startM(false, true), 128, end - 128 * 2);
    assert(b128.join() === expected.join(), `metronome: 拍の位置と小節頭が正しい ${b128.join()}`);
    const b256 = collect(startM(false, true), 256, end - 256 * 2);
    assert(b256.join() === expected.join(), `metronome: ブロック長 256 でも同じ位置 ${b256.join()}`);
    assert(collect(startM(false, false), 128, measure).length === 0, "metronome: OFF では鳴らない");

    // ループの折り返し直後の拍も鳴る (2 小節で曲頭へ戻る)
    const looped = collect(startM(true, true), 128, end + beat + 256);
    const wrapped = expected.concat([`${end}H`, `${end + beat}L`]);
    assert(looped.join() === wrapped.join(), `metronome: 折り返し後も拍が続く ${looped.join()}`);

    // 途中で折り返す位置がブロックをまたいでも取りこぼさない
    const looped100 = collect(startM(true, true), 100, end + beat + 200);
    assert(looped100.join() === wrapped.join(), `metronome: ブロック途中の折り返しでも鳴る ${looped100.join()}`);

    // OFF のときの出力は従来と同じ
    const plain = new Ctor!();
    plain.port.onmessage!({ data: { type: "load", bytes: bytes!.slice().buffer, sps: 44100, playStartMeas: -1, playEndMeas: -1 } });
    plain.port.onmessage!({ data: { type: "setMetronome", enabled: false } });
    plain.port.onmessage!({ data: { type: "play" } });
    const plainOut = run(plain, 256);
    assert(plainOut[0]!.every((v, i) => v === b1[0]![i]), "metronome: OFF の出力は従来と一致する");
  }

  console.log(`ALL PASS (${pass} assertions)`);
})();
