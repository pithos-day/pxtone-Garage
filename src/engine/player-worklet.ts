// AudioWorklet 内で動作する pxtone プレイヤー。
// Service (Moo レンダラー) を worklet スレッド内に置き、process() から
// オフラインと同一のコードパス (Service.Moo) を叩く。
// pxtone-ts の検証用実装 (web/player-worklet.ts) をベースに、ユニット個別ミュート
// (setMutedUnits) を追加したもの。esbuild で単一ファイルにバンドルされる。

import { Service, MemoryIo, PxtnErr, PXTN_VOMIT_PREP_FLAG_LOOP, PXTN_VOMIT_PREP_FLAG_UNIT_MUTE } from "pxtone-ts";
import type { VomitPreparation } from "pxtone-ts";
import type { MainToWorklet, WorkletToMain } from "./worklet-messages";

// AudioWorklet グローバルスコープの最小型定義
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare const sampleRate: number;
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

// scratch のサイズ = 1 回の Moo で描画する最大サンプル数。
// process() に来るブロック長 (レンダークォンタム) はこれより大きくてもよい (分割して描画する)
const BLOCK_SIZE = 128;

class PxtoneWorkletProcessor extends AudioWorkletProcessor {
  private service: Service | null = null;
  private scratch: Int16Array = new Int16Array(BLOCK_SIZE * 2);
  private playing = false;
  private sps = 44100;
  private loop = false;
  private volume = 1.0;
  private mutedUnits: number[] = [];
  private lastPosNotifySample = -1;
  private playStartMeas = -1;
  private playEndMeas = -1;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<MainToWorklet>) => this.onMessage(e.data);
  }

  private post(msg: WorkletToMain): void {
    this.port.postMessage(msg);
  }

  private onMessage(msg: MainToWorklet): void {
    switch (msg.type) {
      case "load":
        this.load(msg.bytes, msg.sps, msg.playStartMeas, msg.playEndMeas);
        break;
      case "play":
        // 曲末で停止した後に再生した場合は先頭から再開する
        // (mooIsEndVomit は「曲末に達した」状態。そのまま再生すると無音になる)
        if (this.service?.mooIsEndVomit()) this.reseek(0);
        this.playing = true;
        this.lastPosNotifySample = -1;
        break;
      case "stop":
        this.playing = false;
        break;
      case "seek":
        this.reseek(msg.sample);
        break;
      case "setLoop":
        this.loop = msg.loop;
        this.service?.mooSetLoop(msg.loop);
        break;
      case "setMasterVolume":
        this.volume = msg.volume;
        this.service?.mooSetMasterVolume(msg.volume);
        break;
      case "setMutedUnits":
        this.mutedUnits = msg.units;
        this.applyMute();
        break;
    }
  }

  // ユニット個別ミュート: mute フラグ有効化 + ユニットごとの played を設定
  private applyMute(): void {
    const svc = this.service;
    if (!svc) return;
    svc.mooSetMuteByUnit(true);
    for (let u = 0; u < svc.unitNum; u++) {
      // setPlayed(false) = そのユニットを発音しない (ミュート)
      svc.unitGet(u)?.setPlayed(!this.mutedUnits.includes(u));
    }
  }

  // Service の初期化・読み込み・準備を行う (失敗時は null)。
  // init() は非編集モードで、ptcop/tune 両方の読み込みに対応 (beatClock 制限なし)
  private loadService(bytes: ArrayBuffer, sps: number): Service | null {
    const svc = new Service();
    if (svc.init() !== PxtnErr.OK) return null;
    const io = new MemoryIo(new Uint8Array(bytes));
    if (svc.read(io) !== PxtnErr.OK) return null;
    // 本家 (pxtonewinXA2.cpp) と同じく出力レートを確定してから tones_ready する。
    // 逆順だとエンベロープ/ディレイが 44100 基準で前計算され、48kHz 環境で長さがずれる
    if (!svc.setDestinationQuality(2, sps)) return null;
    if (svc.tonesReady() !== PxtnErr.OK) return null;
    svc.mooSetLoop(this.loop);
    svc.mooSetMasterVolume(this.volume);
    return svc;
  }

  private load(bytes: ArrayBuffer, sps: number, playStartMeas = -1, playEndMeas = -1): void {
    this.sps = sps;
    const svc = this.loadService(bytes, sps);
    this.service = svc;
    this.playing = false;
    this.lastPosNotifySample = -1;
    this.playStartMeas = playStartMeas;
    this.playEndMeas = playEndMeas;
    if (svc) {
      this.applyMute();
      this.reseek(0);
    }
    this.post({
      type: "loaded",
      ok: svc !== null,
      totalSample: svc ? svc.mooGetSamplingEnd() : 0,
    });
  }

  // 再生位置を再設定 (シーク / 曲末からの再開)。ループ・ミュート・音量を維持する
  private reseek(sample: number): void {
    if (!this.service) return;
    const svc = this.service;
    const max = svc.mooGetSamplingEnd();
    const s = Math.max(0, Math.min(max, Math.trunc(sample)));
    // 編集用再生範囲 (Start/End) を反映。startPosSample が 0 のときだけ
    // startPosMeas が開始位置に使われる (mooPreparation の仕様)
    const prep: VomitPreparation = {
      startPosMeas: this.playStartMeas >= 0 ? this.playStartMeas : 0,
      startPosSample: s,
      startPosFloat: 0,
      measEnd: this.playEndMeas > 0 ? this.playEndMeas : 0,
      measRepeat: this.playStartMeas >= 0 && this.playEndMeas > 0 ? this.playStartMeas : 0,
      fadeinSec: 0,
      flags: (this.loop ? PXTN_VOMIT_PREP_FLAG_LOOP : 0) | PXTN_VOMIT_PREP_FLAG_UNIT_MUTE,
      masterVolume: this.volume,
    };
    svc.mooPreparation(prep);
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const chNum = out.length;
    const block = out[0]!.length;

    if (!this.service || !this.playing) {
      for (let ch = 0; ch < chNum; ch++) out[ch]!.fill(0);
      return true;
    }

    const svc = this.service;
    // レンダークォンタムは通常 128 だが、環境によって変わりうる (仕様上も固定ではない)。
    // scratch (BLOCK_SIZE サンプル) に収まる範囲で分割して描画する
    let offset = 0;
    while (offset < block) {
      const n = Math.min(BLOCK_SIZE, block - offset);
      svc.Moo(this.scratch.subarray(0, n * chNum), n);
      for (let i = 0; i < n; i++) {
        for (let ch = 0; ch < chNum; ch++) {
          out[ch]![offset + i] = this.scratch[i * chNum + ch]! / 32768;
        }
      }
      offset += n;
      // 曲末に達したら残りは無音にする (Moo は endVomit 後は書き込まないため)
      if (svc.mooIsEndVomit()) {
        for (let ch = 0; ch < chNum; ch++) out[ch]!.fill(0, offset);
        break;
      }
    }

    if (svc.mooIsEndVomit()) {
      this.playing = false;
      this.post({ type: "ended" });
    } else {
      const pos = svc.mooGetSamplingOffset();
      if (this.shouldNotifyPosition(pos)) {
        this.lastPosNotifySample = pos;
        this.post({ type: "position", sample: pos });
      }
    }
    return true;
  }

  // ループで位置が巻き戻った場合も即座に通知する (プレイヘッド追従のため)。
  // 通常時は 100ms 間隔で通知する
  private shouldNotifyPosition(pos: number): boolean {
    return pos < this.lastPosNotifySample || pos - this.lastPosNotifySample >= Math.trunc(this.sps / 10);
  }
}

registerProcessor("pxtone-player", PxtoneWorkletProcessor);
