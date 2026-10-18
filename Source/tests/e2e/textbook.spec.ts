import {test,expect,_electron as electron} from '@playwright/test'
import type {ElectronApplication} from '@playwright/test'
import {createRequire} from 'node:module'
import {mkdtemp,readFile,mkdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {sha256File} from '../../src/storage/bundled-library'
import type {BookDetail,Snapshot,PageData,PracticeState} from '../../src/shared/types'
const require=createRequire(import.meta.url)
test('preloaded textbook: first launch opens chapter one without import, full navigation/search, image decoding and restart',async()=>{
  const seed=resolve(process.env.CPSS_REAL_SEED||'.local/textbook-ready')
  const manifest=JSON.parse(await readFile(join(seed,'manifest.json'),'utf8'))
  const root=await mkdtemp(join(tmpdir(),'cpss-textbook-'))
  let application:ElectronApplication|undefined
  const errors:string[]=[],codecErrors:string[]=[],requests:string[]=[]
  const launch=async()=>{
    const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),CPSS_DATA_DIR:join(root,'profile'),CPSS_BUNDLED_ROOT:seed,XDG_CONFIG_HOME:join(root,'config'),XDG_CACHE_HOME:resolve('.local/cache')}
    delete env.ELECTRON_RUN_AS_NODE
    const flags=process.platform==='linux'?['--no-sandbox','--headless','--ozone-platform=headless','--disable-gpu']:[]
    const executable=process.env.CPSS_TEXTBOOK_EXECUTABLE
    application=await electron.launch({executablePath:executable||require('electron'),args:[...flags,...(executable?[]:['.'])],env})
    const page=await application.firstWindow()
    page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>requests.push(request.url()))
    page.on('console',message=>{if(/JpxError|OpenJPEG failed|Unable to decode/.test(message.text()))codecErrors.push(message.text())})
    await application.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>{throw new Error('No import dialog should be needed')}})
    await expect(page.locator('.pdf-pane')).toBeVisible({timeout:30000})
    return page
  }
  try {
    const started=performance.now()
    let page=await launch()
    await expect(page.locator('.pdf-pane')).toContainText(/Performance\s*Dimensions/)
    const readyMs=Math.round(performance.now()-started)
    const detail=await page.evaluate(async id=>window.desktop.call<BookDetail>('detail',id),manifest.bookId)
    expect(detail.book.pages).toBe(1058);expect(detail.book.processed).toBe(1058);expect(detail.book.status).toBe('ready')
    expect(detail.toc.filter(n=>/^Part\s+[IVX]+:/i.test(n.title))).toHaveLength(7)
    const chapters=detail.toc.filter(n=>/^Chapter\s+\d+/i.test(n.title));expect(chapters).toHaveLength(31);expect(detail.toc).toHaveLength(195)
    expect(detail.position?.page).toBe(chapters[0].page)
    for(const chapter of chapters) {
      const data=await page.evaluate(async args=>window.desktop.call<PageData>('page',args),{bookId:manifest.bookId,page:chapter.page})
      const text=data.blocks.map(b=>b.text).join(' ').replace(/\s/g,'').toLowerCase()
      const title=chapter.title.replace(/^Chapter\s+\d+[.\s]*/i,'').replace(/\s/g,'').toLowerCase()
      expect(text,chapter.title).toContain(title)
    }
    const bank=await page.evaluate(id=>window.desktop.call<PracticeState>('practice',id),manifest.bookId)
    expect(bank.questions).toHaveLength(215)
    // All citations must be exact excerpts of the matched edition and chapter.
    for(const question of bank.questions){
      const source=await page.evaluate(args=>window.desktop.call<PageData>('page',args),{bookId:manifest.bookId,page:question.source.page})
      const normalize=(value:string)=>value.replace(/\s+/g,' ').trim()
      expect(normalize(source.blocks.map(b=>b.text).join(' ')),question.id).toContain(normalize(question.source.quote))
      expect(question.source.page).toBeGreaterThanOrEqual(chapters[question.chapter-1].page)
      expect(question.source.page).toBeLessThan(chapters[question.chapter]?.page??901)
    }
    const chrome=await page.locator('.pdf-pane').boundingBox();expect(chrome!.y).toBeLessThan(90)
    await mkdir('.local/screenshots',{recursive:true})
    await page.screenshot({path:'.local/screenshots/textbook-ready.png',fullPage:true})
    // Page 31 contains a real JPEG2000 scientific illustration in this supplied edition.
    await page.getByRole('spinbutton',{name:'PDF 页码'}).fill('31')
    const figure=page.locator('.pdf-page[data-page-index="30"] canvas')
    await expect(figure).toBeVisible()
    await expect.poll(()=>figure.evaluate((canvas:HTMLCanvasElement)=>{
      const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data
      let dark=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3] && Math.min(pixels[i],pixels[i+1],pixels[i+2])<180)dark++
      return dark
    })).toBeGreaterThan(1000)
    await figure.screenshot({path:'.local/screenshots/textbook-figure.png'})
    await expect(page.locator('.pdf-page')).toHaveCount(1058)
    expect(await page.locator('.pdf-page canvas').count()).toBeLessThan(12)
    await page.locator('.pdf-pane').evaluate(element=>{element.scrollTop=element.querySelector<HTMLElement>('[data-page-index="31"]')!.offsetTop-50})
    await expect(page.getByRole('spinbutton',{name:'PDF 页码'})).toHaveValue('32')
    await page.getByRole('spinbutton',{name:'PDF 页码'}).fill('1058')
    await expect(page.locator('.pdf-page[data-page-index="1057"] canvas')).toBeVisible()
    expect(await page.locator('.pdf-page canvas').count()).toBeLessThan(12)
    await page.getByRole('spinbutton',{name:'PDF 页码'}).fill('31')
    await page.getByRole('button',{name:'放大 PDF',exact:true}).click()
    await expect(page.getByRole('spinbutton',{name:'PDF 页码'})).toHaveValue('31')
    await page.getByRole('button',{name:'缩小 PDF',exact:true}).click()
    await page.getByRole('button',{name:'＋ 笔记' ,exact:true}).click()
    await page.locator('.modal textarea').fill('预置教材重启保留测试')
    await page.getByRole('button',{name:'保存记录',exact:true}).click()
    await page.getByRole('button',{name:'学习记录',exact:true}).click()
    await expect(page.locator('.notes-panel')).toContainText('预置教材重启保留测试')
    await page.getByRole('button',{name:'功能导航',exact:true}).click()
    await page.getByRole('button',{name:'练习题库',exact:true}).click()
    await expect(page.locator('.question-detail')).toBeVisible()
    await page.getByRole('button',{name:'大纲覆盖与来源',exact:true}).click()
    await expect(page.locator('.coverage-panel tbody tr:not(.domain-row)')).toHaveCount(24)
    await page.getByRole('button',{name:'大纲覆盖与来源',exact:true}).click()
    await page.getByRole('combobox',{name:'考试领域'}).selectOption('4')
    await page.getByRole('combobox',{name:'题型'}).selectOption('计算')
    await expect(page.locator('.question-list>button').first()).toBeVisible()
    await page.getByRole('combobox',{name:'考试领域'}).selectOption('all')
    await page.getByRole('combobox',{name:'题型'}).selectOption('case-group')
    await expect(page.locator('.case-study')).toBeVisible()
    await page.screenshot({path:'.local/screenshots/case-0.5.0.png',fullPage:true})
    await page.getByRole('combobox',{name:'题型'}).selectOption('all')
    await page.getByRole('combobox',{name:'练习章节'}).selectOption('31')
    await expect(page.locator('.question-list>button')).toHaveCount(9)
    await page.getByRole('combobox',{name:'练习章节'}).selectOption('1')
    await page.locator('.question-list>button').first().click()
    const first=bank.questions[0]
    await page.getByRole('radio').nth((first.correct+1)%4).click()
    await page.getByRole('button',{name:'提交答案',exact:true}).click()
    await expect(page.locator('.answer-explanation')).toContainText('已自动加入错题集')
    await expect(page.locator('.answer-explanation blockquote')).toContainText(first.source.quote)
    await page.screenshot({path:'.local/screenshots/practice-0.5.0.png',fullPage:true})
    await page.getByRole('button',{name:'错题集 1',exact:true}).click()
    await expect(page.locator('.question-list>button')).toHaveCount(1)
    await page.getByRole('radio').nth(first.correct).click()
    await page.getByRole('button',{name:'提交答案',exact:true}).click()
    await expect(page.locator('.answer-explanation')).toContainText('回答正确')
    await expect(page.getByRole('button',{name:'错题集 0',exact:true})).toBeVisible()
    await page.getByRole('button',{name:'章节练习',exact:true}).click()
    await page.locator('.question-list>button').nth(1).click()
    const second=bank.questions.find(q=>q.id==='cpss-ch01-02')!
    await page.getByRole('radio').nth((second.correct+1)%4).click()
    await page.getByRole('button',{name:'提交答案',exact:true}).click()
    await page.getByRole('button',{name:`查看原文 · PDF 第 ${second.source.page+1} 页`,exact:true}).click()
    await expect(page.getByRole('spinbutton',{name:'PDF 页码'})).toHaveValue(String(second.source.page+1))
    await page.getByRole('spinbutton',{name:'PDF 页码'}).fill('31')
    await page.getByRole('button',{name:'全文搜索',exact:true}).click()
    await page.locator('.global-search').fill('periodization')
    await expect(page.locator('.search-results button').first()).toBeVisible()
    await page.getByRole('button',{name:'教材阅读',exact:true}).click()
    await expect.poll(()=>page.evaluate(async id=>(await window.desktop.call<BookDetail>('detail',id)).position?.page,manifest.bookId)).toBe(30)
    const profile=await application!.evaluate(({app})=>app.getPath('userData'))
    expect(await sha256File(join(profile,'books',manifest.bookId,'source.pdf'))).toBe(manifest.sourceHash)
    await application!.close();application=undefined
    page=await launch()
    await page.getByRole('button',{name:'学习记录',exact:true}).click()
    await expect(page.locator('.notes-panel')).toContainText('预置教材重启保留测试')
    await expect(page.getByRole('spinbutton',{name:'PDF 页码'})).toHaveValue('31')
    const restoredPractice=await page.evaluate(id=>window.desktop.call<PracticeState>('practice',id),manifest.bookId)
    expect(restoredPractice.answers.map(a=>a.correct)).toEqual([false,true,false])
    const snapshot=await page.evaluate(()=>window.desktop.call<Snapshot>('snapshot'));expect(snapshot.books).toHaveLength(1);expect(snapshot.bootstrapError).toBeUndefined()
    expect(errors).toEqual([]);expect(codecErrors).toEqual([]);expect(requests.filter(url=>/^https?:/.test(url))).toEqual([])
    console.log(JSON.stringify({firstLaunchReadyMs:readyMs,pages:1058,chaptersChecked:31,parts:7,tocNodes:195,sourceHash:manifest.sourceHash,profileRecordsAreNotBundled:true}))
  }finally{await application?.close()}
})
