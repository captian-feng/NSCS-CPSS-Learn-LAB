import { createReadStream } from 'node:fs'
import { access, copyFile, mkdir, rename, stat, unlink } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { basename, dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { getDocument, OPS, Util } from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { ImportEvent, Rect, TocNode } from '../shared/types'
import { LabStore } from '../storage/store'
import { graphicRegions, structurePage, type PositionedText } from './layout'

const pdfRequire=createRequire(import.meta.url)
const pdfRoot=dirname(pdfRequire.resolve('pdfjs-dist/package.json'))
export const REVISION='pdfjs-layout-v1'
async function hashFile(file: string) { const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex') }
const exists=async(p:string)=>access(p).then(()=>true,()=>false)
export async function extractPage(document: PDFDocumentProxy, bookId: string, index: number, label: string) {
  const page=await document.getPage(index+1)
  const viewport=page.getViewport({scale:1})
  const boxes=await graphics(page,viewport.transform)
  const content=await page.getTextContent()
  const items:PositionedText[]=content.items.flatMap(item=>{
    if(!('str' in item))return []
    const tx=Util.transform(viewport.transform,item.transform)
    const height=Math.hypot(tx[2],tx[3]) || item.height || 10
    const details=page.commonObjs.has(item.fontName)?page.commonObjs.get(item.fontName):null
    const font=[details?.name,content.styles[item.fontName]?.fontFamily,item.fontName].filter(Boolean).join(' ')
    return [{text:item.str,x:tx[4],y:tx[5]-height,width:item.width,height,font,bold:Boolean(details?.bold)||/bold|black|heavy/i.test(font),italic:Boolean(details?.italic)||/italic|oblique/i.test(font)}]
  })
  const {blocks,issues}=structurePage(bookId,index,items,viewport.width,viewport.height)
  const regions=graphicRegions(boxes,viewport.width,viewport.height,items)
  const captions=blocks.filter(b=>b.kind==='caption')
  if(captions.length && !regions.length)issues.push('识别到图题，但未能自动确定图表区域，请在原书模式核对。')
  page.cleanup()
  return {page:index,width:viewport.width,height:viewport.height,label,status:blocks.length?'text':'no-text',blocks,regions,issues}
}
async function graphics(page:PDFPageProxy, viewport:number[]):Promise<Rect[]> {
  const ops=await page.getOperatorList()
  let matrix=[1,0,0,1,0,0]
  const stack:number[][]=[],boxes:Rect[]=[]
  const paintedPaths=new Set([OPS.stroke,OPS.closeStroke,OPS.fill,OPS.eoFill,OPS.fillStroke,OPS.eoFillStroke,OPS.closeFillStroke,OPS.closeEOFillStroke])
  const transform=(r:Rect):Rect=>{
    const m=Util.transform(viewport,matrix)
    const points=[[r[0],r[1]],[r[0],r[3]],[r[2],r[1]],[r[2],r[3]]].map(p=>{Util.applyTransform(p,m);return p})
    return [Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]
  }
  for(let i=0;i<ops.fnArray.length;i++) {
    const op=ops.fnArray[i],args=ops.argsArray[i]
    if(op===OPS.save)stack.push([...matrix])
    else if(op===OPS.restore)matrix=stack.pop()??matrix
    else if(op===OPS.transform)matrix=Util.transform(matrix,args)
    else if(op===OPS.constructPath && paintedPaths.has(args[0]) && args[2]?.length===4)boxes.push(transform(args[2]))
    else if([OPS.paintImageXObject,OPS.paintInlineImageXObject,OPS.paintImageMaskXObject].includes(op))boxes.push(transform([0,0,1,1]))
    else if(op===OPS.paintImageXObjectRepeat)for(let j=0;j<args[3].length;j+=2)boxes.push(transform([args[3][j],args[3][j+1],args[3][j]+args[1],args[3][j+1]+args[2]]))
  }
  return boxes
}
export function openPDF(path:string) {
  return getDocument({url:pathToFileURL(path).href,cMapUrl:join(pdfRoot,'cmaps/'),standardFontDataUrl:join(pdfRoot,'standard_fonts/'),wasmUrl:join(pdfRoot,'wasm/'),useSystemFonts:false,isEvalSupported:false}).promise
}
export class Importer {
  private running=new Set<string>()
  private paused=new Set<string>()
  constructor(readonly store:LabStore,readonly emit:(event:ImportEvent)=>void){}
  path(id:string){return join(this.store.root,'books',id,'source.pdf')}
  async add(file:string) {
    const info=await stat(file)
    if(!info.isFile() || info.size<8)throw new Error('请选择有效的 PDF 文件')
    const hash=await hashFile(file),id=hash
    const existing=this.store.books().find(b=>b.hash===hash)
    if(existing?.status==='ready')return {bookId:id}
    if(this.running.has(id))return {bookId:id}
    // Verify PDF structure before creating a persistent book record.
    const document=await openPDF(file)
    const pages=document.numPages
    await document.destroy()
    this.store.createBook(id,basename(file).replace(/\.pdf$/i,''),hash)
    await mkdir(dirname(this.path(id)),{recursive:true})
    try {
      if(!await exists(this.path(id))) {
        const free=await import('node:fs/promises').then(fs=>fs.statfs(this.store.root))
        if(Number(free.bavail)*Number(free.bsize)<info.size*2+50*1024*1024)throw new Error('剩余磁盘空间不足，请至少预留 PDF 大小的两倍及额外 50 MB')
        const temp=this.path(id)+'.partial'
        await copyFile(file,temp)
        if(await hashFile(temp)!==hash){await unlink(temp);throw new Error('教材复制校验失败，请重试')}
        await rename(temp,this.path(id))
      }
      this.store.updateBook(id,{pages,status:'paused',error:null})
      void this.resume(id)
      return {bookId:id}
    }catch(error){this.store.updateBook(id,{status:'failed',error:String(error)});throw error}
  }
  pause(id:string){this.paused.add(id)}
  async resume(id:string) {
    if(this.running.has(id))return
    this.running.add(id);this.paused.delete(id)
    let document:PDFDocumentProxy|undefined
    try {
      const book=this.store.book(id)
      this.store.updateBook(id,{status:'importing',error:null})
      document=await openPDF(this.path(id))
      const labels=await document.getPageLabels()
      this.store.updateBook(id,{pages:document.numPages})
      const nodes:TocNode[]=[]
      const outline=await document.getOutline()
      const walk=async(items:NonNullable<typeof outline>,parentId:string|null,level:number)=>{
        for(const entry of items) {
          const dest=typeof entry.dest==='string'?await document!.getDestination(entry.dest):entry.dest
          let page=0
          if(dest?.[0]!==undefined)page=typeof dest[0]==='number'?dest[0]:await document!.getPageIndex(dest[0])
          const id2=`${id}:toc:${nodes.length}`
          nodes.push({id:id2,bookId:id,parentId,title:entry.title,page,level,source:'pdf-outline'})
          if(entry.items.length)await walk(entry.items,id2,level+1)
        }
      }
      if(outline?.length)await walk(outline,null,0)
      const fallback:TocNode[]=[]
      // Existing processed pages remain untouched on resume; deterministic identities retain annotations.
      for(let index=book.processed;index<document.numPages;index++) {
        if(this.paused.has(id)){this.store.updateBook(id,{status:'paused'});return}
        const data=await extractPage(document,id,index,labels?.[index]??String(index+1))
        this.store.putPage(id,data)
        this.emit({bookId:id,processed:index+1,total:document.numPages,status:'importing'})
        await new Promise(resolve=>setImmediate(resolve))
      }
      if(!nodes.length) {
        // Derive fallback navigation from extracted headings, never invent chapter page numbers.
        let part:string|null=null,chapter:string|null=null
        for(let page=0;page<document.numPages;page++)for(const block of this.store.page(id,page).blocks) {
          if(block.kind!=='heading')continue
          const isPart=/^part\s+[\dIVX]+\b/i.test(block.text),isChapter=/^chapter\s+\d+\b/i.test(block.text)
          const nodeId=`${id}:toc:${block.id}`
          if(isPart || isChapter || chapter)fallback.push({id:nodeId,bookId:id,parentId:isPart?null:isChapter?part:chapter,title:block.text,page,level:isPart?0:isChapter?1:2,source:'heading-inference'})
          if(isPart){part=nodeId;chapter=null}else if(isChapter)chapter=nodeId
        }
        if(!fallback.length)for(let page=0;page<document.numPages;page+=20)fallback.push({id:`${id}:range:${page}`,bookId:id,parentId:null,title:`PDF 第 ${page+1}–${Math.min(page+20,document.numPages)} 页（未识别章节）`,page,level:0,source:'page-fallback'})
      }
      this.store.setToc(id,nodes.length?nodes:fallback)
      this.store.updateBook(id,{status:'ready',error:null})
    }catch(error){
      const message=error instanceof Error?error.message:String(error)
      this.store.updateBook(id,{status:'failed',error:message})
    }finally{
      await document?.destroy();this.running.delete(id)
      const book=this.store.book(id)
      this.emit({bookId:id,processed:book.processed,total:book.pages,status:book.status,error:book.error??undefined})
    }
  }
}
