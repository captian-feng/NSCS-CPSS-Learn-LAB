import type { Anchor, Block, StudyRecord } from '../shared/types'

export function offsetsForBlock(anchor:Anchor,block:Block,blocks:Block[]):[number,number]|null {
  if(anchor.mode!=='html' || anchor.page!==block.page || !anchor.quote)return null
  const start=blocks.findIndex(b=>b.id===anchor.startBlock),end=blocks.findIndex(b=>b.id===anchor.endBlock),current=blocks.findIndex(b=>b.id===block.id)
  if(start<0 || end<start || current<start || current>end)return null
  const a=current===start?(anchor.start??0):0,b=current===end?(anchor.end??block.text.length):block.text.length
  if(a<0 || b>block.text.length || b<=a)return null
  if(start===end && block.text.slice(a,b)!==anchor.quote) {
    const matches=[...block.text.matchAll(new RegExp(anchor.quote.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))]
    if(matches.length===1)return [matches[0].index!,matches[0].index!+anchor.quote.length]
    return null
  }
  return [a,b]
}
export function highlightedSegments(block:Block,blocks:Block[],records:StudyRecord[]) {
  const ranges=records.filter(r=>(r.kind==='highlight'||r.kind==='underline')&&r.anchor).flatMap(r=>{
    const offsets=offsetsForBlock(r.anchor!,block,blocks)
    return offsets?[{start:offsets[0],end:offsets[1],record:r}]:[]
  })
  let offset=0
  const runs=block.runs.map(run=>{const start=offset;offset+=run.text.length;return {...run,start,end:offset}})
  const points=[...new Set([0,block.text.length,...ranges.flatMap(r=>[r.start,r.end]),...runs.flatMap(r=>[r.start,r.end])])].sort((a,b)=>a-b)
  return points.slice(0,-1).map((start,index)=>({text:block.text.slice(start,points[index+1]),record:ranges.find(r=>r.start<=start && r.end>start)?.record,run:runs.find(r=>r.start<=start && r.end>start)}))
}
export function selectionAnchor(container:HTMLElement,page:number):Anchor|null {
  const selection=window.getSelection()
  if(!selection || selection.isCollapsed || !selection.rangeCount)return null
  const range=selection.getRangeAt(0)
  if(!container.contains(range.commonAncestorContainer))return null
  const element=(node:Node)=>node instanceof Element?node:node.parentElement
  const first=element(range.startContainer)?.closest<HTMLElement>('[data-block]')
  const last=element(range.endContainer)?.closest<HTMLElement>('[data-block]')
  if(!first || !last)return null
  const prefix=range.cloneRange();prefix.selectNodeContents(first);prefix.setEnd(range.startContainer,range.startOffset)
  const end=range.cloneRange();end.selectNodeContents(last);end.setEnd(range.endContainer,range.endOffset)
  return {revision:'pdfjs-layout-v1',mode:'html',page,startBlock:first.dataset.block,endBlock:last.dataset.block,start:prefix.toString().length,end:end.toString().length,quote:selection.toString(),prefix:first.textContent?.slice(Math.max(0,prefix.toString().length-40),prefix.toString().length),suffix:last.textContent?.slice(end.toString().length,end.toString().length+40)}
}
