<script setup lang="ts">
// Voice エディタの1面分 (A面/B面)。
// 上から Coordinate/Oscillator 切替とプリセット、波形モニター (本家 ptuiWave 準拠の生成波形表示)、
// Vol/Pan/補正値/Release のスライダー、点スライダー (本家 ptuiSines 準拠。
// Coordinate では n 番目の点の y 座標表示として常時表示)、エンベロープ。
// エンベロープは本家 ptuiEnvelope 準拠の「区間長 x + 累積描画」。
import { computed } from "vue";
import FillSlider from "../common/FillSlider.vue";
import VoiceEnvelopeCanvas from "./VoiceEnvelopeCanvas.vue";
import VoiceWaveCanvas from "./VoiceWaveCanvas.vue";
import { useEditRev } from "../../composables/useEditRev";
import { useUndoOnce } from "../../composables/useUndo";
import { clamp } from "../../lib/clamp";
import { enveHeadCount } from "../../lib/voice-geometry";
import { VoiceType, type VoiceUnit } from "pxtone-ts";
import {
  currentVoice,
  editVoice,
  applyWavePreset,
  applyWaveTypeData,
  WAVE_PRESET_LABELS,
  WAVE_PRESET_TITLE_KEYS,
} from "../../state/voice";
import type { WavePreset } from "../../state/voice";
import { appConfirm } from "../../state/dialog";
import { t } from "../../i18n";

const props = defineProps<{ side: number }>();
const emit = defineEmits<{ (e: "edit"): void }>();

const voice = computed(() => currentVoice());
// rev は再描画トリガー、touch はプレビューキャッシュ破棄を親へ通知する
const { rev, touch } = useEditRev(() => voice.value, () => emit("edit"));

function currentVoiceUnit(): VoiceUnit | null {
  const v = voice.value;
  if (!v) return null;
  const s = Math.min(props.side, v.woice.voiceNum - 1);
  return v.woice.getVoice(s);
}

// 子のキャンバスへ渡す今の面。実体は markRaw のため rev で追従させる
const unit = computed(() => {
  void rev.value;
  return currentVoiceUnit();
});

// 波形タイプは音色の実データから導く。別に状態を持つと、起動時の復元や undo / A・B コピーで
// データとずれる。実体は markRaw のため rev で追従させる
const waveType = computed<"coord" | "overtone">(() => {
  void rev.value;
  return currentVoiceUnit()?.type === VoiceType.Overtone ? "overtone" : "coord";
});


// ---- 面ごとのパラメータ (Vol/Pan/補正値/Release) ----
// 本家 ptuiRackFull / ptuiReleaseTime 準拠:
//   Vol     = 0..64 (右クリックで 座標=64 / 倍音=32)
//   Pan     = 0..128 (右クリックで 64)
//   補正値  = (tuning-1)*10000 ∈ ±128 (右クリックで 0 = 1.0)
//   Release = リリース区間長 1..1000 (右クリックで 1)
// getter は rev を参照して undo/redo 後の再描画でも最新値を返す
function setVoiceUnit(fn: (c: VoiceUnit) => void): void {
  editVoice(() => {
    const c = currentVoiceUnit();
    if (c) fn(c);
  });
  touch();
}

// スライダーモデル (Vol/Pan/補正値/Release) の共通ファクトリ。
// getter は rev を参照して undo/redo 後の再描画でも最新値を返す
function makeSliderModel(get: () => number, set: (v: number) => void) {
  return computed({
    get: () => {
      void rev.value;
      return get();
    },
    set,
  });
}

const volumeModel = makeSliderModel(
  () => currentVoiceUnit()?.volume ?? 64,
  (v) => setVoiceUnit((c) => (c.volume = clamp(Math.round(v), 0, 64))),
);
const panModel = makeSliderModel(
  () => currentVoiceUnit()?.pan ?? 64,
  (v) => setVoiceUnit((c) => (c.pan = clamp(Math.round(v), 0, 128))),
);
const correctModel = makeSliderModel(
  () => Math.round(((currentVoiceUnit()?.tuning ?? 1) - 1) * 10000),
  (v) => setVoiceUnit((c) => (c.tuning = 1 + clamp(Math.round(v), -128, 128) / 10000)),
);

// リリース区間長 (本家 ptuiReleaseTime 準拠)。
// スライダー表示 0..100 ↔ データ 1..1000 (×10)。スライダー 0 はデータ 1 にクランプ (tail は維持)
const releaseModel = makeSliderModel(
  () => {
    const c = currentVoiceUnit();
    if (!c) return 0;
    const hc = enveHeadCount(c);
    return c.envelope.tailNum > 0 ? Math.round((c.envelope.points[hc]?.x ?? 0) / 10) : 0;
  },
  (v) =>
    setVoiceUnit((c) => {
      const hc = enveHeadCount(c);
      // 本家 ptuiReleaseTime 準拠: スライダー 0..100 ↔ データ 1..1000 (0 は 1 にクランプ、tail は維持)
      c.envelope.tailNum = Math.max(1, c.envelope.tailNum);
      const p = c.envelope.points[hc] ?? (c.envelope.points[hc] = { x: 0, y: 0 });
      p.x = clamp(Math.round(v) * 10, 1, 1000);
    }),
);

// 右クリックで本家のデフォルト値に戻す (本家 _volume_default)
function resetVolume(): void {
  setVoiceUnit((c) => (c.volume = c.type === VoiceType.Coodinate ? 64 : 32));
}
function resetPan(): void {
  setVoiceUnit((c) => (c.pan = 64));
}
function resetCorrect(): void {
  setVoiceUnit((c) => (c.tuning = 1));
}
function resetRelease(): void {
  setVoiceUnit((c) => {
    const hc = enveHeadCount(c);
    if (c.envelope.tailNum > 0 && c.envelope.points[hc]) c.envelope.points[hc]!.x = 1;
  });
}

// ---- 波形タイプ切替 (本家 ptuiWaveHead::_set_wave_tool 準拠。切替時に波形とボリュームをリセット) ----
async function setWaveType(type: "coord" | "overtone"): Promise<void> {
  if (waveType.value === type) return;
  // 本家同様、切替前に確認する (波形とボリュームが初期値に戻るため)
  if (!(await appConfirm(t("confirm.waveType")))) return;
  editVoice(() => {
    const c = currentVoiceUnit();
    if (!c) return;
    applyWaveTypeData(c, type);
  });
  // スライダー (points 配列) を新しい波形に更新する
  touch();
}

// ---- 波形プリセット (本家 ptuiWavePreset 相当。現在の波形タイプに応じて適用) ----
function applyPreset(preset: WavePreset): void {
  setVoiceUnit((c) => applyWavePreset(c, preset));
}

// ---- スライダー (本家 ptuiSines 準拠、y のみ編集) ----
// Coordinate では n 番目の点の y 座標、Oscillator では n 倍音の音量を表す。
// 常時表示し、point[i].y を直接編集する。座標モードの点0 (i=0) は本家 _point_set 同様固定。
// rev に依存させ、波形タイプ切替や undo/redo で points 配列が置き換わっても
// 常に最新の配列を返す (markRaw のため参照の置き換えは reactive 追跡されない)
const sinePoints = computed(() => {
  void rev.value;
  return currentVoiceUnit()?.wave.points ?? [];
});
const sineUndo = useUndoOnce(() => editVoice(() => {}));
function setSine(i: number, v: number): void {
  if (waveType.value === "coord" && i === 0) return; // 座標モードの点0 は固定
  const c = currentVoiceUnit();
  if (!c || !c.wave.points[i]) return;
  c.wave.points[i]!.y = clamp(Math.round(v), -128, 128);
  touch();
}

</script>

<template>
  <!-- data-rev: markRaw の実体を直接書き換えるため rev 変化で再レンダリングを駆動する -->
  <div class="vsp" :data-rev="rev">
    <div class="vsp-header">
      <span class="vsp-side">{{ side === 0 ? t("voice.sideA") : t("voice.sideB") }}</span>
      <div class="seg" role="group" :aria-label="t('voice.waveType')">
        <button type="button" :class="{ on: waveType === 'coord' }" :aria-pressed="waveType === 'coord'" @click="setWaveType('coord')">Coordinate</button>
        <button type="button" :class="{ on: waveType === 'overtone' }" :aria-pressed="waveType === 'overtone'" @click="setWaveType('overtone')">Oscillator</button>
      </div>
      <div class="vsp-presets">
        <button
          v-for="(label, i) in WAVE_PRESET_LABELS"
          :key="i"
          type="button"
          class="chip"
          :title="t(WAVE_PRESET_TITLE_KEYS[i])"
          @click="applyPreset(i as WavePreset)"
        >
          {{ label }}
        </button>
      </div>
    </div>
    <VoiceWaveCanvas :unit="unit" :rev="rev" @update="setVoiceUnit" @touch="touch" />
    <div class="vsp-params">
      <label class="vsp-param">
        <span class="vsp-plabel">{{ t("voice.volume") }}</span>
        <FillSlider v-model="volumeModel" :min="0" :max="64" @contextmenu.prevent="resetVolume" />
        <span class="vsp-pval">{{ volumeModel }}</span>
      </label>
      <label class="vsp-param">
        <span class="vsp-plabel">{{ t("voice.pan") }}</span>
        <FillSlider v-model="panModel" :min="0" :max="128" :center="64" @contextmenu.prevent="resetPan" />
        <span class="vsp-pval">{{ panModel }}</span>
      </label>
      <label class="vsp-param">
        <span class="vsp-plabel">{{ t("voice.correct") }}</span>
        <FillSlider v-model="correctModel" :min="-128" :max="128" :center="0" @contextmenu.prevent="resetCorrect" />
        <span class="vsp-pval">{{ correctModel }}</span>
      </label>
      <label class="vsp-param">
        <span class="vsp-plabel">{{ t("voice.release") }}</span>
        <FillSlider v-model="releaseModel" :min="0" :max="100" @contextmenu.prevent="resetRelease" />
        <span class="vsp-pval">{{ releaseModel }}</span>
      </label>
    </div>
    <div class="vsp-sines-wrap">
      <div class="vsp-sines-title">{{ waveType === "coord" ? t("voice.pointY") : t("voice.overtone") }}</div>
      <div class="vsp-sines" @focusin="sineUndo.onBegin" @focusout="sineUndo.reset">
        <label v-for="(p, i) in sinePoints" :key="i" class="vsp-sine-row">
          <span class="vsp-sine-no">{{ i + 1 }}</span>
          <FillSlider
            :model-value="p.y"
            :min="-128"
            :max="128"
            :center="0"
            :disabled="waveType === 'coord' && i === 0"
            @update:model-value="setSine(i, $event)"
          />
          <span class="vsp-sine-val">{{ p.y }}</span>
        </label>
      </div>
    </div>
    <VoiceEnvelopeCanvas :unit="unit" :rev="rev" @update="setVoiceUnit" @touch="touch" />
  </div>
</template>

<style scoped>
.vsp {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  background: var(--muted);
  border-radius: var(--radius);
  padding: var(--space-lg);
}

.vsp-header {
  display: flex;
  align-items: center;
  gap: var(--space-lg);
  flex-wrap: wrap;
  user-select: none;
  flex: none;
}

.vsp-side {
  font-size: var(--text-lg);
  font-weight: bold;
  color: var(--foreground);
}

.vsp-presets {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-xs);
  margin-left: auto;
}

/* 面ごとのパラメータ (Vol/Pan/補正値/Release のスライダー) */
.vsp-params {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--space-xs) var(--space-xl);
  flex: none;
  font-size: var(--text-xs);
  color: var(--foreground);
}

.vsp-param {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  min-width: 0;
}

.vsp-plabel {
  width: 84px;
  flex: none;
  white-space: nowrap;
}

.vsp-pval {
  width: 34px;
  flex: none;
  text-align: right;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
}

.vsp-wave,
.vsp-enve {
  flex: 1;
  min-height: 50px;
  border-radius: calc(var(--radius) - 2px);
}

/* スライダーは常時表示。高さが足りなければ内部スクロール */
.vsp-sines-wrap {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2xs);
}

.vsp-sines-title {
  font-size: var(--text-xs);
  font-weight: 600;
  color: var(--foreground);
}

/* 点数が違っても A面 / B面 の波形とエンベロープの位置が揃うよう高さを固定する */
.vsp-sines {
  height: 90px;
  overflow-y: auto;
  padding-right: var(--space-xs);
  display: flex;
  flex-direction: column;
}

.vsp-sine-row {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  height: 18px;
  flex: none;
}

.vsp-sine-no {
  width: 20px;
  text-align: right;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
  flex: none;
}

.vsp-sine-val {
  width: 30px;
  text-align: right;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--foreground);
  flex: none;
}
</style>
