// メイン⇔AudioWorklet 間の postMessage 型 (player-worklet.ts / realtime-player.ts で共用)
export type MainToWorklet =
  | { type: "load"; bytes: ArrayBuffer; sps: number; playStart: number; playEnd: number }
  | { type: "play" }
  | { type: "stop" }
  | { type: "seek"; sample: number }
  | { type: "setLoop"; loop: boolean }
  | { type: "setMasterVolume"; volume: number }
  | { type: "setMutedUnits"; units: number[] };

export type WorkletToMain =
  | { type: "loaded"; ok: boolean; error: string; totalSample: number }
  | { type: "position"; sample: number }
  | { type: "ended" };
