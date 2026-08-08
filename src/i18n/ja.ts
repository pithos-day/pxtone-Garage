// 日本語の表示文字列辞書。
// キーはドット区切りの定数として宣言し、src/i18n/index.ts の t() から参照する。
const ja = {
  // 共通
  "common.untitled": "無題",
  "common.close": "閉じる",
  "common.save": "保存",
  "common.cancel": "キャンセル",
  "common.delete": "削除",
  "common.edit": "編集",
  "common.newProject": "新規プロジェクト",
  "common.volumeToggle": "ボリュームエディタの表示",

  // メニュー: File
  "menu.file.new": "新規作成",
  "menu.file.open": "開く...",
  "menu.file.save": "保存",
  "menu.file.saveAs": "別名で保存...",
  "menu.file.exportPttune": "書き出し (.pttune)",
  "menu.file.exportWav": "書き出し (WAV)...",
  "menu.file.project": "Project...",
  "menu.file.settings": "環境設定...",
  "menu.file.close": "閉じる",

  // メニュー: Edit
  "menu.edit.undo": "元に戻す",
  "menu.edit.redo": "やり直す",

  // メニュー: View
  "menu.view.showAllUnits": "全ユニット表示",
  "menu.view.zoom": "ズーム",
  "menu.view.division": "分割",

  // 環境設定
  "settings.title": "環境設定",
  "settings.theme": "テーマ",
  "settings.builtinThemes": "内蔵テーマ",
  "settings.myThemes": "マイテーマ",
  "settings.importTheme": "テーマをインポート…",
  "settings.importThemeName": "テーマ名",
  "settings.importThemeCss": "テーマ CSS (ジェネレーター出力を貼り付け、またはファイルから)",
  "settings.import": "インポート",
  "settings.importFailed": "テーマとして読み込めませんでした",
  "settings.deleteTheme": "このテーマを削除",
  "settings.loadFile": "ファイルから読み込む…",
  "settings.mode": "モード",
  "settings.light": "ライトモード",
  "settings.dark": "ダークモード",
  "settings.language": "言語",
  "settings.languageJa": "日本語",
  "settings.languageEn": "English (未対応)",
  "settings.font": "フォント",
  "settings.builtinFonts": "内蔵フォント",
  "settings.localFonts": "ローカルフォント",
  "settings.loadLocalFonts": "ローカルフォントを読み込む…",
  "settings.loadLocalFontsDone": "ローカルフォントを読み込みました ({n}件)",
  "settings.loadLocalFontsFallback": "このブラウザではシステムフォントの列挙ができないため、よく使われるフォントから検出しました",

  // 再生コントロール
  "transport.play": "再生 (Space)",
  "transport.pause": "一時停止 (Space)",
  "transport.stop": "停止",
  "transport.loop": "リピート",
  "transport.volume": "音量",
  "transport.panels": "パネル",

  // ツールパネル
  "tool.woiceManage": "音色管理 (F1)",
  "tool.unitManage": "ユニット (F2)",
  "tool.addWoice": "＋音色",
  "tool.addUnit": "＋ユニット",

  // ユニット一覧
  "unit.title": "ユニット",
  "unit.headerPlay": "再生",
  "unit.headerShow": "表示",
  "unit.headerPin": "ピン",
  "unit.headerSolo": "ソロ",
  "unit.headerName": "名前",
  "unit.show": "表示 (ピアノロール)",
  "unit.play": "再生",
  "unit.pin": "ピン留め (上部に固定)",
  "unit.solo": "ソロ (他ユニットをミュート)",
  "unit.pen": "ペン (音符)",
  "unit.hand": "ハンド (キーのみ)",
  "unit.editName": "名前を編集",
  "unit.noWoice": "—",
  "unit.empty": "ユニットがありません。\nツールパネルの「＋ユニット」から追加",

  // 音色一覧
  "woice.title": "音色",
  "woice.empty": "音色がありません。\nツールパネルの「＋音色」から\n.ptvoice / .ptnoise / .wav を追加",
  "woice.summaryCoord": "座標波形 ({n}点)",
  "woice.summaryOvertone": "倍音 ({n}音)",
  "woice.summaryPtn": "{n}ユニット {ms}ms",
  "woice.summaryUnknown": "?",

  // Effector / Copier
  "effector.title": "Effector",
  "effector.delay": "Delay",
  "effector.overdrive": "OverDrive",
  "effector.none": "なし",
  "effector.addDelay": "＋Delay",
  "effector.addOverdrive": "＋OverDrive",
  "effector.unit": "単位",
  "effector.length": "長さ",
  "copier.title": "Copier (コピー種別)",

  // Project ダイアログ
  "project.title": "Project",
  "project.name": "曲名",
  "project.comment": "コメント",
  "project.tempo": "テンポ",
  "project.beatNum": "拍子",
  "project.beatPerMeas": "拍/小節",
  "project.measNum": "小節数",
  "project.repeat": "Repeat",
  "project.last": "Last",
  "project.measUnit": "小節目",

  // 再生範囲マーカー
  "playfield.setRepeat": "Repeat をここに設定",
  "playfield.setLast": "Last をここに設定",
  "playfield.clearRepeat": "Repeat をクリア",
  "playfield.clearLast": "Last をクリア",

  // 確認ダイアログ
  "confirm.new": "未保存の変更は破棄されます。新規作成しますか?",
  "confirm.close": "未保存の変更は破棄されます。閉じますか?",
  "prompt.fileName": "ファイル名を入力してください",

  // エラーメッセージ
  "error.engineInit": "エンジン初期化に失敗しました",
  "error.engineInitIo": "エンジン初期化失敗",
  "error.loadFailed": "読み込み失敗",
  "error.tonesReady": "音色変換失敗",
  "error.quality": "品質設定失敗",
  "error.prepare": "再生準備失敗",
  "error.notReady": "エンジン未初期化",
  "error.format": "対応していないファイル形式です",
  "error.ogg": "OGG音色は未対応です",
  "error.beatClock": "beat clock が 480 ではない曲は開けません",
  "error.tooManyEvents": "イベント数が多すぎます",
  "error.loadWithErr": "読み込みに失敗しました",
} as const;

export default ja;
