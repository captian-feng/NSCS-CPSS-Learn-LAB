import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { getDocument, GlobalWorkerOptions, TextLayer } from 'pdfjs-dist'
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import 'pdfjs-dist/web/pdf_viewer.css'
import type { Anchor, Rect, StudyRecord } from '../shared/types'

GlobalWorkerOptions.workerSrc=workerURL
export function useDocument(bookId:string|undefined) {
  const [document,setDocument]=useState<PDFDocumentProxy|null>(null),[error,setError]=useState('')
  useEffect(()=>{
    setDocument(null);setError('')
    if(!bookId)return
    const task=getDocument({url:`cpss://book/${bookId}/source.pdf`,cMapUrl:new URL('./pdf-assets/cmaps/',location.href).href,standardFontDataUrl:new URL('./pdf-assets/standard_fonts/',location.href).href,wasmUrl:new URL('./pdf-assets/wasm/',location.href).href,isEvalSupported:false})
    let alive=true
    task.promise.then(doc=>{if(alive)setDocument(doc)}).catch(e=>{if(alive)setError(String(e))})
    return ()=>{alive=false;void task.destroy()}
  },[bookId])
  return {document,error}
}
// Keep page geometry in the scroll flow, but only allocate canvases near the viewport.
export function PDFPane({document,page,jumpRequest,records,onSelect,onPageChange,zoom,onZoom,focusedRecord,onRecordClick}:{document:PDFDocumentProxy|null;page:number;jumpRequest:{page:number;serial:number;top?:number};records:StudyRecord[];onSelect:(anchor:Anchor|null)=>void;onPageChange:(page:number)=>void;zoom:number;onZoom:(value:number)=>void;focusedRecord:string;onRecordClick:(record:StudyRecord)=>void}) {
  const root=useRef<HTMLDivElement>(null),pagesRoot=useRef<HTMLDivElement>(null)
  const [width,setWidth]=useState(600),[ratios,setRatios]=useState<number[]>([]),[geometryError,setGeometryError]=useState('')
  const [visible,setVisible]=useState<Set<number>>(new Set())
  const frame=useRef(0),pageRef=useRef(page),lastJump=useRef(jumpRequest)
  pageRef.current=page
  useEffect(()=>{
    const element=root.current
    if(!element)return
    const observer=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width))
    observer.observe(element);return ()=>observer.disconnect()
  },[])
  useEffect(()=>{
    setRatios([]);setGeometryError('')
    if(!document)return
    let alive=true
    void (async()=>{
      const dimensions:number[]=[]
      // Metadata only: no image decoding or page canvases here. Exact sizes prevent
      // preceding pages changing height and shifting the current reading position.
      for(let start=0;start<document.numPages;start+=16){
        const batch=await Promise.all(Array.from({length:Math.min(16,document.numPages-start)},async(_,i)=>{
          const source=await document.getPage(start+i+1),viewport=source.getViewport({scale:1})
          return viewport.height/viewport.width
        }))
        if(!alive)return
        dimensions.push(...batch)
      }
      setRatios(dimensions)
    })().catch(e=>{if(alive)setGeometryError(String(e))})
    return ()=>{alive=false}
  },[document])
  const pageWidth=Math.max(120,width-32)*zoom
  useEffect(()=>{
    const element=root.current,list=pagesRoot.current
    if(!element||!list||!document)return
    setVisible(new Set())
    const observer=new IntersectionObserver(entries=>{
      setVisible(previous=>{const next=new Set(previous);for(const entry of entries){const index=Number((entry.target as HTMLElement).dataset.pageIndex);if(entry.isIntersecting)next.add(index);else next.delete(index)}return next})
    },{root:element,rootMargin:'900px 0px'})
    for(const child of list.children)observer.observe(child)
    return ()=>observer.disconnect()
  },[document,ratios])
  useLayoutEffect(()=>{
    const element=root.current,list=pagesRoot.current
    if(!element||!list||!document)return
    const isJump=lastJump.current!==jumpRequest
    const requested=isJump?jumpRequest.page:pageRef.current
    lastJump.current=jumpRequest
    const destination=list.children[Math.min(document.numPages-1,requested)] as HTMLElement|undefined
    if(destination)element.scrollTop=destination.offsetTop+(isJump&&jumpRequest.top!==undefined?destination.clientHeight*jumpRequest.top-80:-12)
  },[document,jumpRequest,width,zoom,ratios])
  useEffect(()=>{
    const element=root.current
    if(!element)return
    const wheel=(event:WheelEvent)=>{if(!event.ctrlKey)return;event.preventDefault();onZoom(zoom*Math.exp(-Math.max(-100,Math.min(100,event.deltaY))*.002))}
    element.addEventListener('wheel',wheel,{passive:false})
    return ()=>element.removeEventListener('wheel',wheel)
  },[zoom,onZoom])
  useEffect(()=>()=>cancelAnimationFrame(frame.current),[])
  const scroll=()=>{
    cancelAnimationFrame(frame.current)
    frame.current=requestAnimationFrame(()=>{
      const element=root.current,list=pagesRoot.current
      if(!element||!list)return
      const marker=element.scrollTop+60
      let low=0,high=list.children.length-1
      while(low<high){const mid=Math.ceil((low+high)/2);if((list.children[mid] as HTMLElement).offsetTop<=marker)low=mid;else high=mid-1}
      if(low!==pageRef.current){pageRef.current=low;onPageChange(low)}
    })
  }
  return <div className="pdf-pane" ref={root} onScroll={scroll} aria-label="连续 PDF 阅读区">

    {geometryError?<div className="error">{geometryError}</div>:!document||!ratios.length?<div className="loading">正在加载原书…</div>:<div className="pdf-pages" ref={pagesRoot}>
      {Array.from({length:document.numPages},(_,index)=><PDFPage key={index} document={document} page={index} width={pageWidth} aspect={ratios[index]} active={visible.has(index)} records={records.filter(r=>r.page===index)} onSelect={onSelect} focusedRecord={focusedRecord} onRecordClick={onRecordClick}/>)}
    </div>}
  </div>
}
function PDFPage({document,page,width,aspect,active,records,onSelect,focusedRecord,onRecordClick}:{document:PDFDocumentProxy;page:number;width:number;aspect:number;active:boolean;records:StudyRecord[];onSelect:(anchor:Anchor|null)=>void;focusedRecord:string;onRecordClick:(record:StudyRecord)=>void}) {
  const canvas=useRef<HTMLCanvasElement>(null),layer=useRef<HTMLDivElement>(null)
  const [error,setError]=useState('')
  useEffect(()=>{
    if(!active||!canvas.current||!layer.current)return
    let alive=true,render:RenderTask|undefined,text:TextLayer|undefined
    const target=canvas.current,container=layer.current
    setError('')
    void (async()=>{
      const source=await document.getPage(page+1)
      if(!alive)return
      const base=source.getViewport({scale:1}),scale=width/base.width
      const viewport=source.getViewport({scale}),ratio=Math.min(window.devicePixelRatio||1,2)
      target.width=Math.ceil(viewport.width*ratio);target.height=Math.ceil(viewport.height*ratio)
      target.style.width=`${viewport.width}px`;target.style.height=`${viewport.height}px`
      container.replaceChildren();container.style.setProperty('--scale-factor',String(scale));container.style.setProperty('--total-scale-factor',String(scale))
      render=source.render({canvas:target,canvasContext:target.getContext('2d')!,viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0]})
      await render.promise
      const content=await source.getTextContent()
      if(!alive)return
      text=new TextLayer({textContentSource:content,container,viewport});await text.render()
    })().catch(e=>{if(alive)setError(String(e))})
    return ()=>{alive=false;render?.cancel();text?.cancel()}
  },[document,page,width,active])
  const select=()=>{
    const selection=window.getSelection(),element=layer.current
    if(!selection||selection.isCollapsed||!selection.rangeCount||!element?.contains(selection.getRangeAt(0).commonAncestorContainer)){onSelect(null);return}
    const bounds=element.getBoundingClientRect()
    const rects:Rect[]=[...selection.getRangeAt(0).getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>[(r.left-bounds.left)/bounds.width,(r.top-bounds.top)/bounds.height,(r.right-bounds.left)/bounds.width,(r.bottom-bounds.top)/bounds.height])
    onSelect({revision:'pdfjs-layout-v1',mode:'pdf',page,quote:selection.toString(),rects})
  }
  return <div className="pdf-page" data-page-index={page} aria-label={`PDF 第 ${page+1} 页`} style={{width,height:width*aspect}} onMouseUp={select}>
    {active?<><canvas ref={canvas}/><div className="textLayer" ref={layer}/>{error&&<div className="error">{error}</div>}<div className="pdf-marks">{records.filter(r=>r.anchor?.mode==='pdf').flatMap(r=>(r.anchor?.rects??[]).map((box,index)=><div key={`${r.id}-${index}`} onClick={()=>onRecordClick(r)} className={`pdf-mark ${focusedRecord===r.id?'focused':''} ${r.kind==='underline'?'under':''} ${r.color}`} style={{left:`${box[0]*100}%`,top:`${box[1]*100}%`,width:`${(box[2]-box[0])*100}%`,height:`${(box[3]-box[1])*100}%`}} title={r.text||r.anchor?.quote}/>))}</div></>:<div className="page-placeholder">PDF 第 {page+1} 页</div>}
  </div>
}
