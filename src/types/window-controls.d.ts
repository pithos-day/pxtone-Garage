// スタンドアロン版のプリロード (electron/preload.cjs) が公開する API。ブラウザでは undefined
interface WindowControls {
  reload(): void;
  minimize(): void;
  toggleMaximize(): void;
  close(): void;
  reveal(): void;
  approveClose(): void;
  cancelClose(): void;
  onCloseRequest(callback: () => void): () => void;
  isMaximized(): Promise<boolean>;
  onMaximizedChange(callback: (maximized: boolean) => void): () => void;
}

interface Window {
  windowControls?: WindowControls;
}
