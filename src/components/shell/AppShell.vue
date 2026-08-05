<script setup lang="ts">
import { ref } from "vue";
import TabBar from "./TabBar.vue";
import CollageTab from "../collage/CollageEditor.vue";
import VoiceTab from "../voice/VoiceEditor.vue";
import NoiseTab from "../noise/NoiseEditor.vue";
import { ensureInit } from "../../state/project";
import {
  newProject as doNewProject,
  openProject,
  doc,
  title,
} from "../../state/project";
import { saveProject, openFileDialog, exportPttune, exportWav } from "../../engine/io";
import { exportBytes } from "../../state/project";
import { isPlaying, togglePlay } from "../../state/player";

const activeTab = ref<"collage" | "voice" | "noise">("collage");
const openError = ref("");

ensureInit();

async function onOpen(): Promise<void> {
  const bytes = await openFileDialog(".ptcop,.pttune");
  if (!bytes) return;
  const err = openProject(bytes);
  if (err) {
    openError.value = err;
    setTimeout(() => (openError.value = ""), 4000);
  }
}

function onNew(): void {
  if (!doc.dirty || window.confirm("未保存の変更は破棄されます。新規作成しますか?")) {
    doNewProject();
  }
}

function onSave(): void {
  const bytes = saveProject(doc.fileName || "untitled");
  if (bytes) doc.fileName = doc.fileName || "untitled";
}

function onExportPttune(): void {
  const bytes = exportBytes();
  if (bytes) exportPttune(bytes, doc.fileName || "untitled");
}

function onExportWav(): void {
  const bytes = exportBytes();
  if (bytes) {
    const err = exportWav(bytes, doc.fileName || "untitled");
    if (err) {
      openError.value = err;
      setTimeout(() => (openError.value = ""), 4000);
    }
  }
}
</script>

<template>
  <div class="app-shell">
    <TabBar v-model="activeTab" :dirty="doc.dirty" :title="title" />
    <div class="app-toolbar">
      <span class="app-title" :title="title">{{ title || "(無題)" }}</span>
      <span v-if="doc.dirty" class="app-dirty">●</span>
      <button class="btn" @click="onNew">新規</button>
      <button class="btn" @click="onOpen">開く</button>
      <button class="btn" @click="onSave">保存</button>
      <span class="sep" />
      <button class="btn" @click="onExportPttune">.pttune 書き出し</button>
      <button class="btn" @click="onExportWav">WAV 書き出し</button>
      <button class="btn btn-accent" @click="togglePlay">{{ isPlaying ? "⏸ 停止" : "▶ 再生" }}</button>
      <span v-if="openError" class="app-error">{{ openError }}</span>
    </div>
    <main class="app-main">
      <CollageTab v-show="activeTab === 'collage'" />
      <VoiceTab v-show="activeTab === 'voice'" />
      <NoiseTab v-show="activeTab === 'noise'" />
    </main>
  </div>
</template>
