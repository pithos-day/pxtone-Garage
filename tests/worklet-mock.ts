// AudioWorklet グローバルのモック。
// player-worklet.ts はモジュール評価時に registerProcessor を呼ぶため、
// このモジュールを player-worklet.ts より先に import する必要がある。
export const registered: Record<string, unknown> = {};
export const messages: unknown[] = [];

class FakeAudioWorkletProcessor {
  port = {
    postMessage: (m: unknown): void => {
      messages.push(m);
    },
    onmessage: null as ((e: { data: unknown }) => void) | null,
  };
}

// player-worklet.ts が期待する最小のインターフェース
export interface MockProcessor {
  port: {
    postMessage: (m: unknown) => void;
    onmessage: ((e: { data: unknown }) => void) | null;
  };
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean;
}

const g = globalThis as unknown as Record<string, unknown>;
g.AudioWorkletProcessor = FakeAudioWorkletProcessor;
g.registerProcessor = (name: string, ctor: unknown): void => {
  registered[name] = ctor;
};
g.sampleRate = 44100;
