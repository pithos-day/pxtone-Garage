// 音声 (.ptvoice) ドキュメント管理。
// タブ管理・undo スタックは doc-tabs.ts の共通実装を使い、
// ここでは実体 (Woice) の読み書きと編集ルールだけを提供する。
import { markRaw } from "vue";
import {
  Woice,
  WoiceType,
  VoiceType,
  MemoryIo,
  PxtnErr,
  PTV_VOICEFLAG_SMOOTH,
  PTV_VOICEFLAG_WAVELOOP,
  PTV_DATAFLAG_WAVE,
  PTV_DATAFLAG_ENVELOPE,
} from "pxtone-ts";
import type { VoiceUnit } from "pxtone-ts";
import { pxtnErrorMessage } from "./project";
import { createDocTabs, type TabDocBase } from "./doc-tabs";

const WAVE_RESO = 256; // 本家 ptvCOODINATERESOLUTION
const MAX_ENVE_POINT = 31; // 本家 ptvMAX_ENVELOPEPOINT

export interface VoiceDoc extends TabDocBase {
  woice: Woice;
}

const tabs = createDocTabs<VoiceDoc>({
  snapshot: snapshotVoice,
  restore: (v, bytes) => v.woice.read(new MemoryIo(bytes), WoiceType.PTV) === PxtnErr.OK,
});

export const voices = tabs.docs;
export const currentVoiceId = tabs.currentId;

export function currentVoice(): VoiceDoc | null {
  // woice は markRaw で格納しているため実体は Woice のまま
  return tabs.current() as VoiceDoc | null;
}

// ---- Coordinate 波形の編集ルール (本家 ptuiWave.cpp 準拠) ----

// 点ドラッグ: 前後の点を越えられないよう x をクランプする (本家 _point_set)。
// idx 0 は x=0 固定 (動かせない)
export function clampWavePointX(points: { x: number }[], idx: number, x: number, reso: number): number {
  if (idx <= 0) return points[0]!.x;
  const minX = points[idx - 1]!.x;
  const maxX = idx < points.length - 1 ? points[idx + 1]!.x : reso;
  return Math.max(minX, Math.min(maxX, x));
}

// 点追加: x でソートされた位置に挿入 (本家 _point_add)。同一 x は既存点の y を更新。
// x=0 は点0 が占有するため不可、最大 maxNum 点。成功時 true
export function insertWavePoint(points: { x: number; y: number }[], x: number, y: number, maxNum: number): boolean {
  if (x <= 0) return false;
  for (let i = 0; i < points.length; i++) {
    if (x === points[i]!.x) {
      points[i]!.y = y;
      return true;
    }
    if (x < points[i]!.x) {
      points.splice(i, 0, { x, y });
      return true;
    }
  }
  if (points.length >= maxNum) return false;
  points.push({ x, y });
  return true;
}

// 本家 WoiceUnit::data_reset / default_coodinate / _envelope_default 相当のデフォルト音声。
// basic_key は本家と同じ 0x4500 - 0x0c00*2 = 0x2d00 (再生音程が本家 ptVoice と一致する)
export function createDefaultWoice(): Woice {
  const w = new Woice();
  w.voiceAllocate(2);
  for (let i = 0; i < 2; i++) {
    const vc = w.getVoice(i)!;
    // 本家 data_reset: 0x4500 - 0x0c00 * 2
    vc.basicKey = 0x2d00;
    // B面のデフォルトは本家データ上 0 だが、編集 UI の都合で 64 にする
    // (波形はゼロなので実音は出ない)
    vc.volume = 64;
    vc.pan = 64;
    vc.tuning = 1;
    vc.type = VoiceType.Coodinate;
    vc.voiceFlags = PTV_VOICEFLAG_SMOOTH | PTV_VOICEFLAG_WAVELOOP;
    vc.dataFlags = PTV_DATAFLAG_WAVE | PTV_DATAFLAG_ENVELOPE;
    vc.wave.reso = WAVE_RESO;
    if (i === 1) {
      vc.wave.num = 1;
      vc.wave.points = [{ x: 0, y: 0 }];
    } else {
      vc.wave.num = 3;
      vc.wave.points = [
        { x: 0, y: 0 },
        { x: 64, y: 64 },
        { x: 192, y: -64 },
      ];
    }
    vc.envelope.fps = 1000;
    vc.envelope.headNum = MAX_ENVE_POINT;
    vc.envelope.bodyNum = 0;
    vc.envelope.tailNum = 1;
    vc.envelope.points = [];
    for (let e = 0; e < MAX_ENVE_POINT + 1; e++) vc.envelope.points.push({ x: 0, y: 0 });
    vc.envelope.points[0] = { x: 0, y: 96 };
    vc.envelope.points[MAX_ENVE_POINT] = { x: 1, y: 0 };
  }
  return w;
}

// ---- エンベロープの編集ルール (本家 ptuiEnvelope.cpp 準拠) ----
// エンベロープ点の x は「前の点からの区間長」で、表示・編集は累積座標を使う。

export interface EnveDisplayPoint {
  index: number; // points 配列のインデックス
  x: number; // 累積 x (表示座標)
  y: number;
  interval: number; // 区間長 (points[i].x)
}

// ヘッド部 (points[0..count-1]) の表示点列。ゼロ点 (x=0,y=0, i>0) は未使用スロットとして
// スキップし、x は累積座標に変換する (本家 _put の累積描画と同じ)
export function enveDisplayPoints(points: { x: number; y: number }[], count: number): EnveDisplayPoint[] {
  const out: EnveDisplayPoint[] = [];
  let acc = 0;
  for (let i = 0; i < count; i++) {
    const p = points[i];
    if (!p) continue;
    if (i === 0 || p.x || p.y) {
      acc += p.x;
      out.push({ index: i, x: acc, y: p.y, interval: p.x });
    }
  }
  return out;
}

// 点追加: 累積座標 cx の位置に挿入 (本家 _point_add)。
// 同一累積 x は既存点の y を更新、空きスロットは末尾追加として埋める。成功時 true
export function enveInsertPoint(points: { x: number; y: number }[], maxHead: number, cx: number, y: number): boolean {
  if (cx < 0) return false;
  let cur = cx;
  for (let idx = 0; idx < maxHead; idx++) {
    const p = points[idx]!;
    if (idx > 0 && !p.x && !p.y) {
      // 最初の空きスロット = 末尾追加 (本家の add last)
      points[idx] = { x: cur, y };
      return true;
    }
    if (p.x > cur) {
      // 挿入: 後続の区間長を短縮してシフト (本家の insert)
      for (let j = maxHead - 1; j > idx; j--) points[j] = points[j - 1]!;
      points[idx + 1]!.x -= cur;
      points[idx] = { x: cur, y };
      return true;
    }
    if (p.x === cur) {
      // 同一位置 → y 更新
      points[idx]!.y = y;
      return true;
    }
    cur -= p.x;
  }
  // 末尾を超えるクリックは追加しない (本家準拠)。
  // 戻り値の true は「編集操作を受け付けた (空きスロットはない)」ことを表す
  return true;
}

// 点削除: 後続の区間長を延長してシフト (本家 _point_delete)。
// 有効点が1つのみ (points[1] が空) なら削除不可
export function enveDeletePoint(points: { x: number; y: number }[], maxHead: number, idx: number): boolean {
  if (idx <= 0 || idx >= maxHead) return false;
  if (!points[1]!.x) return false;
  if (idx < maxHead - 1 && (points[idx + 1]!.x || points[idx + 1]!.y)) {
    points[idx + 1]!.x += points[idx]!.x;
  }
  for (let i = idx; i < maxHead - 1; i++) points[i] = points[i + 1]!;
  points[maxHead - 1] = { x: 0, y: 0 };
  return true;
}

// ヘッド点ドラッグ: 累積座標 cx を前後の累積座標の間にクランプして区間長として保存する。
// (前後の点を乗り越えられないようにする。本家には無いが座標波形と同じルール)
// クランプは「有効点 (ゼロ点を除く)」を基準に行う。配列の隣接要素でクランプすると、
// 末尾の有効点の後ろはゼロ点 (区間長 0) のため accs[idx+1] == accs[idx] となり
// 右へ動かせなくなる。末尾の有効点は右方向へ自由に動かせる
export function enveSetHeadPointX(points: { x: number; y: number }[], maxHead: number, idx: number, cx: number): void {
  if (idx <= 0 || idx >= maxHead) return;
  const disp = enveDisplayPoints(points, maxHead);
  const pos = disp.findIndex((p) => p.index === idx);
  if (pos < 0) return;
  const prev = pos > 0 ? disp[pos - 1]!.x : 0;
  const next = pos < disp.length - 1 ? disp[pos + 1]!.x : -1; // -1 = 上限なし (末尾の有効点)
  const minX = prev + 1;
  const clamped = next < 0 ? Math.max(minX, cx) : Math.max(minX, Math.min(next - 1, cx));
  points[idx]!.x = clamped - prev;
}

// 音声スナップショット (undo 用)
export function snapshotVoice(v: VoiceDoc): Uint8Array | null {
  const io = new MemoryIo();
  if (v.woice.ptvWrite(io) < 0) return null;
  return io.toUint8Array();
}

// 1回の編集操作 (undo 1エントリ + dirty 化)
export function editVoice(fn: () => void): void {
  const v = currentVoice();
  if (!v) return;
  tabs.edit(v, fn);
}

// ---- 波形プリセット (本家 ptuiWavePreset.cpp 準拠) ----
export type WavePreset = 0 | 1 | 2 | 3 | 4 | 5;
export const WAVE_PRESET_LABELS = ["Sine", "Tri", "Saw", "Rect", "Rnd", "Rev"] as const;
export const WAVE_PRESET_TITLES = ["正弦波", "三角波", "鋸波", "矩形波", "ランダム", "左右逆転"] as const;

const WAVE_POINT_MAX = 31; // 本家 ptvFIXNUM_WAVE_POINT

// Random プリセットの有効点数 (1..30 の乱数)
function randomActiveNum(): number {
  return 1 + Math.floor(Math.random() * (WAVE_POINT_MAX - 1));
}

// 倍音プリセット (本家 ptuiWavePreset::_module_overtone)
function presetOvertone(vc: VoiceUnit, preset: WavePreset): void {
  const build = (): void => {
    vc.wave.points = [];
    for (let s = 0; s < WAVE_POINT_MAX; s++) vc.wave.points.push({ x: s + 1, y: 0 });
    vc.wave.num = WAVE_POINT_MAX;
  };
  switch (preset) {
    case 0: // Sine
      vc.volume = 32;
      build();
      vc.wave.points[0]!.y = 128;
      break;
    case 1: // Triangle (奇数倍音を交互 ±・3 で減衰)
      vc.volume = 28;
      {
        let v = 128;
        let i = 0;
        build();
        for (let s = 0; s < WAVE_POINT_MAX; s++) {
          if (s % 2) {
            vc.wave.points[s]!.y = 0;
          } else {
            vc.wave.points[s]!.y = i % 2 ? -Math.trunc(v) : Math.trunc(v);
            v = v / 3;
            i++;
          }
        }
      }
      break;
    case 2: // Saw
      vc.volume = 16;
      build();
      for (let s = 0; s < WAVE_POINT_MAX; s++) vc.wave.points[s]!.y = 128;
      break;
    case 3: // Rectangle (奇数倍音のみ)
      vc.volume = 24;
      build();
      for (let s = 0; s < WAVE_POINT_MAX; s++) vc.wave.points[s]!.y = s % 2 ? 0 : 128;
      break;
    case 4: // Random
      vc.volume = 28;
      {
        const work = randomActiveNum();
        build();
        for (let s = 0; s < work; s++) vc.wave.points[s]!.y = -128 + Math.floor(Math.random() * 257);
        for (let s = work; s < WAVE_POINT_MAX; s++) vc.wave.points[s]!.y = 0;
      }
      break;
    case 5: // Reverse
      for (const p of vc.wave.points) p.y *= -1;
      break;
  }
}

// 座標プリセット (本家 ptuiWavePreset::_module_coodinate)。
// points[0] = {0,0} 固定で points[1..] を構築する (本家準拠)
function presetCoodinate(vc: VoiceUnit, preset: WavePreset): void {
  const build = (pts: [number, number][]): void => {
    vc.wave.points = [{ x: 0, y: 0 }, ...pts.map(([x, y]) => ({ x, y }))];
    vc.wave.num = vc.wave.points.length;
  };
  switch (preset) {
    case 0: // Sine (14点の正弦波サンプル)
      vc.volume = 64;
      build([
        [16, 33], [32, 52], [50, 61], [64, 64], [80, 60], [96, 52], [110, 34],
        [141, -31], [160, -52], [174, -60], [192, -64], [208, -59], [224, -52], [242, -33],
      ]);
      break;
    case 1: // Triangle
      vc.volume = 64;
      build([
        [64, 64],
        [192, -64],
      ]);
      break;
    case 2: // Saw
      vc.volume = 64;
      build([
        [0, 32],
        [255, -32],
      ]);
      break;
    case 3: // Rectangle
      vc.volume = 64;
      build([
        [0, 32],
        [128, 32],
        [128, -32],
        [255, -32],
      ]);
      break;
    case 4: // Random (1..30 個の点を x でソート)
      vc.volume = 64;
      {
        const num = randomActiveNum();
        const pts: [number, number][] = [];
        for (let s = 1; s < num; s++) {
          pts.push([1 + Math.floor(Math.random() * 199), -100 + Math.floor(Math.random() * 201)]);
        }
        pts.sort((a, b) => a[0] - b[0]);
        build(pts);
      }
      break;
    case 5: // Reverse
      for (const p of vc.wave.points) p.y *= -1;
      break;
  }
}

// 現在の波形タイプ (Coordinate/Oscillator) に応じてプリセットを適用する
// (本家 ptuiWavePreset::_do_preset 相当)
export function applyWavePreset(vc: VoiceUnit, preset: WavePreset): void {
  if (vc.type === VoiceType.Overtone) presetOvertone(vc, preset);
  else presetCoodinate(vc, preset);
}

// ---- A/B 面コピー (本家 WoiceUnit::copy_ptv_voice / _copy_voice 準拠) ----
export function copyVoiceSide(srcIdx: number, dstIdx: number): void {
  editVoice(() => {
    const v = currentVoice();
    if (!v) return;
    if (srcIdx === dstIdx) return;
    const src = v.woice.getVoice(srcIdx);
    const dst = v.woice.getVoice(dstIdx);
    if (!src || !dst) return;
    dst.tuning = src.tuning;
    dst.type = src.type;
    dst.voiceFlags = src.voiceFlags;
    dst.dataFlags = src.dataFlags;
    dst.basicKey = src.basicKey;
    dst.pan = src.pan;
    dst.volume = src.volume;
    dst.envelope.fps = src.envelope.fps;
    dst.envelope.headNum = src.envelope.headNum;
    dst.envelope.bodyNum = src.envelope.bodyNum;
    dst.envelope.tailNum = src.envelope.tailNum;
    dst.envelope.points = src.envelope.points.map((p) => ({ ...p }));
    dst.wave.num = src.wave.num;
    dst.wave.reso = src.wave.reso;
    dst.wave.points = src.wave.points.map((p) => ({ ...p }));
    dst.pcm.copyFrom(src.pcm);
  });
}

export function undoVoice(): boolean {
  const v = currentVoice();
  return v ? tabs.restoreFrom(v, v.undoStack, v.redoStack) : false;
}

export function redoVoice(): boolean {
  const v = currentVoice();
  return v ? tabs.restoreFrom(v, v.redoStack, v.undoStack) : false;
}

// 新規タブを追加して切り替える
export function newVoice(): VoiceDoc {
  return tabs.add({ fileName: "", dirty: false, woice: markRaw(createDefaultWoice()), undoStack: [], redoStack: [] });
}

// アプリ起動時に1つ目のデフォルト音声を作る (既にタブがある場合は何もしない)
export function ensureInitialVoice(): void {
  if (voices.value.length === 0) {
    newVoice();
  }
}

// .ptvoice バイト列から新規タブを開く。エラーメッセージを返す (成功時 null)
export function openVoice(bytes: Uint8Array, name: string): string | null {
  const w = new Woice();
  const res = w.read(new MemoryIo(bytes), WoiceType.PTV);
  if (res !== PxtnErr.OK) return pxtnErrorMessage(res);
  tabs.replaceInitialIfPossible();
  tabs.add({ fileName: name, dirty: false, woice: markRaw(w), undoStack: [], redoStack: [] });
  return null;
}

// Collage の音色 (PTV) を ptvoice バイト列化して新規タブで開く ("音色を編集" 用)。
// 成功時 true。編集内容はコピーであり、元の Collage の音色には影響しない
export function openWoiceAsVoice(w: Woice, name: string): boolean {
  const io = new MemoryIo();
  if (w.ptvWrite(io) < 0) return false;
  return openVoice(io.toUint8Array(), name) === null;
}

export function closeVoice(id: number): void {
  tabs.close(id);
}

export function switchVoice(id: number): void {
  tabs.switchTo(id);
}

// 現在の音声を .ptvoice として保存 (asNew でファイル名入力を促す)
export async function saveVoice(asNew: boolean): Promise<boolean> {
  const v = currentVoice();
  if (!v) return false;
  return tabs.save(v, asNew, ".ptvoice");
}
