export type Rect = [number, number, number, number]
export type Book = { id: string; title: string; hash: string; pages: number; language: string; status: string; processed: number; error: string | null }
export type TocNode = { id: string; bookId: string; parentId: string | null; title: string; page: number; level: number; source: string }
export type TextRun = { text: string; bold?: boolean; italic?: boolean }
export type Block = { id: string; bookId: string; page: number; order: number; kind: string; text: string; runs: TextRun[]; rect: Rect; level: number }
export type PageData = { page: number; width: number; height: number; label: string; status: string; issues: string[]; blocks: Block[]; regions: Region[] }
export type Region = { id: string; rect: Rect; caption: string }
export type Anchor = {
  revision: string; page: number; startBlock?: string; endBlock?: string; start?: number; end?: number;
  quote: string; prefix?: string; suffix?: string; rects?: Rect[]; mode: 'html' | 'pdf'
}
export type RecordKind = 'highlight' | 'underline' | 'note' | 'bookmark' | 'card' | 'task'
export type StudyRecord = { id: string; bookId: string; kind: RecordKind; page: number; anchor: Anchor | null; text: string; color: string; important: boolean; due: string; done: boolean; updated: string }
export type Progress = { nodeId: string; status: '未开始' | '学习中' | '已完成' | '需要复习' }
export type SearchHit = { id: string; page: number; text: string; type: 'text' | 'note' }
export type Snapshot = { books: Book[]; settings: Record<string, unknown>; bootstrapError?:string }
export type BookDetail = { book: Book; toc: TocNode[]; records: StudyRecord[]; progress: Progress[]; position: { page: number; blockId?: string } | null }
export type ImportEvent = { bookId: string; processed: number; total: number; status: string; error?: string }
export interface DesktopAPI {
  call<T = unknown>(method: string, args?: unknown): Promise<T>;
  choosePDF(): Promise<{ bookId: string } | null>;
  exportData(format: 'json' | 'markdown'): Promise<string | null>;
  restoreData(): Promise<{ inserted: number; skipped: number } | null>;
  openDataFolder(): Promise<void>;
  onProgress(listener: (event: ImportEvent) => void): () => void;
}
declare global { interface Window { desktop: DesktopAPI } }
