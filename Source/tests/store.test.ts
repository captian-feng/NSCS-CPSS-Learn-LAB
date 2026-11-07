import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LabStore, newRecord } from '../src/storage/store'
import {publishDraft,submitAnswer} from '../src/practice/engine'
import type { Block } from '../src/shared/types'
const roots:string[]=[],stores:LabStore[]=[]
function open(root=mkdtempSync(join(tmpdir(),'cpss-store-'))) {roots.push(root);const store=new LabStore(root);stores.push(store);return store}
afterEach(()=>{for(const s of stores.splice(0))try{s.close()}catch{};for(const root of roots.splice(0))rmSync(root,{recursive:true,force:true})})
describe('SQLite learning data',()=>{
  it('reports review hints for existing processed pages without claiming unprocessed pages',()=>{
    const s=open(),id='5'.repeat(64);s.createBook(id,'Book',id);s.updateBook(id,{pages:3,status:'paused'})
    const block=(text:string,page:number):Block=>({id:`b${page}`,bookId:id,page,order:0,kind:'paragraph',text,runs:[{text}],rect:[0,0,100,20],level:0})
    s.putPage(id,{page:0,width:600,height:800,label:'1',status:'text',blocks:[block('Table 1 � �',0)],regions:[],issues:[]})
    s.putPage(id,{page:1,width:600,height:800,label:'2',status:'no-text',blocks:[],regions:[],issues:['没有文本']})
    const report=s.report(id)
    expect(report.processedPages).toBe(2)
    expect(report.issues.filter(issue=>issue.page===1).map(issue=>issue.message)).toEqual(expect.arrayContaining([expect.stringContaining('文本较少'),expect.stringContaining('替代字符'),expect.stringContaining('表格标题')]))
    expect(report.issues).toContainEqual({page:2,message:'没有文本'})
    expect(report.issues.some(issue=>issue.page===3)).toBe(false)
  })
  it('deletes only the selected manual chapter and its progress',()=>{
    const s=open(),id='8'.repeat(64),other='7'.repeat(64)
    s.createBook(id,'Book',id);s.updateBook(id,{status:'ready',pages:4})
    s.createBook(other,'Other',other);s.updateBook(other,{status:'ready',pages:4})
    const chapter=s.addManualToc(id,'Manual',1),second=s.addManualToc(other,'Other',1)
    s.setToc(id,[{id:'outline',bookId:id,parentId:null,title:'Outline',page:0,level:0,source:'pdf-outline'}])
    s.setProgress(id,chapter.id,'已完成');s.setProgress(id,'outline','学习中')
    const note=newRecord(id,1,'note',null,'Keep this note');s.saveRecord(note)
    expect(()=>s.removeManualToc(id,'outline')).toThrow('只能删除')
    expect(s.removeManualToc(id,second.id)).toBe(false)
    expect(s.removeManualToc(id,chapter.id)).toBe(true)
    expect(s.removeManualToc(id,chapter.id)).toBe(false)
    expect(s.detail(id).toc.map(n=>n.id)).toEqual(['outline'])
    expect(s.detail(id).progress.map(p=>p.nodeId)).toEqual(['outline'])
    expect(s.records(id)).toEqual([note]);expect(s.detail(other).toc).toContainEqual(second)
    expect(s.backup().manualToc).toEqual([second])
  })
  it('preserves manual chapters through regenerated outlines and backup restore',()=>{
    const source=open(),id='9'.repeat(64);source.createBook(id,'Book',id);source.updateBook(id,{status:'ready',pages:10})
    const chapter=source.addManualToc(id,'第一章',2)
    expect(()=>source.addManualToc(id,'Bad',10)).toThrow('页码')
    expect(()=>source.addManualToc(id,' ',0)).toThrow()
    const outline={id:'auto',bookId:id,parentId:null,title:'Original',page:0,level:0,source:'pdf-outline'}
    source.setToc(id,[outline]);expect(source.detail(id).toc).toContainEqual(chapter)
    source.setProgress(id,chapter.id,'已完成')
    const updated=source.updateManualToc(id,chapter.id,'修订章节',3)
    expect(updated.id).toBe(chapter.id)
    expect(source.detail(id).progress[0].status).toBe('已完成')
    expect(()=>source.updateManualToc(id,'auto','Invalid',1)).toThrow('手动章节不存在')
    expect(()=>source.updateManualToc(id,chapter.id,'Invalid',10)).toThrow('页码')
    const target=open(),backup=source.backup()
    target.restore(backup);expect(target.detail(id).toc).toEqual([updated])
    expect(target.detail(id).progress[0].status).toBe('已完成')
    expect(target.restore(backup).skipped).toBe(1)
    target.updateBook(id,{pages:10,status:'ready'});target.setToc(id,[outline])
    expect(target.detail(id).toc).toContainEqual(updated)
    const conflict={...backup,manualToc:[{...updated,title:'Different'}]}
    expect(()=>target.restore(conflict)).toThrow('冲突')
    expect(target.detail(id).toc).toContainEqual(updated)
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
  it('persists book metadata and refuses conflicting backup merges',()=>{
    const s=open(),id='1'.repeat(64);s.createBook(id,'Original',id)
    s.updateBookMetadata(id,{title:'教材',author:'作者',category:'运动科学',language:'中文'})
    const backup=s.backup();s.close();stores.pop()
    const reopened=open(s.root)
    expect(reopened.book(id)).toMatchObject({title:'教材',author:'作者',category:'运动科学',language:'中文'})
    const target=open();target.restore(backup)
    expect(target.book(id)).toMatchObject({author:'作者',category:'运动科学',language:'中文'})
    target.updateBookMetadata(id,{title:'教材',author:'另一作者',category:'运动科学',language:'中文'})
    expect(()=>target.restore(backup)).toThrow('元数据')
    expect(target.book(id).author).toBe('另一作者')
    expect(()=>open().restore({...backup,books:backup.books.map(({author:_,...book})=>book)})).toThrow('元数据')
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
  it('writes version 6 backups and accepts older version 1 through 5 backups',()=>{
    const source=open(),id='6'.repeat(64);source.createBook(id,'Book',id)
    source.saveRecord(newRecord(id,0,'note',null,'Existing note'))
    const backup=source.backup()
    expect(backup.schemaVersion).toBe(6)
    expect(open().restore({...backup,schemaVersion:5}).inserted).toBe(1)
    expect(open().restore({...backup,schemaVersion:4}).inserted).toBe(1)
    expect(open().restore({...backup,schemaVersion:3}).inserted).toBe(1)
    const {questionDrafts:___,...version2}=backup
    expect(open().restore({...version2,schemaVersion:2}).inserted).toBe(1)
    expect(()=>open().restore(version2)).toThrow('缺少题目草稿数据')
    const {customBanks:_,manualToc:__,...old}=version2
    const target=open();expect(target.restore({...old,schemaVersion:1}).inserted).toBe(1)
    expect(()=>open().restore({...old,schemaVersion:2})).toThrow('缺少题库或手动章节数据')
  })
  it('preserves generated drafts across reopening and backup restore',()=>{
    const s=open(),id='5'.repeat(64);s.createBook(id,'Book',id);s.updateBook(id,{status:'ready',pages:1})
    const block:Block={id:'draft-block',bookId:id,page:0,order:0,kind:'paragraph',text:'运动训练可以提高肌力和耐力。',runs:[],rect:[0,0,100,20],level:0}
    s.putPage(id,{page:0,width:600,height:800,label:'1',status:'text',issues:[],blocks:[block],regions:[]})
    const draft={page:0,model:'local:model',topic:'训练',prompt:'训练的作用？',correct:0,quote:'提高肌力和耐力',options:[{text:'A',explanation:'A解说'},{text:'B',explanation:'B解说'},{text:'C',explanation:'C解说'},{text:'D',explanation:'D解说'}]}
    expect(()=>s.saveQuestionDraft(id,{...draft,quote:'不存在的引用'})).toThrow('来源页面已变化')
    const saved=s.saveQuestionDraft(id,draft)
    expect(()=>s.updateQuestionDraft(id,saved,{...saved,quote:'不存在的引用'})).toThrow('无法在来源页面定位')
    const edited=s.updateQuestionDraft(id,saved,{...saved,prompt:'修改后的题目',correct:1})
    expect(()=>s.updateQuestionDraft(id,saved,{...saved,prompt:'过期编辑'})).toThrow('草稿已更改')
    s.close();stores.pop()
    const reopened=open(s.root);expect(reopened.questionDrafts(id)).toEqual([edited])
    const target=open(),backup=reopened.backup();expect(target.restore(backup).inserted).toBe(1)
    expect(target.questionDrafts(id)).toEqual([edited]);expect(target.restore(backup).skipped).toBe(1)
    expect(()=>target.restore({...backup,questionDrafts:[{...edited,prompt:'冲突'}]})).toThrow('冲突')
    expect(target.questionDrafts(id)).toEqual([edited])
  })
  it('publishes reviewed drafts without changing earlier questions or attempts',()=>{
    const s=open(),id='4'.repeat(64);s.createBook(id,'Book',id);s.updateBook(id,{status:'ready',pages:1})
    const block:Block={id:'source',bookId:id,page:0,order:0,kind:'paragraph',text:'运动训练可以提高肌力和耐力。',runs:[],rect:[0,0,100,20],level:0}
    s.putPage(id,{page:0,width:600,height:800,label:'1',status:'text',issues:[],blocks:[block],regions:[]})
    const content={page:0,model:'local:model',topic:'训练',prompt:'训练的作用？',correct:0,quote:'提高肌力和耐力',options:[{text:'A',explanation:'A解说'},{text:'B',explanation:'B解说'},{text:'C',explanation:'C解说'},{text:'D',explanation:'D解说'}]}
    const first=s.saveQuestionDraft(id,content),args={bookId:id,expected:first,chapter:1,chapterTitle:'第一章'}
    expect(publishDraft(s,args).questions).toHaveLength(1)
    submitAnswer(s,{id:'first-attempt',bookId:id,questionId:`draft-${first.id}`,selected:0})
    const second=s.saveQuestionDraft(id,{...content,prompt:'第二题'})
    const state=publishDraft(s,{...args,expected:second})
    expect(state.questions).toHaveLength(2);expect(state.answers[0].correct).toBe(true)
    expect(publishDraft(s,args).questions).toHaveLength(2)
    expect(()=>s.updateQuestionDraft(id,first,{...first,prompt:'修改已发布题'})).toThrow('已发布')
    expect(()=>publishDraft(s,{...args,chapter:2})).toThrow('不能覆盖')
    const restored=open();restored.restore(s.backup())
    expect(restored.questionDrafts(id)).toHaveLength(2)
    expect(restored.backup().practiceAnswers).toHaveLength(1)
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
  it('searches multiple ready books and includes their identities in results',()=>{
    const s=open(),first='1'.repeat(64),second='2'.repeat(64),paused='3'.repeat(64)
    for(const id of [first,second,paused]){
      s.createBook(id,id===first?'教材甲':id===second?'教材乙':'未完成教材',id)
      s.updateBook(id,{status:id===paused?'paused':'ready',pages:1})
      const block:Block={id:`${id}-block`,bookId:id,page:0,order:0,kind:'paragraph',text:'运动训练提高肌力。',runs:[],rect:[0,0,100,20],level:0}
      s.putPage(id,{page:0,width:600,height:800,label:'1',status:'text',issues:[],blocks:[block],regions:[]})
    }
    const hits=s.searchAll('肌力')
    expect(hits.map(hit=>hit.bookId).sort()).toEqual([first,second])
    expect(hits.map(hit=>hit.bookTitle).sort()).toEqual(['教材乙','教材甲'].sort())
    expect(s.searchAll('肌力',[first]).map(hit=>hit.bookId)).toEqual([first])
    expect(s.searchAll('肌力',[])).toEqual([])
    expect(s.searchAll('')).toEqual([])
  })
  it('includes results from other books when one book has many matches',()=>{
    const s=open(),first='1'.repeat(64),second='2'.repeat(64)
    for(const id of [first,second]){
      s.createBook(id,'Book',id);s.updateBook(id,{status:'ready',pages:1})
      const count=id===second?60:1
      const blocks:Block[]=Array.from({length:count},(_,i)=>({id:`${id}-${i}`,bookId:id,page:0,order:i,kind:'paragraph',text:'needle',runs:[],rect:[0,0,100,20],level:0}))
      s.putPage(id,{page:0,width:600,height:800,label:'1',status:'text',issues:[],blocks,regions:[]})
    }
    for(let i=0;i<30;i++)s.saveRecord(newRecord(second,0,'note',null,'needle'))
    const hits=s.searchAll('needle')
    expect(hits).toHaveLength(90)
    expect(hits.some(hit=>hit.bookId===first)).toBe(true)
    expect(hits.some(hit=>hit.bookId===second)).toBe(true)
  })
})
