// File > Project... のモーダルダイアログ。曲名/コメント/BPM/拍子/小節数を編集。
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getService, doc, setProjectSettings } from "../../state/project";
import { t } from "../../i18n";
import ModalDialog from "./ModalDialog.vue";

const emit = defineEmits<{ (e: "close"): void }>();

const name = ref("");
const comment = ref("");
const tempo = ref("120.00");
const beatNum = ref(4);
const measNum = ref(16);

const original = { name: "", comment: "", tempo: 120, beatNum: 4, measNum: 16 };

onMounted(() => {
  const s = getService();
  if (!s) return;
  name.value = s.text.getNameString();
  comment.value = s.text.getCommentString();
  tempo.value = s.master.beatTempo.toFixed(2);
  beatNum.value = s.master.beatNum;
  measNum.value = s.master.measNum;
  original.name = name.value;
  original.comment = comment.value;
  original.tempo = s.master.beatTempo;
  original.beatNum = s.master.beatNum;
  original.measNum = s.master.measNum;
});

function onSubmit(): void {
  const t = parseFloat(tempo.value);
  setProjectSettings({
    name: name.value,
    comment: comment.value,
    tempo: Number.isFinite(t) && t > 0 ? t : original.tempo,
    beatNum: beatNum.value >= 1 && beatNum.value <= 16 ? beatNum.value : original.beatNum,
    measNum: measNum.value >= 1 ? measNum.value : original.measNum,
  });
  emit("close");
}

function onCancel(): void {
  const t = parseFloat(tempo.value);
  const changed =
    name.value !== original.name ||
    comment.value !== original.comment ||
    (Number.isFinite(t) && t !== original.tempo) ||
    beatNum.value !== original.beatNum ||
    measNum.value !== original.measNum;
  if (changed) {
    setProjectSettings({ ...original });
  }
  emit("close");
}
</script>

<template>
  <ModalDialog label="Project" width="360px" body-gap="8px" @close="onCancel">
    <template #title>{{ t("project.title") }}</template>
    <div class="row"><label>{{ t("project.name") }}</label><input v-model="name" type="text" maxlength="64" class="grow" /></div>
    <div class="row"><label>{{ t("project.comment") }}</label><input v-model="comment" type="text" maxlength="200" class="grow" /></div>
    <div class="row">
      <label>{{ t("project.tempo") }}</label>
      <input v-model="tempo" type="number" min="1" max="400" step="0.01" />
      <span class="unit">BPM</span>
    </div>
    <div class="row">
      <label>{{ t("project.beatNum") }}</label>
      <input v-model.number="beatNum" type="number" min="1" max="16" />
      <span class="unit">{{ t("project.beatPerMeas") }}</span>
    </div>
    <div class="row">
      <label>{{ t("project.measNum") }}</label>
      <input v-model.number="measNum" type="number" min="1" max="9999" />
    </div>
    <div class="row dim">
      <label>{{ t("project.repeat") }}</label>
      <span>{{ doc.repeatMeas }} {{ t("project.measUnit") }}</span>
    </div>
    <div class="row dim">
      <label>{{ t("project.last") }}</label>
      <span>{{ getService()?.master.lastMeas }} {{ t("project.measUnit") }}</span>
    </div>
    <template #buttons>
      <button class="btn btn-accent" @click="onSubmit">{{ t("common.save") }}</button>
      <button class="btn" @click="onCancel">{{ t("common.cancel") }}</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.grow {
  flex: 1;
  min-width: 0;
}

.unit {
  font-size: 10px;
  color: var(--muted-foreground);
}

.dim {
  font-size: 11px;
}

.dim span {
  color: var(--muted-foreground);
}
</style>
