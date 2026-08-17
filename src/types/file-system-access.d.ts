// File System Access API (showSaveFilePicker) の型定義。
// TS の lib.dom に含まれていないため、使用するメソッドのみを宣言する。
// (対応ブラウザ: Chromium 系のみ。非対応では従来のダウンロードにフォールバック)
interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept: Record<string, string[]>;
  }>;
}

interface FileSystemFileHandle {
  createWritable(): Promise<FileSystemWritableFileStream>;
}

interface FileSystemWritableFileStream {
  write(data: BufferSource): Promise<void>;
  close(): Promise<void>;
}

interface Window {
  showSaveFilePicker(options?: SaveFilePickerOptions): Promise<FileSystemFileHandle>;
}