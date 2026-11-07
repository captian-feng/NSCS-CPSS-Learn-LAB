import type { PageData } from '../shared/types'

// These are review hints, not diagnoses. They run on stored pages as well as new imports.
export function pageQualityHints(page: PageData): string[] {
  const text=page.blocks.map(block=>block.text).join(' ').trim()
  const hints:string[]=[]
  const characters=Array.from(text.replace(/\s/g,''))
  if(characters.length>0 && characters.length<40)
    hints.push('可提取文本较少，可能是图片页、封面或混合扫描页；请对照原书。')
  if(characters.filter(char=>char==='\uFFFD' || char==='\uFFFC').length>=2)
    hints.push('提取文本含多个替代字符，可能存在字体编码问题；请对照原书。')
  if(/(?:\btable\s+\d|表\s*[\d一二三四五六七八九十])/i.test(text))
    hints.push('检测到表格标题，表格内容与阅读顺序可能需要对照原书。')
  if(/(?:\bequation\s+\d|公式\s*[\d一二三四五六七八九十]|[=＝]\s*[^\s]{1,20}\s*[+−×÷])/i.test(text))
    hints.push('检测到可能的公式，符号和排列可能需要对照原书。')
  return hints
}
