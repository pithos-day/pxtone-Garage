<script setup lang="ts">
// 段階1: タブシェル (コラージュエディタは段階2で組み込み)
import { ref } from "vue";
import TabBar from "./TabBar.vue";
import VoiceTab from "../voice/VoiceEditor.vue";
import NoiseTab from "../noise/NoiseEditor.vue";

const activeTab = ref<"collage" | "voice" | "noise">("collage");
</script>

<template>
  <div class="app-shell">
    <TabBar v-model="activeTab" :dirty="false" :title="''" />
    <main class="app-main">
      <div v-show="activeTab === 'collage'" class="placeholder">
        <h2>コラージュ (DAW)</h2>
        <p>イベント編集・ピアノロールを実装予定です。</p>
      </div>
      <VoiceTab v-show="activeTab === 'voice'" />
      <NoiseTab v-show="activeTab === 'noise'" />
    </main>
  </div>
</template>
