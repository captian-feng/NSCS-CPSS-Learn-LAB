import {test,expect,_electron as electron} from '@playwright/test'
import type {ElectronApplication} from '@playwright/test'
import {createRequire} from 'node:module'
import {mkdtemp,readFile,mkdir} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {tmpdir} from 'node:os'
import {sha256File} from '../../src/storage/bundled-library'
import type {BookDetail,Snapshot,PageData} from '../../src/shared/types'
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
    const snapshot=await page.evaluate(()=>window.desktop.call<Snapshot>('snapshot'));expect(snapshot.books).toHaveLength(1);expect(snapshot.bootstrapError).toBeUndefined()
    expect(errors).toEqual([]);expect(codecErrors).toEqual([]);expect(requests.filter(url=>/^https?:/.test(url))).toEqual([])
    console.log(JSON.stringify({firstLaunchReadyMs:readyMs,pages:1058,chaptersChecked:31,parts:7,tocNodes:195,sourceHash:manifest.sourceHash,profileRecordsAreNotBundled:true}))
  }finally{await application?.close()}
})
