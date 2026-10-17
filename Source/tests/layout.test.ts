import { expect, it } from 'vitest'
import { structurePage, graphicRegions, type PositionedText } from '../src/importer/layout'
import { offsetsForBlock, highlightedSegments } from '../src/domain/anchors'
import { newRecord } from '../src/storage/store'
import type { Anchor, Block } from '../src/shared/types'
it('orders a two-column page left-column-first and retains headings and emphasis',()=>{
  const items:PositionedText[]=[{text:'Chapter 1 Training',x:40,y:40,width:420,height:24,font:'Bold',bold:true,italic:false}]
  for(let i=0;i<8;i++)for(const [text,x] of [[`Left paragraph ${i}`,40],[`Right paragraph ${i}`,320]] as const)items.push({text,x,y:100+i*20,width:220,height:11,font:'Times',bold:false,italic:false})
  const {blocks}=structurePage('book',1,items,600,800),text=blocks.map(b=>b.text).join('|')
  expect(blocks[0].kind).toBe('heading');expect(text.indexOf('Left paragraph 7')).toBeLessThan(text.indexOf('Right paragraph 0'))
  expect(blocks[0].runs[0].bold).toBe(true)
})
it('clusters vector drawing components without dropping the figure',()=>{
  const regions=graphicRegions([[100,100,200,200],[198,100,350,200]],600,800,[])
  expect(regions).toHaveLength(1);expect(regions[0].rect).toEqual([94,94,356,206])
})
it('does not mistake styled full-width body text for two columns or drop inline words',()=>{
  const items:PositionedText[]=[]
  for(let i=0;i<10;i++)for(const [text,x,width] of [[`Bold ${i}`,40,40],[`Full width body text ${i}`,90,420],[`end ${i}`,520,45]] as const)items.push({text,x,y:100+i*20,width,height:11,font:'Times',bold:x===40,italic:false})
  const {blocks,issues}=structurePage('book',0,items,612,792),text=blocks.map(b=>b.text).join(' ')
  expect(issues).not.toContain('已按双栏区域重排；自动阅读顺序尚需对照校验。')
  for(let i=0;i<10;i++){expect(text).toContain(`Bold ${i}`);expect(text).toContain(`end ${i}`)}
})
it('keeps UTF-16 offsets and resolves an unambiguous shifted quote',()=>{
  const block:Block={id:'b',bookId:'book',page:1,order:0,kind:'paragraph',text:'Training 🏃 improves performance.',runs:[{text:'Training 🏃 ',bold:true},{text:'improves performance.'}],rect:[0,0,100,20],level:0}
  const anchor:Anchor={revision:'v1',page:1,startBlock:'b',endBlock:'b',start:0,end:8,quote:'Training',mode:'html'}
  expect(offsetsForBlock(anchor,block,[block])).toEqual([0,8])
  const shifted={...block,text:'New Training 🏃 improves performance.'}
  expect(offsetsForBlock(anchor,shifted,[shifted])).toEqual([4,12])
  const note=newRecord('book',1,'highlight',anchor)
  expect(highlightedSegments(block,[block],[note]).map(s=>s.text).join('')).toBe(block.text)
  expect(highlightedSegments(block,[block],[note])[0].record?.id).toBe(note.id)
  expect(offsetsForBlock(anchor,{...block,text:'New Training Training'},[{...block,text:'New Training Training'}])).toBeNull()
})
