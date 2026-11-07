import { z } from 'zod'
import {importCustomBank,practiceState,publishDraft,submitAnswer,verifyQuestionSource,verifyBankSources} from '../practice/engine'
import {generateLocalDraft,localDraftSchema} from '../practice/local-draft'
import { parentPort, workerData } from 'node:worker_threads'
import { initializeBundledLibrary } from '../storage/bundled-library'
import { LabStore } from '../storage/store'
import { exportFullBackup,restoreFullBackup,validateLibrary } from '../storage/full-backup'
import { Importer } from '../importer/importer'
import type { ImportEvent } from '../shared/types'

if(!parentPort)throw new Error('Data service requires a Node worker thread')
const port=parentPort
const data=workerData as {root:string;bundledRoot?:string;testModelPort?:number;startupWarning?:string}
const store=new LabStore(data.root)
let bootstrapError:string|undefined=data.startupWarning||undefined
try{await initializeBundledLibrary(store,data.bundledRoot)}catch(error){bootstrapError=[bootstrapError,error instanceof Error?error.message:String(error)].filter(Boolean).join('；')}
const importer=new Importer(store,(event:ImportEvent)=>port.postMessage({type:'progress',event}))
const id=z.string().min(1).max(200)
const page=z.number().int().nonnegative().max(100000)
const methods:Record<string,(args:unknown)=>unknown>={
  practice:args=>practiceState(store,id.parse(args)),
  verifyQuestionSource:args=>verifyQuestionSource(store,args),
  verifyBankSources:args=>verifyBankSources(store,id.parse(args)),
  importQuestionBank:args=>{const a=z.object({bookId:id,bank:z.unknown()}).parse(args);return importCustomBank(store,a.bookId,a.bank)},
  questionDrafts:args=>store.questionDrafts(id.parse(args)),
  createManualDraft:args=>{const a=z.object({bookId:id,draft:localDraftSchema}).parse(args);return store.saveQuestionDraft(a.bookId,{...a.draft,model:'手工创建'})},
  updateQuestionDraft:args=>{const a=z.object({bookId:id,expected:z.unknown(),updated:z.unknown()}).parse(args);return store.updateQuestionDraft(a.bookId,a.expected,a.updated)},
  publishDraft:args=>publishDraft(store,args),
  generateLocalDraft:async args=>{
    const a=z.object({bookId:id,page,model:z.string().min(1).max(200)}).parse(args)
    const book=store.book(a.bookId)
    if(book.status!=='ready'||a.page>=book.pages)throw new Error('教材或来源页面尚未准备好')
    const text=store.page(a.bookId,a.page).blocks.map(block=>block.text).join('\n')
    const draft=await generateLocalDraft(a.page,text,a.model,data.testModelPort)
    return store.saveQuestionDraft(a.bookId,draft)
  },
  answer:args=>submitAnswer(store,args),
  snapshot:()=>({...store.snapshot(),bootstrapError}),
  detail:args=>store.detail(id.parse(args)),
  renameBook:args=>{const a=z.object({bookId:id,title:z.string()}).parse(args);return store.renameBook(a.bookId,a.title)},
  updateBookMetadata:args=>{const a=z.object({bookId:id,metadata:z.unknown()}).parse(args);return store.updateBookMetadata(a.bookId,a.metadata)},
  addManualToc:args=>{const a=z.object({bookId:id,title:z.string(),page}).parse(args);return store.addManualToc(a.bookId,a.title,a.page)},
  updateManualToc:args=>{const a=z.object({bookId:id,nodeId:id,title:z.string(),page}).parse(args);return store.updateManualToc(a.bookId,a.nodeId,a.title,a.page)},
  removeManualToc:args=>{const a=z.object({bookId:id,nodeId:id}).parse(args);return store.removeManualToc(a.bookId,a.nodeId)},
  page:args=>{const a=z.object({bookId:id,page}).parse(args);return store.page(a.bookId,a.page)},
  search:args=>{const a=z.object({bookId:id,query:z.string().max(500)}).parse(args);return store.search(a.bookId,a.query)},
  searchAll:args=>{
    const parsed=z.union([z.string().max(500),z.object({query:z.string().max(500),bookIds:z.array(id).max(1000).optional()})]).parse(args)
    return typeof parsed==='string'?store.searchAll(parsed):store.searchAll(parsed.query,parsed.bookIds)
  },
  saveRecord:args=>store.saveRecord(args),
  removeRecord:args=>store.removeRecord(id.parse(args)),
  position:args=>{const a=z.object({bookId:id,page,blockId:z.string().max(200).optional()}).parse(args);store.savePosition(a.bookId,{page:a.page,blockId:a.blockId})},
  progress:args=>{const a=z.object({bookId:id,nodeId:id,status:z.enum(['未开始','学习中','已完成','需要复习'])}).parse(args);store.setProgress(a.bookId,a.nodeId,a.status)},
  setting:args=>{const a=z.object({key:z.enum(['theme','fontSize','lineHeight','readerWidth','mode','lastBook','rightPanel','navWidth','tocWidth','notesWidth','pdfZoom']),value:z.union([z.string().max(300),z.number().finite(),z.boolean()])}).parse(args);store.setSetting(a.key,a.value)},
  pause:args=>importer.pause(id.parse(args)),
  resume:args=>{const bookId=id.parse(args);if(store.book(bookId).status==='missing')throw new Error('请先重新导入对应教材 PDF');void importer.resume(bookId)},
  report:args=>store.report(id.parse(args)),
  importPath:args=>importer.add(z.string().max(2000).parse(args)),
  backup:()=>store.backup(), fullBackup:args=>exportFullBackup(store.db,store.root,z.string().min(1).max(2000).parse(args)),
  restoreFull:args=>{const a=z.object({source:z.string().min(1).max(2000),destination:z.string().min(1).max(2000)}).parse(args);return restoreFullBackup(store.root,a.source,a.destination)},
  validateLibrary:args=>validateLibrary(z.string().min(1).max(2000).parse(args)),
  switchingState:()=>store.books().map(book=>({status:book.status})),
  markdown:()=>store.markdown(), restore:args=>store.restore(args)
}
port.on('message',async (request:{id:string;method:string;args:unknown})=>{
  try {
    if(!Object.hasOwn(methods,request.method))throw new Error('未知操作')
    const value=await methods[request.method](request.args)
    port.postMessage({type:'reply',id:request.id,value})
  }catch(error){port.postMessage({type:'reply',id:request.id,error:error instanceof Error?error.message:String(error)})}
})
port.postMessage({type:'ready'})
