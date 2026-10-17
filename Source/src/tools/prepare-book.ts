import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { LabStore } from '../storage/store'
import { Importer, openPDF, REVISION } from '../importer/importer'

const [source,target]=process.argv.slice(2)
if(!source||!target)throw new Error('Usage: node out/main/prepareBook.js <source.pdf> <seed-directory>')
const root=resolve(target)
await mkdir(root,{recursive:true})
const store=new LabStore(root)
const started=performance.now()
try {
  let finish!:()=>void,fail!:(error:Error)=>void
  const complete=new Promise<void>((resolve,reject)=>{finish=resolve;fail=reject})
  const importer=new Importer(store,event=>{
    if(event.processed%100===0||event.status!=='importing')console.log(JSON.stringify(event))
    if(event.status==='ready')finish()
    if(event.status==='failed')fail(new Error(event.error))
  })
  const {bookId}=await importer.add(resolve(source))
  if(store.book(bookId).status!=='ready')await complete
  const pdf=await openPDF(importer.path(bookId))
  const metadata=await pdf.getMetadata()
  const title=(metadata.info as {Title?:string}).Title||store.book(bookId).title
  await pdf.destroy()
  store.db.prepare('UPDATE books SET title=? WHERE id=?').run(title,bookId)
  const detail=store.detail(bookId)
  const chapter=detail.toc.find(node=>/^Chapter\s+1\b/i.test(node.title))
  const page=chapter?.page??0
  for(const table of ['records','positions','progress','settings']) {
    const count=store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as {n:number}
    if(count.n!==0)throw new Error(`Refusing to bundle personal data from ${table}`)
  }
  const report={...store.report(bookId),durationSeconds:Math.round((performance.now()-started)/10)/100,
    blocks:(store.db.prepare('SELECT count(*) AS n FROM blocks').get() as {n:number}).n,
    parts:detail.toc.filter(n=>/^Part\s+[IVX]+[:\s]/i.test(n.title)).length,
    chapters:detail.toc.filter(n=>/^Chapter\s+\d+\b/i.test(n.title)).length,
    tocNodes:detail.toc.length}
  await writeFile(join(root,'conversion-report.json'),JSON.stringify(report,null,2))
  store.db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;')
  store.close()
  const db=await readFile(join(root,'library.sqlite'))
  const manifest={format:'cpss-bundled-library',schemaVersion:1,bookId,sourceHash:bookId,sourceBytes:(await readFile(importer.path(bookId))).byteLength,
    databaseHash:createHash('sha256').update(db).digest('hex'),title,pages:detail.book.pages,openAtPage:page,converter:REVISION}
  await writeFile(join(root,'manifest.json'),JSON.stringify(manifest,null,2))
  console.log(JSON.stringify({status:'prepared',...manifest,...{durationSeconds:report.durationSeconds,blocks:report.blocks,parts:report.parts,chapters:report.chapters,tocNodes:report.tocNodes}},null,2))
}catch(error){try{store.close()}catch{};throw error}
