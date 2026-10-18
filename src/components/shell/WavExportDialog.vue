// File > WAVを書き出し のオプションダイアログ (本家 dlg_BuildOption 相当)。
// 音質 (チャンネル/サンプリング周波数)・ビルド範囲・フェードアウト・ボリューム・
// ユニットミュートを設定して書き出す。直近の設定は localStorage に保存する
<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { doc, exportBytes, getService } from "../../state/project";
import { exportWav, WAV_EXPORT_DEFAULTS, type WavExportOptions, type WavExportScope } from "../../engine/io";
import { readStorage, writeStorage } from "../../lib/storage";
import { t } from "../../i18n";
import ModalDialog from "./ModalDialog.vue";

const emit = defineEmits<{ (e: "close"): void }>();

// 本家 ptConfig_cmb_quality_init と同じ選択肢
const SPS_TABLE = [11025, 22050, 44100, 48000] as const;
const STORAGE_WAV_EXPORT = "pxtone-garage-wav-export";

const chNum = ref(WAV_EXPORT_DEFAULTS.chNum);
const sps = ref(WAV_EXPORT_DEFAULTS.sps);
const scope = ref<WavExportScope>(WAV_EXPORT_DEFAULTS.scope);
const playTime = ref("0");
const extraFade = ref("0");
const volume = ref("1");
const muteByUnit = ref(WAV_EXPORT_DEFAULTS.muteByUnit);
const busy = ref(false);

// localStorage へ保存する設定 (ミュート対象は保存せず、書き出し時の現在値を使う)
type StoredWavOptions = Omit<WavExportOptions, "mutedUnits">;

// 保存済み設定を読み戻す (不正値は既定値のまま)
function restoreStored(): void {
  const raw = readStorage(STORAGE_WAV_EXPORT);
  if (!raw) return;
  try {
    const saved = JSON.parse(raw) as Partial<StoredWavOptions>;
    if (saved.chNum === 1 || saved.chNum === 2) chNum.value = saved.chNum;
    const savedSps = SPS_TABLE.find((v) => v === saved.sps);
    if (savedSps !== undefined) sps.value = savedSps;
    if (saved.scope === "topLast" || saved.scope === "byTime") scope.value = saved.scope;
    if (Number.isFinite(saved.playTimeSec)) playTime.value = String(saved.playTimeSec);
    if (Number.isFinite(saved.extraFadeSec)) extraFade.value = String(saved.extraFadeSec);
    if (Number.isFinite(saved.volume)) volume.value = String(saved.volume);
    if (typeof saved.muteByUnit === "boolean") muteByUnit.value = saved.muteByUnit;
  } catch {
    // 壊れた設定は無視して既定値を使う
  }
}

onMounted(restoreStored);

// 演奏データ情報 (本家 dlg_BuildOption の Total/Loop/Head Time と同じ計算)
const playData = computed(() => {
  const m = getService()?.master;
  if (!m || m.beatTempo <= 0) return { total: 0, loop: 0, head: 0 };
  // 本家同様、Last が設定されていればそちらを末尾とする
  const meas = m.lastMeas || m.measNum;
  const total = (meas * m.beatNum * 60) / m.beatTempo;
  const loop = ((meas - m.repeatMeas) * m.beatNum * 60) / m.beatTempo;
  return { total, loop, head: total - loop };
});

function onDefault(): void {
  chNum.value = WAV_EXPORT_DEFAULTS.chNum;
  sps.value = WAV_EXPORT_DEFAULTS.sps;
  scope.value = WAV_EXPORT_DEFAULTS.scope;
  playTime.value = String(WAV_EXPORT_DEFAULTS.playTimeSec);
  extraFade.value = String(WAV_EXPORT_DEFAULTS.extraFadeSec);
  volume.value = String(WAV_EXPORT_DEFAULTS.volume);
  muteByUnit.value = WAV_EXPORT_DEFAULTS.muteByUnit;
}

function onSubmit(): void {
  if (busy.value) return;
  const fade = Number(extraFade.value);
  const time = Number(playTime.value);
  const vol = Number(volume.value);
  // 本家 _AlarmParameter と同じ検証
  if (!Number.isFinite(fade) || fade < 0) {
    window.alert(t("wav.errFade"));
    return;
  }
  if (scope.value === "byTime" && (!Number.isFinite(time) || time <= 0)) {
    window.alert(t("wav.errPlayTime"));
    return;
  }
  if (!Number.isFinite(vol) || vol < 0.01 || vol > 1) {
    window.alert(t("wav.errVolume"));
    return;
  }
  const bytes = exportBytes();
  if (!bytes) {
    window.alert(t("error.save"));
    return;
  }
  const options: WavExportOptions = {
    chNum: chNum.value,
    sps: sps.value,
    scope: scope.value,
    playTimeSec: scope.value === "byTime" ? time : 0,
    extraFadeSec: fade,
    volume: vol,
    muteByUnit: muteByUnit.value,
    mutedUnits: [...doc.muted],
  };
  const stored: StoredWavOptions = {
    chNum: options.chNum,
    sps: options.sps,
    scope: options.scope,
    playTimeSec: options.playTimeSec,
    extraFadeSec: options.extraFadeSec,
    volume: options.volume,
    muteByUnit: options.muteByUnit,
  };
  writeStorage(STORAGE_WAV_EXPORT, JSON.stringify(stored));
  busy.value = true;
  void exportWav(bytes, doc.fileName || "untitled", options).then((err) => {
    busy.value = false;
    if (err) {
      window.alert(err);
      return;
    }
    emit("close");
  });
}
</script>

<template>
  <ModalDialog label="wav-export" width="400px" body-gap="10px" @close="emit('close')">
    <template #title>{{ t("wav.title") }}</template>
    <div class="group">
      <div class="group-title">{{ t("wav.soundQuality") }}</div>
      <div class="row">
        <label>{{ t("wav.channel") }}</label>
        <select v-model.number="chNum" class="grow">
          <option :value="1">{{ t("wav.mono") }}</option>
          <option :value="2">{{ t("wav.stereo") }}</option>
        </select>
      </div>
      <div class="row">
        <label>{{ t("wav.sps") }}</label>
        <select v-model.number="sps" class="grow">
          <option v-for="v in SPS_TABLE" :key="v" :value="v">{{ v }}Hz</option>
        </select>
      </div>
    </div>
    <div class="group">
      <div class="group-title">{{ t("wav.buildScope") }}</div>
      <div class="row">
        <select v-model="scope" class="grow">
          <option value="topLast">{{ t("wav.scopeTopLast") }}</option>
          <option value="byTime">{{ t("wav.scopeByTime") }}</option>
        </select>
      </div>
      <div class="row" :class="{ off: scope !== 'byTime' }">
        <label>{{ t("wav.playTime") }}</label>
        <input v-model="playTime" type="number" min="0" step="0.01" :disabled="scope !== 'byTime'" />
        <span class="unit">{{ t("wav.sec") }}</span>
      </div>
      <div class="row">
        <label>{{ t("wav.fadeOut") }}</label>
        <input v-model="extraFade" type="number" min="0" step="0.01" />
        <span class="unit">{{ t("wav.sec") }}</span>
      </div>
    </div>
    <div class="row">
      <label>{{ t("wav.volume") }}</label>
      <input v-model="volume" type="number" min="0.01" max="1" step="0.01" />
      <span class="unit">{{ t("wav.volumeRange") }}</span>
    </div>
    <div class="row">
      <label class="check"><input v-model="muteByUnit" type="checkbox" />{{ t("wav.muteByUnit") }}</label>
    </div>
    <div class="group">
      <div class="group-title">{{ t("wav.playData") }}</div>
      <div class="row"><label>{{ t("wav.totalTime") }}</label><span class="time">{{ playData.total.toFixed(2) }} {{ t("wav.sec") }}</span></div>
      <div class="row"><label>{{ t("wav.loopTime") }}</label><span class="time">{{ playData.loop.toFixed(2) }} {{ t("wav.sec") }}</span></div>
      <div class="row"><label>{{ t("wav.headTime") }}</label><span class="time">{{ playData.head.toFixed(2) }} {{ t("wav.sec") }}</span></div>
    </div>
    <template #buttons>
      <button class="btn" @click="onDefault">{{ t("wav.default") }}</button>
      <button class="btn btn-accent" :disabled="busy" @click="onSubmit">{{ t("wav.export") }}</button>
      <button class="btn" @click="emit('close')">{{ t("common.cancel") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  border: 1px solid var(--border);
  padding: 8px 10px;
}

.group-title {
  font-size: var(--text-sm);
  color: var(--muted-foreground);
}

.unit {
  font-size: var(--text-xs);
  color: var(--muted-foreground);
}

.check {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.time {
  font-size: var(--text-sm);
}
</style>
