// メトロノームの拍位置の計算 (AudioWorklet とテストで共用する純関数)
// 拍は曲頭 (サンプル 0) から等間隔で、beatNum 拍ごとに小節頭になる

export interface MetronomeHit {
  sample: number; // 拍の位置 (曲頭からのサンプル数)
  downbeat: boolean; // 小節頭か
}

// 区間 [start, end) に含まれる拍を返す
export function metronomeHits(start: number, end: number, samplesPerBeat: number, beatNum: number): MetronomeHit[] {
  const hits: MetronomeHit[] = [];
  // 壊れたファイルのテンポ (0 / NaN) でオーディオスレッドを止めない
  if (end <= start || !Number.isFinite(samplesPerBeat) || samplesPerBeat <= 0) return hits;
  const measure = Math.max(1, beatNum);
  for (let beat = Math.max(0, Math.floor(start / samplesPerBeat)); ; beat++) {
    const sample = Math.round(beat * samplesPerBeat);
    if (sample >= end) break;
    if (sample >= start) hits.push({ sample, downbeat: beat % measure === 0 });
  }
  return hits;
}
