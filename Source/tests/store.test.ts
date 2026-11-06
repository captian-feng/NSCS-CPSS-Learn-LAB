import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LabStore, newRecord } from '../src/storage/store'
import type { Block } from '../src/shared/types'
const roots:string[]=[],stores:LabStore[]=[]
function open(root=mkdtempSync(join(tmpdir(),'cpss-store-'))) {roots.push(root);const store=new LabStore(root);stores.push(store);return store}
afterEach(()=>{for(const s of stores.splice(0))try{s.close()}catch{};for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
describe('SQLite learning data',()=>{
  it('preserves manual chapters through regenerated outlines and backup restore',()=>{
    const source=open(),id='9'.repeat(64);source.createBook(id,'Book',id);source.updateBook(id,{status:'ready',pages:10})
    const chapter=source.addManualToc(id,'第一章',2)
    expect(()=>source.addManualToc(id,'Bad',10)).toThrow('页码')
    expect(()=>source.addManualToc(id,' ',0)).toThrow()
    const outline={id:'auto',bookId:id,parentId:null,title:'Original',page:0,level:0,source:'pdf-outline'}
    source.setToc(id,[outline]);expect(source.detail(id).toc).toContainEqual(chapter)
    source.setProgress(id,chapter.id,'已完成')
    const target=open(),backup=source.backup()
    target.restore(backup);expect(target.detail(id).toc).toEqual([chapter])
    expect(target.detail(id).progress[0].status).toBe('已完成')
    expect(target.restore(backup).skipped).toBe(1)
    target.updateBook(id,{pages:10,status:'ready'});target.setToc(id,[outline])
    expect(target.detail(id).toc).toContainEqual(chapter)
    const conflict={...backup,manualToc:[{...chapter,title:'Different'}]}
    expect(()=>target.restore(conflict)).toThrow('冲突')
    expect(target.detail(id).toc).toContainEqual(chapter)
  })
  it('renames a book without changing its identity or learning data and retains its name in backups',()=>{
    const s=open(),id='a'.repeat(64);s.createBook(id,'Original',id)
    const record=newRecord(id,0,'note',null,'kept');s.saveRecord(record)
    expect(s.renameBook(id,'  新教材  ').title).toBe('新教材')
    expect(()=>s.renameBook(id,'   ')).toThrow()
    expect(()=>s.renameBook('missing','Title')).toThrow('教材不存在')
    s.close();stores.pop()
    const reopened=open(s.root)
    expect(reopened.book(id).hash).toBe(id)
    expect(reopened.book(id).title).toBe('新教材')
    expect(reopened.records(id)).toEqual([record])
    const restored=open();restored.restore(reopened.backup())
    expect(restored.book(id).title).toBe('新教材')
    expect(restored.records(id)).toEqual([record])
  })
  it('persists annotations, progress, position and settings across process-style reopening',()=>{
    const s=open(),id='a'.repeat(64);s.createBook(id,'Fixture',id)
    const note=newRecord(id,2,'note',{revision:'pdfjs-layout-v1',page:2,quote:'Training',mode:'html',startBlock:'block',endBlock:'block',start:0,end:8},'中文笔记')
    s.saveRecord(note);s.savePosition(id,{page:2,blockId:'block'});s.setProgress(id,'chapter','需要复习');s.setSetting('theme','dark');s.close();stores.pop()
    const reopened=open(s.root)
    expect(reopened.detail(id).records).toEqual([note]);expect(reopened.detail(id).position).toEqual({page:2,blockId:'block'})
    expect(reopened.detail(id).progress[0].status).toBe('需要复习');expect(reopened.snapshot().settings.theme).toBe('dark')
  })
  it('restores into a new library, retains missing PDF identity, and is idempotent',()=>{
    const source=open(),id='b'.repeat(64);source.createBook(id,'Book',id)
    source.saveRecord(newRecord(id,1,'card',null,'Force x distance'));source.savePosition(id,{page:1});source.setProgress(id,'chapter','已完成')
    const backup=source.backup(),target=open()
    expect(target.restore(backup)).toEqual({inserted:1,skipped:0});expect(target.books()[0].status).toBe('missing')
    expect(target.restore(backup)).toEqual({inserted:0,skipped:1});expect(target.detail(id).records).toEqual(source.detail(id).records)
    expect(target.detail(id).position).toEqual({page:1});expect(target.detail(id).progress).toEqual(source.detail(id).progress)
  })
  it('rejects invalid versions and rolls back an entire conflicting restore',()=>{
    const s=open(),id='c'.repeat(64);s.createBook(id,'Book',id)
    const record=newRecord(id,0,'note',null,'current');s.saveRecord(record)
    const backup=s.backup();backup.records=[newRecord(id,0,'note',null,'new'),{...record,text:'conflict'}]
    expect(()=>s.restore(backup)).toThrow('冲突');expect(s.records(id)).toHaveLength(1)
    expect(()=>s.restore({...backup,schemaVersion:99})).toThrow()
    expect(()=>s.saveRecord({...record,page:-1})).toThrow()
  })
  it('indexes real extracted blocks and handles query punctuation without SQL/FTS injection',()=>{
    const s=open(),id='d'.repeat(64);s.createBook(id,'Book',id)
    const block:Block={id:'b1',bookId:id,page:0,order:0,kind:'paragraph',text:'Neuromuscular adaptation supports athletic performance.',runs:[{text:'Neuromuscular adaptation supports athletic performance.'}],rect:[0,0,100,20],level:0}
    s.putPage(id,{page:0,width:600,height:800,label:'1',status:'text',issues:[],blocks:[block],regions:[]})
    expect(s.search(id,'neuromuscular adapt')[0].id).toBe('b1');expect(s.search(id,'" OR * --')).toEqual([])
    const note=newRecord(id,0,'note',null,'肌力与表现');s.saveRecord(note);expect(s.search(id,'肌力')[0].type).toBe('note')
    s.putPage(id,{page:0,width:600,height:800,label:'1',status:'text',issues:[],blocks:[block],regions:[]});expect(s.search(id,'adaptation')).toHaveLength(1)
  })
  it('finds Chinese phrases within a block and keeps results scoped to the selected book',()=>{
    const s=open(),id='e'.repeat(64),other='f'.repeat(64)
    s.createBook(id,'中文教材',id);s.createBook(other,'另一本教材',other)
    for (const bookId of [id,other]) {
      const block:Block={id:`${bookId}-1`,bookId,page:0,order:0,kind:'paragraph',text:'运动训练可以提高肌力和耐力。',runs:[],rect:[0,0,100,20],level:0}
      s.putPage(bookId,{page:0,width:600,height:800,label:'1',status:'text',issues:[],blocks:[block],regions:[]})
    }
    expect(s.search(id,'肌力').map(hit=>hit.id)).toEqual([`${id}-1`])
    expect(s.search(id,'肌力 耐力').map(hit=>hit.id)).toEqual([`${id}-1`])
    expect(s.search(id,'不存在')).toEqual([])
  })
})
