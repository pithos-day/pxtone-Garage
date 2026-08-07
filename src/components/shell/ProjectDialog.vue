// File > Project... のモーダルダイアログ。曲名/コメント/BPM/拍子/小節数を編集。
<script setup lang="ts">
import { onMounted, ref } from "vue";
import { getService, setProjectSettings } from "../../state/project";

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

function onSave(): void {
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

function onOverlayClick(e: MouseEvent): void {
  if ((e.target as HTMLElement).classList.contains("dlg-overlay")) onCancel();
}
</script>

<template>
  <div class="dlg-overlay" @click="onOverlayClick">
    <div class="dlg" role="dialog" aria-label="Project">
      <div class="dlg-title">Project</div>
      <div class="dlg-body">
        <div class="row"><label>曲名</label><input v-model="name" type="text" maxlength="64" class="grow" /></div>
        <div class="row"><label>コメント</label><input v-model="comment" type="text" maxlength="200" class="grow" /></div>
        <div class="row">
          <label>テンポ</label>
          <input v-model="tempo" type="number" min="1" max="400" step="0.01" />
          <span class="unit">BPM</span>
        </div>
        <div class="row">
          <label>拍子</label>
          <input v-model.number="beatNum" type="number" min="1" max="16" />
          <span class="unit">拍/小節</span>
        </div>
        <div class="row">
          <label>小節数</label>
          <input v-model.number="measNum" type="number" min="1" max="9999" />
        </div>
        <div class="row dim">
          <label>Repeat</label>
          <span>{{ getService()?.master.repeatMeas }} 小節目</span>
        </div>
        <div class="row dim">
          <label>Last</label>
          <span>{{ getService()?.master.lastMeas }} 小節目</span>
        </div>
      </div>
      <div class="dlg-buttons">
        <button class="btn btn-accent" @click="onSave">保存</button>
        <button class="btn" @click="onCancel">キャンセル</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dlg-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
}

.dlg {
  width: 360px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  box-shadow: 4px 4px 16px var(--shadow);
}

.dlg-title {
  padding: 8px 12px;
  font-size: 13px;
  font-weight: bold;
  color: var(--foreground);
  background: var(--muted);
  border-bottom: 1px solid var(--border);
}

.dlg-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
}

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

.dlg-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  padding: 0 12px 12px;
}
</style>
