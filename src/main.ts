import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { openProject, newProject, doc, getService, mutate, beginEdit, commitEdit } from './state/project'
import { play, stop, seekToClock } from './state/player'
import { undo, redo, pushUndo } from './state/undo'

createApp(App).mount('#app')

// 開発・テスト用フック
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__pxtoneGarage = {
    openProject,
    newProject,
    doc,
    getService,
    play,
    stop,
    seekToClock,
    undo,
    redo,
    pushUndo,
    mutate,
    beginEdit,
    commitEdit,
  }
}
