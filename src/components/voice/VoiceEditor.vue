<script setup lang="ts">
// ptVoice (PTV 音源エディタ) の全体レイアウト。
// 左から A面 / B面 (波形+エンベロープ) / 縦型ピアノロール の3カラム。
// ツールバーのパラメータ (ボリューム/パン/チューニング/基本キー) はアクティブ面に適用する。
import { computed, ref, watch } from "vue";
import { currentVoice, newVoice, editVoice } from "../../state/voice";
import VoiceSidePane from "./VoiceSidePane.vue";
import VoicePianoRoll from "./VoicePianoRoll.vue";
import { t } from "../../i18n";

// v-show で常時マウントされるため、ピアノロール (Space) にはモード判定を渡す
const props = defineProps<{ active: boolean }>();

const voice = computed(() => currentVoice());
const rev = ref(0);
function touch(): void {
  rev.value++;
}

// アクティブ面 (ツールバーの編集対象)。面ヘッダのクリックで切替
const activeSide = ref(0);

function vcActive() {
  const v = voice.value;
  if (!v) return null;
  const s = Math.min(activeSide.value, v.woice.voiceNum - 1);
  return v.woice.getVoice(s);
}

function setVoiceUnit(fn: (c: NonNullable<ReturnType<typeof vcActive>>) => void): void {
  editVoice(() => {
    const c = vcActive();
    if (c) fn(c);
  });
  touch();
}

// getter は rev を参照して undo/redo 後の再描画でも最新値を返す
const volumeModel = computed({
  get: () => {
    void rev.value;
    return vcActive()?.volume ?? 64;
  },
  set: (v: number) => setVoiceUnit((c) => (c.volume = Math.max(0, Math.min(128, Math.round(v))))),
});
const panModel = computed({
  get: () => {
    void rev.value;
    return vcActive()?.pan ?? 64;
  },
  set: (v: number) => setVoiceUnit((c) => (c.pan = Math.max(0, Math.min(128, Math.round(v))))),
});
const tuningModel = computed({
  get: () => {
    void rev.value;
    return vcActive()?.tuning ?? 1;
  },
  set: (v: number) => setVoiceUnit((c) => (c.tuning = Math.max(0.1, Math.min(4, v)))),
});
const basicKeyModel = computed({
  get: () => {
    void rev.value;
    return (vcActive()?.basicKey ?? 0x4500) / 256;
  },
  set: (v: number) => setVoiceUnit((c) => (c.basicKey = Math.max(0, Math.min(127, Math.round(v))) * 256)),
});

// タブ切替でアクティブ面をリセット、undo/redo 後に再描画
watch(
  () => voice.value,
  () => {
    activeSide.value = 0;
  },
);
watch(
  () => [voice.value?.undoStack.length, voice.value?.redoStack.length],
  () => touch(),
);
</script>

<template>
  <div class="voice-editor">
    <div v-if="!voice" class="editor-empty">
      <h2>{{ t("voice.title") }}</h2>
      <p>{{ t("voice.empty") }}</p>
      <button class="btn btn-accent" @click="newVoice()">{{ t("menu.file.new") }}</button>
    </div>
    <template v-else>
      <div class="ve-toolbar">
        <span class="ve-active">{{ activeSide === 0 ? t("voice.sideA") : t("voice.sideB") }}</span>
        <label>{{ t("voice.volume") }} <input v-model.number="volumeModel" type="number" min="0" max="128" class="num" /></label>
        <label>{{ t("voice.pan") }} <input v-model.number="panModel" type="number" min="0" max="128" class="num" /></label>
        <label>{{ t("voice.tuning") }} <input v-model.number="tuningModel" type="number" min="0.1" max="4" step="0.01" class="num" /></label>
        <label>{{ t("voice.basicKey") }} <input v-model.number="basicKeyModel" type="number" min="0" max="127" class="num" /></label>
      </div>
      <div class="ve-body">
        <VoiceSidePane :side="0" @activate="activeSide = 0" />
        <VoiceSidePane :side="1" @activate="activeSide = 1" />
        <VoicePianoRoll :edit-rev="rev" :active="props.active" />
      </div>
    </template>
  </div>
</template>

<style scoped>
.voice-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  background: var(--background);
}

.editor-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--muted-foreground);
  text-align: center;
  white-space: pre-line;
}

.ve-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 4px 6px;
  border-bottom: 1px solid var(--border);
  font-size: 12px;
  color: var(--muted-foreground);
  user-select: none;
}

.ve-active {
  font-weight: bold;
  color: var(--foreground);
}

.ve-toolbar input {
  font-size: 12px;
  background: var(--card);
  color: var(--foreground);
  border: 1px solid var(--border);
}

.ve-toolbar .num {
  width: 64px;
  padding: 1px 4px;
}

.ve-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 6px;
}
</style>
