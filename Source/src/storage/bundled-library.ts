import { createReadStream } from 'node:fs'
import { access, copyFile, mkdir, readFile, rename, stat, unlink } from 'node:fs/promises'
import { createHash, randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { LabStore } from './store'

const sha=z.string().regex(/^[a-f0-9]{64}$/)
const manifestSchema=z.object({format:z.literal('cpss-bundled-library'),schemaVersion:z.literal(1),bookId:sha,sourceHash:sha,
  sourceBytes:z.number().int().positive(),databaseHash:sha,title:z.string().min(1),pages:z.number().int().positive(),
  openAtPage:z.number().int().nonnegative(),converter:z.literal('pdfjs-layout-v1')}).refine(m=>m.bookId===m.sourceHash && m.openAtPage<m.pages)
export async function sha256File(path:string) {
  const hash=createHash('sha256')
  for await(const chunk of createReadStream(path))hash.update(chunk)
  return hash.digest('hex')
}
const exists=(path:string)=>access(path).then(()=>true,()=>false)

/** Installs only immutable textbook content. Never replaces the user's whole database. */
export async function initializeBundledLibrary(store:LabStore,root?:string):Promise<boolean> {
  if(!root || !await exists(join(root,'manifest.json')))return false
  const manifest=manifestSchema.parse(JSON.parse(await readFile(join(root,'manifest.json'),'utf8')))
  const id=manifest.bookId,target=join(store.root,'books',id,'source.pdf')
  const existing=store.books().find(b=>b.id===id)
  const marker=store.db.prepare('SELECT value FROM meta WHERE key=?').get(`bundled:${id}`)
  if(marker?.value===manifest.databaseHash && existing?.status==='ready' && await exists(target) && (await stat(target)).size===manifest.sourceBytes)return false
  const source=join(root,'books',id,'source.pdf'),database=join(root,'library.sqlite')
  if(await sha256File(database)!==manifest.databaseHash)throw new Error('预置教材索引校验失败，请重新解压完整软件包；现有学习资料未被替换')
  if((await stat(source)).size!==manifest.sourceBytes || await sha256File(source)!==manifest.sourceHash)throw new Error('预置 PDF 校验失败，请重新解压完整软件包')
  const seed=new DatabaseSync(database,{readOnly:true})
  try {
    const result=seed.prepare('PRAGMA quick_check').get() as {quick_check:string}
    if(result.quick_check!=='ok')throw new Error('预置索引完整性检查失败')
    const books=seed.prepare('SELECT id,hash,pages,status,processed FROM books').all()
    if(books.length!==1 || books[0].id!==id || books[0].hash!==id || books[0].pages!==manifest.pages || books[0].processed!==manifest.pages || books[0].status!=='ready')throw new Error('预置索引教材身份或处理状态不一致')
    if((seed.prepare('SELECT count(*) AS n FROM pages WHERE book_id=?').get(id) as {n:number}).n!==manifest.pages)throw new Error('预置教材页数据不完整')
    for(const table of ['records','positions','progress','settings'])if((seed.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {n:number}).n)throw new Error('预置索引包含个人学习资料，已拒绝安装')
  }finally{seed.close()}
  await mkdir(dirname(target),{recursive:true})
  if(await exists(target)) {
    if(await sha256File(target)!==id)throw new Error('本机已有同路径文件与教材摘要不一致，未覆盖现有文件')
  }else{
    const temp=target+`.${randomUUID()}.partial`
    try {
      await copyFile(source,temp)
      if(await sha256File(temp)!==id)throw new Error('预置 PDF 复制校验失败')
      await rename(temp,target)
    }finally{await unlink(temp).catch(()=>{})}
  }
  store.db.prepare('ATTACH DATABASE ? AS bundled').run(database)
  try {
    store.transaction(()=>{
      // A ready existing conversion is authoritative; upgrading the app never changes its block identities.
      if(existing?.status!=='ready') {
        store.db.prepare('INSERT OR IGNORE INTO books SELECT * FROM bundled.books WHERE id=?').run(id)
        store.db.prepare('INSERT OR IGNORE INTO pages SELECT * FROM bundled.pages WHERE book_id=?').run(id)
        store.db.prepare('INSERT OR IGNORE INTO blocks SELECT * FROM bundled.blocks WHERE book_id=?').run(id)
        store.db.prepare('INSERT OR IGNORE INTO toc SELECT * FROM bundled.toc WHERE book_id=?').run(id)
        store.db.prepare('DELETE FROM text_search WHERE book_id=?').run(id)
        store.db.prepare('INSERT INTO text_search(id,book_id,page,text) SELECT id,book_id,page,text FROM blocks WHERE book_id=? AND length(trim(text))>0').run(id)
        store.updateBook(id,{pages:manifest.pages,processed:manifest.pages,status:'ready',error:null})
      }
      store.db.prepare('INSERT OR IGNORE INTO positions VALUES(?,?)').run(id,JSON.stringify({page:manifest.openAtPage}))
      store.db.prepare('INSERT OR IGNORE INTO settings VALUES(?,?)').run('lastBook',JSON.stringify(id))
      store.db.prepare('INSERT OR REPLACE INTO meta VALUES(?,?)').run(`bundled:${id}`,manifest.databaseHash)
    })
  }finally{store.db.exec('DETACH DATABASE bundled')}
  return true
}
