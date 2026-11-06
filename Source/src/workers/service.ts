import { z } from 'zod'
import {importCustomBank,practiceState,submitAnswer} from '../practice/engine'
import { parentPort, workerData } from 'node:worker_threads'
import { initializeBundledLibrary } from '../storage/bundled-library'
import { LabStore } from '../storage/store'
import { Importer } from '../importer/importer'
import type { ImportEvent } from '../shared/types'

if(!parentPort)throw new Error('Data service requires a Node worker thread')
const port=parentPort
const data=workerData as {root:string;bundledRoot?:string}
const store=new LabStore(data.root)
let bootstrapError:string|undefined
try{await initializeBundledLibrary(store,data.bundledRoot)}catch(error){bootstrapError=error instanceof Error?error.message:String(error)}
const importer=new Importer(store,(event:ImportEvent)=>port.postMessage({type:'progress',event}))
const id=z.string().min(1).max(200)
const page=z.number().int().nonnegative().max(100000)
const methods:Record<string,(args:unknown)=>unknown>={
  practice:args=>practiceState(store,id.parse(args)),
  importQuestionBank:args=>{const a=z.object({bookId:id,bank:z.unknown()}).parse(args);return importCustomBank(store,a.bookId,a.bank)},
  answer:args=>submitAnswer(store,args),
  snapshot:()=>({...store.snapshot(),bootstrapError}),
  detail:args=>store.detail(id.parse(args)),
  renameBook:args=>{const a=z.object({bookId:id,title:z.string()}).parse(args);return store.renameBook(a.bookId,a.title)},
  addManualToc:args=>{const a=z.object({bookId:id,title:z.string(),page}).parse(args);return store.addManualToc(a.bookId,a.title,a.page)},
  page:args=>{const a=z.object({bookId:id,page}).parse(args);return store.page(a.bookId,a.page)},
  search:args=>{const a=z.object({bookId:id,query:z.string().max(500)}).parse(args);return store.search(a.bookId,a.query)},
  saveRecord:args=>store.saveRecord(args),
  removeRecord:args=>store.removeRecord(id.parse(args)),
  position:args=>{const a=z.object({bookId:id,page,blockId:z.string().max(200).optional()}).parse(args);store.savePosition(a.bookId,{page:a.page,blockId:a.blockId})},
  progress:args=>{const a=z.object({bookId:id,nodeId:id,status:z.enum(['未开始','学习中','已完成','需要复习'])}).parse(args);store.setProgress(a.bookId,a.nodeId,a.status)},
  setting:args=>{const a=z.object({key:z.enum(['theme','fontSize','lineHeight','readerWidth','mode','lastBook','rightPanel','navWidth','tocWidth','notesWidth','pdfZoom']),value:z.union([z.string().max(300),z.number().finite(),z.boolean()])}).parse(args);store.setSetting(a.key,a.value)},
  pause:args=>importer.pause(id.parse(args)),
  resume:args=>{const bookId=id.parse(args);if(store.book(bookId).status==='missing')throw new Error('请先重新导入对应教材 PDF');void importer.resume(bookId)},
  report:args=>store.report(id.parse(args)),
  importPath:args=>importer.add(z.string().max(2000).parse(args)),
  backup:()=>store.backup(), markdown:()=>store.markdown(), restore:args=>store.restore(args)
}
port.on('message',async (request:{id:string;method:string;args:unknown})=>{
  try {
    if(!Object.hasOwn(methods,request.method))throw new Error('未知操作')
    const value=await methods[request.method](request.args)
    port.postMessage({type:'reply',id:request.id,value})
  }catch(error){port.postMessage({type:'reply',id:request.id,error:error instanceof Error?error.message:String(error)})}
})
port.postMessage({type:'ready'})
