// 音色選択 + 名前入力フォーム (AddUnitDialog / ChangeUnitDialog)
import { onMounted, ref, watch } from "vue";

export function useWoiceNameForm(opts: {
  initWoice: () => number; // 初期選択の音色 index
  initName: (woiceIdx: number) => string; // 初期の名前 (音色から導出)
  autoName?: boolean; // 音色変更時に名前を自動更新するか (未編集の場合のみ)
  submit: (woiceIdx: number, name: string) => void;
}) {
  const woiceIdx = ref(-1);
  const name = ref("");
  const nameDirty = ref(false);

  onMounted(() => {
    woiceIdx.value = opts.initWoice();
    name.value = opts.initName(woiceIdx.value);
  });

  if (opts.autoName) {
    watch(woiceIdx, (idx) => {
      if (!nameDirty.value) name.value = opts.initName(idx);
    });
  }

  function onNameInput(): void {
    nameDirty.value = true;
  }

  function onSubmit(): void {
    opts.submit(woiceIdx.value, name.value.trim() || opts.initName(woiceIdx.value));
  }

  return { woiceIdx, name, onNameInput, onSubmit };
}
