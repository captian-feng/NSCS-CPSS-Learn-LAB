import {useRef} from 'react'
export function ResizeHandle({label,value,min,max,onChange,onCommit,reverse=false}:{label:string;value:number;min:number;max:number;onChange:(v:number)=>void;onCommit:(v:number)=>void;reverse?:boolean}) {
  const drag=useRef<{x:number;width:number;latest:number}|null>(null)
  const clamp=(v:number)=>Math.round(Math.max(min,Math.min(max,v)))
  return <div role="separator" aria-label={label} aria-orientation="vertical" aria-valuenow={value} aria-valuemin={min} aria-valuemax={max} tabIndex={0} className={`resize-handle ${reverse?'left':''}`}
    onPointerDown={e=>{e.preventDefault();drag.current={x:e.clientX,width:value,latest:value};e.currentTarget.setPointerCapture(e.pointerId)}}
    onPointerMove={e=>{const start=drag.current;if(start){start.latest=clamp(start.width+(e.clientX-start.x)*(reverse?-1:1));onChange(start.latest)}}}
    onPointerUp={e=>{if(drag.current){onCommit(drag.current.latest);drag.current=null;e.currentTarget.releasePointerCapture(e.pointerId)}}}
    onPointerCancel={()=>{if(drag.current){onCommit(drag.current.latest);drag.current=null}}}
    onKeyDown={e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const next=clamp(e.key==='Home'?min:e.key==='End'?max:value+(e.key==='ArrowRight'?10:-10)*(reverse?-1:1));onChange(next);onCommit(next)}} title="拖动调节宽度；方向键微调"/>
}
