// node_modules/.pnpm/pxtone-ts@git+https+++codeberg.org+pithos+pxtone-ts.git+0171c92ce1fa84ed2e0987361ec4c0e4bd6dbdff/node_modules/pxtone-ts/dist/index.js
var PxtnErr = /* @__PURE__ */ ((PxtnErr2) => {
  PxtnErr2[PxtnErr2["OK"] = 0] = "OK";
  PxtnErr2[PxtnErr2["VOID"] = 1] = "VOID";
  PxtnErr2[PxtnErr2["INIT"] = 2] = "INIT";
  PxtnErr2[PxtnErr2["FATAL"] = 3] = "FATAL";
  PxtnErr2[PxtnErr2["ANTI_OPERATION"] = 4] = "ANTI_OPERATION";
  PxtnErr2[PxtnErr2["DENY_BEATCLOCK"] = 5] = "DENY_BEATCLOCK";
  PxtnErr2[PxtnErr2["DESC_W"] = 6] = "DESC_W";
  PxtnErr2[PxtnErr2["DESC_R"] = 7] = "DESC_R";
  PxtnErr2[PxtnErr2["DESC_BROKEN"] = 8] = "DESC_BROKEN";
  PxtnErr2[PxtnErr2["FMT_NEW"] = 9] = "FMT_NEW";
  PxtnErr2[PxtnErr2["FMT_UNKNOWN"] = 10] = "FMT_UNKNOWN";
  PxtnErr2[PxtnErr2["INV_CODE"] = 11] = "INV_CODE";
  PxtnErr2[PxtnErr2["INV_DATA"] = 12] = "INV_DATA";
  PxtnErr2[PxtnErr2["MEMORY"] = 13] = "MEMORY";
  PxtnErr2[PxtnErr2["MOO_INIT"] = 14] = "MOO_INIT";
  PxtnErr2[PxtnErr2["OGG"] = 15] = "OGG";
  PxtnErr2[PxtnErr2["OGG_NO_SUPPORTED"] = 16] = "OGG_NO_SUPPORTED";
  PxtnErr2[PxtnErr2["PARAM"] = 17] = "PARAM";
  PxtnErr2[PxtnErr2["PCM_CONVERT"] = 18] = "PCM_CONVERT";
  PxtnErr2[PxtnErr2["PCM_UNKNOWN"] = 19] = "PCM_UNKNOWN";
  PxtnErr2[PxtnErr2["PTN_BUILD"] = 20] = "PTN_BUILD";
  PxtnErr2[PxtnErr2["PTN_INIT"] = 21] = "PTN_INIT";
  PxtnErr2[PxtnErr2["PTV_NO_SUPPORTED"] = 22] = "PTV_NO_SUPPORTED";
  PxtnErr2[PxtnErr2["TOO_MUCH_EVENT"] = 23] = "TOO_MUCH_EVENT";
  PxtnErr2[PxtnErr2["Woice_FULL"] = 24] = "Woice_FULL";
  PxtnErr2[PxtnErr2["X1X_IGNORE"] = 25] = "X1X_IGNORE";
  PxtnErr2[PxtnErr2["X3X_ADD_TUNING"] = 26] = "X3X_ADD_TUNING";
  PxtnErr2[PxtnErr2["X3X_KEY"] = 27] = "X3X_KEY";
  PxtnErr2[PxtnErr2["NUM"] = 28] = "NUM";
  return PxtnErr2;
})(PxtnErr || {});
var SEEK_SET = 0;
var SEEK_CUR = 1;
var SEEK_END = 2;
var GROW_BASE = 1024;
function growCapacity(cap, needed) {
  let c = cap;
  while (c < needed) c += Math.max(GROW_BASE, c >> 1);
  return c;
}
var MemoryIo = class {
  buf;
  _len = 0;
  _pos = 0;
  constructor(data) {
    if (typeof data === "number") {
      this.buf = new Uint8Array(Math.max(data, GROW_BASE));
      this._len = 0;
    } else if (data instanceof ArrayBuffer) {
      this.buf = new Uint8Array(data.byteLength);
      this.buf.set(new Uint8Array(data));
      this._len = data.byteLength;
    } else if (data instanceof Uint8Array) {
      this.buf = new Uint8Array(data.length);
      this.buf.set(data);
      this._len = data.length;
    } else {
      this.buf = new Uint8Array(GROW_BASE);
      this._len = 0;
    }
  }
  get position() {
    return this._pos;
  }
  get size() {
    return this._len;
  }
  get remain() {
    return this._len - this._pos;
  }
  read(dst, size, num) {
    const total = size * num;
    if (total === 0) return true;
    if (this._pos + total > this._len) return false;
    dst.set(this.buf.subarray(this._pos, this._pos + total));
    this._pos += total;
    return true;
  }
  write(src, size, num) {
    const total = size * num;
    if (total === 0) return true;
    this.ensure(this._pos + total);
    const dst = this.buf.subarray(this._pos, this._pos + total);
    dst.set(src.subarray(0, total));
    this._pos += total;
    if (this._pos > this._len) this._len = this._pos;
    return true;
  }
  seek(mode, size) {
    if (mode === SEEK_SET) {
      if (size < 0) return false;
      this._pos = size;
    } else if (mode === SEEK_CUR) {
      if (this._pos + size < 0) return false;
      this._pos += size;
    } else if (mode === SEEK_END) {
      if (this._len + size < 0) return false;
      this._pos = this._len + size;
    } else {
      return false;
    }
    return true;
  }
  clear() {
    this._pos = 0;
    this._len = 0;
  }
  toUint8Array() {
    return this.buf.slice(0, this._len);
  }
  ensure(needed) {
    if (needed <= this.buf.length) return;
    const grown = growCapacity(this.buf.length, needed);
    const nb = new Uint8Array(grown);
    nb.set(this.buf.subarray(0, this._len));
    this.buf = nb;
  }
};
function ioGetU8(io) {
  return io.read(scratch1, 1, 1) ? scratch1[0] : null;
}
function ioPutU8(io, v) {
  scratch1[0] = v & 255;
  io.write(scratch1, 1, 1);
}
function ioGetInt8(io) {
  const v = ioGetU8(io);
  return v === null ? null : v << 24 >> 24;
}
function ioGetU16LE(io) {
  if (!io.read(scratch2, 1, 2)) return null;
  return scratch2[0] | scratch2[1] << 8;
}
var ioGetUint16LE = ioGetU16LE;
function ioPutU16LE(io, v) {
  scratch2[0] = v & 255;
  scratch2[1] = v >>> 8 & 255;
  io.write(scratch2, 1, 2);
}
var ioPutUint16LE = ioPutU16LE;
function ioGetInt16LE(io) {
  const v = ioGetU16LE(io);
  return v === null ? null : v << 16 >> 16;
}
function ioPutInt16LE(io, v) {
  ioPutU16LE(io, v);
}
function ioGetInt32LE(io) {
  if (!io.read(scratch4, 1, 4)) return null;
  return scratch4[0] | scratch4[1] << 8 | scratch4[2] << 16 | scratch4[3] << 24;
}
function ioPutInt32LE(io, v) {
  writeI32LE(scratch4, v);
  io.write(scratch4, 1, 4);
}
function ioPutUint32LE(io, v) {
  ioPutInt32LE(io, v >>> 0);
}
function ioPutInt8(io, v) {
  ioPutU8(io, v << 24 >> 24);
}
function floatToInt32Bits(v) {
  const dv = new DataView(asInt8Array(4).buffer);
  dv.setFloat32(0, v, true);
  return dv.getInt32(0, true);
}
function int32ToFloat(bits) {
  const dv = new DataView(asInt8Array(4).buffer);
  dv.setInt32(0, bits, true);
  return dv.getFloat32(0, true);
}
function asInt8Array(n) {
  return new Int8Array(n);
}
function ioGetUint32LE(io) {
  const v = ioGetInt32LE(io);
  return v === null ? null : v >>> 0;
}
function ioGetFloatLE(io) {
  if (!io.read(scratch4, 1, 4)) return null;
  return floatView.getFloat32(0, true);
}
function ioPutFloatLE(io, v) {
  floatView.setFloat32(0, v, true);
  io.write(scratch4, 1, 4);
}
function ioGetBytes(io, n) {
  if (io.remain < n) return null;
  const out = new Uint8Array(n);
  io.read(out, 1, n);
  return out;
}
function intToVBytes(i32) {
  const u = i32 >>> 0;
  const a = [u >>> 0 & 255, u >>> 8 & 255, u >>> 16 & 255, u >>> 24 & 255, 0];
  if (u < 128) {
    return [a[0], 0, 0, 0, 0];
  } else if (u < 16384) {
    return [
      a[0] & 127 | 128,
      a[0] >> 7 | a[1] << 1 & 127,
      0,
      0,
      0
    ];
  } else if (u < 2097152) {
    return [
      a[0] & 127 | 128,
      (a[0] >> 7 | a[1] << 1) & 127 | 128,
      a[1] >> 6 | a[2] << 2 & 127,
      0,
      0
    ];
  } else if (u < 268435456) {
    return [
      a[0] & 127 | 128,
      (a[0] >> 7 | a[1] << 1) & 127 | 128,
      (a[1] >> 6 | a[2] << 2) & 127 | 128,
      a[2] >> 5 | a[3] << 3 & 127,
      0
    ];
  }
  return [
    a[0] & 127 | 128,
    (a[0] >> 7 | a[1] << 1) & 127 | 128,
    (a[1] >> 6 | a[2] << 2) & 127 | 128,
    (a[2] >> 5 | a[3] << 3) & 127 | 128,
    a[3] >> 4 | a[4] << 4 & 127
  ];
}
function vToInt(bytes, byteNum) {
  const b = [0, 0, 0, 0, 0];
  switch (byteNum) {
    case 0:
      break;
    case 1:
      b[0] = bytes[0] & 127 & 255;
      break;
    case 2:
      b[0] = (bytes[0] & 127 | bytes[1] << 7) & 255;
      b[1] = (bytes[1] & 127) >> 1 & 255;
      break;
    case 3:
      b[0] = (bytes[0] & 127 | bytes[1] << 7) & 255;
      b[1] = ((bytes[1] & 127) >> 1 | bytes[2] << 6) & 255;
      b[2] = (bytes[2] & 127) >> 2 & 255;
      break;
    case 4:
      b[0] = (bytes[0] & 127 | bytes[1] << 7) & 255;
      b[1] = ((bytes[1] & 127) >> 1 | bytes[2] << 6) & 255;
      b[2] = ((bytes[2] & 127) >> 2 | bytes[3] << 5) & 255;
      b[3] = (bytes[3] & 127) >> 3 & 255;
      break;
    case 5:
      b[0] = (bytes[0] & 127 | bytes[1] << 7) & 255;
      b[1] = ((bytes[1] & 127) >> 1 | bytes[2] << 6) & 255;
      b[2] = ((bytes[2] & 127) >> 2 | bytes[3] << 5) & 255;
      b[3] = ((bytes[3] & 127) >> 3 | bytes[4] << 4) & 255;
      b[4] = (bytes[4] & 127) >> 4 & 255;
      break;
    default:
      throw new RangeError("varint: invalid byte_num=" + byteNum);
  }
  return b[0] | b[1] << 8 | b[2] << 16 | b[3] << 24;
}
function dataCheckVSize(v) {
  const u = v >>> 0;
  if (u < 128) return 1;
  if (u < 16384) return 2;
  if (u < 2097152) return 3;
  if (u < 268435456) return 4;
  return 5;
}
function dataWriteV(io, v) {
  const bytes = intToVBytes(v);
  const n = dataCheckVSize(v);
  const tmp = theVBytes;
  for (let i = 0; i < n; i++) tmp[i] = bytes[i];
  io.write(tmp.subarray(0, n), 1, n);
  return true;
}
function dataReadV(io) {
  const a = [0, 0, 0, 0, 0];
  let count = 0;
  for (; count < 5; count++) {
    const b = ioGetU8(io);
    if (b === null) return null;
    a[count] = b;
    if ((b & 128) === 0) break;
  }
  return vToInt(a, count + 1);
}
var scratch1 = new Uint8Array(1);
var scratch2 = new Uint8Array(2);
var scratch4 = new Uint8Array(4);
var floatView = new DataView(scratch4.buffer);
var theVBytes = new Uint8Array(5);
function writeI32LE(dst, v) {
  dst[0] = v & 255;
  dst[1] = v >>> 8 & 255;
  dst[2] = v >>> 16 & 255;
  dst[3] = v >>> 24 & 255;
}
var EVENTDEFAULT_VOLUME = 104;
var EVENTDEFAULT_VELOCITY = 104;
var EVENTDEFAULT_VOICENO = 0;
var EVENTDEFAULT_GROUPNO = 0;
var EVENTDEFAULT_KEY = 24576;
var EVENTDEFAULT_BASICKEY = 17664;
var EVENTDEFAULT_TUNING = 1;
var EVENTDEFAULT_BEATNUM = 4;
var EVENTDEFAULT_BEATTEMPO = 120;
var EVENTDEFAULT_BEATCLOCK = 480;
function eventKindIsTail(kind) {
  return kind === 1 || kind === 6;
}
var PRIORITY_TABLE = [
  0,
  // NULL
  50,
  // ON
  40,
  // KEY
  60,
  // PAN_VOLUME
  70,
  // VELOCITY
  80,
  // VOLUME
  30,
  // PORTAMENT
  0,
  // BEATCLOCK
  0,
  // BEATTEMPO
  0,
  // BEATNUM
  0,
  // REPEAT
  255,
  // LAST
  10,
  // VOICENO
  20,
  // GROUPNO
  90,
  // TUNING
  100
  // PAN_TIME
];
function comparePriority(kind1, kind2) {
  return (PRIORITY_TABLE[kind1] ?? 0) - (PRIORITY_TABLE[kind2] ?? 0);
}
var EVENTDEFAULT_VOLUME2 = 104;
var EVENTDEFAULT_VELOCITY2 = 104;
var EVENTDEFAULT_PAN_VOLUME2 = 64;
var EVENTDEFAULT_PAN_TIME2 = 64;
var EVENTDEFAULT_PORTAMENT2 = 0;
var EVENTDEFAULT_VOICENO2 = 0;
var EVENTDEFAULT_GROUPNO2 = 0;
var EVENTDEFAULT_KEY2 = 24576;
var EVENTDEFAULT_TUNING2 = 1;
function defaultKindValue(kind) {
  switch (kind) {
    case 2:
      return EVENTDEFAULT_KEY2;
    case 3:
      return EVENTDEFAULT_PAN_VOLUME2;
    case 4:
      return EVENTDEFAULT_VELOCITY2;
    case 5:
      return EVENTDEFAULT_VOLUME2;
    case 6:
      return EVENTDEFAULT_PORTAMENT2;
    case 7:
      return EVENTDEFAULT_BEATCLOCK;
    case 8:
      return EVENTDEFAULT_BEATTEMPO;
    case 9:
      return EVENTDEFAULT_BEATNUM;
    case 12:
      return EVENTDEFAULT_VOICENO2;
    case 13:
      return EVENTDEFAULT_GROUPNO2;
    case 14:
      return floatToInt32Bits(EVENTDEFAULT_TUNING2);
    case 15:
      return EVENTDEFAULT_PAN_TIME2;
  }
  return 0;
}
function makeRecord() {
  return { kind: 0, unitNo: 0, value: 0, clock: 0, prev: -1, next: -1 };
}
var Evelist = class {
  _eves = [];
  _start = -1;
  _linear = 0;
  _pX4xRec = -1;
  release() {
    this._eves = [];
    this._start = -1;
  }
  clear() {
    for (let i = 0; i < this._eves.length; i++) {
      this._eves[i] = makeRecord();
    }
    this._start = -1;
  }
  allocate(maxEventNum) {
    this.release();
    if (maxEventNum <= 0) return false;
    this._eves = new Array(maxEventNum);
    for (let i = 0; i < maxEventNum; i++) this._eves[i] = makeRecord();
    return true;
  }
  get numMax() {
    return this._eves.length;
  }
  get maxClock() {
    let max = 0;
    for (let p = this._start; p >= 0; p = this._eves[p].next) {
      const e = this._eves[p];
      const clock = eventKindIsTail(e.kind) ? e.clock + e.value : e.clock;
      if (clock > max) max = clock;
    }
    return max;
  }
  get count() {
    if (this._eves.length === 0 || this._start < 0) return 0;
    let n = 0;
    for (let p = this._start; p >= 0; p = this._eves[p].next) n++;
    return n;
  }
  countByValue(kind, value) {
    if (this._eves.length === 0) return 0;
    let n = 0;
    for (let p = this._start; p >= 0; p = this._eves[p].next) {
      const e = this._eves[p];
      if (e.kind === kind && e.value === value) n++;
    }
    return n;
  }
  countByUnit(unitNo) {
    if (this._eves.length === 0) return 0;
    let n = 0;
    for (let p = this._start; p >= 0; p = this._eves[p].next) {
      if (this._eves[p].unitNo === unitNo) n++;
    }
    return n;
  }
  countByUnitKind(unitNo, kind) {
    if (this._eves.length === 0) return 0;
    let n = 0;
    for (let p = this._start; p >= 0; p = this._eves[p].next) {
      const e = this._eves[p];
      if (e.unitNo === unitNo && e.kind === kind) n++;
    }
    return n;
  }
  countByClockRange(clock1, clock2, unitNo) {
    if (this._eves.length === 0) return 0;
    let p = this._start;
    for (; p >= 0; p = this._eves[p].next) {
      const e = this._eves[p];
      if (e.unitNo === unitNo) {
        if (e.clock >= clock1) break;
        if (eventKindIsTail(e.kind) && e.clock + e.value > clock1) break;
      }
    }
    let n = 0;
    for (; p >= 0; p = this._eves[p].next) {
      const e = this._eves[p];
      if (e.clock !== clock1 && e.clock >= clock2) break;
      if (e.unitNo === unitNo) n++;
    }
    return n;
  }
  getValue(clock, unitNo, kind) {
    if (this._eves.length === 0) return 0;
    let val = defaultKindValue(kind);
    for (let p = this._start; p >= 0; p = this._eves[p].next) {
      const e = this._eves[p];
      if (e.clock > clock) break;
      if (e.unitNo === unitNo && e.kind === kind) val = e.value;
    }
    return val;
  }
  get records() {
    const out = [];
    for (let p = this._start; p >= 0; p = this._eves[p].next) out.push(this._eves[p]);
    return out;
  }
  recSet(pRec, prev, next, clock, unitNo, kind, value) {
    if (prev >= 0) this._eves[prev].next = pRec;
    else this._start = pRec;
    if (next >= 0) this._eves[next].prev = pRec;
    const e = this._eves[pRec];
    e.next = next;
    e.prev = prev;
    e.clock = clock;
    e.kind = kind;
    e.unitNo = unitNo;
    e.value = value;
  }
  recCut(pRec) {
    const e = this._eves[pRec];
    if (e.prev >= 0) this._eves[e.prev].next = e.next;
    else this._start = e.next;
    if (e.next >= 0) this._eves[e.next].prev = e.prev;
    e.kind = 0;
  }
  recordAddF(clock, unitNo, kind, valueF) {
    const value = floatToInt32Bits(valueF);
    return this.recordAddI(clock, unitNo, kind, value);
  }
  recordAddI(clock, unitNo, kind, value) {
    if (this._eves.length === 0) return false;
    let pNew = -1;
    let pPrev = -1;
    let pNext = -1;
    for (let r = 0; r < this._eves.length; r++) {
      if (this._eves[r].kind === 0) {
        pNew = r;
        break;
      }
    }
    if (pNew < 0) return false;
    if (this._start < 0) {
    } else if (clock < this._eves[this._start].clock) {
      pNext = this._start;
    } else {
      let p = this._start;
      for (; ; p = this._eves[p].next) {
        const e = this._eves[p];
        if (p < 0) break;
        if (e.clock === clock) {
          for (; ; p = this._eves[p].next) {
            const e2 = this._eves[p];
            if (p < 0) break;
            if (e2.clock !== clock) {
              pPrev = e2.prev;
              pNext = p;
              break;
            }
            if (unitNo === e2.unitNo && kind === e2.kind) {
              pPrev = e2.prev;
              pNext = e2.next;
              e2.kind = 0;
              break;
            }
            if (comparePriority(kind, e2.kind) < 0) {
              pPrev = e2.prev;
              pNext = p;
              break;
            }
            if (e2.next < 0) {
              pPrev = p;
              break;
            }
          }
          break;
        } else if (e.clock > clock) {
          pPrev = e.prev;
          pNext = p;
          break;
        } else if (e.next < 0) {
          pPrev = p;
          break;
        }
      }
    }
    this.recSet(pNew, pPrev, pNext, clock, unitNo, kind, value);
    if (eventKindIsTail(kind)) {
      for (let p = this._eves[pNew].prev; p >= 0; p = this._eves[p].prev) {
        const e = this._eves[p];
        if (e.unitNo === unitNo && e.kind === kind) {
          if (clock < e.clock + e.value) e.value = clock - e.clock;
          break;
        }
      }
    }
    if (eventKindIsTail(kind)) {
      const limit = clock + value;
      for (let p = this._eves[pNew].next; p >= 0 && this._eves[p].clock < limit; p = this._eves[p].next) {
        const e = this._eves[p];
        if (e.unitNo === unitNo && e.kind === kind) this.recCut(p);
      }
    }
    return true;
  }
  recordDelete(clock1, clock2, unitNo, kind) {
    if (this._eves.length === 0) return 0;
    let count = 0;
    for (let p = this._start; p >= 0; p = this._eves[p].next) {
      const e = this._eves[p];
      if (e.clock !== clock1 && e.clock >= clock2) break;
      if (e.clock >= clock1 && e.unitNo === unitNo && e.kind === kind) {
        this.recCut(p);
        count++;
      }
    }
    if (eventKindIsTail(kind)) {
      for (let p = this._start; p >= 0; p = this._eves[p].next) {
        const e = this._eves[p];
        if (e.clock >= clock1) break;
        if (e.unitNo === unitNo && e.kind === kind && e.clock + e.value > clock1) {
          e.value = clock1 - e.clock;
          count++;
        }
      }
    }
    return count;
  }
  recordDeleteByUnit(clock1, clock2, unitNo) {
    if (this._eves.length === 0) return 0;
    let count = 0;
    for (let p = this._start; p >= 0; p = this._eves[p].next) {
      const e = this._eves[p];
      if (e.clock !== clock1 && e.clock >= clock2) break;
      if (e.clock >= clock1 && e.unitNo === unitNo) {
        this.recCut(p);
        count++;
      }
    }
    for (let p = this._start; p >= 0; p = this._eves[p].next) {
      const e = this._eves[p];
      if (e.clock >= clock1) break;
      if (e.unitNo === unitNo && eventKindIsTail(e.kind) && e.clock + e.value > clock1) {
        e.value = clock1 - e.clock;
        count++;
      }
    }
    return count;
  }
  recordUnitNoMiss(unitNo) {
    if (this._eves.length === 0) return 0;
    let count = 0;
    for (let p = this._start; p >= 0; p = this._eves[p].next) {
      const e = this._eves[p];
      if (e.unitNo === unitNo) {
        this.recCut(p);
        count++;
      } else if (e.unitNo > unitNo) {
        e.unitNo--;
        count++;
      }
    }
    return count;
  }
  recordUnitNoSet(unitNo) {
    if (this._eves.length === 0) return 0;
    let count = 0;
    for (let p = this._start; p >= 0; p = this._eves[p].next) {
      this._eves[p].unitNo = unitNo;
      count++;
    }
    return count;
  }
  recordUnitNoReplace(oldU, newU) {
    if (this._eves.length === 0) return 0;
    let count = 0;
    if (oldU === newU) return 0;
    if (oldU < newU) {
      for (let p = this._start; p >= 0; p = this._eves[p].next) {
        const e = this._eves[p];
        if (e.unitNo === oldU) {
          e.unitNo = newU;
          count++;
        } else if (e.unitNo > oldU && e.unitNo <= newU) {
          e.unitNo--;
          count++;
        }
      }
    } else {
      for (let p = this._start; p >= 0; p = this._eves[p].next) {
        const e = this._eves[p];
        if (e.unitNo === oldU) {
          e.unitNo = newU;
          count++;
        } else if (e.unitNo < oldU && e.unitNo >= newU) {
          e.unitNo++;
          count++;
        }
      }
    }
    return count;
  }
  recordValueSet(clock1, clock2, unitNo, kind, value) {
    if (this._eves.length === 0) return 0;
    let count = 0;
    for (let p = this._start; p >= 0; p = this._eves[p].next) {
      const e = this._eves[p];
      if (e.unitNo === unitNo && e.kind === kind && e.clock >= clock1 && e.clock < clock2) {
        e.value = value;
        count++;
      }
    }
    return count;
  }
  beatClockOperation(rate) {
    if (this._eves.length === 0) return 0;
    let count = 0;
    for (let p = this._start; p >= 0; p = this._eves[p].next) {
      const e = this._eves[p];
      e.clock *= rate;
      if (eventKindIsTail(e.kind)) e.value *= rate;
      count++;
    }
    return count;
  }
  recordValueChange(clock1, clock2, unitNo, kind, value) {
    if (this._eves.length === 0) return 0;
    let count = 0;
    let max;
    let min;
    switch (kind) {
      case 0:
        max = 0;
        min = 0;
        break;
      case 1:
        max = 120;
        min = 120;
        break;
      case 2:
        max = 49151;
        min = 0;
        break;
      case 3:
      case 15:
      case 4:
      case 5:
        max = 128;
        min = 0;
        break;
      default:
        max = 0;
        min = 0;
    }
    for (let p = this._start; p >= 0; p = this._eves[p].next) {
      const e = this._eves[p];
      if (e.unitNo === unitNo && e.kind === kind && e.clock >= clock1) {
        if (clock2 === -1 || e.clock < clock2) {
          e.value += value;
          if (e.value < min) e.value = min;
          if (e.value > max) e.value = max;
          count++;
        }
      }
    }
    return count;
  }
  recordValueOmit(kind, value) {
    if (this._eves.length === 0) return 0;
    let count = 0;
    for (let p = this._start; p >= 0; p = this._eves[p].next) {
      const e = this._eves[p];
      if (e.kind === kind) {
        if (e.value === value) {
          this.recCut(p);
          count++;
        } else if (e.value > value) {
          e.value--;
          count++;
        }
      }
    }
    return count;
  }
  recordValueReplace(kind, oldValue, newValue) {
    if (this._eves.length === 0) return 0;
    let count = 0;
    if (oldValue === newValue) return 0;
    if (oldValue < newValue) {
      for (let p = this._start; p >= 0; p = this._eves[p].next) {
        const e = this._eves[p];
        if (e.kind === kind) {
          if (e.value === oldValue) {
            e.value = newValue;
            count++;
          } else if (e.value > oldValue && e.value <= newValue) {
            e.value--;
            count++;
          }
        }
      }
    } else {
      for (let p = this._start; p >= 0; p = this._eves[p].next) {
        const e = this._eves[p];
        if (e.kind === kind) {
          if (e.value === oldValue) {
            e.value = newValue;
            count++;
          } else if (e.value < oldValue && e.value >= newValue) {
            e.value++;
            count++;
          }
        }
      }
    }
    return count;
  }
  recordClockShift(clock, shift, unitNo) {
    if (this._eves.length === 0) return 0;
    if (this._start < 0) return 0;
    if (!shift) return 0;
    let count = 0;
    if (shift < 0) {
      let p = this._start;
      for (; p >= 0; p = this._eves[p].next) {
        if (this._eves[p].clock >= clock) break;
      }
      while (p >= 0) {
        if (this._eves[p].unitNo === unitNo) {
          const c = this._eves[p].clock + shift;
          const k = this._eves[p].kind;
          const v = this._eves[p].value;
          const pNext = this._eves[p].next;
          this.recCut(p);
          if (c >= 0) this.recordAddI(c, unitNo, k, v);
          count++;
          p = pNext;
        } else {
          p = this._eves[p].next;
        }
      }
    } else if (shift > 0) {
      let p = this._start;
      while (this._eves[p].next >= 0) p = this._eves[p].next;
      while (p >= 0) {
        if (this._eves[p].clock < clock) break;
        if (this._eves[p].unitNo === unitNo) {
          const c = this._eves[p].clock + shift;
          const k = this._eves[p].kind;
          const v = this._eves[p].value;
          const pPrev = this._eves[p].prev;
          this.recCut(p);
          this.recordAddI(c, unitNo, k, v);
          count++;
          p = pPrev;
        } else {
          p = this._eves[p].prev;
        }
      }
    }
    return count;
  }
  // linear 読み込みモード
  linearStart() {
    if (this._eves.length === 0) return false;
    this.clear();
    this._linear = 0;
    return true;
  }
  linearAddI(clock, unitNo, kind, value) {
    const e = this._eves[this._linear];
    e.clock = clock;
    e.unitNo = unitNo;
    e.kind = kind;
    e.value = value;
    this._linear++;
  }
  linearAddF(clock, unitNo, kind, valueF) {
    const value = floatToInt32Bits(valueF);
    this.linearAddI(clock, unitNo, kind, value);
  }
  linearEnd(bConnect) {
    if (this._eves.length > 0 && this._eves[0].kind !== 0) this._start = 0;
    if (bConnect) {
      for (let r = 1; r < this._eves.length; r++) {
        if (this._eves[r].kind === 0) break;
        this._eves[r].prev = r - 1;
        this._eves[r - 1].next = r;
      }
    }
  }
  // x4x 読み込み
  x4xReadStart() {
    if (this._eves.length === 0) return false;
    this.clear();
    this._linear = 0;
    this._pX4xRec = -1;
    return true;
  }
  x4xReadNewKind() {
    this._pX4xRec = -1;
  }
  x4xReadAdd(clock, unitNo, kind, value) {
    const pNew = this._linear++;
    let pPrev = -1;
    let pNext = -1;
    if (this._start < 0) {
    } else if (clock < this._eves[this._start].clock) {
      pNext = this._start;
    } else {
      let p = this._pX4xRec >= 0 ? this._pX4xRec : this._start;
      for (; ; p = this._eves[p].next) {
        if (p < 0) break;
        const e = this._eves[p];
        if (e.clock === clock) {
          for (; ; p = this._eves[p].next) {
            if (p < 0) break;
            const e2 = this._eves[p];
            if (e2.clock !== clock) {
              pPrev = e2.prev;
              pNext = p;
              break;
            }
            if (unitNo === e2.unitNo && kind === e2.kind) {
              pPrev = e2.prev;
              pNext = e2.next;
              e2.kind = 0;
              break;
            }
            if (comparePriority(kind, e2.kind) < 0) {
              pPrev = e2.prev;
              pNext = p;
              break;
            }
            if (e2.next < 0) {
              pPrev = p;
              break;
            }
          }
          break;
        } else if (e.clock > clock) {
          pPrev = e.prev;
          pNext = p;
          break;
        } else if (e.next < 0) {
          pPrev = p;
          break;
        }
      }
    }
    this.recSet(pNew, pPrev, pNext, clock, unitNo, kind, value);
    this._pX4xRec = pNew;
  }
  // ---- io ----
  ioWrite(desc, rough) {
    const eveNum = this.count;
    let relativeSize = 0;
    for (const p of this.records) {
      relativeSize += dataCheckVSize(p.clock);
      relativeSize += 1;
      relativeSize += 1;
      relativeSize += dataCheckVSize(p.value);
    }
    const size = 4 + relativeSize;
    ioPutInt32LE(desc, size);
    ioPutInt32LE(desc, eveNum);
    let absolute = 0;
    for (const p of this.records) {
      const clock = p.clock - absolute;
      const value = eventKindIsTail(p.kind) ? Math.trunc(p.value / rough) : p.value;
      dataWriteV(desc, Math.trunc(clock / rough));
      ioPutU8(desc, p.unitNo);
      ioPutU8(desc, p.kind);
      dataWriteV(desc, value);
      absolute = p.clock;
    }
    return true;
  }
  ioRead(desc) {
    const size = ioGetInt32LE(desc);
    const eveNum = ioGetInt32LE(desc);
    if (size === null || eveNum === null) return 7;
    let clock = 0;
    let absolute = 0;
    for (let e = 0; e < eveNum; e++) {
      const rv = dataReadV(desc);
      const unitNo = ioGetU8(desc);
      const kind = ioGetU8(desc);
      const value = dataReadV(desc);
      if (rv === null || unitNo === null || kind === null || value === null) return 7;
      absolute += rv;
      clock = absolute;
      this.linearAddI(clock, unitNo, kind, value);
    }
    return 0;
  }
  ioReadEventNum(desc) {
    const size = ioGetInt32LE(desc);
    const eveNum = ioGetInt32LE(desc);
    if (size === null || eveNum === null) return 0;
    let count = 0;
    for (let e = 0; e < eveNum; e++) {
      const c = dataReadV(desc);
      const u = ioGetU8(desc);
      const k = ioGetU8(desc);
      const v = dataReadV(desc);
      if (c === null || u === null || k === null || v === null) return 0;
      count++;
    }
    if (count !== eveNum) return 0;
    return eveNum;
  }
  // _x4x_EVENTSTRUCT: unit_index / event_kind / data_num / rrr / event_num (12byte)
  ioUnitReadX4xEvent(desc, bTailAbsolute, bCheckRRR) {
    const size = ioGetInt32LE(desc);
    if (size === null) return 7;
    const unitIndex = ioGetU16LE(desc);
    const eventKind = ioGetU16LE(desc);
    const dataNum = ioGetU16LE(desc);
    const rrr = ioGetU16LE(desc);
    const eventNum = ioGetUint32LE(desc);
    if (unitIndex === null || eventKind === null || dataNum === null || rrr === null || eventNum === null) {
      return 7;
    }
    if (dataNum !== 2) return 10;
    if (eventKind >= 16) return 10;
    if (bCheckRRR && rrr) return 10;
    void size;
    let absolute = 0;
    let clock = 0;
    let value = 0;
    let e = 0;
    for (; e < eventNum; e++) {
      const cv = dataReadV(desc);
      const vv = dataReadV(desc);
      if (cv === null || vv === null) break;
      clock = cv;
      value = vv;
      absolute += clock;
      clock = absolute;
      this.x4xReadAdd(clock, unitIndex, eventKind, value);
      if (bTailAbsolute && eventKindIsTail(eventKind)) absolute += value;
    }
    if (e !== eventNum) return 8;
    this.x4xReadNewKind();
    return 0;
  }
  ioReadX4xEventNum(desc) {
    if (!desc) return 17;
    const size = ioGetInt32LE(desc);
    if (size === null) return 7;
    const _unitIndex = ioGetU16LE(desc);
    const _eventKind = ioGetU16LE(desc);
    const dataNum = ioGetU16LE(desc);
    const _rrr = ioGetU16LE(desc);
    const eventNum = ioGetUint32LE(desc);
    if (_unitIndex === null || _eventKind === null || dataNum === null || _rrr === null || eventNum === null) {
      return 7;
    }
    void size;
    if (dataNum !== 2) return 10;
    let e = 0;
    for (; e < eventNum; e++) {
      const a = dataReadV(desc);
      const b = dataReadV(desc);
      if (a === null || b === null) break;
    }
    if (e !== eventNum) return 8;
    return eventNum;
  }
};
var Master = class {
  _beat_num = EVENTDEFAULT_BEATNUM;
  _beat_tempo = EVENTDEFAULT_BEATTEMPO;
  _beat_clock = EVENTDEFAULT_BEATCLOCK;
  _meas_num = 1;
  _repeat_meas = 0;
  _last_meas = 0;
  reset() {
    this._beat_num = EVENTDEFAULT_BEATNUM;
    this._beat_tempo = EVENTDEFAULT_BEATTEMPO;
    this._beat_clock = EVENTDEFAULT_BEATCLOCK;
    this._meas_num = 1;
    this._repeat_meas = 0;
    this._last_meas = 0;
  }
  set(beatNum, beatTempo, beatClock) {
    this._beat_num = beatNum;
    this._beat_tempo = beatTempo;
    this._beat_clock = beatClock;
  }
  get beatNum() {
    return this._beat_num;
  }
  get beatTempo() {
    return this._beat_tempo;
  }
  get beatClock() {
    return this._beat_clock;
  }
  get measNum() {
    return this._meas_num;
  }
  get repeatMeas() {
    return this._repeat_meas;
  }
  get lastMeas() {
    return this._last_meas;
  }
  get lastClock() {
    return this._last_meas * this._beat_clock * this._beat_num;
  }
  get playMeas() {
    if (this._last_meas) return this._last_meas;
    return this._meas_num;
  }
  setMeasNum(measNum) {
    if (measNum < 1) measNum = 1;
    if (measNum <= this._repeat_meas) measNum = this._repeat_meas + 1;
    if (measNum < this._last_meas) measNum = this._last_meas;
    this._meas_num = measNum;
  }
  setRepeatMeas(meas) {
    if (meas < 0) meas = 0;
    this._repeat_meas = meas;
  }
  setLastMeas(meas) {
    if (meas < 0) meas = 0;
    this._last_meas = meas;
  }
  setBeatClock(beatClock) {
    if (beatClock < 0) beatClock = 0;
    this._beat_clock = beatClock;
  }
  getThisClock(meas, beat, clock) {
    return this._beat_num * this._beat_clock * meas + this._beat_clock * beat + clock;
  }
  adjustMeasNum(clock) {
    const bNum = Math.trunc((clock + this._beat_clock - 1) / this._beat_clock);
    const mNum = Math.trunc((bNum + this._beat_num - 1) / this._beat_num);
    if (this._meas_num <= mNum) this._meas_num = mNum;
    if (this._repeat_meas >= this._meas_num) this._repeat_meas = 0;
    if (this._last_meas > this._meas_num) this._last_meas = this._meas_num;
  }
  // 15byte固定 + size（rough は .ptcop 読み込み時は 1）
  ioWV5(desc, rough) {
    const size = 15;
    const bClock = Math.trunc(this._beat_clock / rough);
    ioPutUint32LE(desc, size);
    ioPutInt16LE(desc, bClock);
    ioPutInt8(desc, this._beat_num);
    ioPutFloatLE(desc, this._beat_tempo);
    ioPutInt32LE(desc, bClock * this._beat_num * this.repeatMeas);
    ioPutInt32LE(desc, bClock * this._beat_num * this.lastMeas);
    return true;
  }
  ioRV5(desc) {
    const size = ioGetUint32LE(desc);
    if (size === null) return 7;
    if (size !== 15) return 10;
    const beatClock = ioGetInt16LE(desc);
    const beatNum = ioGetInt8(desc);
    const beatTempo = ioGetFloatLE(desc);
    const clockRepeat = ioGetInt32LE(desc);
    const clockLast = ioGetInt32LE(desc);
    if (beatClock === null || beatNum === null || beatTempo === null || clockRepeat === null || clockLast === null) {
      return 7;
    }
    this._beat_clock = beatClock;
    this._beat_num = beatNum;
    this._beat_tempo = beatTempo;
    if (beatNum * beatClock) {
      this.setRepeatMeas(Math.trunc(clockRepeat / (beatNum * beatClock)));
      this.setLastMeas(Math.trunc(clockLast / (beatNum * beatClock)));
    } else {
      this.setRepeatMeas(0);
      this.setLastMeas(0);
    }
    return 0;
  }
  // カウント用: master セクションのサイズを確認して 5 を返す（C++ 互換）
  ioRV5EventNum(desc) {
    const size = ioGetUint32LE(desc);
    if (size !== 15) return 0;
    if (desc.remain < 15) return 0;
    desc.seek(SEEK_CUR, 15);
    return 5;
  }
  // x4x 形式
  ioRX4x(desc) {
    ioGetInt32LE(desc);
    const dataNum = ioGetUint16LE(desc);
    const rrr = ioGetUint16LE(desc);
    const eventNum = ioGetUint32LE(desc);
    if (dataNum === null || rrr === null || eventNum === null) return 7;
    if (dataNum !== 3) return 10;
    if (rrr) return 10;
    let beatClock = EVENTDEFAULT_BEATCLOCK;
    let beatNum = EVENTDEFAULT_BEATNUM;
    let beatTempo = EVENTDEFAULT_BEATTEMPO;
    let repeatClock = 0;
    let lastClock = 0;
    let absolute = 0;
    let e = 0;
    for (; e < eventNum; e++) {
      const status = dataReadV(desc);
      const clock = dataReadV(desc);
      const volume = dataReadV(desc);
      if (status === null || clock === null || volume === null) break;
      absolute += clock;
      const curClock = absolute;
      switch (status) {
        case 7:
          beatClock = volume;
          if (curClock) return 8;
          break;
        case 8:
          beatTempo = int32ToFloat(volume);
          if (curClock) return 8;
          break;
        case 9:
          beatNum = volume;
          if (curClock) return 8;
          break;
        case 10:
          repeatClock = curClock;
          if (volume) return 8;
          break;
        case 11:
          lastClock = curClock;
          if (volume) return 8;
          break;
        default:
          return 10;
      }
    }
    if (e !== eventNum) return 8;
    this._beat_num = beatNum;
    this._beat_tempo = beatTempo;
    this._beat_clock = beatClock;
    if (beatNum * beatClock) {
      this.setRepeatMeas(Math.trunc(repeatClock / (beatNum * beatClock)));
      this.setLastMeas(Math.trunc(lastClock / (beatNum * beatClock)));
    } else {
      this.setRepeatMeas(0);
      this.setLastMeas(0);
    }
    return 0;
  }
  ioRX4xEventNum(desc) {
    const size = ioGetUint32LE(desc);
    if (size === null) return 0;
    const dataNum = ioGetUint16LE(desc);
    const rrr = ioGetUint16LE(desc);
    const eventNum = ioGetUint32LE(desc);
    if (dataNum === null || rrr === null || eventNum === null) return 0;
    if (dataNum !== 3) return 0;
    void rrr;
    for (let e = 0; e < eventNum; e++) {
      const a = dataReadV(desc);
      const b = dataReadV(desc);
      const c = dataReadV(desc);
      if (a === null || b === null || c === null) return 0;
    }
    return eventNum;
  }
};
var PxtnText = class {
  _comment = new Uint8Array(0);
  _name = new Uint8Array(0);
  get hasComment() {
    return this._comment.length > 0;
  }
  get hasName() {
    return this._name.length > 0;
  }
  setCommentBuf(buf) {
    this._comment = new Uint8Array(buf.length);
    this._comment.set(buf);
    return true;
  }
  setNameBuf(buf) {
    this._name = new Uint8Array(buf.length);
    this._name.set(buf);
    return true;
  }
  getCommentBuf() {
    return this._comment;
  }
  getNameBuf() {
    return this._name;
  }
  // 文字列として取得（SJIS→Unicode）
  getCommentString() {
    return shiftJisToString(this._comment);
  }
  getNameString() {
    return shiftJisToString(this._name);
  }
  commentW(desc) {
    if (!this.hasComment) return false;
    return write4(desc, this._comment);
  }
  nameW(desc) {
    if (!this.hasName) return false;
    return write4(desc, this._name);
  }
  commentR(desc) {
    const r = read4(desc);
    if (r === null) return false;
    this._comment = new Uint8Array(r.length);
    this._comment.set(r);
    return true;
  }
  nameR(desc) {
    const r = read4(desc);
    if (r === null) return false;
    this._name = new Uint8Array(r.length);
    this._name.set(r);
    return true;
  }
};
function read4(desc) {
  const size = ioGetInt32LE(desc);
  if (size === null || size < 0) return null;
  if (size === 0) return new Uint8Array(0);
  const b = ioGetBytes(desc, size);
  return b;
}
function write4(desc, buf) {
  ioPutInt32LE(desc, buf.length);
  desc.write(buf, 1, buf.length);
  return true;
}
var sjisDecoder = null;
function shiftJisToString(buf) {
  if (!sjisDecoder) sjisDecoder = new TextDecoder("shift_jis");
  return sjisDecoder.decode(buf);
}
var PXTN_MAX_CHANNEL = 2;
var PXTN_MAX_TUNE_UNIT_STRUCT = 50;
var PXTN_MAX_TUNE_WOICE_STRUCT = 100;
var PXTN_MAX_TUNE_GROUP_NUM = 7;
var PXTN_MAX_TUNE_DELAY_STRUCT = 4;
var PXTN_MAX_TUNE_OVERDRIVE_STRUCT = 2;
var PXTN_MAX_TUNE_UNIT_NAME = 16;
var PXTN_VERSIONSIZE = 16;
var PXTN_CODESIZE = 8;
var PXTN_VOMIT_PREP_FLAG_LOOP = 1;
var PXTN_VOMIT_PREP_FLAG_UNIT_MUTE = 2;
var PXTN_BUFSIZE_TIMEPAN = 64;
var PXTN_BITPERSAMPLE = 16;
var PXTN_MAX_TUNEWOICENAME = 16;
var Delay = class {
  _bPlayed = true;
  _unit = 0;
  _group = 0;
  _rate = 33;
  _freq = 3;
  _smpNum = 0;
  _offset = 0;
  _bufs = [new Int32Array(0), new Int32Array(0)];
  _rateS32 = 100;
  get unit() {
    return this._unit;
  }
  get group() {
    return this._group;
  }
  get rate() {
    return this._rate;
  }
  get freq() {
    return this._freq;
  }
  get played() {
    return this._bPlayed;
  }
  set(unit, freq, rate, group) {
    this._unit = unit;
    this._group = group;
    this._rate = rate;
    this._freq = freq;
  }
  setPlayed(b) {
    this._bPlayed = b;
  }
  switchPlayed() {
    this._bPlayed = !this._bPlayed;
    return this._bPlayed;
  }
  toneRelease() {
    this._bufs = [new Int32Array(0), new Int32Array(0)];
    this._smpNum = 0;
  }
  toneReady(beatNum, beatTempo, sps) {
    this.toneRelease();
    let res = 1;
    if (this._freq && this._rate) {
      this._offset = 0;
      this._rateS32 = Math.trunc(this._rate);
      switch (this._unit) {
        case 0:
          this._smpNum = Math.trunc(Math.fround(Math.fround(sps * 60) / beatTempo) / this._freq);
          break;
        case 1:
          this._smpNum = Math.trunc(Math.fround(Math.fround(Math.fround(sps * 60 * beatNum) / beatTempo)) / this._freq);
          break;
        case 2:
          this._smpNum = Math.trunc(Math.fround(sps / this._freq));
          break;
      }
      this._bufs = [];
      for (let c = 0; c < PXTN_MAX_CHANNEL; c++) {
        if (this._smpNum <= 0) {
          this._bufs.push(new Int32Array(0));
        } else {
          try {
            this._bufs.push(new Int32Array(this._smpNum));
          } catch {
            res = 13;
            break;
          }
        }
      }
      if (res !== 1) {
        this.toneRelease();
        return res;
      }
    }
    return 0;
  }
  toneSupple(ch, groupSmps) {
    if (!this._smpNum) return;
    const rateS32 = this._rateS32;
    const a = Math.trunc(Math.imul(this._bufs[ch][this._offset], rateS32) / 100);
    if (this._bPlayed) groupSmps[this._group] += a;
    this._bufs[ch][this._offset] = groupSmps[this._group];
  }
  toneIncrement() {
    if (!this._smpNum) return;
    if (++this._offset >= this._smpNum) this._offset = 0;
  }
  toneClear() {
    if (!this._smpNum) return;
    for (let i = 0; i < PXTN_MAX_CHANNEL; i++) this._bufs[i].fill(0);
  }
  // 12byte
  write(desc) {
    const size = 12;
    ioPutInt32LE(desc, size);
    ioPutUint16LE(desc, this._unit);
    ioPutUint16LE(desc, this._group);
    ioPutFloatLE(desc, this._rate);
    ioPutFloatLE(desc, this._freq);
    return true;
  }
  read(desc) {
    const size = ioGetInt32LE(desc);
    if (size === null) return 7;
    const unit = ioGetUint16LE(desc);
    const group = ioGetUint16LE(desc);
    const rate = ioGetFloatLE(desc);
    const freq = ioGetFloatLE(desc);
    if (unit === null || group === null || rate === null || freq === null) return 7;
    if (unit >= 3) return 10;
    this._unit = unit;
    this._freq = freq;
    this._rate = rate;
    this._group = group;
    if (this._group >= PXTN_MAX_TUNE_GROUP_NUM) this._group = 0;
    void size;
    return 0;
  }
};
var TUNEOVERDRIVE_CUT_MAX = 99.9;
var TUNEOVERDRIVE_CUT_MIN = 50;
var TUNEOVERDRIVE_AMP_MAX = 8;
var TUNEOVERDRIVE_AMP_MIN = 0.1;
var OverDrive = class {
  _bPlayed = true;
  _group = 0;
  _cutF = 0;
  _ampF = 0;
  _cut16bitTop = 0;
  get cut() {
    return this._cutF;
  }
  get amp() {
    return this._ampF;
  }
  get group() {
    return this._group;
  }
  get played() {
    return this._bPlayed;
  }
  set(cut, amp, group) {
    this._cutF = cut;
    this._ampF = amp;
    this._group = group;
  }
  setPlayed(b) {
    this._bPlayed = b;
  }
  switchPlayed() {
    this._bPlayed = !this._bPlayed;
    return this._bPlayed;
  }
  toneReady() {
    this._cut16bitTop = Math.trunc(Math.fround(Math.fround(32767 * (100 - this._cutF)) / 100));
  }
  toneSupple(groupSmps) {
    if (!this._bPlayed) return;
    let work = groupSmps[this._group];
    const top = this._cut16bitTop;
    if (work > top) work = top;
    else if (work < -top) work = -top;
    groupSmps[this._group] = Math.trunc(Math.fround(work * this._ampF));
  }
  // 16byte
  write(desc) {
    const size = 16;
    ioPutInt32LE(desc, size);
    ioPutUint16LE(desc, 0);
    ioPutUint16LE(desc, this._group);
    ioPutFloatLE(desc, this._cutF);
    ioPutFloatLE(desc, this._ampF);
    ioPutFloatLE(desc, 0);
    return true;
  }
  read(desc) {
    const size = ioGetInt32LE(desc);
    if (size === null) return 7;
    const xxx = ioGetUint16LE(desc);
    const group = ioGetUint16LE(desc);
    const cut = ioGetFloatLE(desc);
    const amp = ioGetFloatLE(desc);
    const yyy = ioGetFloatLE(desc);
    if (xxx === null || group === null || cut === null || amp === null || yyy === null) return 7;
    if (xxx) return 10;
    if (yyy) return 10;
    if (cut > TUNEOVERDRIVE_CUT_MAX || cut < TUNEOVERDRIVE_CUT_MIN) return 10;
    if (amp > TUNEOVERDRIVE_AMP_MAX || amp < TUNEOVERDRIVE_AMP_MIN) return 10;
    this._cutF = cut;
    this._ampF = amp;
    this._group = group;
    void size;
    return 0;
  }
};
var _OCTAVE_NUM = 16;
var _KEY_PER_OCTAVE = 12;
var _FREQUENCY_PER_KEY = 16;
var _TABLE_SIZE = _OCTAVE_NUM * _KEY_PER_OCTAVE * _FREQUENCY_PER_KEY;
var _OCT_TABLE = [
  390625e-8,
  // 0  -8
  78125e-7,
  // 1  -7
  0.015625,
  // 2  -6
  0.03125,
  // 3  -5
  0.0625,
  // 4  -4
  0.125,
  // 5  -3
  0.25,
  // 6  -2
  0.5,
  // 7  -1
  1,
  // 8
  2,
  // 9  1
  4,
  // a  2
  8,
  // b  3
  16,
  // c  4
  32,
  // d  5
  64,
  // e  6
  128
  // f  7
];
function getDivideOctaveRate(divi) {
  let parameter = 1;
  for (let i = 0; i < 17; i++) {
    let add = 1;
    for (let j2 = 0; j2 < i; j2++) add = add * 0.1;
    let j = 0;
    for (j = 0; j < 10; j++) {
      const work = parameter + add * j;
      let result = 1;
      let k = 0;
      for (k = 0; k < divi; k++) {
        result *= work;
        if (result >= 2) break;
      }
      if (k !== divi) break;
    }
    parameter += add * (j - 1);
  }
  return parameter;
}
var Frequency = class {
  _freqTable;
  constructor() {
    this._freqTable = new Float32Array(_TABLE_SIZE);
  }
  init() {
    const octX24 = getDivideOctaveRate(_KEY_PER_OCTAVE * _FREQUENCY_PER_KEY);
    const perOct = _KEY_PER_OCTAVE * _FREQUENCY_PER_KEY;
    for (let f = 0; f < _TABLE_SIZE; f++) {
      let work = _OCT_TABLE[Math.trunc(f / perOct)];
      const rem = f % perOct;
      for (let key = 0; key < rem; key++) work *= octX24;
      this._freqTable[f] = work;
    }
  }
  get(key) {
    let i = Math.trunc((key + 24576) * _FREQUENCY_PER_KEY / 256);
    if (i < 0) i = 0;
    else if (i >= _TABLE_SIZE) i = _TABLE_SIZE - 1;
    return this._freqTable[i];
  }
  get2(key) {
    let i = key >> 4;
    if (i < 0) i = 0;
    else if (i >= _TABLE_SIZE) i = _TABLE_SIZE - 1;
    return this._freqTable[i];
  }
  getTable() {
    return this._freqTable;
  }
};
var Oscillator = class {
  _volume = 0;
  _pPoint = [];
  _sampleNum = 0;
  _pointNum = 0;
  _pointReso = 0;
  readyGetSample(pPoint, pointNum, volume, sampleNum, pointReso) {
    this._volume = volume;
    this._pPoint = pPoint;
    this._sampleNum = sampleNum;
    this._pointNum = pointNum;
    this._pointReso = pointReso;
  }
  getOneSampleOvertone(index) {
    const pi = 3.141592653589793;
    let work = 0;
    for (let o = 0; o < this._pointNum; o++) {
      const sss = 2 * pi * this._pPoint[o].x * index / this._sampleNum;
      work += Math.sin(sss) * this._pPoint[o].y / this._pPoint[o].x / 128;
    }
    return work * this._volume / 128;
  }
  getOneSampleCoodinate(index) {
    const p = this._pPoint;
    let i = Math.trunc(this._pointReso * index / this._sampleNum);
    let c = 0;
    while (c < this._pointNum) {
      if (p[c].x > i) break;
      c++;
    }
    let x1;
    let y1;
    let x2;
    let y2;
    if (c === this._pointNum) {
      x1 = p[c - 1].x;
      y1 = p[c - 1].y;
      x2 = this._pointReso;
      y2 = p[0].y;
    } else if (c) {
      x1 = p[c - 1].x;
      y1 = p[c - 1].y;
      x2 = p[c].x;
      y2 = p[c].y;
    } else {
      x1 = p[0].x;
      y1 = p[0].y;
      x2 = p[0].x;
      y2 = p[0].y;
    }
    const w = x2 - x1;
    i = i - x1;
    const h = y2 - y1;
    const work = i !== 0 ? y1 + h * i / w : y1;
    return work * this._volume / 128 / 128;
  }
};
var _CHUNK_HEADER = 16;
var Pcm = class _Pcm {
  _pSmp = null;
  _ch = 0;
  _sps = 0;
  _bps = 0;
  _smpHead = 0;
  _smpBody = 0;
  _smpTail = 0;
  release() {
    this._pSmp = null;
    this._ch = 0;
    this._sps = 0;
    this._bps = 0;
    this._smpHead = 0;
    this._smpBody = 0;
    this._smpTail = 0;
  }
  devolveSamplingBuffer() {
    const p = this._pSmp;
    this._pSmp = null;
    return p;
  }
  create(ch, sps, bps, sampleNum) {
    this.release();
    if (bps !== 8 && bps !== 16) return 19;
    this._ch = ch;
    this._sps = sps;
    this._bps = bps;
    this._smpHead = 0;
    this._smpBody = sampleNum;
    this._smpTail = 0;
    const size = this._smpBody * this._bps * this._ch / 8;
    this._pSmp = new Uint8Array(size);
    if (bps === 8) this._pSmp.fill(128);
    return 0;
  }
  read(io) {
    this._pSmp = null;
    const head = ioGetBytes(io, _CHUNK_HEADER);
    if (head === null) return 7;
    const isRIFF = head[0] === 82 && head[1] === 73 && head[2] === 70 && head[3] === 70;
    const isWAVE = head[8] === 87 && head[9] === 65 && head[10] === 86 && head[11] === 69;
    const isFMTSpace = head[12] === 102 && head[13] === 109 && head[14] === 116 && head[15] === 32;
    if (!isRIFF || !isWAVE || !isFMTSpace) return 19;
    ioGetUint32LE(io);
    const formatID = ioGetU16LE(io);
    const ch = ioGetU16LE(io);
    const sps = ioGetUint32LE(io);
    ioGetUint32LE(io);
    ioGetU16LE(io);
    const bps = ioGetU16LE(io);
    const fmtTail = ioGetU16LE(io);
    if (formatID === null || ch === null || sps === null || bps === null || fmtTail === null)
      return 7;
    if (formatID !== 1) return 19;
    if (ch !== 1 && ch !== 2) return 19;
    if (bps !== 8 && bps !== 16) return 19;
    if (!io.seek(SEEK_SET, 12)) return 7;
    const tag = new Uint8Array(4);
    let dataSize = 0;
    for (; ; ) {
      if (!io.read(tag, 1, 4)) return 7;
      const size = ioGetUint32LE(io);
      if (size === null) return 7;
      if (tag[0] === 100 && tag[1] === 97 && tag[2] === 116 && tag[3] === 97) {
        dataSize = size;
        break;
      }
      if (!io.seek(SEEK_CUR, size)) return 7;
    }
    const res = this.create(ch, sps, bps, Math.trunc(dataSize * 8 / bps / ch));
    if (res !== 0) return res;
    const samples = ioGetBytes(io, dataSize);
    if (samples === null) {
      this._pSmp = null;
      return 7;
    }
    this._pSmp = samples;
    return 0;
  }
  write(io, pstrLIST) {
    if (!this._pSmp) return false;
    const sampleSize = (this._smpHead + this._smpBody + this._smpTail) * this._ch * this._bps / 8;
    const bText = !!pstrLIST && pstrLIST.length > 0;
    let isftSize = 0;
    let listSize = 0;
    let riffSize = sampleSize + 4 + 26 + 12 + 8;
    if (bText) {
      isftSize = pstrLIST.length;
      listSize = 4 + 4 + 4 + isftSize;
      riffSize += 8 + listSize;
    }
    putTag(io, "RIFF");
    ioPutUint32LE(io, riffSize);
    putTag(io, "WAVE");
    putTag(io, "fmt ");
    ioPutUint32LE(io, 18);
    ioPutU16LE(io, 1);
    ioPutU16LE(io, this._ch);
    ioPutUint32LE(io, this._sps);
    ioPutUint32LE(io, this._sps * this._bps * this._ch / 8);
    ioPutU16LE(io, this._bps * this._ch / 8);
    ioPutU16LE(io, this._bps);
    ioPutU16LE(io, 0);
    if (bText) {
      putTag(io, "LIST");
      ioPutUint32LE(io, listSize);
      putTag(io, "INFO");
      putTag(io, "ISFT");
      ioPutUint32LE(io, isftSize);
      writeAscii(io, pstrLIST);
    }
    putTag(io, "fact");
    ioPutUint32LE(io, 4);
    ioPutUint32LE(io, this._smpHead + this._smpBody + this._smpTail);
    putTag(io, "data");
    ioPutUint32LE(io, sampleSize);
    io.write(this._pSmp, 1, sampleSize);
    return true;
  }
  convertChannelNum(newCh) {
    if (!this._pSmp) return false;
    if (this._ch === newCh) return true;
    const sampleSize = (this._smpHead + this._smpBody + this._smpTail) * this._ch * this._bps / 8;
    const src = this._pSmp;
    let work;
    if (newCh === 2) {
      work = new Uint8Array(sampleSize * 2);
      if (this._bps === 8) {
        for (let a = 0, b = 0; a < sampleSize; a++, b += 2) {
          work[b] = src[a];
          work[b + 1] = src[a];
        }
      } else {
        for (let a = 0, b = 0; a < sampleSize; a += 2, b += 4) {
          work[b] = src[a];
          work[b + 1] = src[a + 1];
          work[b + 2] = src[a];
          work[b + 3] = src[a + 1];
        }
      }
    } else {
      work = new Uint8Array(sampleSize / 2);
      if (this._bps === 8) {
        for (let a = 0, b = 0; a < sampleSize; a += 2, b++) {
          work[b] = src[a] + src[a + 1] >> 1;
        }
      } else {
        for (let a = 0, b = 0; a < sampleSize; a += 4, b += 2) {
          const temp1 = (src[a] | src[a + 1] << 8) << 16 >> 16;
          const temp2 = (src[a + 2] | src[a + 3] << 8) << 16 >> 16;
          putI16(work, b, (temp1 + temp2) / 2 | 0);
        }
      }
    }
    this._pSmp = work;
    this._ch = newCh;
    return true;
  }
  convertBitPerSample(newBps) {
    if (!this._pSmp) return false;
    if (this._bps === newBps) return true;
    const sampleSize = (this._smpHead + this._smpBody + this._smpTail) * this._ch * this._bps / 8;
    const src = this._pSmp;
    let work;
    if (newBps === 8) {
      work = new Uint8Array(sampleSize / 2);
      for (let a = 0, b = 0; a < sampleSize; a += 2, b++) {
        let temp1 = (src[a] | src[a + 1] << 8) << 16 >> 16;
        temp1 = temp1 / 256 + 128;
        work[b] = temp1 & 255;
      }
    } else if (newBps === 16) {
      work = new Uint8Array(sampleSize * 2);
      for (let a = 0, b = 0; a < sampleSize; a++, b += 2) {
        const temp1 = (src[a] - 128) * 256 << 16 >> 16;
        putI16(work, b, temp1);
      }
    } else {
      return false;
    }
    this._pSmp = work;
    this._bps = newBps;
    return true;
  }
  convertSamplePerSecond(newSps) {
    if (!this._pSmp) return false;
    if (this._sps === newSps) return true;
    const src = this._pSmp;
    let head = this.sampleByteSizeFrom(this._smpHead);
    let body = this.sampleByteSizeFrom(this._smpBody);
    let tail = this.sampleByteSizeFrom(this._smpTail);
    head = Math.trunc((head * newSps + this._sps - 1) / this._sps);
    body = Math.trunc((body * newSps + this._sps - 1) / this._sps);
    tail = Math.trunc((tail * newSps + this._sps - 1) / this._sps);
    const workSize = head + body + tail;
    let per;
    if (this._ch === 2 && this._bps === 16) {
      this._smpHead = head / 4;
      this._smpBody = body / 4;
      this._smpTail = tail / 4;
      const sampleNum = Math.trunc(workSize / 4);
      const size = sampleNum * 4;
      const work = new Uint8Array(size);
      const srcU32 = u32View(src);
      const workU32 = u32View(work);
      for (let a = 0; a < sampleNum; a++) {
        const b = Math.trunc(a * this._sps / newSps);
        workU32[a] = srcU32[b];
      }
      this._pSmp = work;
    } else if (this._ch === 1 && this._bps === 8) {
      this._smpHead = head;
      this._smpBody = body;
      this._smpTail = tail;
      const sampleNum = workSize;
      const work = new Uint8Array(sampleNum);
      for (let a = 0; a < sampleNum; a++) {
        work[a] = src[Math.trunc(a * this._sps / newSps)];
      }
      this._pSmp = work;
    } else {
      this._smpHead = head / 2;
      this._smpBody = body / 2;
      this._smpTail = tail / 2;
      const sampleNum = Math.trunc(workSize / 2);
      const size = sampleNum * 2;
      const work = new Uint8Array(size);
      const srcU16 = u16View(src);
      const workU16 = u16View(work);
      for (let a = 0; a < sampleNum; a++) {
        const b = Math.trunc(a * this._sps / newSps);
        workU16[a] = srcU16[b];
      }
      this._pSmp = work;
    }
    this._sps = newSps;
    return true;
  }
  convert(newCh, newSps, newBps) {
    if (!this.convertChannelNum(newCh)) return false;
    if (!this.convertBitPerSample(newBps)) return false;
    if (!this.convertSamplePerSecond(newSps)) return false;
    return true;
  }
  convertVolume(v) {
    if (!this._pSmp) return false;
    const sampleNum = (this._smpHead + this._smpBody + this._smpTail) * this._ch;
    const p = this._pSmp;
    if (this._bps === 8) {
      for (let i = 0; i < sampleNum; i++) {
        p[i] = (p[i] - 128) * v + 128 & 255;
      }
    } else if (this._bps === 16) {
      const p16 = i16View(p);
      for (let i = 0; i < sampleNum; i++) {
        p16[i] = p16[i] * v | 0;
      }
    } else {
      return false;
    }
    return true;
  }
  copyFrom(src) {
    if (!src._pSmp) {
      this.release();
      return true;
    }
    this.create(src._ch, src._sps, src._bps, src._smpBody);
    if (!this._pSmp) return false;
    this._pSmp.set(
      src._pSmp.subarray(
        0,
        (src._smpHead + src._smpBody + src._smpTail) * src._ch * src._bps / 8
      )
    );
    return true;
  }
  copyAt(start, end) {
    const dst = new _Pcm();
    if (this._smpHead || this._smpTail) return null;
    if (!this._pSmp) {
      dst.release();
      return dst;
    }
    const size = (end - start) * this._ch * this._bps / 8;
    const offset = start * this._ch * this._bps / 8;
    if (dst.create(this._ch, this._sps, this._bps, end - start) !== 0) return null;
    dst._pSmp.set(this._pSmp.subarray(offset, offset + size));
    return dst;
  }
  sampleByteSizeFrom(n) {
    return n * this._ch * this._bps / 8;
  }
  get ch() {
    return this._ch;
  }
  get bps() {
    return this._bps;
  }
  get sps() {
    return this._sps;
  }
  get smpBody() {
    return this._smpBody;
  }
  get smpHead() {
    return this._smpHead;
  }
  get smpTail() {
    return this._smpTail;
  }
  get pBuf() {
    return this._pSmp;
  }
  get sec() {
    return (this._smpBody + this._smpHead + this._smpTail) / this._sps;
  }
  get bufSize() {
    return (this._smpHead + this._smpBody + this._smpTail) * this._ch * this._bps / 8;
  }
};
function putTag(io, s) {
  const tag = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) tag[i] = s.charCodeAt(i);
  io.write(tag, 1, s.length);
}
function writeAscii(io, s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
  io.write(b, 1, s.length);
}
function putI16(dst, off, v) {
  dst[off] = v & 255;
  dst[off + 1] = v >> 8 & 255;
}
function u16View(b) {
  return new Uint16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
}
function i16View(b) {
  return new Int16Array(b.buffer, b.byteOffset, b.byteLength >> 1);
}
function u32View(b) {
  return new Uint32Array(b.buffer, b.byteOffset, b.byteLength >> 2);
}
var NOISEDESIGNLIMIT_SMPNUM = 48e3 * 10;
var NOISEDESIGNLIMIT_ENVE_X = 1e3 * 10;
var NOISEDESIGNLIMIT_ENVE_Y = 100;
var NOISEDESIGNLIMIT_OSC_FREQUENCY = 44100;
var NOISEDESIGNLIMIT_OSC_VOLUME = 200;
var NOISEDESIGNLIMIT_OSC_OFFSET = 100;
var MAX_NOISEEDITUNITNUM = 4;
var MAX_NOISEEDITENVELOPENUM = 3;
var NOISEEDITFLAG_ENVELOPE = 4;
var NOISEEDITFLAG_PAN = 8;
var NOISEEDITFLAG_OSC_MAIN = 16;
var NOISEEDITFLAG_OSC_FREQ = 32;
var NOISEEDITFLAG_OSC_VOLU = 64;
var NOISEEDITFLAG_UNCOVERED = 4294967171;
var NOISE_FILEID = "PTNOISE-";
var NOISE_VERSION = 20120418;
function fixOscillator(osc) {
  if (osc.type >= 17) osc.type = 0;
  if (osc.freq > NOISEDESIGNLIMIT_OSC_FREQUENCY) osc.freq = NOISEDESIGNLIMIT_OSC_FREQUENCY;
  if (osc.freq <= 0) osc.freq = 0;
  if (osc.volume > NOISEDESIGNLIMIT_OSC_VOLUME) osc.volume = NOISEDESIGNLIMIT_OSC_VOLUME;
  if (osc.volume <= 0) osc.volume = 0;
  if (osc.offset > NOISEDESIGNLIMIT_OSC_OFFSET) osc.offset = NOISEDESIGNLIMIT_OSC_OFFSET;
  if (osc.offset <= 0) osc.offset = 0;
}
var Noise = class {
  _smpNum44k = 0;
  _unitNum = 0;
  _units = [];
  setSmpNum44k(num) {
    this._smpNum44k = num;
  }
  get unitNum() {
    return this._unitNum;
  }
  get smpNum44k() {
    return this._smpNum44k;
  }
  get sec() {
    return this._smpNum44k / 44100;
  }
  getUnit(u) {
    if (u < 0 || u >= this._unitNum) return null;
    return this._units[u];
  }
  fix() {
    if (this._smpNum44k > NOISEDESIGNLIMIT_SMPNUM) this._smpNum44k = NOISEDESIGNLIMIT_SMPNUM;
    for (let i = 0; i < this._unitNum; i++) {
      const unit = this._units[i];
      if (unit.bEnable) {
        for (let e = 0; e < unit.enveNum; e++) {
          const pnt = unit.enves[e];
          if (pnt.x > NOISEDESIGNLIMIT_ENVE_X) pnt.x = NOISEDESIGNLIMIT_ENVE_X;
          if (pnt.x < 0) pnt.x = 0;
          if (pnt.y > NOISEDESIGNLIMIT_ENVE_Y) pnt.y = NOISEDESIGNLIMIT_ENVE_Y;
          if (pnt.y < 0) pnt.y = 0;
        }
        if (unit.pan < -100) unit.pan = -100;
        if (unit.pan > 100) unit.pan = 100;
        fixOscillator(unit.main);
        fixOscillator(unit.freq);
        fixOscillator(unit.volu);
      }
    }
  }
  writeOscillator(osc, io, add) {
    const vals = [
      osc.type,
      osc.bRev ? 1 : 0,
      Math.trunc(osc.freq * 10),
      Math.trunc(osc.volume * 10),
      Math.trunc(osc.offset * 10)
    ];
    for (const v of vals) {
      if (!dataWriteV(io, v)) return null;
      add += dataCheckVSize(v);
    }
    return add;
  }
  readOscillator(osc, io) {
    const t = dataReadV(io);
    if (t === null) return 7;
    osc.type = t;
    if (osc.type >= 17) return 10;
    const b = dataReadV(io);
    if (b === null) return 7;
    osc.bRev = b !== 0;
    const f = dataReadV(io);
    if (f === null) return 7;
    osc.freq = f / 10;
    const v = dataReadV(io);
    if (v === null) return 7;
    osc.volume = v / 10;
    const o = dataReadV(io);
    if (o === null) return 7;
    osc.offset = o / 10;
    return 0;
  }
  makeFlags(unit) {
    let flags = NOISEEDITFLAG_ENVELOPE;
    if (unit.pan) flags |= NOISEEDITFLAG_PAN;
    if (unit.main.type !== 0) flags |= NOISEEDITFLAG_OSC_MAIN;
    if (unit.freq.type !== 0) flags |= NOISEEDITFLAG_OSC_FREQ;
    if (unit.volu.type !== 0) flags |= NOISEEDITFLAG_OSC_VOLU;
    return flags;
  }
  write(io, pAdd) {
    let seek = pAdd ?? io.position;
    if (!writeAscii2(io, NOISE_FILEID)) return false;
    ioPutUint32LE(io, NOISE_VERSION);
    seek += 12;
    if (!dataWriteV(io, this._smpNum44k)) return false;
    seek += dataCheckVSize(this._smpNum44k);
    ioPutU8(io, 0);
    const numSeek = seek;
    seek += 1;
    let unitNum = 0;
    for (let u = 0; u < this._unitNum; u++) {
      const unit = this._units[u];
      if (!unit.bEnable) continue;
      const flags = this.makeFlags(unit);
      if (!dataWriteV(io, flags)) return false;
      seek += dataCheckVSize(flags);
      if (flags & NOISEEDITFLAG_ENVELOPE) {
        if (!dataWriteV(io, unit.enveNum)) return false;
        seek += dataCheckVSize(unit.enveNum);
        for (let e = 0; e < unit.enveNum; e++) {
          const pnt = unit.enves[e];
          if (!dataWriteV(io, pnt.x)) return false;
          seek += dataCheckVSize(pnt.x);
          if (!dataWriteV(io, pnt.y)) return false;
          seek += dataCheckVSize(pnt.y);
        }
      }
      if (flags & NOISEEDITFLAG_PAN) {
        ioPutU8(io, unit.pan & 255);
        seek += 1;
      }
      if (flags & NOISEEDITFLAG_OSC_MAIN) {
        const s = this.writeOscillator(unit.main, io, seek);
        if (s === null) return false;
        seek = s;
      }
      if (flags & NOISEEDITFLAG_OSC_FREQ) {
        const s = this.writeOscillator(unit.freq, io, seek);
        if (s === null) return false;
        seek = s;
      }
      if (flags & NOISEEDITFLAG_OSC_VOLU) {
        const s = this.writeOscillator(unit.volu, io, seek);
        if (s === null) return false;
        seek = s;
      }
      unitNum++;
    }
    if (!io.seek(SEEK_CUR, numSeek - seek)) return false;
    ioPutU8(io, unitNum);
    if (!io.seek(SEEK_CUR, seek - numSeek - 1)) return false;
    return true;
  }
  read(io) {
    this.release();
    const code = readAsciiExact(io, 8);
    if (code === null) return 7;
    if (code !== NOISE_FILEID) return 11;
    const ver = ioGetUint32LE(io);
    if (ver === null) return 7;
    if (ver > NOISE_VERSION) return 9;
    const smp = dataReadV(io);
    if (smp === null) return 7;
    this._smpNum44k = smp;
    const unitNumByte = ioGetInt8(io);
    if (unitNumByte === null) return 7;
    if (unitNumByte < 0) return 12;
    if (unitNumByte > MAX_NOISEEDITUNITNUM) return 10;
    this._unitNum = unitNumByte;
    this._units = [];
    for (let u = 0; u < this._unitNum; u++) this._units.push(newUnit());
    for (let u = 0; u < this._unitNum; u++) {
      const unit = this._units[u];
      unit.bEnable = true;
      const flags = dataReadV(io);
      if (flags === null) return 7;
      if (flags & NOISEEDITFLAG_UNCOVERED) return 10;
      if (flags & NOISEEDITFLAG_ENVELOPE) {
        const en = dataReadV(io);
        if (en === null) return 7;
        unit.enveNum = en;
        if (unit.enveNum > MAX_NOISEEDITENVELOPENUM) return 10;
        unit.enves = [];
        for (let e = 0; e < unit.enveNum; e++) {
          const x = dataReadV(io);
          if (x === null) return 7;
          const y = dataReadV(io);
          if (y === null) return 7;
          unit.enves.push({ x, y });
        }
      }
      if (flags & NOISEEDITFLAG_PAN) {
        const b = ioGetInt8(io);
        if (b === null) return 7;
        unit.pan = b;
      }
      if (flags & NOISEEDITFLAG_OSC_MAIN) {
        const r = this.readOscillator(unit.main, io);
        if (r !== 0) return r;
      }
      if (flags & NOISEEDITFLAG_OSC_FREQ) {
        const r = this.readOscillator(unit.freq, io);
        if (r !== 0) return r;
      }
      if (flags & NOISEEDITFLAG_OSC_VOLU) {
        const r = this.readOscillator(unit.volu, io);
        if (r !== 0) return r;
      }
    }
    return 0;
  }
  release() {
    this._units = [];
    this._unitNum = 0;
  }
  allocate(unitNum, envelopeNum) {
    this.release();
    this._unitNum = unitNum;
    this._units = [];
    for (let u = 0; u < unitNum; u++) {
      const unit = newUnit();
      unit.enveNum = envelopeNum;
      for (let e = 0; e < envelopeNum; e++) unit.enves.push({ x: 0, y: 0 });
      this._units.push(unit);
    }
    return true;
  }
  copyFrom(src) {
    this.release();
    this._smpNum44k = src._smpNum44k;
    if (src._unitNum) {
      const enveNum = src._units[0].enveNum;
      if (!this.allocate(src._unitNum, enveNum)) return false;
      for (let u = 0; u < src._unitNum; u++) {
        const dst = this._units[u];
        const s = src._units[u];
        dst.bEnable = s.bEnable;
        dst.enveNum = s.enveNum;
        dst.freq = { ...s.freq };
        dst.main = { ...s.main };
        dst.pan = s.pan;
        dst.volu = { ...s.volu };
        dst.enves = s.enves.slice();
      }
    }
    return true;
  }
  compare(src) {
    if (!src) return -1;
    if (src._smpNum44k !== this._smpNum44k) return 1;
    if (src._unitNum !== this._unitNum) return 1;
    for (let u = 0; u < this._unitNum; u++) {
      const su = src._units[u];
      const tu = this._units[u];
      if (su.bEnable !== tu.bEnable) return 1;
      if (su.enveNum !== tu.enveNum) return 1;
      if (su.pan !== tu.pan) return 1;
      if (compareOsci(su.main, tu.main)) return 1;
      if (compareOsci(su.freq, tu.freq)) return 1;
      if (compareOsci(su.volu, tu.volu)) return 1;
      for (let e = 0; e < this._units[u].enveNum; e++) {
        if (tu.enves[e].x !== tu.enves[e].x) return 1;
        if (tu.enves[e].y !== tu.enves[e].y) return 1;
      }
    }
    return 0;
  }
};
function newUnit() {
  return {
    bEnable: false,
    enveNum: 0,
    enves: [],
    pan: 0,
    main: { type: 0, freq: 0, volume: 0, offset: 0, bRev: false },
    freq: { type: 0, freq: 0, volume: 0, offset: 0, bRev: false },
    volu: { type: 0, freq: 0, volume: 0, offset: 0, bRev: false }
  };
}
function compareOsci(a, b) {
  if (a.type !== b.type) return 1;
  if (a.freq !== b.freq) return 1;
  if (a.volume !== b.volume) return 1;
  if (a.offset !== b.offset) return 1;
  if (a.bRev !== b.bRev) return 1;
  return 0;
}
function writeAscii2(io, s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return io.write(b, 1, s.length);
}
function readAsciiExact(io, n) {
  if (io.remain < n) return null;
  const b = new Uint8Array(n);
  if (!io.read(b, 1, n)) return null;
  let s = "";
  for (const c of b) s += String.fromCharCode(c);
  return s;
}
var _BASIC_SPS = 44100;
var _BASIC_FREQUENCY = 100;
var _SAMPLING_TOP = 32767;
var _KEY_TOP = 12800;
var _smp_num_rand = 44100;
var _smp_num = Math.trunc(_BASIC_SPS / _BASIC_FREQUENCY);
function newOsc() {
  return {
    incriment: 0,
    offset: 0,
    volume: 0,
    pSmp: null,
    bReverse: false,
    ranType: 0,
    rdmStart: 0,
    rdmMargin: 0,
    rdmIndex: 0
  };
}
function getInt(v) {
  return v >= 0 ? Math.floor(v) : Math.ceil(v);
}
function setOscillator(to, from, sps, tbl, tblRand) {
  if (from.type === 4) to.ranType = 1;
  else if (from.type === 8) to.ranType = 2;
  else to.ranType = 0;
  to.incriment = _BASIC_SPS / sps * (from.freq / _BASIC_FREQUENCY);
  if (to.ranType !== 0) to.offset = 0;
  else to.offset = _smp_num * (from.offset / 100);
  to.volume = from.volume / 100;
  to.pSmp = tbl;
  to.bReverse = from.bRev;
  to.rdmStart = 0;
  to.rdmIndex = Math.trunc(_smp_num_rand * (from.offset / 100));
  to.rdmMargin = tblRand[to.rdmIndex];
}
function fillStairs(tbl, smpNum, nums, vals) {
  const den = nums[nums.length - 1];
  let s = 0;
  for (let i = 0; i < nums.length; i++) {
    const a = Math.trunc(smpNum * nums[i] / den);
    const v = vals[i];
    for (; s < a; s++) tbl[s] = v;
  }
}
var NoiseBuilder = class {
  _bInit = false;
  _freq = null;
  _tables = [];
  _randBuf = [0, 0];
  _randomReset() {
    this._randBuf[0] = 17476;
    this._randBuf[1] = 34952;
  }
  _randomGet() {
    const w1 = (this._randBuf[0] << 16 >> 16) + this._randBuf[1];
    const s = w1 & 65535;
    const w2 = (s & 255) << 8 | s >> 8 & 255;
    this._randBuf[1] = this._randBuf[0];
    this._randBuf[0] = w2 << 16 >> 16;
    return this._randBuf[0];
  }
  init() {
    if (this._bInit) return true;
    const freq = new Frequency();
    freq.init();
    this._freq = freq;
    const tbls = [];
    for (let s = 0; s < 17; s++) tbls.push(null);
    const alloc = (t, n) => tbls[t] = new Int16Array(n);
    alloc(0, _smp_num);
    alloc(1, _smp_num);
    alloc(2, _smp_num);
    alloc(3, _smp_num);
    alloc(4, _smp_num_rand);
    alloc(5, _smp_num);
    alloc(6, _smp_num);
    alloc(7, _smp_num);
    alloc(9, _smp_num);
    alloc(10, _smp_num);
    alloc(11, _smp_num);
    alloc(12, _smp_num);
    alloc(13, _smp_num);
    alloc(14, _smp_num);
    alloc(15, _smp_num);
    alloc(16, _smp_num);
    const osci = new Oscillator();
    osci.readyGetSample([{ x: 1, y: 128 }], 1, 128, _smp_num, 0);
    {
      const p = tbls[
        1
        /* Sine */
      ];
      for (let s = 0; s < _smp_num; s++) {
        let work = osci.getOneSampleOvertone(s);
        if (work > 1) work = 1;
        if (work < -1) work = -1;
        p[s] = Math.trunc(work * _SAMPLING_TOP);
      }
    }
    {
      const p = tbls[
        2
        /* Saw */
      ];
      const work = _SAMPLING_TOP + _SAMPLING_TOP;
      for (let s = 0; s < _smp_num; s++) {
        p[s] = Math.trunc(_SAMPLING_TOP - work * s / _smp_num);
      }
    }
    {
      const p = tbls[
        3
        /* Rect */
      ];
      let s = 0;
      for (; s < _smp_num / 2; s++) p[s] = _SAMPLING_TOP;
      for (; s < _smp_num; s++) p[s] = -_SAMPLING_TOP;
    }
    {
      const p = tbls[
        4
        /* Random */
      ];
      this._randomReset();
      for (let s = 0; s < _smp_num_rand; s++) p[s] = this._randomGet();
    }
    {
      const overtones = [];
      for (let i = 1; i <= 16; i++) overtones.push({ x: i, y: 128 });
      osci.readyGetSample(overtones, 16, 128, _smp_num, 0);
      const p = tbls[
        5
        /* Saw2 */
      ];
      for (let s = 0; s < _smp_num; s++) {
        let work = osci.getOneSampleOvertone(s);
        if (work > 1) work = 1;
        if (work < -1) work = -1;
        p[s] = Math.trunc(work * _SAMPLING_TOP);
      }
    }
    {
      const overtones = [];
      for (let i = 1; i <= 15; i += 2) overtones.push({ x: i, y: 128 });
      osci.readyGetSample(overtones, 8, 128, _smp_num, 0);
      const p = tbls[
        6
        /* Rect2 */
      ];
      for (let s = 0; s < _smp_num; s++) {
        let work = osci.getOneSampleOvertone(s);
        if (work > 1) work = 1;
        if (work < -1) work = -1;
        p[s] = Math.trunc(work * _SAMPLING_TOP);
      }
    }
    {
      const coodi = [
        { x: 0, y: 0 },
        { x: _smp_num / 4, y: 128 },
        { x: _smp_num * 3 / 4, y: -128 },
        { x: _smp_num, y: 0 }
      ];
      osci.readyGetSample(coodi, 4, 128, _smp_num, _smp_num);
      const p = tbls[
        7
        /* Tri */
      ];
      for (let s = 0; s < _smp_num; s++) {
        let work = osci.getOneSampleCoodinate(s);
        if (work > 1) work = 1;
        if (work < -1) work = -1;
        p[s] = Math.trunc(work * _SAMPLING_TOP);
      }
    }
    for (const n of [3, 4, 8, 16]) {
      const wave = n === 3 ? 9 : n === 4 ? 10 : n === 8 ? 11 : 12;
      const p = tbls[wave];
      let s = 0;
      for (; s < _smp_num / n; s++) p[s] = _SAMPLING_TOP;
      for (; s < _smp_num; s++) p[s] = -_SAMPLING_TOP;
    }
    fillStairs(tbls[
      13
      /* Saw3 */
    ], _smp_num, [1, 2, 3], [_SAMPLING_TOP, 0, -_SAMPLING_TOP]);
    fillStairs(tbls[
      14
      /* Saw4 */
    ], _smp_num, [1, 2, 3, 4], [
      _SAMPLING_TOP,
      _SAMPLING_TOP / 3,
      -_SAMPLING_TOP / 3,
      -_SAMPLING_TOP
    ]);
    fillStairs(tbls[
      15
      /* Saw6 */
    ], _smp_num, [1, 2, 3, 4, 5, 6], [
      _SAMPLING_TOP,
      _SAMPLING_TOP - _SAMPLING_TOP * 2 / 5,
      _SAMPLING_TOP / 5,
      -_SAMPLING_TOP / 5,
      -_SAMPLING_TOP + _SAMPLING_TOP * 2 / 5,
      -_SAMPLING_TOP
    ]);
    fillStairs(tbls[
      16
      /* Saw8 */
    ], _smp_num, [1, 2, 3, 4, 5, 6, 7, 8], [
      _SAMPLING_TOP,
      _SAMPLING_TOP - _SAMPLING_TOP * 2 / 7,
      _SAMPLING_TOP - _SAMPLING_TOP * 4 / 7,
      _SAMPLING_TOP / 7,
      -_SAMPLING_TOP / 7,
      -_SAMPLING_TOP + _SAMPLING_TOP * 4 / 7,
      -_SAMPLING_TOP + _SAMPLING_TOP * 2 / 7,
      -_SAMPLING_TOP
    ]);
    this._tables = tbls;
    this._bInit = true;
    return true;
  }
  buildNoise(pNoise, ch, sps, bps) {
    if (!this._bInit) return null;
    pNoise.fix();
    const unitNum = pNoise.unitNum;
    const units = [];
    for (let u = 0; u < unitNum; u++) {
      const du = pNoise.getUnit(u);
      const pU = {
        bEnable: du.bEnable,
        pan: [1, 1],
        enveIndex: 0,
        enveMagStart: 0,
        enveMagMargin: 0,
        enveCount: 0,
        enveNum: du.enveNum,
        enves: [],
        main: newOsc(),
        freq: newOsc(),
        volu: newOsc()
      };
      if (du.pan === 0) {
        pU.pan[0] = 1;
        pU.pan[1] = 1;
      } else if (du.pan < 0) {
        pU.pan[0] = 1;
        pU.pan[1] = (100 + du.pan) / 100;
      } else {
        pU.pan[1] = 1;
        pU.pan[0] = (100 - du.pan) / 100;
      }
      for (let e = 0; e < du.enveNum; e++) {
        pU.enves.push({
          smp: Math.trunc(sps * du.enves[e].x / 1e3),
          mag: du.enves[e].y / 100
        });
      }
      while (pU.enveIndex < pU.enveNum) {
        pU.enveMagMargin = pU.enves[pU.enveIndex].mag - pU.enveMagStart;
        if (pU.enves[pU.enveIndex].smp) break;
        pU.enveMagStart = pU.enves[pU.enveIndex].mag;
        pU.enveIndex++;
      }
      setOscillator(pU.main, du.main, sps, this._tables[du.main.type], this._tables[
        4
        /* Random */
      ]);
      setOscillator(pU.freq, du.freq, sps, this._tables[du.freq.type], this._tables[
        4
        /* Random */
      ]);
      setOscillator(pU.volu, du.volu, sps, this._tables[du.volu.type], this._tables[
        4
        /* Random */
      ]);
      units.push(pU);
    }
    const smpNum = Math.trunc(pNoise.smpNum44k / (44100 / sps));
    const pcm = new Pcm();
    if (pcm.create(ch, sps, bps, smpNum) !== 0) return null;
    const p = pcm.pBuf;
    const p16 = bps === 16 ? new Int16Array(p.buffer, p.byteOffset, p.byteLength >> 1) : null;
    let pos = 0;
    for (let s = 0; s < smpNum; s++) {
      for (let c = 0; c < ch; c++) {
        let store = 0;
        for (let u = 0; u < unitNum; u++) {
          const pU = units[u];
          if (!pU.bEnable) continue;
          let po;
          let work;
          po = pU.main;
          if (po.ranType === 0) {
            const offset = getInt(po.offset);
            work = offset >= 0 ? po.pSmp[offset] : 0;
          } else if (po.ranType === 1) {
            work = po.offset >= 0 ? po.rdmStart + po.rdmMargin * getInt(po.offset) / _smp_num : 0;
          } else {
            work = po.offset >= 0 ? po.rdmStart : 0;
          }
          if (po.bReverse) work *= -1;
          work *= po.volume;
          let vol;
          po = pU.volu;
          if (po.ranType === 0) {
            const offset = getInt(po.offset);
            vol = po.pSmp[offset];
          } else if (po.ranType === 1) {
            vol = po.rdmStart + po.rdmMargin * getInt(po.offset) / _smp_num;
          } else {
            vol = po.rdmStart;
          }
          if (po.bReverse) vol *= -1;
          vol *= po.volume;
          work = work * (vol + _SAMPLING_TOP) / (_SAMPLING_TOP * 2);
          work = work * pU.pan[c];
          if (pU.enveIndex < pU.enveNum)
            work *= pU.enveMagStart + pU.enveMagMargin * pU.enveCount / pU.enves[pU.enveIndex].smp;
          else work *= pU.enveMagStart;
          store += work;
        }
        let byte4 = Math.trunc(store);
        if (byte4 > _SAMPLING_TOP) byte4 = _SAMPLING_TOP;
        if (byte4 < -_SAMPLING_TOP) byte4 = -_SAMPLING_TOP;
        if (bps === 8) {
          p[pos] = (byte4 >> 8) + 128;
          pos += 1;
        } else {
          p16[s * ch + c] = byte4;
        }
      }
      for (let u = 0; u < unitNum; u++) {
        const pU = units[u];
        if (!pU.bEnable) continue;
        let po = pU.freq;
        let fre;
        if (po.ranType === 0) {
          const offset = getInt(po.offset);
          fre = _KEY_TOP * po.pSmp[offset] / _SAMPLING_TOP;
        } else if (po.ranType === 1) {
          fre = po.rdmStart + po.rdmMargin * getInt(po.offset) / _smp_num;
        } else {
          fre = po.rdmStart;
        }
        if (po.bReverse) fre *= -1;
        fre *= po.volume;
        this._incriment(pU.main, pU.main.incriment * this._freq.get(getInt(fre)), this._tables[
          4
          /* Random */
        ]);
        this._incriment(pU.freq, pU.freq.incriment, this._tables[
          4
          /* Random */
        ]);
        this._incriment(pU.volu, pU.volu.incriment, this._tables[
          4
          /* Random */
        ]);
        if (pU.enveIndex < pU.enveNum) {
          pU.enveCount++;
          if (pU.enveCount >= pU.enves[pU.enveIndex].smp) {
            pU.enveCount = 0;
            pU.enveMagStart = pU.enves[pU.enveIndex].mag;
            pU.enveMagMargin = 0;
            pU.enveIndex++;
            while (pU.enveIndex < pU.enveNum) {
              pU.enveMagMargin = pU.enves[pU.enveIndex].mag - pU.enveMagStart;
              if (pU.enves[pU.enveIndex].smp) break;
              pU.enveMagStart = pU.enves[pU.enveIndex].mag;
              pU.enveIndex++;
            }
          }
        }
      }
    }
    void pos;
    return pcm;
  }
  _incriment(osc, incr, randTable) {
    osc.offset += incr;
    if (osc.offset > _smp_num) {
      osc.offset -= _smp_num;
      if (osc.offset >= _smp_num) osc.offset = 0;
      if (osc.ranType !== 0) {
        osc.rdmStart = randTable[osc.rdmIndex];
        osc.rdmIndex++;
        if (osc.rdmIndex >= _smp_num_rand) osc.rdmIndex = 0;
        osc.rdmMargin = randTable[osc.rdmIndex] - osc.rdmStart;
      }
    }
  }
};
var PTV_VOICEFLAG_WAVELOOP = 1;
var PTV_VOICEFLAG_SMOOTH = 2;
var PTV_VOICEFLAG_BEATFIT = 4;
var PTV_VOICEFLAG_UNCOVERED = 4294967288;
var PTV_DATAFLAG_WAVE = 1;
var PTV_DATAFLAG_ENVELOPE = 2;
var PTV_DATAFLAG_UNCOVERED = 4294967292;
var PTV_FILEID = "PTVOICE-";
var PTV_VERSION = 20060111;
function newVoiceUnit() {
  return {
    basicKey: EVENTDEFAULT_BASICKEY,
    volume: 128,
    pan: 64,
    tuning: 1,
    voiceFlags: PTV_VOICEFLAG_SMOOTH,
    dataFlags: PTV_DATAFLAG_WAVE,
    type: 0,
    pcm: new Pcm(),
    ptn: new Noise(),
    wave: { num: 0, reso: 0, points: [] },
    envelope: { fps: 0, headNum: 0, bodyNum: 0, tailNum: 0, points: [] }
  };
}
function newVoiceInstance() {
  return {
    smpHeadW: 0,
    smpBodyW: 0,
    smpTailW: 0,
    pSmpW: null,
    pEnv: null,
    envSize: 0,
    envRelease: 0,
    bSineOver: false
  };
}
function releaseVoiceUnit(unit) {
  unit.envelope.points = [];
  unit.wave.points = [];
  unit.wave.num = 0;
  unit.wave.reso = 0;
  unit.envelope = { fps: 0, headNum: 0, bodyNum: 0, tailNum: 0, points: [] };
}
var Woice = class {
  _voiceNum = 0;
  _name = new Uint8Array(0);
  _type = 0;
  _voices = [];
  _voinsts = [];
  _x3xTuning = 0;
  _x3xBasicKey = 0;
  get voiceNum() {
    return this._voiceNum;
  }
  get x3xBasicKey() {
    return this._x3xBasicKey;
  }
  get x3xTuning() {
    return this._x3xTuning;
  }
  get type() {
    return this._type;
  }
  getVoice(idx) {
    if (idx < 0 || idx >= this._voiceNum) return null;
    return this._voices[idx];
  }
  getInstance(idx) {
    if (idx < 0 || idx >= this._voiceNum) return null;
    return this._voinsts[idx];
  }
  setNameBuf(name, bufSize) {
    const bytes = typeof name === "string" ? stringToBytes(name) : name;
    const size = bufSize ?? bytes.length;
    if (size < 0 || size > 16) return false;
    this._name = new Uint8Array(16);
    this._name.fill(0);
    if (size) this._name.set(bytes.subarray(0, size));
    return true;
  }
  getNameBuf() {
    return this._name;
  }
  get nameSize() {
    for (let i = 0; i < this._name.length; i++) {
      if (this._name[i] === 0) return i;
    }
    return this._name.length;
  }
  isNameBuf() {
    return this.nameSize > 0;
  }
  voiceAllocate(voiceNum) {
    this.voiceRelease();
    this._voices = [];
    this._voinsts = [];
    for (let i = 0; i < voiceNum; i++) {
      this._voices.push(newVoiceUnit());
      this._voinsts.push(newVoiceInstance());
    }
    this._voiceNum = voiceNum;
    return true;
  }
  voiceRelease() {
    for (const unit of this._voices) releaseVoiceUnit(unit);
    this._voices = [];
    this._voinsts = [];
    this._voiceNum = 0;
  }
  slim() {
    for (let i = this._voiceNum - 1; i >= 0; i--) {
      let bRemove = false;
      if (!this._voices[i].volume) bRemove = true;
      if (this._voices[i].type === 0 && this._voices[i].wave.num <= 1) bRemove = true;
      if (bRemove) {
        releaseVoiceUnit(this._voices[i]);
        this._voices.splice(i, 1);
        this._voinsts.splice(i, 1);
        this._voiceNum--;
      }
    }
  }
  copy(dst) {
    if (!dst.voiceAllocate(this._voiceNum)) return false;
    dst._type = this._type;
    dst._name = new Uint8Array(this._name);
    for (let v = 0; v < this._voiceNum; v++) {
      const s = this._voices[v];
      const d = dst._voices[v];
      d.tuning = s.tuning;
      d.dataFlags = s.dataFlags;
      d.basicKey = s.basicKey;
      d.pan = s.pan;
      d.type = s.type;
      d.voiceFlags = s.voiceFlags;
      d.volume = s.volume;
      d.envelope = {
        ...s.envelope,
        points: s.envelope.points.map((p) => ({ ...p }))
      };
      d.wave = { num: s.wave.num, reso: s.wave.reso, points: s.wave.points.map((p) => ({ ...p })) };
      if (!d.pcm.copyFrom(s.pcm)) return false;
      if (!d.ptn.copyFrom(s.ptn)) return false;
    }
    return true;
  }
  read(io, type) {
    let res = 1;
    switch (type) {
      case 1: {
        if (!this.voiceAllocate(1)) return 13;
        const vc = this._voices[0];
        vc.type = 3;
        res = vc.pcm.read(io);
        if (res !== 0) return res;
        if (vc.pcm.sec < 5e-3) vc.voiceFlags |= PTV_VOICEFLAG_WAVELOOP;
        else vc.voiceFlags &= ~PTV_VOICEFLAG_WAVELOOP;
        this._type = 1;
        break;
      }
      case 2:
        res = this.ptvRead(io);
        if (res !== 0) return res;
        break;
      case 3: {
        if (!this.voiceAllocate(1)) return 13;
        const vc = this._voices[0];
        vc.type = 2;
        res = vc.ptn.read(io);
        if (res !== 0) return res;
        this._type = 3;
        break;
      }
      case 4:
        return 16;
      default:
        return 1;
    }
    return 0;
  }
  updateWavePTV(vc, vi, ch, bps) {
    const osci = new Oscillator();
    const panVolume = [64, 64];
    if (ch === 2) {
      if (vc.pan > 64) panVolume[0] = 128 - vc.pan;
      if (vc.pan < 64) panVolume[1] = vc.pan;
    }
    osci.readyGetSample(vc.wave.points, vc.wave.num, vc.volume, vi.smpBodyW, vc.wave.reso);
    const bOvt = vc.type === 1;
    vi.bSineOver = false;
    const body = vi.smpBodyW;
    if (bps === 8) {
      const p = vi.pSmpW;
      for (let s = 0; s < body; s++) {
        const osc = bOvt ? osci.getOneSampleOvertone(s) : osci.getOneSampleCoodinate(s);
        for (let c = 0; c < ch; c++) {
          let work = osc * panVolume[c] / 64;
          if (work > 1) {
            work = 1;
            vi.bSineOver = true;
          }
          if (work < -1) {
            work = -1;
            vi.bSineOver = true;
          }
          p[s * ch + c] = Math.trunc(work * 127) + 128;
        }
      }
    } else {
      const p = new Int16Array(vi.pSmpW.buffer, vi.pSmpW.byteOffset, vi.pSmpW.byteLength >> 1);
      for (let s = 0; s < body; s++) {
        const osc = bOvt ? osci.getOneSampleOvertone(s) : osci.getOneSampleCoodinate(s);
        for (let c = 0; c < ch; c++) {
          let work = osc * panVolume[c] / 64;
          if (work > 1) {
            work = 1;
            vi.bSineOver = true;
          }
          if (work < -1) {
            work = -1;
            vi.bSineOver = true;
          }
          p[s * ch + c] = Math.trunc(work * 32767);
        }
      }
    }
  }
  toneReadySample(ptnBldr) {
    const ch = 2;
    const sps = 44100;
    const bps = 16;
    for (let v = 0; v < this._voiceNum; v++) {
      const vi = this._voinsts[v];
      vi.pSmpW = null;
      vi.smpHeadW = 0;
      vi.smpBodyW = 0;
      vi.smpTailW = 0;
    }
    const pcmWork = new Pcm();
    for (let v = 0; v < this._voiceNum; v++) {
      const vi = this._voinsts[v];
      const vc = this._voices[v];
      switch (vc.type) {
        case 3: {
          if (!pcmWork.copyFrom(vc.pcm)) return 19;
          if (!pcmWork.convert(ch, sps, bps)) return 18;
          vi.smpHeadW = pcmWork.smpHead;
          vi.smpBodyW = pcmWork.smpBody;
          vi.smpTailW = pcmWork.smpTail;
          vi.pSmpW = pcmWork.devolveSamplingBuffer();
          break;
        }
        case 1:
        case 0: {
          vi.smpBodyW = 400;
          const size = vi.smpBodyW * ch * bps / 8;
          vi.pSmpW = new Uint8Array(size);
          vi.pSmpW.fill(0);
          this.updateWavePTV(vc, vi, ch, bps);
          break;
        }
        case 2: {
          if (!ptnBldr) return 21;
          const pPcm = ptnBldr.buildNoise(vc.ptn, ch, sps, bps);
          if (!pPcm) return 20;
          vi.pSmpW = pPcm.devolveSamplingBuffer();
          vi.smpBodyW = vc.ptn.smpNum44k;
          break;
        }
        default:
          break;
      }
    }
    return 0;
  }
  toneReadyEnvelope(sps) {
    for (let v = 0; v < this._voiceNum; v++) {
      const vi = this._voinsts[v];
      const vc = this._voices[v];
      const enve = vc.envelope;
      vi.pEnv = null;
      if (enve.headNum) {
        let size = 0;
        for (let e = 0; e < enve.headNum; e++) size += enve.points[e].x;
        vi.envSize = Math.trunc(size * sps / enve.fps);
        if (!vi.envSize) vi.envSize = 1;
        vi.pEnv = new Uint8Array(vi.envSize);
        const pointList = [];
        let offset = 0;
        let headCount = 0;
        for (let e = 0; e < enve.headNum; e++) {
          if (!e || enve.points[e].x || enve.points[e].y) {
            offset += Math.trunc(enve.points[e].x * sps / enve.fps);
            pointList.push({ x: offset, y: enve.points[e].y });
            headCount++;
          }
        }
        let startX = 0;
        let startY = 0;
        let ei = 0;
        for (let s = 0; s < vi.envSize; s++) {
          while (ei < headCount && s >= pointList[ei].x) {
            startX = pointList[ei].x;
            startY = pointList[ei].y;
            ei++;
          }
          if (ei < headCount) {
            const p = pointList[ei];
            vi.pEnv[s] = Math.trunc(startY + (p.y - startY) * (s - startX) / (p.x - startX));
          } else {
            vi.pEnv[s] = Math.trunc(startY);
          }
        }
      }
      if (enve.tailNum) {
        vi.envRelease = Math.trunc(enve.points[enve.headNum].x * sps / enve.fps);
      } else {
        vi.envRelease = 0;
      }
    }
    return 0;
  }
  toneReady(ptnBldr, sps) {
    const r = this.toneReadySample(ptnBldr);
    if (r !== 0) return r;
    return this.toneReadyEnvelope(sps);
  }
  // ---- PTV ----
  ptvWrite(io) {
    let total = 0;
    if (!writeAscii8(io, PTV_FILEID)) return -1;
    writeU32LE(io, PTV_VERSION);
    writeI32LE2(io, 0);
    if (!dataWriteV(io, 0)) return -1;
    total += dataCheckVSize(0);
    if (!dataWriteV(io, 0)) return -1;
    total += dataCheckVSize(0);
    if (!dataWriteV(io, 0)) return -1;
    total += dataCheckVSize(0);
    if (!dataWriteV(io, this._voiceNum)) return -1;
    total += dataCheckVSize(this._voiceNum);
    for (let v = 0; v < this._voiceNum; v++) {
      const vc = this._voices[v];
      const vals = [vc.basicKey, vc.volume, vc.pan, floatToIntBits(vc.tuning), vc.voiceFlags, vc.dataFlags];
      for (const val of vals) {
        if (!dataWriteV(io, val)) return -1;
        total += dataCheckVSize(val);
      }
      if (vc.dataFlags & PTV_DATAFLAG_WAVE) {
        const t = this.writeWave(io, vc);
        if (t < 0) return -1;
        total += t;
      }
      if (vc.dataFlags & PTV_DATAFLAG_ENVELOPE) {
        const t = this.writeEnvelope(io, vc);
        if (t < 0) return -1;
        total += t;
      }
    }
    if (!io.seek(SEEK_CUR, -(total + 4))) return -1;
    writeI32LE2(io, total);
    if (!io.seek(SEEK_CUR, total)) return -1;
    return 16 + total;
  }
  writeWave(io, vc) {
    let add = 0;
    if (!dataWriteV(io, vc.type)) return -1;
    add += dataCheckVSize(vc.type);
    switch (vc.type) {
      case 0: {
        if (!dataWriteV(io, vc.wave.num)) return -1;
        add += dataCheckVSize(vc.wave.num);
        if (!dataWriteV(io, vc.wave.reso)) return -1;
        add += dataCheckVSize(vc.wave.reso);
        for (let i = 0; i < vc.wave.num; i++) {
          ioPutU8w(io, vc.wave.points[i].x & 255);
          add += 1;
          ioPutU8w(io, vc.wave.points[i].y << 24 >> 24 & 255);
          add += 1;
        }
        break;
      }
      case 1: {
        if (!dataWriteV(io, vc.wave.num)) return -1;
        add += dataCheckVSize(vc.wave.num);
        for (let i = 0; i < vc.wave.num; i++) {
          if (!dataWriteV(io, vc.wave.points[i].x)) return -1;
          add += dataCheckVSize(vc.wave.points[i].x);
          if (!dataWriteV(io, vc.wave.points[i].y)) return -1;
          add += dataCheckVSize(vc.wave.points[i].y);
        }
        break;
      }
      case 3: {
        if (!dataWriteV(io, vc.pcm.ch)) return -1;
        add += dataCheckVSize(vc.pcm.ch);
        if (!dataWriteV(io, vc.pcm.bps)) return -1;
        add += dataCheckVSize(vc.pcm.bps);
        if (!dataWriteV(io, vc.pcm.sps)) return -1;
        add += dataCheckVSize(vc.pcm.sps);
        if (!dataWriteV(io, vc.pcm.smpHead)) return -1;
        add += dataCheckVSize(vc.pcm.smpHead);
        if (!dataWriteV(io, vc.pcm.smpBody)) return -1;
        add += dataCheckVSize(vc.pcm.smpBody);
        if (!dataWriteV(io, vc.pcm.smpTail)) return -1;
        add += dataCheckVSize(vc.pcm.smpTail);
        const size = vc.pcm.bufSize;
        if (!vc.pcm.pBuf) return -1;
        io.write(vc.pcm.pBuf, 1, size);
        add += size;
        break;
      }
      default:
        return -1;
    }
    return add;
  }
  writeEnvelope(io, vc) {
    let add = 0;
    const enve = vc.envelope;
    const vals = [enve.fps, enve.headNum, enve.bodyNum, enve.tailNum];
    for (const v of vals) {
      if (!dataWriteV(io, v)) return -1;
      add += dataCheckVSize(v);
    }
    const num = enve.headNum + enve.bodyNum + enve.tailNum;
    for (let i = 0; i < num; i++) {
      if (!dataWriteV(io, enve.points[i].x)) return -1;
      add += dataCheckVSize(enve.points[i].x);
      if (!dataWriteV(io, enve.points[i].y)) return -1;
      add += dataCheckVSize(enve.points[i].y);
    }
    return add;
  }
  ptvRead(io) {
    let res = 1;
    const code = readAscii(io, 8);
    if (code === null) return 7;
    const version = ioGetInt32LE(io);
    if (version === null) return 7;
    if (code !== PTV_FILEID) return 11;
    const _total = ioGetInt32LE(io);
    if (_total === null) return 7;
    if (version > PTV_VERSION) return 9;
    const bk = dataReadV(io);
    if (bk === null) return 7;
    this._x3xBasicKey = bk;
    const w1 = dataReadV(io);
    if (w1 === null) return 7;
    const w2 = dataReadV(io);
    if (w2 === null) return 7;
    if (w1 || w2) return 10;
    const num = dataReadV(io);
    if (num === null) return 7;
    if (!this.voiceAllocate(num)) return 13;
    for (let v = 0; v < this._voiceNum; v++) {
      const vc = this._voices[v];
      const bk2 = dataReadV(io);
      if (bk2 === null) return 7;
      vc.basicKey = bk2;
      const vol = dataReadV(io);
      if (vol === null) return 7;
      vc.volume = vol;
      const pan = dataReadV(io);
      if (pan === null) return 7;
      vc.pan = pan;
      const tune = dataReadV(io);
      if (tune === null) return 7;
      vc.tuning = intBitsToFloat(tune);
      const vf = dataReadV(io);
      if (vf === null) return 7;
      vc.voiceFlags = vf;
      const df = dataReadV(io);
      if (df === null) return 7;
      vc.dataFlags = df;
      if (vc.voiceFlags & PTV_VOICEFLAG_UNCOVERED) return 10;
      if (vc.dataFlags & PTV_DATAFLAG_UNCOVERED) return 10;
      if (vc.dataFlags & PTV_DATAFLAG_WAVE) {
        res = this.readWave(io, vc);
        if (res !== 0) return res;
      }
      if (vc.dataFlags & PTV_DATAFLAG_ENVELOPE) {
        res = this.readEnvelope(io, vc);
        if (res !== 0) return res;
      }
    }
    this._type = 2;
    return 0;
  }
  readWave(io, vc) {
    const t = dataReadV(io);
    if (t === null) return 7;
    vc.type = t;
    switch (vc.type) {
      case 0: {
        const num = dataReadV(io);
        if (num === null) return 7;
        vc.wave.num = num;
        const reso = dataReadV(io);
        if (reso === null) return 7;
        vc.wave.reso = reso;
        vc.wave.points = [];
        for (let i = 0; i < num; i++) {
          const x = ioGetU8(io);
          if (x === null) return 7;
          const yb = ioGetU8(io);
          if (yb === null) return 7;
          vc.wave.points.push({ x, y: yb << 24 >> 24 });
        }
        break;
      }
      case 1: {
        const num = dataReadV(io);
        if (num === null) return 7;
        vc.wave.num = num;
        vc.wave.points = [];
        for (let i = 0; i < num; i++) {
          const x = dataReadV(io);
          if (x === null) return 7;
          const y = dataReadV(io);
          if (y === null) return 7;
          vc.wave.points.push({ x, y });
        }
        break;
      }
      case 3:
        return 10;
      default:
        return 22;
    }
    return 0;
  }
  readEnvelope(io, vc) {
    const enve = vc.envelope;
    const fps = dataReadV(io);
    if (fps === null) return 7;
    enve.fps = fps;
    const headNum = dataReadV(io);
    if (headNum === null) return 7;
    enve.headNum = headNum;
    const bodyNum = dataReadV(io);
    if (bodyNum === null) return 7;
    enve.bodyNum = bodyNum;
    const tailNum = dataReadV(io);
    if (tailNum === null) return 7;
    enve.tailNum = tailNum;
    if (enve.bodyNum) return 10;
    if (enve.tailNum !== 1) return 10;
    enve.points = [];
    const num = enve.headNum + enve.bodyNum + enve.tailNum;
    for (let i = 0; i < num; i++) {
      const x = dataReadV(io);
      if (x === null) return 7;
      const y = dataReadV(io);
      if (y === null) return 7;
      enve.points.push({ x, y });
    }
    return 0;
  }
  // ---- matePCM / matePTN / matePTV ----
  ioMatePcmW(io) {
    const vc = this._voices[0];
    const pcm = vc.pcm;
    const size = 24 + pcm.bufSize;
    writeU32LE(io, size);
    writeU16LE(io, 0);
    writeU16LE(io, vc.basicKey & 65535);
    writeU32LE(io, vc.voiceFlags);
    writeU16LE(io, pcm.ch & 65535);
    writeU16LE(io, pcm.bps & 65535);
    writeU32LE(io, pcm.sps);
    ioPutFloatLE(io, vc.tuning);
    writeU32LE(io, pcm.bufSize);
    if (!pcm.pBuf) return false;
    io.write(pcm.pBuf, 1, pcm.bufSize);
    return true;
  }
  ioMatePcmR(io) {
    const size = ioGetUint32LE(io);
    if (size === null) return 7;
    void size;
    const unitNo = ioGetUint16LE(io);
    if (unitNo === null) return 7;
    void unitNo;
    const basicKey = ioGetUint16LE(io);
    if (basicKey === null) return 7;
    const voiceFlags = ioGetUint32LE(io);
    if (voiceFlags === null) return 7;
    if (voiceFlags & PTV_VOICEFLAG_UNCOVERED) return 10;
    const ch = ioGetUint16LE(io);
    if (ch === null) return 7;
    const bps = ioGetUint16LE(io);
    if (bps === null) return 7;
    const sps = ioGetUint32LE(io);
    if (sps === null) return 7;
    const tuning = ioGetFloatLE(io);
    if (tuning === null) return 7;
    const dataSize = ioGetUint32LE(io);
    if (dataSize === null) return 7;
    if (!this.voiceAllocate(1)) return 13;
    const vc = this._voices[0];
    vc.type = 3;
    const res = vc.pcm.create(ch, sps, bps, Math.trunc(dataSize / (bps / 8 * ch)));
    if (res !== 0) return res;
    const buf = ioGetBytes(io, dataSize);
    if (buf === null) {
      this.voiceRelease();
      return 7;
    }
    vc.pcm.pBuf.set(buf);
    this._type = 1;
    vc.voiceFlags = voiceFlags;
    vc.basicKey = basicKey;
    vc.tuning = tuning;
    this._x3xBasicKey = basicKey;
    this._x3xTuning = 0;
    return 0;
  }
  ioMatePtnW(io) {
    const vc = this._voices[0];
    const start = io.position;
    writeI32LE2(io, 0);
    writeU16LE(io, 0);
    writeU16LE(io, vc.basicKey & 65535);
    writeU32LE(io, vc.voiceFlags);
    ioPutFloatLE(io, vc.tuning);
    writeI32LE2(io, 1);
    let size = 16;
    if (!vc.ptn.write(io, io.position)) return false;
    size += io.position - (start + 20);
    const end = io.position;
    if (!io.seek(SEEK_CUR, start - end)) return false;
    writeI32LE2(io, size);
    return io.seek(SEEK_CUR, end - io.position);
  }
  ioMatePtnR(io) {
    const size = ioGetUint32LE(io);
    if (size === null) return 7;
    void size;
    const unitNo = ioGetUint16LE(io);
    if (unitNo === null) return 7;
    void unitNo;
    const basicKey = ioGetUint16LE(io);
    if (basicKey === null) return 7;
    const voiceFlags = ioGetUint32LE(io);
    if (voiceFlags === null) return 7;
    const tuning = ioGetFloatLE(io);
    if (tuning === null) return 7;
    const rrr = ioGetInt32LE(io);
    if (rrr === null) return 7;
    if (rrr > 1 || rrr < 0) return 10;
    if (!this.voiceAllocate(1)) return 13;
    const vc = this._voices[0];
    vc.type = 2;
    const res = vc.ptn.read(io);
    if (res !== 0) {
      this.voiceRelease();
      return res;
    }
    this._type = 3;
    vc.voiceFlags = voiceFlags;
    vc.basicKey = basicKey;
    vc.tuning = tuning;
    this._x3xBasicKey = basicKey;
    this._x3xTuning = 0;
    return 0;
  }
  ioMatePtvW(io) {
    const start = io.position;
    writeI32LE2(io, 0);
    writeU16LE(io, 0);
    writeU16LE(io, 0);
    ioPutFloatLE(io, 0);
    writeI32LE2(io, 0);
    const ptvSize = this.ptvWrite(io);
    if (ptvSize < 0) return false;
    const end = io.position;
    if (!io.seek(SEEK_CUR, start - end)) return false;
    writeI32LE2(io, ptvSize + 12);
    writeU16LE(io, 0);
    writeU16LE(io, 0);
    ioPutFloatLE(io, 0);
    writeI32LE2(io, ptvSize);
    return io.seek(SEEK_CUR, end - io.position);
  }
  ioMatePtvR(io) {
    const size = ioGetInt32LE(io);
    if (size === null) return 7;
    void size;
    const unitNo = ioGetUint16LE(io);
    if (unitNo === null) return 7;
    void unitNo;
    const rrr = ioGetUint16LE(io);
    if (rrr === null) return 7;
    const x3xTuning = ioGetFloatLE(io);
    if (x3xTuning === null) return 7;
    const ptvSize = ioGetInt32LE(io);
    if (ptvSize === null) return 7;
    void ptvSize;
    if (rrr) return 10;
    const res = this.ptvRead(io);
    if (res !== 0) return res;
    if (x3xTuning !== 1) this._x3xTuning = x3xTuning;
    else this._x3xTuning = 0;
    return 0;
  }
};
function writeAscii8(io, s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return io.write(b, 1, s.length);
}
function readAscii(io, n) {
  if (io.remain < n) return null;
  const b = new Uint8Array(n);
  if (!io.read(b, 1, n)) return null;
  let s = "";
  for (const c of b) s += String.fromCharCode(c);
  return s;
}
function stringToBytes(s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
  return b;
}
function ioPutU8w(io, v) {
  const b = new Uint8Array(1);
  b[0] = v & 255;
  io.write(b, 1, 1);
}
function writeU32LE(io, v) {
  writeI32LE2(io, v >>> 0);
}
function writeI32LE2(io, v) {
  const b = new Uint8Array(4);
  b[0] = v & 255;
  b[1] = v >>> 8 & 255;
  b[2] = v >>> 16 & 255;
  b[3] = v >>> 24 & 255;
  io.write(b, 1, 4);
}
function writeU16LE(io, v) {
  const b = new Uint8Array(2);
  b[0] = v & 255;
  b[1] = v >>> 8 & 255;
  io.write(b, 1, 2);
}
function floatToIntBits(v) {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setFloat32(0, v, true);
  return dv.getInt32(0, true);
}
function intBitsToFloat(bits) {
  const dv = new DataView(new ArrayBuffer(4));
  dv.setInt32(0, bits, true);
  return dv.getFloat32(0, true);
}
function newTone() {
  return {
    smpPos: 0,
    offsetFreq: 0,
    envVolume: 0,
    lifeCount: 0,
    onCount: 0,
    smpCount: 0,
    envStart: 0,
    envPos: 0,
    envReleaseClock: 0,
    smoothVolume: 0
  };
}
var Unit = class {
  _bOperated = true;
  _bPlayed = true;
  _name = "no name";
  _keyNow = EVENTDEFAULT_KEY;
  _keyStart = EVENTDEFAULT_KEY;
  _keyMargin = 0;
  _portamentSamplePos = 0;
  _portamentSampleNum = 0;
  _panVols = [64, 64];
  _panTimes = [0, 0];
  _panTimeBufs = [new Array(PXTN_BUFSIZE_TIMEPAN).fill(0), new Array(PXTN_BUFSIZE_TIMEPAN).fill(0)];
  _vVolume = EVENTDEFAULT_VOLUME;
  _vVelocity = EVENTDEFAULT_VELOCITY;
  _vGroupNo = EVENTDEFAULT_GROUPNO;
  _vTuning = EVENTDEFAULT_TUNING;
  _pWoice = null;
  _vts = [newTone(), newTone()];
  toneInit() {
    this._vGroupNo = EVENTDEFAULT_GROUPNO;
    this._vVelocity = EVENTDEFAULT_VELOCITY;
    this._vVolume = EVENTDEFAULT_VOLUME;
    this._vTuning = EVENTDEFAULT_TUNING;
    this._portamentSampleNum = 0;
    this._portamentSamplePos = 0;
    for (let i = 0; i < PXTN_MAX_CHANNEL; i++) {
      this._panVols[i] = 64;
      this._panTimes[i] = 0;
    }
  }
  toneClear() {
    for (let i = 0; i < PXTN_MAX_CHANNEL; i++) this._panTimeBufs[i].fill(0);
  }
  toneResetAnd2prm(voiceIdx, envRlsClock, offsetFreq) {
    const t = this._vts[voiceIdx];
    t.lifeCount = 0;
    t.onCount = 0;
    t.smpPos = 0;
    t.smoothVolume = 0;
    t.envReleaseClock = envRlsClock;
    t.offsetFreq = offsetFreq;
  }
  setWoice(pWoice) {
    if (!pWoice) return false;
    this._pWoice = pWoice;
    this._keyNow = EVENTDEFAULT_KEY;
    this._keyMargin = 0;
    this._keyStart = EVENTDEFAULT_KEY;
    return true;
  }
  get woice() {
    return this._pWoice;
  }
  setNameBuf(name) {
    const size = typeof name === "string" ? name.length : name.length;
    if (size > 16) return false;
    if (typeof name === "string") this._name = name;
    else {
      let s = "";
      for (const c of name) {
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      this._name = s;
    }
    return true;
  }
  get name() {
    return this._name;
  }
  isNameBuf() {
    return this._name.length > 0;
  }
  setOperated(b) {
    this._bOperated = b;
  }
  setPlayed(b) {
    this._bPlayed = b;
  }
  get operated() {
    return this._bOperated;
  }
  get played() {
    return this._bPlayed;
  }
  toneZeroLives() {
    for (let i = 0; i < PXTN_MAX_CHANNEL; i++) this._vts[i].lifeCount = 0;
  }
  toneKeyOn() {
    this._keyNow = this._keyStart + this._keyMargin;
    this._keyStart = this._keyNow;
    this._keyMargin = 0;
  }
  toneKey(key) {
    this._keyStart = this._keyNow;
    this._keyMargin = key - this._keyStart;
    this._portamentSamplePos = 0;
  }
  tonePanVolume(ch, pan) {
    this._panVols[0] = 64;
    this._panVols[1] = 64;
    if (ch === 2) {
      if (pan >= 64) this._panVols[0] = 128 - pan;
      else this._panVols[1] = pan;
    }
  }
  tonePanTime(ch, pan, sps) {
    this._panTimes[0] = 0;
    this._panTimes[1] = 0;
    if (ch === 2) {
      if (pan >= 64) {
        this._panTimes[0] = pan - 64;
        if (this._panTimes[0] > 63) this._panTimes[0] = 63;
        this._panTimes[0] = Math.trunc(this._panTimes[0] * 44100 / sps);
      } else {
        this._panTimes[1] = 64 - pan;
        if (this._panTimes[1] > 63) this._panTimes[1] = 63;
        this._panTimes[1] = Math.trunc(this._panTimes[1] * 44100 / sps);
      }
    }
  }
  toneVelocity(val) {
    this._vVelocity = val;
  }
  toneVolume(val) {
    this._vVolume = val;
  }
  tonePortament(val) {
    this._portamentSampleNum = val;
  }
  toneGroupNo(val) {
    this._vGroupNo = val;
  }
  toneTuning(val) {
    this._vTuning = val;
  }
  toneEnvelope() {
    if (!this._pWoice) return;
    const num = this._pWoice.voiceNum;
    for (let v = 0; v < num; v++) {
      const vi = this._pWoice.getInstance(v);
      const vt = this._vts[v];
      if (vt.lifeCount > 0 && vi.envSize) {
        if (vt.onCount > 0) {
          if (vt.envPos < vi.envSize) {
            vt.envVolume = vi.pEnv[vt.envPos];
            vt.envPos++;
          }
        } else {
          vt.envVolume = vt.envStart + Math.trunc((0 - vt.envStart) * vt.envPos / vi.envRelease);
          vt.envPos++;
        }
      }
    }
  }
  toneSample(bMuteByUnit, chNum, timePanIndex, smoothSmp) {
    if (!this._pWoice) return;
    if (bMuteByUnit && !this._bPlayed) {
      for (let ch = 0; ch < chNum; ch++) this._panTimeBufs[ch][timePanIndex] = 0;
      return;
    }
    const num = this._pWoice.voiceNum;
    for (let ch = 0; ch < PXTN_MAX_CHANNEL; ch++) {
      let timePanBuf = 0;
      for (let v = 0; v < num; v++) {
        const vt = this._vts[v];
        const vi = this._pWoice.getInstance(v);
        let work = 0;
        if (vt.lifeCount > 0) {
          const pos = Math.trunc(vt.smpPos) * 4 + ch * 2;
          work += i16At(vi.pSmpW, pos);
          if (chNum === 1) {
            work += i16At(vi.pSmpW, pos + 2);
            work = Math.trunc(work / 2);
          }
          work = Math.trunc(work * this._vVelocity / 128);
          work = Math.trunc(work * this._vVolume / 128);
          work = Math.trunc(work * this._panVols[ch] / 64);
          if (vi.envSize) work = Math.trunc(work * vt.envVolume / 128);
          if (this._pWoice.getVoice(v).voiceFlags & PTV_VOICEFLAG_SMOOTH && vt.lifeCount < smoothSmp) {
            work = Math.trunc(work * vt.lifeCount / smoothSmp);
          }
        }
        timePanBuf += work;
      }
      this._panTimeBufs[ch][timePanIndex] = timePanBuf;
    }
  }
  toneSupple(groupSmps, ch, timePanIndex) {
    const idx = timePanIndex - this._panTimes[ch] & PXTN_BUFSIZE_TIMEPAN - 1;
    groupSmps[this._vGroupNo] += this._panTimeBufs[ch][idx];
  }
  toneIncrementKey() {
    if (this._portamentSampleNum && this._keyMargin) {
      if (this._portamentSamplePos < this._portamentSampleNum) {
        this._portamentSamplePos++;
        this._keyNow = Math.trunc(this._keyStart + this._keyMargin * this._portamentSamplePos / this._portamentSampleNum);
      } else {
        this._keyNow = this._keyStart + this._keyMargin;
        this._keyStart = this._keyNow;
        this._keyMargin = 0;
      }
    } else {
      this._keyNow = this._keyStart + this._keyMargin;
    }
    return this._keyNow;
  }
  toneIncrementSample(freq) {
    if (!this._pWoice) return;
    const num = this._pWoice.voiceNum;
    for (let v = 0; v < num; v++) {
      const vi = this._pWoice.getInstance(v);
      const vt = this._vts[v];
      if (vt.lifeCount > 0) vt.lifeCount--;
      if (vt.lifeCount > 0) {
        vt.onCount--;
        vt.smpPos += vt.offsetFreq * this._vTuning * freq;
        if (vt.smpPos >= vi.smpBodyW) {
          if (this._pWoice.getVoice(v).voiceFlags & PTV_VOICEFLAG_WAVELOOP) {
            if (vt.smpPos >= vi.smpBodyW) vt.smpPos -= vi.smpBodyW;
            if (vt.smpPos >= vi.smpBodyW) vt.smpPos = 0;
          } else {
            vt.lifeCount = 0;
          }
        }
        if (vt.onCount === 0 && vi.envSize) {
          vt.envStart = vt.envVolume;
          vt.envPos = 0;
        }
      }
    }
  }
  getTone(voiceIdx) {
    return this._vts[voiceIdx];
  }
  tonePanTimeBuf(ch, idx) {
    return this._panTimeBufs[ch][idx];
  }
  readV1x(io, groupOut) {
    const size = ioGetInt32LE(io);
    if (size === null) return false;
    void size;
    const name = ioGetBytes(io, 16);
    if (name === null) return false;
    const type = ioGetU16LE(io);
    if (type === null) return false;
    const group = ioGetU16LE(io);
    if (group === null) return false;
    if (type !== 1) return false;
    this.setNameBuf(name);
    groupOut.value = group;
    return true;
  }
  readV3x(io, groupOut) {
    const size = ioGetInt32LE(io);
    if (size === null) return 7;
    void size;
    const type = ioGetU16LE(io);
    if (type === null) return 7;
    const group = ioGetU16LE(io);
    if (group === null) return 7;
    if (type !== 1 && type !== 2 && type !== 3)
      return 10;
    groupOut.value = group;
    return 0;
  }
};
function i16At(buf, pos) {
  return (buf[pos] | buf[pos + 1] << 8) << 16 >> 16;
}
var CODE_TUNE_X2X = "PTTUNE--20050608";
var CODE_TUNE_X3X = "PTTUNE--20060115";
var CODE_TUNE_X4X = "PTTUNE--20060930";
var CODE_TUNE_V5 = "PTTUNE--20071119";
var CODE_PROJ_X1X = "PTCOLLAGE-050227";
var CODE_PROJ_X2X = "PTCOLLAGE-050608";
var CODE_PROJ_X3X = "PTCOLLAGE-060115";
var CODE_PROJ_X4X = "PTCOLLAGE-060930";
var CODE_PROJ_V5 = "PTCOLLAGE-071119";
var CODE_X1X_PROJ = "PROJECT=";
var CODE_X1X_EVEN = "EVENT===";
var CODE_X1X_UNIT = "UNIT====";
var CODE_X1X_END = "END=====";
var CODE_X1X_PCM = "matePCM=";
var CODE_X3X_PXTNUNIT = "pxtnUNIT";
var CODE_X4X_EVENMAST = "evenMAST";
var CODE_X4X_EVENUNIT = "evenUNIT";
var CODE_ANTIOPER = "antiOPER";
var CODE_NUM_UNIT = "num UNIT";
var CODE_MASTERV5 = "MasterV5";
var CODE_EVENT_V5 = "Event V5";
var CODE_MATEPCM = "matePCM ";
var CODE_MATEPTV = "matePTV ";
var CODE_MATEPTN = "matePTN ";
var CODE_MATEOGGV = "mateOGGV";
var CODE_EFFEDELA = "effeDELA";
var CODE_EFFEOVER = "effeOVER";
var CODE_TEXTNAME = "textNAME";
var CODE_TEXTCOMM = "textCOMM";
var CODE_ASSIUNIT = "assiUNIT";
var CODE_ASSIWOIC = "assiWOIC";
var CODE_PXTONEND = "pxtoneND";
var MAX_FMTVER_X1X_EVENTNUM = 1e4;
function checkTagCode(code) {
  switch (code) {
    case CODE_ANTIOPER:
      return 1;
    case CODE_X1X_PROJ:
      return 2;
    case CODE_X1X_UNIT:
      return 3;
    case CODE_X1X_PCM:
      return 4;
    case CODE_X1X_EVEN:
      return 5;
    case CODE_X1X_END:
      return 6;
    case CODE_X3X_PXTNUNIT:
      return 7;
    case CODE_X4X_EVENMAST:
      return 8;
    case CODE_X4X_EVENUNIT:
      return 9;
    case CODE_NUM_UNIT:
      return 10;
    case CODE_EVENT_V5:
      return 12;
    case CODE_MASTERV5:
      return 11;
    case CODE_MATEPCM:
      return 13;
    case CODE_MATEPTV:
      return 14;
    case CODE_MATEPTN:
      return 15;
    case CODE_MATEOGGV:
      return 16;
    case CODE_EFFEDELA:
      return 17;
    case CODE_EFFEOVER:
      return 18;
    case CODE_TEXTNAME:
      return 19;
    case CODE_TEXTCOMM:
      return 20;
    case CODE_ASSIUNIT:
      return 21;
    case CODE_ASSIWOIC:
      return 22;
    case CODE_PXTONEND:
      return 23;
    default:
      return 0;
  }
}
function asciiFromBytes(b) {
  let s = "";
  for (const c of b) s += String.fromCharCode(c);
  return s;
}
var Service = class {
  text = new PxtnText();
  master = new Master();
  evels = new Evelist();
  _bInit = false;
  _bEdit = false;
  _bFixEvelsNum = false;
  _dstChNum = 2;
  _dstSps = 44100;
  _dstBytePerSmp = PXTN_BITPERSAMPLE / 8 * 2;
  _ptnBldr = null;
  _delayMax = 0;
  _delayNum = 0;
  _delays = [];
  _ovdrvMax = 0;
  _ovdrvNum = 0;
  _ovdrvs = [];
  _woiceMax = 0;
  _woiceNum = 0;
  _woices = [];
  _unitMax = 0;
  _unitNum = 0;
  _units = [];
  _groupNum = PXTN_MAX_TUNE_GROUP_NUM;
  // ---- Moo (レンダラー) 状態 ----
  _mooBValidData = false;
  _mooBEndVomit = true;
  _mooBMuteByUnit = false;
  _mooBLoop = true;
  _mooFadeFade = 0;
  _mooMasterVol = 1;
  _mooBtClock = 0;
  _mooBtNum = 0;
  _mooFreq = null;
  _mooGroupSmps = null;
  _mooPEve = -1;
  // _mooRecords の index
  _mooRecords = [];
  _mooSmpCount = 0;
  _mooSmpStart = 0;
  _mooSmpEnd = 0;
  _mooSmpRepeat = 0;
  _mooSmpSmooth = 0;
  _mooClockRate = 0;
  _mooFadeCount = 0;
  _mooFadeMax = 0;
  _mooTop = 32767;
  _mooSmpStride = 1;
  _mooTimePanIndex = 0;
  _mooBtTempo = 0;
  get isInit() {
    return this._bInit;
  }
  init() {
    return this._init(0, false);
  }
  initCollage(fixEvelsNum) {
    return this._init(fixEvelsNum, true);
  }
  _init(fixEvelsNum, bEdit) {
    if (this._bInit) return 2;
    this._ptnBldr = new NoiseBuilder();
    if (!this._ptnBldr.init()) return 21;
    if (fixEvelsNum) {
      this._bFixEvelsNum = true;
      if (!this.evels.allocate(fixEvelsNum)) return 13;
    } else {
      this._bFixEvelsNum = false;
    }
    this._delays = new Array(PXTN_MAX_TUNE_DELAY_STRUCT).fill(null);
    this._delayMax = PXTN_MAX_TUNE_DELAY_STRUCT;
    this._delayNum = 0;
    this._ovdrvs = new Array(PXTN_MAX_TUNE_OVERDRIVE_STRUCT).fill(null);
    this._ovdrvMax = PXTN_MAX_TUNE_OVERDRIVE_STRUCT;
    this._ovdrvNum = 0;
    this._woices = new Array(PXTN_MAX_TUNE_WOICE_STRUCT).fill(null);
    this._woiceMax = PXTN_MAX_TUNE_WOICE_STRUCT;
    this._woiceNum = 0;
    this._units = new Array(PXTN_MAX_TUNE_UNIT_STRUCT).fill(null);
    this._unitMax = PXTN_MAX_TUNE_UNIT_STRUCT;
    this._unitNum = 0;
    this._groupNum = PXTN_MAX_TUNE_GROUP_NUM;
    if (!this._mooInit()) return 14;
    this._bEdit = bEdit;
    this._bInit = true;
    return 0;
  }
  _mooInit() {
    this._mooFreq = new Frequency();
    this._mooFreq.init();
    this._mooGroupSmps = new Int32Array(this._groupNum);
    return true;
  }
  clear() {
    if (!this._bInit) return false;
    if (!this._bEdit) this._mooBValidData = false;
    this.text.setNameBuf(new Uint8Array(0));
    this.text.setCommentBuf(new Uint8Array(0));
    this.evels.clear();
    this._delays.fill(null);
    this._delayNum = 0;
    this._ovdrvs.fill(null);
    this._ovdrvNum = 0;
    this._woices.fill(null);
    this._woiceNum = 0;
    this._units.fill(null);
    this._unitNum = 0;
    this.master.reset();
    if (!this._bEdit) this.evels.release();
    else this.evels.clear();
    return true;
  }
  adjustMeasNum() {
    if (!this._bInit) return false;
    this.master.adjustMeasNum(this.evels.maxClock);
    return true;
  }
  get groupNum() {
    return this._bInit ? this._groupNum : 0;
  }
  tonesReady() {
    if (!this._bInit) return 2;
    const beatNum = this.master.beatNum;
    const beatTempo = this.master.beatTempo;
    for (let i = 0; i < this._delayNum; i++) {
      const res = this._delays[i].toneReady(beatNum, beatTempo, this._dstSps);
      if (res !== 0) return res;
    }
    for (let i = 0; i < this._ovdrvNum; i++) this._ovdrvs[i].toneReady();
    for (let i = 0; i < this._woiceNum; i++) {
      const res = this._woices[i].toneReady(this._ptnBldr, this._dstSps);
      if (res !== 0) return res;
    }
    return 0;
  }
  tonesClear() {
    if (!this._bInit) return false;
    for (let i = 0; i < this._delayNum; i++) this._delays[i].toneClear();
    for (let i = 0; i < this._unitNum; i++) this._units[i].toneClear();
    return true;
  }
  // Delay
  get delayNum() {
    return this._bInit ? this._delayNum : 0;
  }
  get delayMax() {
    return this._bInit ? this._delayMax : 0;
  }
  delaySet(idx, unit, freq, rate, group) {
    if (!this._bInit) return false;
    if (idx >= this._delayNum) return false;
    this._delays[idx].set(unit, freq, rate, group);
    return true;
  }
  delayAdd(unit, freq, rate, group) {
    if (!this._bInit) return false;
    if (this._delayNum >= this._delayMax) return false;
    const d = new Delay();
    d.set(unit, freq, rate, group);
    this._delays[this._delayNum] = d;
    this._delayNum++;
    return true;
  }
  delayRemove(idx) {
    if (!this._bInit) return false;
    if (idx >= this._delayNum) return false;
    this._delays.splice(idx, 1);
    this._delays.push(null);
    this._delayNum--;
    return true;
  }
  delayGet(idx) {
    if (!this._bInit) return null;
    if (idx < 0 || idx >= this._delayNum) return null;
    return this._delays[idx] ?? null;
  }
  delayReadyTone(idx) {
    if (!this._bInit) return 2;
    if (idx < 0 || idx >= this._delayNum) return 17;
    return this._delays[idx].toneReady(this.master.beatNum, this.master.beatTempo, this._dstSps);
  }
  // OverDrive
  get overdriveNum() {
    return this._bInit ? this._ovdrvNum : 0;
  }
  get overdriveMax() {
    return this._bInit ? this._ovdrvMax : 0;
  }
  overdriveSet(idx, cut, amp, group) {
    if (!this._bInit) return false;
    if (idx >= this._ovdrvNum) return false;
    this._ovdrvs[idx].set(cut, amp, group);
    return true;
  }
  overdriveAdd(cut, amp, group) {
    if (!this._bInit) return false;
    if (this._ovdrvNum >= this._ovdrvMax) return false;
    const o = new OverDrive();
    o.set(cut, amp, group);
    this._ovdrvs[this._ovdrvNum] = o;
    this._ovdrvNum++;
    return true;
  }
  overdriveRemove(idx) {
    if (!this._bInit) return false;
    if (idx >= this._ovdrvNum) return false;
    this._ovdrvs.splice(idx, 1);
    this._ovdrvs.push(null);
    this._ovdrvNum--;
    return true;
  }
  overdriveGet(idx) {
    if (!this._bInit) return null;
    if (idx < 0 || idx >= this._ovdrvNum) return null;
    return this._ovdrvs[idx] ?? null;
  }
  overdriveReadyTone(idx) {
    if (!this._bInit) return false;
    if (idx < 0 || idx >= this._ovdrvNum) return false;
    this._ovdrvs[idx].toneReady();
    return true;
  }
  // Woice
  get woiceNum() {
    return this._bInit ? this._woiceNum : 0;
  }
  get woiceMax() {
    return this._bInit ? this._woiceMax : 0;
  }
  woiceGet(idx) {
    if (!this._bInit) return null;
    if (idx < 0 || idx >= this._woiceNum) return null;
    return this._woices[idx] ?? null;
  }
  woiceRead(idx, desc, type) {
    if (!this._bInit) return 2;
    if (idx < 0 || idx >= this._woiceMax) return 17;
    if (idx > this._woiceNum) return 17;
    if (idx === this._woiceNum) {
      this._woices[idx] = new Woice();
      this._woiceNum++;
    }
    const res = this._woices[idx].read(desc, type);
    if (res !== 0) {
      this.woiceRemove(idx);
      return res;
    }
    return res;
  }
  woiceReadyTone(idx) {
    if (!this._bInit) return 2;
    if (idx < 0 || idx >= this._woiceNum) return 17;
    return this._woices[idx].toneReady(this._ptnBldr, this._dstSps);
  }
  woiceRemove(idx) {
    if (!this._bInit) return false;
    if (idx < 0 || idx >= this._woiceNum) return false;
    this._woices.splice(idx, 1);
    this._woices.push(null);
    this._woiceNum--;
    return true;
  }
  woiceReplace(oldPlace, newPlace) {
    if (!this._bInit) return false;
    const pW = this._woices[oldPlace];
    let maxPlace = this._woiceNum - 1;
    if (newPlace > maxPlace) newPlace = maxPlace;
    if (newPlace === oldPlace) return true;
    if (oldPlace < newPlace) {
      for (let w = oldPlace; w < newPlace; w++) {
        if (this._woices[w]) this._woices[w] = this._woices[w + 1] ?? null;
      }
    } else {
      for (let w = oldPlace; w > newPlace; w--) {
        if (this._woices[w]) this._woices[w] = this._woices[w - 1] ?? null;
      }
    }
    this._woices[newPlace] = pW ?? null;
    return true;
  }
  // Unit
  get unitNum() {
    return this._bInit ? this._unitNum : 0;
  }
  get unitMax() {
    return this._bInit ? this._unitMax : 0;
  }
  unitGet(idx) {
    if (!this._bInit) return null;
    if (idx < 0 || idx >= this._unitNum) return null;
    return this._units[idx] ?? null;
  }
  unitAddNew() {
    if (this._unitNum >= this._unitMax) return false;
    this._units[this._unitNum] = new Unit();
    this._unitNum++;
    return true;
  }
  unitRemove(idx) {
    if (!this._bInit) return false;
    if (idx < 0 || idx >= this._unitNum) return false;
    this._units.splice(idx, 1);
    this._units.push(null);
    this._unitNum--;
    return true;
  }
  unitReplace(oldPlace, newPlace) {
    if (!this._bInit) return false;
    const pW = this._units[oldPlace];
    let maxPlace = this._unitNum - 1;
    if (newPlace > maxPlace) newPlace = maxPlace;
    if (newPlace === oldPlace) return true;
    if (oldPlace < newPlace) {
      for (let w = oldPlace; w < newPlace; w++) {
        if (this._units[w]) this._units[w] = this._units[w + 1] ?? null;
      }
    } else {
      for (let w = oldPlace; w > newPlace; w--) {
        if (this._units[w]) this._units[w] = this._units[w - 1] ?? null;
      }
    }
    this._units[newPlace] = pW ?? null;
    return true;
  }
  unitSetOperatedAll(b) {
    if (!this._bInit) return false;
    for (let u = 0; u < this._unitNum; u++) {
      this._units[u].setOperated(b);
      if (b) this._units[u].setPlayed(true);
    }
    return true;
  }
  unitSolo(idx) {
    if (!this._bInit) return false;
    for (let u = 0; u < this._unitNum; u++) {
      if (u === idx) this._units[u].setPlayed(true);
      else this._units[u].setPlayed(false);
    }
    return false;
  }
  // Quality
  setDestinationQuality(chNum, sps) {
    if (!this._bInit) return false;
    if (chNum !== 1 && chNum !== 2) return false;
    this._dstChNum = chNum;
    this._dstSps = sps;
    this._dstBytePerSmp = PXTN_BITPERSAMPLE / 8 * chNum;
    return true;
  }
  getDestinationQuality() {
    return { chNum: this._dstChNum, sps: this._dstSps };
  }
  // ---------- read ----------
  _readVersion(desc, out) {
    const version = ioGetBytes(desc, PXTN_VERSIONSIZE);
    if (version === null) return 7;
    const v = asciiFromBytes(version);
    if (v === CODE_PROJ_X1X) {
      out.fmt = 1;
      out.exeVer = 0;
      return 0;
    }
    if (v === CODE_PROJ_X2X) {
      out.fmt = 2;
      out.exeVer = 0;
      return 0;
    }
    if (v === CODE_PROJ_X3X) out.fmt = 3;
    else if (v === CODE_PROJ_X4X) out.fmt = 4;
    else if (v === CODE_PROJ_V5) out.fmt = 5;
    else if (v === CODE_TUNE_X2X) {
      out.fmt = 2;
      out.exeVer = 0;
      return 0;
    } else if (v === CODE_TUNE_X3X) out.fmt = 3;
    else if (v === CODE_TUNE_X4X) out.fmt = 4;
    else if (v === CODE_TUNE_V5) out.fmt = 5;
    else return 10;
    const exeVer = ioGetUint16LE(desc);
    const dummy = ioGetUint16LE(desc);
    if (exeVer === null || dummy === null) return 7;
    out.exeVer = exeVer;
    return 0;
  }
  _preCountEvent(desc, pCount) {
    if (!this._bInit) return 2;
    const fmtVer = { fmt: 0, exeVer: 0 };
    let res = this._readVersion(desc, fmtVer);
    if (res !== 0) return res;
    if (fmtVer.fmt === 1) {
      pCount.value = MAX_FMTVER_X1X_EVENTNUM;
      return 0;
    }
    let count = 0;
    let c = 0;
    let bEnd = false;
    while (!bEnd) {
      const code = ioGetBytes(desc, PXTN_CODESIZE);
      if (code === null) return 7;
      switch (checkTagCode(asciiFromBytes(code))) {
        case 12:
          count += this.evels.ioReadEventNum(desc);
          break;
        case 11:
          count += this.master.ioRV5EventNum(desc);
          break;
        case 8:
          count += this.master.ioRX4xEventNum(desc);
          break;
        case 9: {
          const n = this.evels.ioReadX4xEventNum(desc);
          if (typeof n !== "number") {
            res = n;
            return res;
          }
          count += n;
          break;
        }
        case 23:
          bEnd = true;
          break;
        case 2:
        case 3:
        case 4:
        case 5:
        case 6:
          return 25;
        default: {
          const size = ioGetInt32LE(desc);
          if (size === null) return 7;
          if (!desc.seek(SEEK_CUR, size)) return 7;
          break;
        }
      }
    }
    if (fmtVer.fmt <= 3) count += PXTN_MAX_TUNE_UNIT_STRUCT * 4;
    pCount.value = count;
    return 0;
  }
  _ioReadDelay(desc) {
    if (!this._bInit) return 2;
    if (this._delayNum >= this._delayMax) return 10;
    const delay = new Delay();
    const res = delay.read(desc);
    if (res === 0) {
      this._delays[this._delayNum] = delay;
      this._delayNum++;
    }
    return res;
  }
  _ioReadOverDrive(desc) {
    if (!this._bInit) return 2;
    if (this._ovdrvNum >= this._ovdrvMax) return 10;
    const ovdrv = new OverDrive();
    const res = ovdrv.read(desc);
    if (res === 0) {
      this._ovdrvs[this._ovdrvNum] = ovdrv;
      this._ovdrvNum++;
    }
    return res;
  }
  _ioReadWoice(desc, type) {
    if (!this._bInit) return 2;
    if (this._woiceNum >= this._woiceMax) return 24;
    const woice = new Woice();
    let res;
    switch (type) {
      case 1:
        res = woice.ioMatePcmR(desc);
        break;
      case 2:
        res = woice.ioMatePtvR(desc);
        break;
      case 3:
        res = woice.ioMatePtnR(desc);
        break;
      case 4:
        res = 16;
        break;
      default:
        res = 10;
        break;
    }
    if (res !== 0) return res;
    this._woices[this._woiceNum] = woice;
    this._woiceNum++;
    return 0;
  }
  _ioReadOldUnit(desc, ver) {
    if (!this._bInit) return 2;
    if (this._unitNum >= this._unitMax) return 10;
    const unit = new Unit();
    const groupOut = { value: 0 };
    let res = 0;
    switch (ver) {
      case 1:
        if (!unit.readV1x(desc, groupOut)) res = 10;
        break;
      case 3:
        res = unit.readV3x(desc, groupOut);
        break;
      default:
        res = 10;
        break;
    }
    if (res !== 0) return res;
    if (groupOut.value >= this._groupNum) groupOut.value = this._groupNum - 1;
    this.evels.x4xReadAdd(0, this._unitNum, 13, groupOut.value);
    this.evels.x4xReadNewKind();
    this.evels.x4xReadAdd(0, this._unitNum, 12, this._unitNum);
    this.evels.x4xReadNewKind();
    this._units[this._unitNum] = unit;
    this._unitNum++;
    return 0;
  }
  _ioAssiWoiceR(desc) {
    if (!this._bInit) return 2;
    const size = ioGetInt32LE(desc);
    if (size === null) return 7;
    if (size !== 20) return 10;
    const woiceIndex = ioGetU16LE(desc);
    const rrr = ioGetU16LE(desc);
    const name = ioGetBytes(desc, PXTN_MAX_TUNEWOICENAME);
    if (woiceIndex === null || rrr === null || name === null) return 7;
    if (rrr) return 10;
    if (woiceIndex >= this._woiceNum) return 10;
    if (!this._woices[woiceIndex].setNameBuf(name, PXTN_MAX_TUNEWOICENAME)) return 3;
    return 0;
  }
  _ioAssiUnitR(desc) {
    if (!this._bInit) return 2;
    const size = ioGetInt32LE(desc);
    if (size === null) return 7;
    if (size !== 20) return 10;
    const unitIndex = ioGetU16LE(desc);
    const rrr = ioGetU16LE(desc);
    const name = ioGetBytes(desc, PXTN_MAX_TUNE_UNIT_NAME);
    if (unitIndex === null || rrr === null || name === null) return 7;
    if (rrr) return 10;
    if (unitIndex >= this._unitNum) return 10;
    if (!this._units[unitIndex].setNameBuf(name)) return 3;
    return 0;
  }
  _ioUnitNumR(desc, pNum) {
    if (!this._bInit) return 2;
    const size = ioGetInt32LE(desc);
    if (size === null) return 7;
    if (size !== 4) return 10;
    const num = ioGetU16LE(desc);
    const rrr = ioGetU16LE(desc);
    if (num === null || rrr === null) return 7;
    if (rrr) return 10;
    if (num > this._unitMax) return 9;
    if (num < 0) return 10;
    pNum.value = num;
    return 0;
  }
  _readTuneItems(desc) {
    if (!this._bInit) return 2;
    let bEnd = false;
    while (!bEnd) {
      const code = ioGetBytes(desc, PXTN_CODESIZE);
      if (code === null) return 7;
      switch (checkTagCode(asciiFromBytes(code))) {
        case 1:
          return 4;
        case 10: {
          const num = { value: 0 };
          const res = this._ioUnitNumR(desc, num);
          if (res !== 0) return res;
          for (let i = 0; i < num.value; i++) this._units[i] = new Unit();
          this._unitNum = num.value;
          break;
        }
        case 11: {
          const res = this.master.ioRV5(desc);
          if (res !== 0) return res;
          break;
        }
        case 12: {
          const res = this.evels.ioRead(desc);
          if (res !== 0) return res;
          break;
        }
        case 13: {
          const res = this._ioReadWoice(
            desc,
            1
            /* PCM */
          );
          if (res !== 0) return res;
          break;
        }
        case 14: {
          const res = this._ioReadWoice(
            desc,
            2
            /* PTV */
          );
          if (res !== 0) return res;
          break;
        }
        case 15: {
          const res = this._ioReadWoice(
            desc,
            3
            /* PTN */
          );
          if (res !== 0) return res;
          break;
        }
        case 16:
          return 16;
        case 17: {
          const res = this._ioReadDelay(desc);
          if (res !== 0) return res;
          break;
        }
        case 18: {
          const res = this._ioReadOverDrive(desc);
          if (res !== 0) return res;
          break;
        }
        case 19:
          if (!this.text.nameR(desc)) return 7;
          break;
        case 20:
          if (!this.text.commentR(desc)) return 7;
          break;
        case 22: {
          const res = this._ioAssiWoiceR(desc);
          if (res !== 0) return res;
          break;
        }
        case 21: {
          const res = this._ioAssiUnitR(desc);
          if (res !== 0) return res;
          break;
        }
        case 23:
          bEnd = true;
          break;
        case 8: {
          const res = this.master.ioRX4x(desc);
          if (res !== 0) return res;
          break;
        }
        case 9: {
          const res = this.evels.ioUnitReadX4xEvent(desc, false, true);
          if (res !== 0) return res;
          break;
        }
        case 7: {
          const res = this._ioReadOldUnit(desc, 3);
          if (res !== 0) return res;
          break;
        }
        case 2:
          if (!this._x1xProjectRead(desc)) return 7;
          break;
        case 3: {
          const res = this._ioReadOldUnit(desc, 1);
          if (res !== 0) return res;
          break;
        }
        case 4: {
          const res = this._ioReadWoice(
            desc,
            1
            /* PCM */
          );
          if (res !== 0) return res;
          break;
        }
        case 5: {
          const res = this.evels.ioUnitReadX4xEvent(desc, true, false);
          if (res !== 0) return res;
          break;
        }
        case 6:
          bEnd = true;
          break;
        default:
          return 10;
      }
    }
    return 0;
  }
  read(desc) {
    if (!this._bInit) return 2;
    let res = 0;
    const exeVer = { value: 0 };
    const fmtVer = { fmt: 0, exeVer: 0 };
    const eventNum = { value: 0 };
    this.clear();
    res = this._preCountEvent(desc, eventNum);
    if (res !== 0) return res;
    desc.seek(SEEK_SET, 0);
    if (this._bFixEvelsNum) {
      if (eventNum.value > this.evels.numMax) return 23;
    } else {
      if (!this.evels.allocate(eventNum.value)) return 13;
    }
    res = this._readVersion(desc, fmtVer);
    if (res !== 0) return res;
    void exeVer;
    if (fmtVer.fmt >= 5) this.evels.linearStart();
    else this.evels.x4xReadStart();
    res = this._readTuneItems(desc);
    if (res !== 0) return res;
    if (fmtVer.fmt >= 5) this.evels.linearEnd(true);
    if (fmtVer.fmt <= 3) {
      if (!this._x3xTuningKeyEvent()) return 27;
      if (!this._x3xAddTuningEvent()) return 26;
      this._x3xSetVoiceNames();
    }
    if (this._bEdit && this.master.beatClock !== EVENTDEFAULT_BEATCLOCK) return 5;
    const clock1 = this.evels.maxClock;
    const clock2 = this.master.lastClock;
    if (clock1 > clock2) this.master.adjustMeasNum(clock1);
    else this.master.adjustMeasNum(clock2);
    this._mooBValidData = true;
    return 0;
  }
  _x3xTuningKeyEvent() {
    if (!this._bInit) return false;
    if (this._unitNum > this._woiceNum) return false;
    for (let u = 0; u < this._unitNum; u++) {
      if (u >= this._woiceNum) return false;
      const changeValue = this._woices[u].x3xBasicKey - EVENTDEFAULT_BASICKEY;
      if (!this.evels.countByUnitKind(
        u,
        2
        /* KEY */
      )) {
        this.evels.recordAddI(0, u, 2, 24576);
      }
      this.evels.recordValueChange(0, -1, u, 2, changeValue);
    }
    return true;
  }
  _x3xAddTuningEvent() {
    if (!this._bInit) return false;
    if (this._unitNum > this._woiceNum) return false;
    for (let u = 0; u < this._unitNum; u++) {
      const tuning = this._woices[u].x3xTuning;
      if (tuning) this.evels.recordAddF(0, u, 14, tuning);
    }
    return true;
  }
  _x3xSetVoiceNames() {
    for (let i = 0; i < this._woiceNum; i++) {
      const name = `voice_${String(i).padStart(2, "0")}`;
      this._woices[i].setNameBuf(name, 8);
    }
  }
  // x1x project..(36byte)
  _x1xProjectRead(desc) {
    if (!this._bInit) return false;
    const size = ioGetInt32LE(desc);
    if (size === null) return false;
    void size;
    const name = ioGetBytes(desc, 16);
    if (name === null) return false;
    const beatTempo = ioGetFloatLE(desc);
    const beatClock = ioGetU16LE(desc);
    const beatNum = ioGetU16LE(desc);
    if (beatTempo === null || beatClock === null || beatNum === null) return false;
    void ioGetU16LE(desc);
    void ioGetU16LE(desc);
    void ioGetU16LE(desc);
    void ioGetU16LE(desc);
    void ioGetUint32LE(desc);
    let ns = 0;
    for (; ns < 16; ns++) {
      if (!name[ns]) break;
    }
    this.text.setNameBuf(name.subarray(0, ns));
    this.master.set(beatNum, beatTempo, beatClock);
    return true;
  }
  // ---------- write ----------
  write(desc, bTune, exeVer) {
    if (!this._bInit) return 2;
    const rough = bTune ? 10 : 1;
    const code = bTune ? CODE_TUNE_V5 : CODE_PROJ_V5;
    writeAscii3(desc, code);
    ioPutU16LE(desc, exeVer);
    ioPutU16LE(desc, 0);
    writeAscii3(desc, CODE_MASTERV5);
    if (!this.master.ioWV5(desc, rough)) return 6;
    writeAscii3(desc, CODE_EVENT_V5);
    if (!this.evels.ioWrite(desc, rough)) return 6;
    if (this.text.hasName) {
      writeAscii3(desc, CODE_TEXTNAME);
      if (!this.text.nameW(desc)) return 6;
    }
    if (this.text.hasComment) {
      writeAscii3(desc, CODE_TEXTCOMM);
      if (!this.text.commentW(desc)) return 6;
    }
    for (let d = 0; d < this._delayNum; d++) {
      writeAscii3(desc, CODE_EFFEDELA);
      if (!this._delays[d].write(desc)) return 6;
    }
    for (let o = 0; o < this._ovdrvNum; o++) {
      writeAscii3(desc, CODE_EFFEOVER);
      if (!this._ovdrvs[o].write(desc)) return 6;
    }
    for (let w = 0; w < this._woiceNum; w++) {
      const pW = this._woices[w];
      switch (pW.type) {
        case 1:
          writeAscii3(desc, CODE_MATEPCM);
          if (!pW.ioMatePcmW(desc)) return 6;
          break;
        case 2:
          writeAscii3(desc, CODE_MATEPTV);
          if (!pW.ioMatePtvW(desc)) return 6;
          break;
        case 3:
          writeAscii3(desc, CODE_MATEPTN);
          if (!pW.ioMatePtnW(desc)) return 6;
          break;
        case 4:
          return 16;
        default:
          return 12;
      }
      if (!bTune && pW.isNameBuf()) {
        writeAscii3(desc, CODE_ASSIWOIC);
        if (!this._ioAssiWoiceW(desc, w)) return 6;
      }
    }
    writeAscii3(desc, CODE_NUM_UNIT);
    if (!this._ioUnitNumW(desc)) return 6;
    for (let u = 0; u < this._unitNum; u++) {
      if (!bTune && this._units[u].isNameBuf()) {
        writeAscii3(desc, CODE_ASSIUNIT);
        if (!this._ioAssiUnitW(desc, u)) return 6;
      }
    }
    writeAscii3(desc, CODE_PXTONEND);
    ioPutInt32LE(desc, 0);
    return 0;
  }
  _ioAssiWoiceW(desc, idx) {
    if (!this._bInit) return false;
    const name = this._woices[idx].getNameBuf();
    if (this._woices[idx].nameSize > PXTN_MAX_TUNEWOICENAME) return false;
    ioPutInt32LE(desc, 20);
    ioPutU16LE(desc, idx);
    ioPutU16LE(desc, 0);
    for (let i = 0; i < PXTN_MAX_TUNEWOICENAME; i++) {
      ioPutU8(desc, i < name.length ? name[i] : 0);
    }
    return true;
  }
  _ioAssiUnitW(desc, idx) {
    if (!this._bInit) return false;
    const name = this._units[idx].name;
    ioPutInt32LE(desc, 20);
    ioPutU16LE(desc, idx);
    ioPutU16LE(desc, 0);
    for (let i = 0; i < PXTN_MAX_TUNE_UNIT_NAME; i++) {
      ioPutU8(desc, i < name.length ? name.charCodeAt(i) : 0);
    }
    return true;
  }
  _ioUnitNumW(desc) {
    if (!this._bInit) return false;
    ioPutInt32LE(desc, 4);
    ioPutU16LE(desc, this._unitNum);
    ioPutU16LE(desc, 0);
    return true;
  }
  // ---------- Moo (レンダラー) ----------
  mooIsValidData() {
    if (!this._bInit) return false;
    return this._mooBValidData;
  }
  mooIsEndVomit() {
    if (!this._bInit) return true;
    return this._mooBEndVomit;
  }
  mooGetNowClock() {
    if (!this._bInit) return 0;
    if (this._mooClockRate) return Math.trunc(this._mooSmpCount / this._mooClockRate);
    return 0;
  }
  mooGetEndClock() {
    if (!this._bInit) return 0;
    if (this._mooClockRate) return Math.trunc(this._mooSmpEnd / this._mooClockRate);
    return 0;
  }
  mooSetMuteByUnit(b) {
    if (!this._bInit) return false;
    this._mooBMuteByUnit = b;
    return true;
  }
  mooSetLoop(b) {
    if (!this._bInit) return false;
    this._mooBLoop = b;
    return true;
  }
  mooSetFade(fade, sec) {
    if (!this._bInit) return false;
    this._mooFadeMax = Math.trunc(this._dstSps * sec) >> 8;
    if (fade < 0) {
      this._mooFadeFade = -1;
      this._mooFadeCount = this._mooFadeMax << 8;
    } else if (fade > 0) {
      this._mooFadeFade = 1;
      this._mooFadeCount = 0;
    } else {
      this._mooFadeFade = 0;
      this._mooFadeCount = 0;
    }
    return true;
  }
  mooSetMasterVolume(v) {
    if (!this._bInit) return false;
    if (v < 0) v = 0;
    if (v > 1) v = 1;
    this._mooMasterVol = v;
    return true;
  }
  mooGetSamplingOffset() {
    if (!this._bInit) return 0;
    if (this._mooBEndVomit) return 0;
    return this._mooSmpCount;
  }
  mooGetSamplingEnd() {
    if (!this._bInit) return 0;
    if (this._mooBEndVomit) return 0;
    return this._mooSmpEnd;
  }
  mooGetTotalSample() {
    if (!this._bInit) return 0;
    if (!this._mooBValidData) return 0;
    return pxtnServiceMooCalcSampleNum(this.master.measNum, this.master.beatNum, this._dstSps, this.master.beatTempo);
  }
  mooPreparation(prep) {
    if (!this._bInit || !this._mooBValidData || !this._dstChNum || !this._dstSps || !this._dstBytePerSmp) {
      this._mooBEndVomit = true;
      return false;
    }
    let startMeas = 0;
    let startSample = 0;
    let startFloat = 0;
    let measEnd = this.master.playMeas;
    let measRepeat = this.master.repeatMeas;
    let fadeinSec = 0;
    if (prep) {
      startMeas = prep.startPosMeas;
      startSample = prep.startPosSample;
      startFloat = prep.startPosFloat;
      if (prep.measEnd) measEnd = prep.measEnd;
      if (prep.measRepeat) measRepeat = prep.measRepeat;
      if (prep.fadeinSec) fadeinSec = prep.fadeinSec;
      if (prep.flags & PXTN_VOMIT_PREP_FLAG_UNIT_MUTE) this._mooBMuteByUnit = true;
      else this._mooBMuteByUnit = false;
      if (prep.flags & PXTN_VOMIT_PREP_FLAG_LOOP) this._mooBLoop = true;
      else this._mooBLoop = false;
      this._mooMasterVol = prep.masterVolume;
    }
    this._mooBtClock = this.master.beatClock;
    this._mooBtNum = this.master.beatNum;
    this._mooBtTempo = this.master.beatTempo;
    this._mooClockRate = 60 * this._dstSps / (this._mooBtTempo * this._mooBtClock);
    this._mooSmpStride = 44100 / this._dstSps;
    this._mooTop = 32767;
    this._mooTimePanIndex = 0;
    this._mooSmpEnd = Math.trunc(measEnd * this._mooBtNum * this._mooBtClock * this._mooClockRate);
    this._mooSmpRepeat = Math.trunc(measRepeat * this._mooBtNum * this._mooBtClock * this._mooClockRate);
    if (startFloat) this._mooSmpStart = Math.trunc(this.mooGetTotalSample() * startFloat);
    else if (startSample) this._mooSmpStart = startSample;
    else this._mooSmpStart = Math.trunc(startMeas * this._mooBtNum * this._mooBtClock * this._mooClockRate);
    this._mooSmpCount = this._mooSmpStart;
    this._mooSmpSmooth = Math.trunc(this._dstSps / 250);
    if (fadeinSec > 0) this.mooSetFade(1, fadeinSec);
    else this.mooSetFade(0, 0);
    this.tonesClear();
    this._mooRecords = this.evels.records;
    this._mooPEve = 0;
    this._mooInitUnitTone();
    this._mooBEndVomit = false;
    return true;
  }
  // 1サンプル分を合成して [L,R] を返す。終了時は null
  _mooPxtoneSample() {
    for (let u = 0; u < this._unitNum; u++) this._units[u].toneEnvelope();
    const clock = Math.trunc(this._mooSmpCount / this._mooClockRate);
    const records = this._mooRecords;
    for (; this._mooPEve >= 0 && this._mooPEve < records.length && records[this._mooPEve].clock <= clock; this._mooPEve++) {
      const eve = records[this._mooPEve];
      const u = eve.unitNo;
      const pU = this._units[u];
      switch (eve.kind) {
        case 1: {
          const onCount = Math.trunc((eve.clock + eve.value - clock) * this._mooClockRate);
          if (onCount <= 0) {
            pU.toneZeroLives();
            break;
          }
          pU.toneKeyOn();
          const pWc = pU.woice;
          if (!pWc) break;
          for (let v = 0; v < pWc.voiceNum; v++) {
            const pTone = pU.getTone(v);
            const pVi = pWc.getInstance(v);
            if (pVi.envRelease) {
              const maxLifeCount1 = Math.trunc((eve.value - (clock - eve.clock)) * this._mooClockRate) + pVi.envRelease;
              let maxLifeCount2;
              const c = eve.clock + eve.value + pTone.envReleaseClock;
              let next = null;
              for (let q = this._mooPEve + 1; q < records.length; q++) {
                const p = records[q];
                if (p.clock > c) break;
                if (p.unitNo === u && p.kind === 1) {
                  next = p;
                  break;
                }
              }
              if (!next) maxLifeCount2 = this._mooSmpEnd - Math.trunc(clock * this._mooClockRate);
              else maxLifeCount2 = Math.trunc((next.clock - clock) * this._mooClockRate);
              if (maxLifeCount1 < maxLifeCount2) pTone.lifeCount = maxLifeCount1;
              else pTone.lifeCount = maxLifeCount2;
            } else {
              pTone.lifeCount = Math.trunc((eve.value - (clock - eve.clock)) * this._mooClockRate);
            }
            if (pTone.lifeCount > 0) {
              pTone.onCount = onCount;
              pTone.smpPos = 0;
              pTone.envPos = 0;
              if (pVi.envSize) pTone.envVolume = pTone.envStart = 0;
              else pTone.envVolume = pTone.envStart = 128;
            }
          }
          break;
        }
        case 2:
          pU.toneKey(eve.value);
          break;
        case 3:
          pU.tonePanVolume(this._dstChNum, eve.value);
          break;
        case 15:
          pU.tonePanTime(this._dstChNum, eve.value, this._dstSps);
          break;
        case 4:
          pU.toneVelocity(eve.value);
          break;
        case 5:
          pU.toneVolume(eve.value);
          break;
        case 6:
          pU.tonePortament(Math.trunc(eve.value * this._mooClockRate));
          break;
        case 7:
        case 8:
        case 9:
        case 10:
        case 11:
          break;
        case 12:
          this._mooResetVoiceOn(pU, eve.value);
          break;
        case 13:
          pU.toneGroupNo(eve.value);
          break;
        case 14:
          pU.toneTuning(int32ToFloat(eve.value));
          break;
      }
    }
    for (let u = 0; u < this._unitNum; u++) {
      this._units[u].toneSample(this._mooBMuteByUnit, this._dstChNum, this._mooTimePanIndex, this._mooSmpSmooth);
    }
    const out = [0, 0];
    for (let ch = 0; ch < this._dstChNum; ch++) {
      this._mooGroupSmps.fill(0);
      for (let u = 0; u < this._unitNum; u++) this._units[u].toneSupple(this._mooGroupSmps, ch, this._mooTimePanIndex);
      for (let o = 0; o < this._ovdrvNum; o++) this._ovdrvs[o].toneSupple(this._mooGroupSmps);
      for (let d = 0; d < this._delayNum; d++) this._delays[d].toneSupple(ch, this._mooGroupSmps);
      let work = 0;
      for (let g = 0; g < this._groupNum; g++) work += this._mooGroupSmps[g];
      if (this._mooFadeFade) work = Math.trunc(work * (this._mooFadeCount >> 8) / this._mooFadeMax);
      work = Math.trunc(work * this._mooMasterVol);
      if (work > this._mooTop) work = this._mooTop;
      if (work < -this._mooTop) work = -this._mooTop;
      out[ch] = work;
    }
    this._mooSmpCount++;
    this._mooTimePanIndex = this._mooTimePanIndex + 1 & PXTN_BUFSIZE_TIMEPAN - 1;
    for (let u = 0; u < this._unitNum; u++) {
      const keyNow = this._units[u].toneIncrementKey();
      this._units[u].toneIncrementSample(this._mooFreq.get2(keyNow) * this._mooSmpStride);
    }
    for (let d = 0; d < this._delayNum; d++) this._delays[d].toneIncrement();
    if (this._mooFadeFade < 0) {
      if (this._mooFadeCount > 0) this._mooFadeCount--;
      else return null;
    } else if (this._mooFadeFade > 0) {
      if (this._mooFadeCount < this._mooFadeMax << 8) this._mooFadeCount++;
      else this._mooFadeFade = 0;
    }
    if (this._mooSmpCount >= this._mooSmpEnd) {
      if (!this._mooBLoop) return null;
      this._mooSmpCount = this._mooSmpRepeat;
      this._mooPEve = 0;
      this._mooInitUnitTone();
    }
    return out;
  }
  _mooResetVoiceOn(pU, w) {
    if (!this._bInit) return false;
    const pWc = this.woiceGet(w);
    if (!pWc) return false;
    pU.setWoice(pWc);
    for (let v = 0; v < pWc.voiceNum; v++) {
      const pInst = pWc.getInstance(v);
      const pVc = pWc.getVoice(v);
      let ofsFreq = 0;
      if (pVc.voiceFlags & PTV_VOICEFLAG_BEATFIT) {
        ofsFreq = pInst.smpBodyW * this._mooBtTempo / (44100 * 60 * pVc.tuning);
      } else {
        ofsFreq = this._mooFreq.get(EVENTDEFAULT_BASICKEY - pVc.basicKey) * pVc.tuning;
      }
      pU.toneResetAnd2prm(v, Math.trunc(pInst.envRelease / this._mooClockRate), ofsFreq);
    }
    return true;
  }
  _mooInitUnitTone() {
    if (!this._bInit) return false;
    for (let u = 0; u < this._unitNum; u++) {
      const pU = this._units[u];
      pU.toneInit();
      this._mooResetVoiceOn(pU, EVENTDEFAULT_VOICENO);
    }
    return true;
  }
  // バッファへ出力。buf は Int16Array、長さ = smpNum * _dstChNum
  Moo(buf, smpNum) {
    if (!this._bInit) return false;
    if (!this._mooBValidData) return false;
    if (this._mooBEndVomit) return false;
    let smpW = 0;
    for (smpW = 0; smpW < smpNum; smpW++) {
      const sample = this._mooPxtoneSample();
      if (sample === null) {
        this._mooBEndVomit = true;
        break;
      }
      for (let ch = 0; ch < this._dstChNum; ch++) buf[smpW * this._dstChNum + ch] = sample[ch];
    }
    for (; smpW < smpNum; smpW++) {
      for (let ch = 0; ch < this._dstChNum; ch++) buf[smpW * this._dstChNum + ch] = 0;
    }
    return true;
  }
};
function pxtnServiceMooCalcSampleNum(measNum, beatNum, sps, beatTempo) {
  if (!beatTempo) return 0;
  const totalBeatNum = measNum * beatNum;
  return Math.trunc(sps * 60 * totalBeatNum / beatTempo);
}
function writeAscii3(desc, s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  desc.write(b, 1, b.length);
}

// src/engine/player-worklet.ts
var BLOCK_SIZE = 128;
var PxtoneWorkletProcessor = class extends AudioWorkletProcessor {
  service = null;
  scratch = new Int16Array(BLOCK_SIZE * 2);
  loaded = false;
  playing = false;
  sps = 44100;
  loop = false;
  volume = 1;
  mutedUnits = [];
  lastPosNotifySample = -1;
  constructor() {
    super();
    this.port.onmessage = (e) => this.onMessage(e.data);
  }
  post(msg) {
    this.port.postMessage(msg);
  }
  onMessage(msg) {
    switch (msg.type) {
      case "load":
        this.doLoad(msg.bytes, msg.sps);
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
  applyMute() {
    const svc = this.service;
    if (!svc) return;
    svc.mooSetMuteByUnit(true);
    for (let u = 0; u < svc.unitNum; u++) {
      svc.unitGet(u)?.setPlayed(!this.mutedUnits.includes(u));
    }
  }
  doLoad(bytes, sps) {
    this.sps = sps;
    const svc = new Service();
    let error = "";
    const ok = (() => {
      if (svc.initCollage(5e5) !== PxtnErr.OK) {
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
    if (ok) {
      this.applyMute();
      this.reseek(0);
    }
    this.post({
      type: "loaded",
      ok,
      error,
      totalSample: ok ? svc.mooGetSamplingEnd() : 0
    });
  }
  // 再生位置を再設定 (シーク / 曲末からの再開)。ループ・ミュート・音量を維持する
  reseek(sample) {
    if (!this.service) return;
    const svc = this.service;
    const max = svc.mooGetSamplingEnd();
    const s = Math.max(0, Math.min(max, Math.trunc(sample)));
    const prep = {
      startPosMeas: 0,
      startPosSample: s,
      startPosFloat: 0,
      measEnd: 0,
      measRepeat: 0,
      fadeinSec: 0,
      flags: (this.loop ? PXTN_VOMIT_PREP_FLAG_LOOP : 0) | PXTN_VOMIT_PREP_FLAG_UNIT_MUTE,
      masterVolume: this.volume
    };
    svc.mooPreparation(prep);
  }
  process(_inputs, outputs) {
    const out = outputs[0];
    if (!out || out.length === 0) return true;
    const chNum = out.length;
    const block = out[0].length;
    if (!this.service || !this.loaded || !this.playing) {
      for (let ch = 0; ch < chNum; ch++) out[ch].fill(0);
      return true;
    }
    const svc = this.service;
    svc.Moo(this.scratch.subarray(0, block * chNum), block);
    for (let i = 0; i < block; i++) {
      for (let ch = 0; ch < chNum; ch++) {
        out[ch][i] = this.scratch[i * chNum + ch] / 32768;
      }
    }
    if (svc.mooIsEndVomit()) {
      this.playing = false;
      this.post({ type: "ended" });
    } else {
      const pos = svc.mooGetSamplingOffset();
      if (pos - this.lastPosNotifySample >= Math.trunc(this.sps / 10)) {
        this.lastPosNotifySample = pos;
        this.post({ type: "position", sample: pos });
      }
    }
    return true;
  }
};
registerProcessor("pxtone-player", PxtoneWorkletProcessor);
