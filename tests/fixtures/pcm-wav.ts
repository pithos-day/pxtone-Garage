// テスト用の有効な PCM 音色 (WAV 形式) を手組みで生成する。
// 4410 サンプル (0.1 秒 @44100Hz) の 100Hz サイン波をモノラル 16bit で持つ
export function buildPcmWav(): Uint8Array {
  const data = new Int16Array(4410);
  for (let i = 0; i < data.length; i++) data[i] = Math.round(Math.sin((i / 4410) * 2 * Math.PI * 100) * 8000);
  const dataSize = data.length * 2;
  const pcm = new Uint8Array(44 + dataSize);
  const dv = new DataView(pcm.buffer);
  pcm.set([82, 73, 70, 70], 0); // "RIFF"
  dv.setUint32(4, 36 + dataSize, true);
  pcm.set([87, 65, 86, 69], 8); // "WAVE"
  pcm.set([102, 109, 116, 32], 12); // "fmt "
  dv.setUint32(16, 16, true); // fmt chunk size
  dv.setUint16(20, 1, true); // formatID (PCM)
  dv.setUint16(22, 1, true); // ch
  dv.setUint32(24, 44100, true); // sps
  dv.setUint32(28, 88200, true); // byteRate
  dv.setUint16(32, 2, true); // blockAlign
  dv.setUint16(34, 16, true); // bps
  pcm.set([100, 97, 116, 97], 36); // "data"
  dv.setUint32(40, dataSize, true);
  new Int16Array(pcm.buffer, 44, data.length).set(data);
  return pcm;
}
