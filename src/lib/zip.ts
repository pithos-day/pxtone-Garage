// 無圧縮 (STORE) の ZIP を組み立てる。WAV はほとんど圧縮が効かないため圧縮しない。
// state 層に依存しない純関数 (node テストから直接呼べる)
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_RECORD_SIZE = 22;
// ZIP64 に対応しないため、形式の上限を超えるものは作らない
const MAX_ZIP_BYTES = 0xffffffff;
const MAX_ZIP_ENTRIES = 0xffff;
// ファイル名を UTF-8 として扱うフラグ
const FLAG_UTF8 = 0x0800;
const ZIP_VERSION = 20;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]!) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipFile {
  name: string;
  bytes: Uint8Array;
}

// DOS 形式の日時
function dosDateTime(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

export function buildZip(files: ZipFile[], modified = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const entries = files.map((file) => ({ ...file, nameBytes: encoder.encode(file.name), crc: crc32(file.bytes) }));
  const dataSize = entries.reduce((sum, e) => sum + LOCAL_HEADER_SIZE + e.nameBytes.length + e.bytes.length, 0);
  const centralSize = entries.reduce((sum, e) => sum + CENTRAL_HEADER_SIZE + e.nameBytes.length, 0);
  const total = dataSize + centralSize + END_RECORD_SIZE;
  if (total > MAX_ZIP_BYTES || entries.length > MAX_ZIP_ENTRIES) throw new RangeError("ZIP の上限を超えています");

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  const stamp = dosDateTime(modified);
  let offset = 0;
  let centralOffset = dataSize;
  for (const e of entries) {
    // 中央ディレクトリとローカルヘッダで共通の項目 (署名の直後からの差分を吸収して書く)
    const writeCommon = (at: number): void => {
      view.setUint16(at, FLAG_UTF8, true);
      view.setUint16(at + 2, 0, true); // 無圧縮
      view.setUint16(at + 4, stamp.time, true);
      view.setUint16(at + 6, stamp.date, true);
      view.setUint32(at + 8, e.crc, true);
      view.setUint32(at + 12, e.bytes.length, true);
      view.setUint32(at + 16, e.bytes.length, true);
      view.setUint16(at + 20, e.nameBytes.length, true);
    };
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, ZIP_VERSION, true);
    writeCommon(offset + 6);
    out.set(e.nameBytes, offset + LOCAL_HEADER_SIZE);
    out.set(e.bytes, offset + LOCAL_HEADER_SIZE + e.nameBytes.length);

    view.setUint32(centralOffset, 0x02014b50, true);
    view.setUint16(centralOffset + 4, ZIP_VERSION, true);
    view.setUint16(centralOffset + 6, ZIP_VERSION, true);
    writeCommon(centralOffset + 8);
    view.setUint32(centralOffset + 42, offset, true);
    out.set(e.nameBytes, centralOffset + CENTRAL_HEADER_SIZE);

    offset += LOCAL_HEADER_SIZE + e.nameBytes.length + e.bytes.length;
    centralOffset += CENTRAL_HEADER_SIZE + e.nameBytes.length;
  }
  view.setUint32(centralOffset, 0x06054b50, true);
  view.setUint16(centralOffset + 8, entries.length, true);
  view.setUint16(centralOffset + 10, entries.length, true);
  view.setUint32(centralOffset + 12, centralSize, true);
  view.setUint32(centralOffset + 16, dataSize, true);
  return out;
}
