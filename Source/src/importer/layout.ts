import type { Block, Rect, Region, TextRun } from '../shared/types'

export type PositionedText = { text: string; x: number; y: number; width: number; height: number; font: string; bold: boolean; italic: boolean }
type Line = { x: number; y: number; right: number; height: number; runs: TextRun[]; text: string }
const median = (values: number[]) => [...values].sort((a,b) => a-b)[Math.floor(values.length/2)] || 10
export function union(a: Rect, b: Rect): Rect { return [Math.min(a[0],b[0]),Math.min(a[1],b[1]),Math.max(a[2],b[2]),Math.max(a[3],b[3])] }
const overlaps = (a: Rect,b: Rect,pad=0) => a[0]-pad <= b[2] && a[2]+pad >= b[0] && a[1]-pad <= b[3] && a[3]+pad >= b[1]
export function graphicRegions(boxes: Rect[], width: number, height: number, texts: PositionedText[]): Region[] {
  let groups: Rect[] = []
  for (const box of boxes) {
    if (!box.every(Number.isFinite)) continue
    const r: Rect = [Math.max(0,box[0]),Math.max(0,box[1]),Math.min(width,box[2]),Math.min(height,box[3])]
    if (r[2]-r[0] < 0.1 || r[3]-r[1] < 0.1 || (r[2]-r[0])*(r[3]-r[1]) > width*height*.94) continue
    const same = groups.filter(g => overlaps(g,r,12))
    groups = groups.filter(g => !same.includes(g))
    groups.push(same.reduce(union,r))
  }
  // Merge transitively; vector graphs are often composed of many individual paths.
  for (let changed=true; changed;) {
    changed=false
    outer: for(let i=0;i<groups.length;i++) for(let j=i+1;j<groups.length;j++) if(overlaps(groups[i],groups[j],12)) {
      groups[i]=union(groups[i],groups[j]);groups.splice(j,1);changed=true;break outer
    }
  }
  return groups.filter(r => r[2]-r[0]>=4 && r[3]-r[1]>=4 && (r[2]-r[0])*(r[3]-r[1])>=50 && !(r[1]>height*.94 && r[3]-r[1]<height*.08)).map((r,index) => {
    const caption = texts.filter(t=>/^(figure|table|equation)\s*[\dIVX]/i.test(t.text.trim()) && Math.abs(t.y-r[3])<100 && t.x<r[2] && t.x+t.width>r[0]).sort((a,b)=>Math.abs(a.y-r[3])-Math.abs(b.y-r[3]))[0]
    const padded: Rect = [Math.max(0,r[0]-6),Math.max(0,r[1]-6),Math.min(width,r[2]+6),Math.min(height,r[3]+6)]
    return {id:`region-${index}`,rect:padded,caption:caption?.text ?? '原书图表 / 公式区域（自动识别）'}
  })
}
export function structurePage(bookId: string, page: number, items: PositionedText[], width: number, height: number): {blocks: Block[]; issues: string[]} {
  const texts = items.filter(i=>i.text.trim())
  if (!texts.length) return {blocks:[],issues:['该页无可提取文本，可能为扫描页；本版本未提供 OCR，请查看原书。']}
  const bodySize=median(texts.filter(i=>i.text.length>15).map(i=>i.height))
  const split=width/2
  const left=texts.filter(t=>t.x<split-30 && t.x+t.width<split+10 && t.height<bodySize*1.4)
  const right=texts.filter(t=>t.x>split-10 && t.height<bodySize*1.4)
  // Font changes can split a single full-width line into left/right text items.
  // Repeated body runs crossing the centre are evidence against a real column gutter.
  const crossing=texts.filter(t=>t.height<bodySize*1.4 && t.x<split-20 && t.x+t.width>split+20 && t.text.length>12)
  const twoColumns = crossing.length<3 && left.length>=6 && right.length>=6 && Math.max(Math.min(...left.map(t=>t.y)),Math.min(...right.map(t=>t.y))) < Math.min(Math.max(...left.map(t=>t.y)),Math.max(...right.map(t=>t.y)))-bodySize*3
  const full = twoColumns ? texts.filter(t=>(t.x<split && t.x+t.width>split+20) || t.height>bodySize*1.5) : []
  const linesOf=(input:PositionedText[]):Line[]=>{
    const lines:Line[]=[]
    for(const t of [...input].sort((a,b)=>a.y-b.y || a.x-b.x)) {
      const last=lines.find(l=>Math.abs(l.y-t.y)<Math.min(l.height,t.height)*.35)
      if(last) {
        const gap=t.x-last.right
        const separator=gap>Math.max(1,t.height*.13) && !last.text.endsWith(' ') && !t.text.startsWith(' ') ? ' ' : ''
        if(separator)last.runs.push({text:separator})
        last.runs.push({text:t.text,bold:t.bold,italic:t.italic}); last.text+=separator+t.text; last.right=Math.max(last.right,t.x+t.width);last.height=Math.max(last.height,t.height)
      } else lines.push({x:t.x,y:t.y,right:t.x+t.width,height:t.height,runs:[{text:t.text,bold:t.bold,italic:t.italic}],text:t.text})
    }
    return lines.sort((a,b)=>a.y-b.y || a.x-b.x)
  }
  let ordered:Line[]=[]
  if(twoColumns) {
    const fullLines=linesOf(full)
    const rest=texts.filter(t=>!full.includes(t))
    let start=-Infinity
    for(const heading of [...fullLines,{y:Infinity} as Line]) {
      const band=rest.filter(t=>t.y>=start && t.y<heading.y)
      ordered.push(...linesOf(band.filter(t=>t.x<split)),...linesOf(band.filter(t=>t.x>=split)))
      if(Number.isFinite(heading.y))ordered.push(heading)
      start=heading.y
    }
  } else ordered=linesOf(texts)
  const blocks:Block[]=[]
  const issues:string[]=[]
  if(twoColumns)issues.push('已按双栏区域重排；自动阅读顺序尚需对照校验。')
  for(const line of ordered) {
    const caption=/^(figure|table|equation)\s*[\dIVX]/i.test(line.text.trim())
    const heading=!caption && (line.height>bodySize*1.22 || /^(chapter|part)\s+([\dIVX]+)\b/i.test(line.text.trim()))
    const list=/^(?:[•●▪]|\d+[.)]|[a-z][.)])\s/.test(line.text.trim())
    const kind=caption?'caption':heading?'heading':list?'list':'paragraph'
    const box:Rect=[line.x,line.y,line.right,line.y+line.height]
    // Headers/footers remain in source data, but are labelled rather than silently discarded.
    const marginal=(line.y<height*.035 || line.y>height*.965)
    const previous=blocks.at(-1)
    const gap=previous ? line.y-previous.rect[3] : Infinity
    if(previous && previous.kind===kind && kind==='paragraph' && !marginal && gap>=-bodySize*.15 && gap<bodySize*.7 && Math.abs(previous.rect[0]-line.x)<bodySize*1.8) {
      previous.text+=' '+line.text;previous.runs.push({text:' '},...line.runs);previous.rect=union(previous.rect,box)
    } else blocks.push({id:`${bookId}:p${page}:b${blocks.length}`,bookId,page,order:blocks.length,kind:marginal?'marginal':kind,text:line.text,runs:line.runs,rect:box,level:heading?(line.height>bodySize*1.6?1:2):0})
  }
  return {blocks,issues}
}
