// プレビュー音声制御 (preview.ts) のシミュレーションテスト。
// AudioContext をモックして、キー変更時の「前の音の停止」を検証する。
import { EventKind, MemoryIo, PXTN_MAX_EVENT_NUM, PxtnErr, SEEK_SET, Service, WoiceType, type Woice } from "pxtone-ts";
import { previewWoiceObjectHold, stopPreview, renderWoice, clearWoicePreviewCache, resetPreviewContext, playPcmOnce } from "../src/engine/preview";
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
  // createBuffer に渡されたサンプルレート (PCM の実レートを検証するため記録)
  bufferSps: number[] = [];
  // createBuffer で作られたチャンネルデータ (フェード/クロスフェードの検証用)
  buffers: Float32Array[][] = [];
  resume(): void {
    this.state = "running";
  }
  createBuffer(ch: number, len: number, sps: number): { getChannelData: (i: number) => Float32Array } {
    this.bufferSps.push(sps);
    const data = Array.from({ length: ch }, () => new Float32Array(len));
    this.buffers.push(data);
    return { getChannelData: (i: number) => data[i]! };
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

// 非同期レンダリング完了を待つ (previewWoiceObjectHold は setTimeout(0) でスケジュール)
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

void (async () => {
  // ---- renderWoice の Service 使い回し: 同一キーで 2 回レンダリング → 同一結果 ----
  {
    const w = createDefaultWoice();
    const work1 = renderWoice(w, 60, 104, 1.0, 44100);
    const work2 = renderWoice(w, 60, 104, 1.0, 44100);
    assert(work1 !== null && work2 !== null && work1!.length === work2!.length, "Service 再利用: 同一キーで長さ一致");
    let eq = true;
    for (let i = 0; i < work1!.length; i++) {
      if (work1![i] !== work2![i]) { eq = false; break; }
    }
    assert(eq, "Service 再利用: 同一キーで内容一致");
    console.log(`renderWoice: ${work1!.length} samples`);
  }

  // ---- pxtone-ts の契約: initCollage 直後 (read() を経由しない) でも mooPreparation が通り音が出る ----
  // renderWoice は 1 個の Service を clear() で使い回しているため、この挙動に依存している
  // (pxtone-ts が initCollage で moo 有効フラグを立てなくなったら、ここで気づけるようにする)
  {
    const s = new Service();
    assert(s.initCollage(PXTN_MAX_EVENT_NUM) === PxtnErr.OK, "moo 契約: initCollage が成功する");
    const w = createDefaultWoice();
    const io = new MemoryIo();
    assert(w.ptvWrite(io) > 0, "moo 契約: 音色を ptvWrite できる");
    assert(io.seek(SEEK_SET, 0), "moo 契約: 読み込み位置を先頭へ戻せる");
    assert(s.woiceRead(0, io, WoiceType.PTV) === PxtnErr.OK, "moo 契約: woiceRead が成功する");
    assert(s.unitAddNew(), "moo 契約: ユニットを追加できる");
    s.master.set(4, 120, 480);
    s.master.setMeasNum(2);
    s.evels.clear();
    s.evels.recordAddI(0, 0, EventKind.VOICENO, 0);
    s.evels.recordAddI(0, 0, EventKind.KEY, 0x6000);
    s.evels.recordAddI(0, 0, EventKind.VELOCITY, 104);
    s.evels.recordAddI(0, 0, EventKind.ON, 480);
    assert(s.setDestinationQuality(2, 44100), "moo 契約: setDestinationQuality が成功する");
    assert(s.tonesReady() === PxtnErr.OK, "moo 契約: tonesReady が成功する");
    assert(s.mooPreparation(null), "moo 契約: read() を経由せず mooPreparation が成功する");
    const pcm = new Int16Array(1024 * 2);
    assert(s.Moo(pcm, 1024), "moo 契約: Moo が成功する");
    let signal = false;
    for (let i = 0; i < pcm.length; i++) {
      if (pcm[i] !== 0) signal = true;
    }
    assert(signal, "moo 契約: 音が出る (非ゼロサンプル)");
  }

  // ---- 出力レート確定 → tones_ready の順序: 減衰長が出力レートに依存しないこと ----
  // (逆順だとエンベロープが 44100 基準で前計算され、48kHz で約 8.8% 短くなる)
  {
    const w = createDefaultWoice();
    const vc = w.getVoice(0)!;
    vc.envelope.fps = 1000;
    vc.envelope.headNum = 2;
    vc.envelope.bodyNum = 0;
    vc.envelope.tailNum = 1;
    vc.envelope.points = [
      { x: 0, y: 128 },
      { x: 500, y: 0 }, // 0.5 秒で減衰しきる
      { x: 0, y: 0 },
    ];
    const decaySec = (sps: number): number => {
      const work = renderWoice(w, 60, 104, 1.0, sps);
      assert(work !== null && work.length >= sps, `env: ${sps}Hz で 1 秒以上レンダリングされる`);
      let peak = 0;
      for (let i = 0; i < work!.length; i++) peak = Math.max(peak, Math.abs(work![i]!));
      // 減衰しきった後も envVolume の残留 (1/128) で微小な音が続くため、ピーク比 2% を閾値にする
      const thr = peak * 0.02;
      let last = -1;
      for (let i = 0; i < work!.length / 2; i++) {
        if (Math.abs(work![i * 2]!) >= thr) last = i;
      }
      return (last + 1) / sps;
    };
    const t44 = decaySec(44100);
    const t48 = decaySec(48000);
    assert(Math.abs(t44 - 0.5) < 0.02, `env: 44100 の減衰長 ${t44.toFixed(3)}s ≈ 0.5s`);
    assert(Math.abs(t48 - 0.5) < 0.02, `env: 48000 の減衰長 ${t48.toFixed(3)}s ≈ 0.5s (レート非依存)`);
  }

  // ---- 非同期集約レンダリング: 連続キー変更で最新キーのみレンダリング ----
  {
    clearWoicePreviewCache();
    resetPreviewContext();
    const w = longReleaseWoice();
    lastCtx = new FakeContext() as unknown as FakeContext;
    previewWoiceObjectHold(w, 60, 104);
    assert(lastCtx.sources.length === 0, "coalesce: 即座にはソース生成されない");
    previewWoiceObjectHold(w, 64, 104);
    previewWoiceObjectHold(w, 67, 104);
    assert(lastCtx.sources.length === 0, "coalesce: 複数キー変更後もソースなし");
    await flush();
    assert(lastCtx.sources.length === 1, "coalesce: タイマー後に 1 ソース生成");
    assert(lastCtx.sources[0]!.started, "coalesce: 最終キー (67) が再生開始");
  }

  // ---- キャッシュヒット: 同じキー 2 回目は即時再生 (レンダリングなし) ----
  {
    clearWoicePreviewCache();
    resetPreviewContext();
    const w = longReleaseWoice();
    lastCtx = new FakeContext() as unknown as FakeContext;
    previewWoiceObjectHold(w, 60, 104);
    await flush();
    assert(lastCtx.sources.length === 1, "cache: 1 回目でソース生成");
    previewWoiceObjectHold(w, 60, 104);
    assert(lastCtx.sources.length >= 2, "cache: 2 回目で追加ソース生成 (即時再生)");
  }

  // ---- キー A → B → C: 前の音が Release を鳴らさず即座に切られること ----
  {
    clearWoicePreviewCache();
    resetPreviewContext();
    const w = longReleaseWoice();
    lastCtx = new FakeContext() as unknown as FakeContext;
    previewWoiceObjectHold(w, 60, 104);
    await flush();
    assert(lastCtx.sources.length === 1, "A: 1 ソース生成");
    assert(lastCtx.sources[0]!.started, "A: start 済み");

    previewWoiceObjectHold(w, 64, 104);
    await flush();
    const srcA = lastCtx.sources[0]!;
    const gA = lastCtx.params[0]!;
    assert(srcA.stopCalls >= 1, "B: A への stop がスケジュールされる");
    // stopFadingSource は即時 gain=0 ではなく短いフェードで消す (プツッ防止)
    const rampA = gA.events.filter((e) => e.type === "ramp");
    assert(rampA.length >= 1 && rampA.at(-1)!.value === 0, "B: A のゲインがフェードアウトで 0 になる");
    assert(!gA.events.some((e) => e.type === "ramp" && e.time >= 10), "B: A に 10 秒の Release 減衰は設定されない");

    previewWoiceObjectHold(w, 67, 104);
    await flush();
    const srcB = lastCtx.sources[1]!;
    const gB = lastCtx.params[1]!;
    assert(srcB.stopCalls >= 1, "C: B への stop がスケジュールされる");
    const rampB = gB.events.filter((e) => e.type === "ramp");
    assert(rampB.length >= 1 && rampB.at(-1)!.value === 0, "C: B のゲインがフェードアウトで 0 になる");

    stopPreview();
    const srcC = lastCtx.sources[2]!;
    const gC = lastCtx.params[2]!;
    const rampC = gC.events.filter((e) => e.type === "ramp");
    assert(rampC.length === 1 && rampC[0]!.time >= 10, "押下解除: Release 区間 (10 秒) で減衰");
    assert(srcC.stopCalls === 1, "押下解除: C に stop(when) が 1 回");
  }

  // ---- stopAfterStart: リリース後にレンダリング完了 → startHold 直後に停止 ----
  {
    clearWoicePreviewCache();
    resetPreviewContext();
    const w = longReleaseWoice();
    lastCtx = new FakeContext() as unknown as FakeContext;
    previewWoiceObjectHold(w, 60, 104);
    stopPreview();
    await flush();
    assert(lastCtx.sources.length >= 1, "stopAfterStart: startHold でソース生成");
    const srcD = lastCtx.sources[lastCtx.sources.length - 1]!;
    assert(srcD.stopCalls >= 1, "stopAfterStart: startHold 直後に stop が呼ばれる");
  }

  // ---- renderWoice の実測 (1 回のレンダリングがどの程度ブロックするか) ----
  {
    const w = createDefaultWoice();
    const t0 = performance.now();
    const work = renderWoice(w, 60, 104, 2.5, 44100);
    const ms = performance.now() - t0;
    assert(work !== null && work.length >= 2, "renderWoice: 結果あり");
    console.log(`renderWoice: ${ms.toFixed(1)}ms (len=${work?.length})`);
  }

  // ---- ノイズ PCM の再生: デバイスが 48kHz でもバッファは実レート 44100 で作る ----
  // (デバイスレートで作ると 48000/44100 倍速になり、本家より音程が高くなる)
  {
    resetPreviewContext();
    const realAc = globalThis.AudioContext;
    globalThis.AudioContext = class extends FakeContext {
      constructor() {
        super();
        this.sampleRate = 48000;
        lastCtx = this;
      }
    } as unknown as new () => FakeContext;
    playPcmOnce(new Float32Array(44100 * 2));
    assert(lastCtx!.sampleRate === 48000, "noise pcm: 48kHz デバイスを模擬");
    assert(lastCtx!.bufferSps[0] === 44100, "noise pcm: 44100 のバッファとして作られる");
    assert(lastCtx!.sources.length === 1, "noise pcm: ソースが 1 つ生成される");
    globalThis.AudioContext = realAc;
    resetPreviewContext();
  }

  // ---- ループ試聴 (長押し): 継ぎ目をクロスフェードし、両端を 0 に落とさない ----
  {
    clearWoicePreviewCache();
    resetPreviewContext();
    const w = createDefaultWoice();
    const sps = 44100;
    const durSec = 1.0;
    const rendered = renderWoice(w, 60, 104, durSec, sps);
    lastCtx = new FakeContext() as unknown as FakeContext;
    previewWoiceObjectHold(w, 60, 104, durSec);
    await flush();
    const buf = lastCtx.buffers[lastCtx.buffers.length - 1];
    assert(!!rendered, "loop: 参照レンダリングが取れる");
    assert(!!buf, "loop: ループ再生の AudioBuffer が作られる");
    const ch0 = buf![0]!;
    const n = ch0.length;
    let maxAdj = 0;
    for (let i = 1; i < n; i++) maxAdj = Math.max(maxAdj, Math.abs(ch0[i]! - ch0[i - 1]!));
    const seam = Math.abs(ch0[n - 1]! - ch0[0]!);
    assert(seam <= maxAdj, `loop: 継ぎ目の段差 ${seam.toFixed(5)} <= 最大隣接差 ${maxAdj.toFixed(5)}`);
    // 先頭は末尾側の素材で始まる (両端を 0 に落とすフェードではない)
    const limit = Math.min(Math.trunc(sps * 0.01), Math.trunc(n / 4));
    let fromTail = false;
    for (let j = n - limit; j < n; j++) {
      if (Math.abs(ch0[0]! - rendered![j * 2]!) < 1e-9) fromTail = true;
    }
    assert(fromTail, "loop: 先頭は末尾素材とのクロスフェードで始まる");
    // クロスフェード範囲より後ろは元のレンダリングのまま
    let same = true;
    for (let i = limit + 1; i < n; i++) if (ch0[i] !== rendered![i * 2]) same = false;
    assert(same, "loop: クロスフェード範囲外はレンダリング結果のまま");
    stopPreview();
  }

  console.log(`ALL PASS (${pass} assertions)`);
})();
