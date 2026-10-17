import { expect,it } from 'vitest'
import { mkdtemp,rm,unlink,writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFixture } from './fixtures/create'
import { LabStore,newRecord } from '../src/storage/store'
import { Importer,openPDF } from '../src/importer/importer'

it('imports a genuine PDF, preserves outline/vector regions, searches text, resumes and keeps a managed copy',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cpss-import-')),store=new LabStore(join(root,'data')),file=await createFixture(join(root,'fixture.pdf'))
  try {
    let finish:(value?:unknown)=>void=()=>{},fail:(error:Error)=>void=()=>{}
    let ready=new Promise((resolve,reject)=>{finish=resolve;fail=reject})
    const importer=new Importer(store,event=>{if(event.status==='ready')finish();if(event.status==='failed')fail(new Error(event.error))})
    const {bookId}=await importer.add(file);await ready
    const detail=store.detail(bookId)
    expect(detail.book.pages).toBe(4);expect(detail.book.processed).toBe(4);expect(detail.toc.map(n=>n.title)).toContain('Chapter 2 Data Analysis')
    expect(detail.toc.find(n=>n.title.startsWith('Chapter 2'))?.page).toBe(2)
    const page=store.page(bookId,1);expect(page.blocks.map(b=>b.text).join(' ')).toContain('Performance science')
    expect(page.blocks.flatMap(b=>b.runs).some(run=>run.bold && run.text.includes('Important interpretation'))).toBe(true)
    expect(page.regions.length).toBeGreaterThan(0);expect(store.page(bookId,3).issues.join(' ')).toContain('OCR')
    expect(store.search(bookId,'adaptation').length).toBeGreaterThan(0)
    store.saveRecord(newRecord(bookId,1,'note',null,'Persistent note'))
    expect(await importer.add(file)).toEqual({bookId});expect(store.detail(bookId).records).toHaveLength(1)
    // Simulate an interrupted import: committed pages remain usable, remaining pages replay idempotently.
    const before=store.search(bookId,'adaptation').filter(h=>h.page===2).length
    store.updateBook(bookId,{status:'paused',processed:2})
    await importer.resume(bookId)
    expect(store.search(bookId,'adaptation').filter(h=>h.page===2)).toHaveLength(before)
    expect(store.book(bookId).status).toBe('ready')
    await unlink(file)
    const copy=await openPDF(importer.path(bookId));expect(copy.numPages).toBe(4);await copy.destroy()
  }finally{store.close();await rm(root,{recursive:true,force:true})}
})

it('resumes a paused import after reopening the database without needing the original file',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cpss-resume-')),file=await createFixture(join(root,'fixture.pdf'),30)
  let store=new LabStore(join(root,'data'))
  try {
    let paused!:()=>void
    const checkpoint=new Promise<void>(resolve=>{paused=resolve})
    const importer=new Importer(store,event=>{
      if(event.status==='importing'&&event.processed===2)importer.pause(event.bookId)
      if(event.status==='paused')paused()
    })
    const {bookId}=await importer.add(file);await checkpoint
    expect(store.book(bookId).processed).toBe(2);expect(store.book(bookId).status).toBe('paused')
    store.saveRecord(newRecord(bookId,1,'note',null,'Checkpoint preserved'))
    store.close();await unlink(file)
    store=new LabStore(join(root,'data'))
    const resumed=new Importer(store,()=>{})
    await resumed.resume(bookId)
    expect(store.book(bookId).processed).toBe(30);expect(store.book(bookId).status).toBe('ready')
    expect(store.records(bookId)[0].text).toBe('Checkpoint preserved')
    expect(store.page(bookId,29).blocks.length).toBeGreaterThan(0)
  }finally{store.close();await rm(root,{recursive:true,force:true})}
})

it('rejects a non-PDF file without adding an unusable book',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cpss-invalid-')),file=join(root,'bad.pdf'),store=new LabStore(join(root,'data'))
  try {
    await writeFile(file,'This is not a valid PDF document.')
    await expect(new Importer(store,()=>{}).add(file)).rejects.toThrow()
    expect(store.books()).toEqual([])
  }finally{store.close();await rm(root,{recursive:true,force:true})}
})
