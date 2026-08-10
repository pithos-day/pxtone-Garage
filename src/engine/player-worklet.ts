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

const BLOCK_SIZE = 128;

class PxtoneWorkletProcessor extends AudioWorkletProcessor {
  private service: Service | null = null;
  private scratch: Int16Array = new Int16Array(BLOCK_SIZE * 2);
  private loaded = false;
  private playing = false;
  private sps = 44100;
  private loop = false;
  private volume = 1.0;
  private mutedUnits: number[] = [];
  private lastPosNotifySample = -1;
  private playStart = -1;
  private playEnd = -1;

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
        this.doLoad(msg.bytes, msg.sps, msg.playStart, msg.playEnd);
        break;
      case "play":
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
      svc.unitGet(u)?.setPlayed(!this.mutedUnits.includes(u));
    }
  }

  private doLoad(bytes: ArrayBuffer, sps: number, playStart = -1, playEnd = -1): void {
    this.sps = sps;
    const svc = new Service();
    let error = "";
    const ok = ((): boolean => {
      if (svc.initCollage(500000) !== PxtnErr.OK) {
        error = "init";
        return false;
      }
      const io = new MemoryIo(new Uint8Array(bytes));
      if (svc.read(io) !== PxtnErr.OK) {
        error = "read";
        return false;
      }
      if (svc.tonesReady() !== PxtnErr.OK) {
        error = "tonesReady";
        return false;
      }
      if (!svc.setDestinationQuality(2, sps)) {
        error = "quality";
        return false;
      }
      svc.mooSetLoop(this.loop);
      svc.mooSetMasterVolume(this.volume);
      return true;
    })();
    this.service = ok ? svc : null;
    this.loaded = ok;
    this.playing = false;
    this.lastPosNotifySample = -1;
    this.playStart = playStart;
    this.playEnd = playEnd;
    if (ok) {
      this.applyMute();
      this.reseek(0);
    }

    this.post({
      type: "loaded",
      ok,
      error,
      totalSample: ok ? svc.mooGetSamplingEnd() : 0,
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
      startPosMeas: this.playStart >= 0 ? this.playStart : 0,
      startPosSample: s,
      startPosFloat: 0,
      measEnd: this.playEnd > 0 ? this.playEnd : 0,
      measRepeat: this.playStart >= 0 && this.playEnd > 0 ? this.playStart : 0,
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

    if (!this.service || !this.loaded || !this.playing) {
      for (let ch = 0; ch < chNum; ch++) out[ch]!.fill(0);
      return true;
    }

    const svc = this.service;
    svc.Moo(this.scratch.subarray(0, block * chNum), block);
    for (let i = 0; i < block; i++) {
      for (let ch = 0; ch < chNum; ch++) {
        out[ch]![i] = this.scratch[i * chNum + ch]! / 32768;
      }
    }

    if (svc.mooIsEndVomit()) {
      this.playing = false;
      this.post({ type: "ended" });
    } else {
      const pos = svc.mooGetSamplingOffset();
      // ループで位置が巻き戻った場合も即座に通知する (プレイヘッド追従のため)
      if (pos < this.lastPosNotifySample || pos - this.lastPosNotifySample >= Math.trunc(this.sps / 10)) {
        this.lastPosNotifySample = pos;
        this.post({ type: "position", sample: pos });
      }
    }
    return true;
  }
}

registerProcessor("pxtone-player", PxtoneWorkletProcessor);
