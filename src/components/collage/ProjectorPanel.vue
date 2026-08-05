// 曲情報パネル (フローティング) — BPM/拍子/小節数/曲名
<script setup lang="ts">
import { ref } from "vue";
import FloatingPanel from "./FloatingPanel.vue";
import { getService, title, comment, setTempo, setBeatNum, setMeasNum, setTextName, setTextComment } from "../../state/project";

const nameEdit = ref("");
const commentEdit = ref("");
const editingName = ref(false);
const editingComment = ref(false);

function tempoInput(e: Event): void {
  const v = parseFloat((e.target as HTMLInputElement).value);
  if (Number.isFinite(v) && v > 0) setTempo(v);
}

function beatInput(e: Event): void {
  const v = parseInt((e.target as HTMLInputElement).value, 10);
  if (Number.isFinite(v) && v >= 1 && v <= 16) setBeatNum(v);
}

function measInput(e: Event): void {
  const v = parseInt((e.target as HTMLInputElement).value, 10);
  if (Number.isFinite(v) && v >= 1) setMeasNum(v);
}

function onNameEdit(): void {
  const s = getService();
  if (!s) return;
  nameEdit.value = s.text.getNameString();
  editingName.value = true;
}

function commitName(): void {
  editingName.value = false;
  setTextName(nameEdit.value);
}

function onCommentEdit(): void {
  const s = getService();
  if (!s) return;
  commentEdit.value = s.text.getCommentString();
  editingComment.value = true;
}

function commitComment(): void {
  editingComment.value = false;
  setTextComment(commentEdit.value);
}
</script>

<template>
  <FloatingPanel name="projector" title="Projector" :width="230">
    <div class="proj-body">
      <div class="row">
        <label>曲名</label>
        <input
          v-if="editingName"
          v-model="nameEdit"
          type="text"
          class="grow"
          maxlength="64"
          @keydown.enter="commitName"
          @keydown.esc="editingName = false"
          @blur="commitName"
        />
        <button v-else class="link" @click="onNameEdit">{{ title || "(未設定)" }}</button>
      </div>
      <div class="row">
        <label>コメント</label>
        <button v-if="!editingComment" class="link" @click="onCommentEdit">
          {{ comment.length > 24 ? comment.slice(0, 24) + "…" : comment || "(未設定)" }}
        </button>
        <input
          v-else
          v-model="commentEdit"
          type="text"
          class="grow"
          maxlength="200"
          @keydown.enter="commitComment"
          @keydown.esc="editingComment = false"
          @blur="commitComment"
        />
      </div>
      <div class="row">
        <label>テンポ</label>
        <input type="number" min="1" max="400" :value="getService()?.master.beatTempo.toFixed(2)" step="0.01" @change="tempoInput" />
        <span class="unit">BPM</span>
      </div>
      <div class="row">
        <label>拍子</label>
        <input type="number" min="1" max="16" :value="getService()?.master.beatNum" @change="beatInput" />
        <span class="unit">拍/小節</span>
      </div>
      <div class="row">
        <label>小節数</label>
        <input type="number" min="1" max="9999" :value="getService()?.master.measNum" @change="measInput" />
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
  </FloatingPanel>
</template>

<style scoped>
.proj-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.grow {
  flex: 1;
  min-width: 0;
}

.unit {
  font-size: 10px;
  color: var(--text-dim);
}

.dim {
  font-size: 11px;
}

.dim span {
  color: var(--text-dim);
}

.link {
  border: none;
  background: transparent;
  color: var(--accent);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  padding: 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link:hover {
  text-decoration: underline;
}
</style>
