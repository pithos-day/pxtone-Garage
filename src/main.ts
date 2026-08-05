import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { openProject, newProject, doc, getService, mutate, beginEdit, commitEdit, exportBytes, setTextComment, setTextName } from './state/project'
import { play, stop, seekToClock } from './state/player'
import { undo, redo, pushUndo } from './state/undo'
import { renderPreview, previewUnit, previewWoice } from './engine/preview'
import { MemoryIo } from 'pxtone-ts'

createApp(App).mount('#app')

// 開発・テスト用フック
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).__pxtoneGarage = {
    MemoryIo,
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
    exportBytes,
    setTextComment,
    setTextName,
    previewUnit,
    previewWoice,
    // 単音プレビューのデバッグ用: { len, peak } を返す
    previewDebug: (unitNo: number, key: number, velocity = 104, sps = 44100) => {
      const bytes = exportBytes()
      if (!bytes) return { err: 'no project' }
      const buf = renderPreview(bytes, { unitNo, woiceIdx: null }, key, velocity, 1.2, sps)
      if (!buf) return { err: 'renderPreview failed' }
      let peak = 0
      for (let i = 0; i < buf.length; i += 20) {
        const v = Math.abs(buf[i]!)
        if (v > peak) peak = v
      }
      return { len: buf.length, peak }
    },
  }
}
