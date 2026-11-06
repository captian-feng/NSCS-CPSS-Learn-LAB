import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {answerSchema,customBankSchema,persistAnswer} from '../practice/engine'
import type { Anchor, Block, Book, BookDetail, PageData, Progress, SearchHit, Snapshot, StudyRecord, TocNode } from '../shared/types'

const rect = z.tuple([z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite()])
export const anchorSchema = z.object({
  revision: z.string().max(100), page: z.number().int().nonnegative(),
  startBlock: z.string().max(200).optional(), endBlock: z.string().max(200).optional(),
  start: z.number().int().nonnegative().optional(), end: z.number().int().nonnegative().optional(),
  quote: z.string().max(100000), prefix: z.string().max(200).optional(), suffix: z.string().max(200).optional(),
  rects: z.array(rect).max(1000).optional(), mode: z.enum(['html', 'pdf'])
})
export const recordSchema = z.object({
  id: z.string().min(1).max(200), bookId: z.string().min(1).max(200),
  kind: z.enum(['highlight', 'underline', 'note', 'bookmark', 'card', 'task']),
  page: z.number().int().nonnegative(), anchor: anchorSchema.nullable(), text: z.string().max(100000),
  color: z.enum(['yellow', 'green', 'blue', 'pink']), important: z.boolean(),
  due: z.string().max(40), done: z.boolean(), updated: z.string().max(50)
})
const manualTocSchema=z.object({
  id:z.string().min(1).max(200),bookId:z.string().min(1).max(200),parentId:z.null(),
  title:z.string().trim().min(1).max(200),page:z.number().int().nonnegative(),level:z.literal(0),source:z.literal('manual')
}).strict()
const backupSchema = z.object({
  format: z.literal('cpss-lab'), schemaVersion: z.literal(1), created: z.string(),
  books: z.array(z.object({ id: z.string(), title: z.string(), hash: z.string() })),
  records: z.array(recordSchema).max(100000),
  positions: z.array(z.object({ bookId: z.string(), value: z.object({ page: z.number().int().nonnegative(), blockId: z.string().optional() }) })),
  progress: z.array(z.object({ bookId: z.string(), nodeId: z.string(), status: z.enum(['未开始', '学习中', '已完成', '需要复习']) })),
  practiceAnswers:z.array(answerSchema).max(100000).default([]),
  customBanks:z.array(z.object({bookId:z.string(),bank:customBankSchema})).max(10000).default([]),
  manualToc:z.array(manualTocSchema).max(100000).default([]),
  settings: z.record(z.string(), z.unknown())
})
export class LabStore {
  readonly db: DatabaseSync
  constructor(readonly root: string) {
    mkdirSync(root, { recursive: true })
    this.db = new DatabaseSync(join(root, 'library.sqlite'))
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS books(id TEXT PRIMARY KEY,title TEXT NOT NULL,hash TEXT UNIQUE NOT NULL,pages INTEGER NOT NULL DEFAULT 0,language TEXT NOT NULL DEFAULT 'en',status TEXT NOT NULL,processed INTEGER NOT NULL DEFAULT 0,error TEXT);
      CREATE TABLE IF NOT EXISTS pages(book_id TEXT NOT NULL,page INTEGER NOT NULL,data TEXT NOT NULL,PRIMARY KEY(book_id,page),FOREIGN KEY(book_id) REFERENCES books(id));
      CREATE TABLE IF NOT EXISTS blocks(id TEXT PRIMARY KEY,book_id TEXT NOT NULL,page INTEGER NOT NULL,ord INTEGER NOT NULL,text TEXT NOT NULL,data TEXT NOT NULL,FOREIGN KEY(book_id) REFERENCES books(id));
      CREATE INDEX IF NOT EXISTS blocks_page ON blocks(book_id,page,ord);
      CREATE VIRTUAL TABLE IF NOT EXISTS text_search USING fts5(id UNINDEXED,book_id UNINDEXED,page UNINDEXED,text,tokenize='unicode61');
      CREATE TABLE IF NOT EXISTS toc(id TEXT PRIMARY KEY,book_id TEXT NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,book_id TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS records_book ON records(book_id);
      CREATE TABLE IF NOT EXISTS positions(book_id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS progress(book_id TEXT NOT NULL,node_id TEXT NOT NULL,status TEXT NOT NULL,PRIMARY KEY(book_id,node_id));
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS translation_links(id TEXT PRIMARY KEY,source_book TEXT NOT NULL,source_block TEXT NOT NULL,target_book TEXT NOT NULL,target_block TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'unreviewed');
      CREATE TABLE IF NOT EXISTS question_banks(id TEXT PRIMARY KEY,title TEXT NOT NULL,provenance TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS questions(id TEXT PRIMARY KEY,bank_id TEXT NOT NULL,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS custom_practice_banks(book_id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS practice_sessions(id TEXT PRIMARY KEY,data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS answers(id TEXT PRIMARY KEY,session_id TEXT NOT NULL,question_id TEXT NOT NULL,data TEXT NOT NULL);
      INSERT OR IGNORE INTO meta VALUES('schema_version','1');`)
    const version = this.db.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as { value: string }
    if (version.value !== '1') throw new Error('资料库版本不受支持，请使用匹配的应用版本')
    this.db.prepare("UPDATE books SET status='paused' WHERE status IN ('copying','importing')").run()
  }
  close() { this.db.close() }
  transaction<T>(action: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = action(); this.db.exec('COMMIT'); return result }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  books(): Book[] { return this.db.prepare('SELECT * FROM books ORDER BY rowid DESC').all() as unknown as Book[] }
  book(id: string): Book {
    const book = this.db.prepare('SELECT * FROM books WHERE id=?').get(id) as unknown as Book | undefined
    if (!book) throw new Error('教材不存在')
    return book
  }
  createBook(id: string, title: string, hash: string) {
    this.db.prepare("INSERT OR IGNORE INTO books(id,title,hash,status) VALUES(?,?,?,'copying')").run(id, title, hash)
  }
  renameBook(id:string, title:string):Book {
    const value=z.string().trim().min(1).max(200).parse(title)
    this.book(id)
    this.db.prepare('UPDATE books SET title=? WHERE id=?').run(value,id)
    return this.book(id)
  }
  updateBook(id: string, patch: Partial<Pick<Book, 'pages' | 'processed' | 'status' | 'error'>>) {
    const allowed = ['pages', 'processed', 'status', 'error'] as const
    for (const key of allowed) if (key in patch) this.db.prepare(`UPDATE books SET ${key}=? WHERE id=?`).run(patch[key] ?? null, id)
  }
  snapshot(): Snapshot {
    return { books: this.books(), settings: Object.fromEntries(this.db.prepare('SELECT * FROM settings').all().map(r => [String(r.key), JSON.parse(String(r.data))])) }
  }
  detail(id: string): BookDetail {
    return {
      book: this.book(id),
      toc: this.db.prepare('SELECT data FROM toc WHERE book_id=? ORDER BY rowid').all(id).map(r => JSON.parse(String(r.data))),
      records: this.records(id),
      progress: this.db.prepare('SELECT node_id AS nodeId,status FROM progress WHERE book_id=?').all(id) as unknown as Progress[],
      position: this.jsonRow('SELECT data FROM positions WHERE book_id=?', id)
    }
  }
  records(id: string): StudyRecord[] { return this.db.prepare('SELECT data FROM records WHERE book_id=? ORDER BY rowid DESC').all(id).map(r => JSON.parse(String(r.data))) }
  jsonRow(sql: string, ...args: (string | number)[]) { const r = this.db.prepare(sql).get(...args); return r ? JSON.parse(String(r.data)) : null }
  page(id: string, page: number): PageData {
    const data = this.jsonRow('SELECT data FROM pages WHERE book_id=? AND page=?', id, page)
    if (!data) throw new Error('该页尚未完成导入')
    data.blocks = this.db.prepare('SELECT data FROM blocks WHERE book_id=? AND page=? ORDER BY ord').all(id, page).map(r => JSON.parse(String(r.data)))
    return data
  }
  putPage(bookId: string, page: PageData) {
    this.transaction(() => {
      this.db.prepare('DELETE FROM text_search WHERE book_id=? AND page=?').run(bookId, page.page)
      this.db.prepare('DELETE FROM blocks WHERE book_id=? AND page=?').run(bookId, page.page)
      const b = this.db.prepare('INSERT INTO blocks VALUES(?,?,?,?,?,?)')
      const f = this.db.prepare('INSERT INTO text_search VALUES(?,?,?,?)')
      for (const block of page.blocks) {
        b.run(block.id, bookId, page.page, block.order, block.text, JSON.stringify(block))
        if (block.text.trim()) f.run(block.id, bookId, page.page, block.text)
      }
      this.db.prepare('INSERT OR REPLACE INTO pages VALUES(?,?,?)').run(bookId, page.page, JSON.stringify({ ...page, blocks: [] }))
      this.updateBook(bookId, { processed: page.page + 1 })
    })
  }
  setToc(bookId: string, nodes: TocNode[]) {
    this.transaction(() => {
      this.db.prepare("DELETE FROM toc WHERE book_id=? AND COALESCE(json_extract(data,'$.source'),'') <> 'manual'").run(bookId)
      const statement = this.db.prepare('INSERT INTO toc VALUES(?,?,?)')
      for (const node of nodes) statement.run(node.id, bookId, JSON.stringify(node))
    })
  }
  addManualToc(bookId:string,title:string,page:number):TocNode {
    const book=this.book(bookId)
    if(book.status!=='ready')throw new Error('请先完成教材导入')
    if(!Number.isInteger(page)||page<0||page>=book.pages)throw new Error('章节页码超出教材范围')
    const node=manualTocSchema.parse({id:randomUUID(),bookId,parentId:null,title,page,level:0,source:'manual'})
    this.db.prepare('INSERT INTO toc VALUES(?,?,?)').run(node.id,bookId,JSON.stringify(node))
    return node
  }
  saveRecord(input: unknown): StudyRecord {
    const record = recordSchema.parse(input)
    if (record.anchor && record.anchor.page !== record.page) throw new Error('批注来源页不一致')
    const existing = this.db.prepare('SELECT book_id FROM records WHERE id=?').get(record.id)
    if (existing && existing.book_id !== record.bookId) throw new Error('记录 ID 与教材不一致')
    this.db.prepare('INSERT OR REPLACE INTO records VALUES(?,?,?,?)').run(record.id, record.bookId, record.kind, JSON.stringify(record))
    return record
  }
  removeRecord(id: string) { this.db.prepare('DELETE FROM records WHERE id=?').run(id) }
  savePosition(bookId: string, value: { page: number; blockId?: string }) { this.db.prepare('INSERT OR REPLACE INTO positions VALUES(?,?)').run(bookId, JSON.stringify(value)) }
  setProgress(bookId: string, nodeId: string, status: string) { this.db.prepare('INSERT OR REPLACE INTO progress VALUES(?,?,?)').run(bookId, nodeId, status) }
  setSetting(key: string, value: unknown) { this.db.prepare('INSERT OR REPLACE INTO settings VALUES(?,?)').run(key, JSON.stringify(value)) }
  search(bookId: string, query: string): SearchHit[] {
    const words = query.trim().match(/[\p{L}\p{N}]+/gu)?.slice(0, 20) ?? []
    if (!words.length) return []
    const match = words.map(word => `"${word}"*`).join(' AND ')
    const rows = /\p{Script=Han}/u.test(query)
      ? this.db.prepare(`SELECT id,page,text FROM blocks WHERE book_id=? AND ${words.map(() => 'instr(lower(text),lower(?)) > 0').join(' AND ')} ORDER BY page,ord LIMIT 60`).all(bookId, ...words)
      : this.db.prepare('SELECT id,page,text FROM text_search WHERE text_search MATCH ? AND book_id=? ORDER BY rank LIMIT 60').all(match, bookId)
    const text = rows.map(r => ({ id: String(r.id), page: Number(r.page), text: String(r.text), type: 'text' as const }))
    const notes = this.records(bookId).filter(r => `${r.text} ${r.anchor?.quote ?? ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).slice(0, 30).map(r => ({ id: r.id, page: r.page, text: `${r.anchor?.quote ?? ''} ${r.text}`, type: 'note' as const }))
    return [...text, ...notes]
  }
  report(bookId: string) {
    const book = this.book(bookId)
    const pages = this.db.prepare('SELECT data FROM pages WHERE book_id=? ORDER BY page').all(bookId).map(r => JSON.parse(String(r.data)) as PageData)
    return { book, converter: 'pdfjs-layout-v1', processedPages: pages.length, issues: pages.flatMap(p => p.issues.map(message => ({ page: p.page + 1, message }))),
      regions: pages.reduce((n, p) => n + p.regions.length, 0), manuallyVerifiedPages: [],
      note: '页面处理完成不代表内容逐页核验。复杂表格/公式以来源区域保真展示，自动布局需对照原书校对。' }
  }
  backup() {
    return {
      format: 'cpss-lab' as const, schemaVersion: 1 as const, created: new Date().toISOString(),
      books: this.books().map(({ id, title, hash }) => ({ id, title, hash })),
      records: this.db.prepare('SELECT data FROM records').all().map(r => JSON.parse(String(r.data))),
      positions: this.db.prepare('SELECT * FROM positions').all().map(r => ({ bookId: r.book_id, value: JSON.parse(String(r.data)) })),
      progress: this.db.prepare('SELECT book_id AS bookId,node_id AS nodeId,status FROM progress').all(), settings: this.snapshot().settings,
      practiceAnswers:this.db.prepare("SELECT data FROM answers ORDER BY json_extract(data,'$.created'),rowid").all().map(r=>answerSchema.parse(JSON.parse(String(r.data)))),
      customBanks:this.db.prepare('SELECT book_id,data FROM custom_practice_banks').all().map(r=>({bookId:String(r.book_id),bank:customBankSchema.parse(JSON.parse(String(r.data)))})),
      manualToc:this.db.prepare("SELECT data FROM toc WHERE json_extract(data,'$.source')='manual'").all().map(r=>manualTocSchema.parse(JSON.parse(String(r.data))))
    }
  }
  restore(input: unknown) {
    const backup = backupSchema.parse(input)
    if(new Set(backup.manualToc.map(n=>n.id)).size!==backup.manualToc.length)throw new Error('备份包含重复章节编号')
    for(const node of backup.manualToc){if(!backup.books.some(b=>b.id===node.bookId))throw new Error('章节缺少教材身份')}
    if(new Set(backup.customBanks.map(b=>b.bookId)).size!==backup.customBanks.length)throw new Error('备份包含重复教材题库')
    for(const entry of backup.customBanks){if(!backup.books.some(b=>b.id===entry.bookId&&b.hash===entry.bank.sourceHash))throw new Error('题库与教材身份不一致')}
    if(new Set(backup.practiceAnswers.map(a=>a.id)).size!==backup.practiceAnswers.length)throw new Error('备份包含重复答题编号')
    for(const answer of backup.practiceAnswers){if(!backup.books.some(b=>b.id===answer.bookId))throw new Error('答题记录缺少教材身份')}
    if (new Set(backup.records.map(r => r.id)).size !== backup.records.length) throw new Error('备份包含重复记录 ID')
    return this.transaction(() => {
      let inserted = 0, skipped = 0
      for (const record of backup.records) {
        const current = this.jsonRow('SELECT data FROM records WHERE id=?', record.id)
        if (current) {
          if (JSON.stringify(current) !== JSON.stringify(record)) throw new Error('备份记录与当前资料冲突，已取消恢复；请使用空资料目录恢复或先导出当前资料')
          skipped++; continue
        }
        this.saveRecord(record); inserted++
      }
      for (const p of backup.positions) this.db.prepare('INSERT OR IGNORE INTO positions VALUES(?,?)').run(p.bookId, JSON.stringify(p.value))
      for (const p of backup.progress) this.db.prepare('INSERT OR IGNORE INTO progress VALUES(?,?,?)').run(p.bookId, p.nodeId, p.status)
      for (const [key, value] of Object.entries(backup.settings)) this.db.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)').run(key, JSON.stringify(value))
      // Preserve book identities even before the source PDF is re-imported.
      for (const book of backup.books) this.db.prepare("INSERT OR IGNORE INTO books(id,title,hash,status) VALUES(?,?,?,'missing')").run(book.id, book.title, book.hash)
      for(const node of backup.manualToc){
        const current=this.jsonRow('SELECT data FROM toc WHERE id=?',node.id)
        if(current){if(JSON.stringify(current)!==JSON.stringify(node))throw new Error('备份章节与当前资料冲突，已取消恢复');skipped++;continue}
        const book=this.book(node.bookId)
        if(book.pages>0&&node.page>=book.pages)throw new Error('备份章节页码超出教材范围')
        this.db.prepare('INSERT INTO toc VALUES(?,?,?)').run(node.id,node.bookId,JSON.stringify(node));inserted++
      }
      for (const entry of backup.customBanks) {
        const current=this.db.prepare('SELECT data FROM custom_practice_banks WHERE book_id=?').get(entry.bookId)
        const data=JSON.stringify(entry.bank)
        if(current && current.data!==data)throw new Error('备份题库与当前资料冲突，已取消恢复')
        if(!current)this.db.prepare('INSERT INTO custom_practice_banks VALUES(?,?)').run(entry.bookId,data)
      }
      for(const answer of backup.practiceAnswers){if(persistAnswer(this,answer))inserted++;else skipped++}
      return { inserted, skipped }
    })
  }
  markdown(): string {
    return ['# CPSS LAB 学习记录', `导出时间：${new Date().toISOString()}`, ...this.books().flatMap(book => [
      `\n## ${book.title}`, `源文件 SHA-256：${book.hash}`,
      `阅读位置：PDF 第 ${(this.detail(book.id).position?.page??0)+1} 页`,
      ...this.detail(book.id).progress.map(p=>`- ${this.detail(book.id).toc.find(n=>n.id===p.nodeId)?.title??p.nodeId}：${p.status}`),
      ...this.records(book.id).map(r => `\n### ${r.kind} · PDF 第 ${r.page + 1} 页\n${r.anchor?.quote ? '> ' + r.anchor.quote.replaceAll('\n', '\n> ') + '\n' : ''}${r.text}\n${r.due?'目标 / 复习日期：'+r.due+'\n':''}${r.important?'重点：是\n':''}${r.done?'状态：已完成\n':''}`)
    ])].join('\n')
  }
}
export function newRecord(bookId: string, page: number, kind: StudyRecord['kind'], anchor: Anchor | null, text = ''): StudyRecord {
  return { id: randomUUID(), bookId, page, kind, anchor, text, color: 'yellow', important: false, due: '', done: false, updated: new Date().toISOString() }
}
