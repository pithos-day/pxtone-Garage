<script setup lang="ts">
// ptVoice (PTV 音源エディタ) の全体レイアウト。
// 左から A面 / B面 (各面にパラメータ+波形+スライダー+エンベロープ) / 縦型ピアノロール の3カラム。
import { computed } from "vue";
import { currentVoice, newVoice } from "../../state/voice";
import { useEditRev } from "../../composables/useEditRev";
import VoiceSidePane from "./VoiceSidePane.vue";
import VoicePianoRoll from "./VoicePianoRoll.vue";
import { t } from "../../i18n";

// v-show で常時マウントされるため、ピアノロール (Space) にはモード判定を渡す
const props = defineProps<{ active: boolean }>();

const voice = computed(() => currentVoice());
// 音声編集リビジョン (プレビューキャッシュの破棄トリガーとしてピアノロールに渡す)
const { rev, touch } = useEditRev(() => voice.value);
</script>

<template>
  <div class="voice-editor">
    <div v-if="!voice" class="editor-empty">
      <h2>{{ t("voice.title") }}</h2>
      <p>{{ t("voice.empty") }}</p>
      <button class="btn btn-accent" @click="newVoice()">{{ t("menu.file.new") }}</button>
    </div>
    <template v-else>
      <div class="ve-body">
        <VoiceSidePane :side="0" @edit="touch" />
        <VoiceSidePane :side="1" @edit="touch" />
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
  gap: var(--space-md);
  padding: 6px;
  background: var(--background);
}

.editor-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-lg);
  color: var(--muted-foreground);
  text-align: center;
  white-space: pre-line;
}

.ve-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: var(--space-md);
}
</style>
