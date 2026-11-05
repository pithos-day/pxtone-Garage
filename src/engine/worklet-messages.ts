// メイン⇔AudioWorklet 間の postMessage 型 (player-worklet.ts / realtime-player.ts で共用)
export type MainToWorklet =
  | { type: "load"; bytes: ArrayBuffer; sps: number; playStartMeas: number; playEndMeas: number }
  | { type: "play" }
  | { type: "stop" }
  | { type: "seek"; sample: number }
  | { type: "setLoop"; loop: boolean }
  | { type: "setMasterVolume"; volume: number }
  | { type: "setMutedUnits"; units: number[] }
  | { type: "setMetronome"; enabled: boolean }
  // クリック音 (ステレオインターリーブ。high = 小節頭、low = それ以外の拍)
  | { type: "setMetronomeTones"; high: Float32Array; low: Float32Array };

export type WorkletToMain =
  | { type: "loaded"; ok: boolean; totalSample: number }
  | { type: "position"; sample: number }
  // 前回の通知以降のピーク (0..1) と音割れの有無。メトロノームは書き出しに入らないため含めない
  | { type: "level"; left: number; right: number; clipped: boolean }
  | { type: "ended" };
