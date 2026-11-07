import { afterEach,describe,expect,it } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdtempSync,mkdirSync,readFileSync,readdirSync,rmSync,writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname,join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { LabStore,newRecord } from '../src/storage/store'
import { exportFullBackup,restoreFullBackup,validateLibrary } from '../src/storage/full-backup'

const roots:string[]=[],stores:LabStore[]=[]
function folder(){const path=mkdtempSync(join(tmpdir(),'cpss-full-backup-'));roots.push(path);return path}
function open(path:string){const store=new LabStore(path);stores.push(store);return store}
afterEach(()=>{for(const store of stores.splice(0))try{store.close()}catch{};for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})

describe('full library backup',()=>{
  it('copies a consistent database and verified textbook into a separate folder',async()=>{
    const root=folder(),destination=folder(),store=open(root)
    const pdf=Buffer.from('%PDF-1.4\nself-authored test content')
    const id=createHash('sha256').update(pdf).digest('hex')
    store.createBook(id,'Book',id);store.updateBook(id,{status:'ready',pages:1})
    const original=join(root,'books',id,'source.pdf');mkdirSync(dirname(original),{recursive:true});writeFileSync(original,pdf)
    const note=newRecord(id,0,'note',null,'Keep this note');store.saveRecord(note)
    const backup=await exportFullBackup(store.db,root,destination)
    const manifest=JSON.parse(readFileSync(join(backup,'manifest.json'),'utf8'))
    expect(manifest.books).toEqual([{bookId:id,sha256:id,size:pdf.length}])
    expect(readFileSync(join(backup,'books',id,'source.pdf'))).toEqual(pdf)
    const snapshot=new DatabaseSync(join(backup,'library.sqlite'),{readOnly:true})
    try{expect(snapshot.prepare('SELECT count(*) AS n FROM records').get()?.n).toBe(1)}finally{snapshot.close()}
    expect(store.records(id)).toEqual([note])
  })
  it('rejects missing textbooks and locations inside the active library',async()=>{
    const root=folder(),destination=folder(),store=open(root),id='1'.repeat(64)
    store.createBook(id,'Book',id);store.updateBook(id,{status:'ready',pages:1})
    const nested=join(root,'..inside');mkdirSync(nested)
    await expect(exportFullBackup(store.db,root,nested)).rejects.toThrow('资料目录以外')
    await expect(exportFullBackup(store.db,root,destination)).rejects.toThrow('教材文件缺失')
    expect(readdirSync(destination)).toEqual([])
  })
  it('restores a verified backup into a new library and rejects damaged files',async()=>{
    const root=folder(),backups=folder(),restores=folder(),store=open(root)
    const pdf=Buffer.from('%PDF-1.4\nself-authored backup restoration test')
    const id=createHash('sha256').update(pdf).digest('hex')
    store.createBook(id,'Book',id);store.updateBook(id,{status:'ready',pages:1})
    const original=join(root,'books',id,'source.pdf');mkdirSync(dirname(original),{recursive:true});writeFileSync(original,pdf)
    const note=newRecord(id,0,'note',null,'Saved note');store.saveRecord(note)
    const backup=await exportFullBackup(store.db,root,backups)
    const restored=await restoreFullBackup(root,backup,restores)
    const reopened=open(restored)
    expect(await validateLibrary(restored)).toBe(restored)
    expect(reopened.book(id).title).toBe('Book');expect(reopened.records(id)).toEqual([note])
    expect(readFileSync(join(restored,'books',id,'source.pdf'))).toEqual(pdf)
    expect(store.records(id)).toEqual([note])
    const damaged=join(backup,'books',id,'source.pdf');writeFileSync(damaged,Buffer.alloc(pdf.length,1))
    const before=readdirSync(restores)
    await expect(restoreFullBackup(root,backup,restores)).rejects.toThrow('教材校验失败')
    expect(readdirSync(restores)).toEqual(before)
    await expect(restoreFullBackup(root,backup,root)).rejects.toThrow('恢复位置')
    writeFileSync(join(restored,'books',id,'source.pdf'),Buffer.alloc(pdf.length,2))
    await expect(validateLibrary(restored)).rejects.toThrow('校验失败')
  })
})
