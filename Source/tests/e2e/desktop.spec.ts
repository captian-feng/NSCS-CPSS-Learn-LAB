import { test,expect,_electron as electron } from '@playwright/test'
import type { ElectronApplication,Page } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdtemp,readFile,mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join,resolve } from 'node:path'
import { createFixture } from '../fixtures/create'
import type { BookDetail,Snapshot } from '../../src/shared/types'
const require=createRequire(import.meta.url)
test('offline desktop: import, continuous PDF selection, annotation CRUD, search, export, restart and restore',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cpss-desktop-')),fixture=await createFixture(join(root,'sample.pdf')),data=join(root,'library')
  const errors:string[]=[],requests:string[]=[]
  let app:ElectronApplication|undefined
  const launch=async(directory:string)=>{
    const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),CPSS_DATA_DIR:directory,CPSS_TESTING:'1',CPSS_TEST_PDF:fixture,XDG_CONFIG_HOME:directory,XDG_CACHE_HOME:resolve('.local/cache')}
    delete env.ELECTRON_RUN_AS_NODE
    const headless=process.platform==='linux'?['--no-sandbox','--headless','--ozone-platform=headless','--disable-gpu']:[]
    app=await electron.launch({executablePath:process.env.CPSS_EXECUTABLE||require('electron'),args:[...headless,...(process.env.CPSS_EXECUTABLE?[]:['.'])],env,timeout:30000})
    const page=await app.firstWindow()
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},fixture)
    page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()))
    await page.waitForLoadState('domcontentloaded')
    return page
  }
  try {
    let w=await launch(data)
    await expect(w.getByRole('button',{name:'＋ 导入英文教材 PDF',exact:true})).toBeVisible()
    await w.getByRole('button',{name:'＋ 导入英文教材 PDF',exact:true}).click()
    await expect(w.locator('.pdf-pane')).toBeVisible({timeout:30000})
    await expect(w.getByRole('button',{name:'HTML 阅读',exact:true})).toHaveCount(0)
    await expect(w.locator('.nav-label')).toHaveCount(8)
    await expect(w.locator('.rail')).toBeHidden()
    await expect(w.locator('.library-sidebar')).toBeHidden()
    await expect(w.locator('.notes-panel')).toHaveCount(0)
    await w.getByRole('button',{name:'功能导航',exact:true}).click()
    await expect(w.locator('.rail')).toBeVisible()
    await w.getByRole('button',{name:'目录',exact:true}).click()
    await w.getByRole('button',{name:'学习记录',exact:true}).click()
    await w.getByTitle('收起 Part I - Learning fixture',{exact:true}).click()
    await expect(w.getByRole('button',{name:/Chapter 1 Training Principles/})).toHaveCount(0)
    await w.getByTitle('展开 Part I - Learning fixture',{exact:true}).click()
    await w.getByRole('button',{name:/Chapter 1 Training Principles/}).click()
    const current=w.locator('.pdf-page[data-page-index="1"]')
    await expect(current.locator('.textLayer span').first()).toBeVisible()
    const selectPDF=async()=>{
      await w.evaluate(()=>{
        const element=[...document.querySelectorAll('.pdf-page[data-page-index="1"] .textLayer span')].find(e=>e.textContent?.includes('Performance science'))!
        const range=document.createRange();range.selectNodeContents(element)
        const selection=window.getSelection()!;selection.removeAllRanges();selection.addRange(range)
        element.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}))
      })
    }
    await selectPDF();await w.getByTitle('yellow 高亮',{exact:true}).click()
    await expect(w.locator('.pdf-mark')).toHaveCount(1)
    // Natural scrolling crosses the page boundary and persists the visible page.
    await w.locator('.pdf-pane').evaluate(element=>{const next=element.querySelector<HTMLElement>('[data-page-index="2"]')!;element.scrollTop=next.offsetTop-50})
    await expect(w.getByRole('spinbutton',{name:'PDF 页码'})).toHaveValue('3')
    await w.getByRole('button',{name:'← 上一页',exact:true}).click()
    await expect(w.getByRole('spinbutton',{name:'PDF 页码'})).toHaveValue('2')
    // At representative Windows window widths the sidebars never cover the PDF.
    for(const width of [1024,1280,1600]) {
      await w.setViewportSize({width,height:900})
      const geometry=await w.evaluate(()=>{
        const sidebar=document.querySelector('.library-sidebar')!.getBoundingClientRect(),reader=document.querySelector('.reader-column')!.getBoundingClientRect(),notes=document.querySelector('.notes-panel')!.getBoundingClientRect()
        return {left:sidebar.right<=reader.left+.5,right:reader.right<=notes.left+.5,body:document.body.scrollWidth<=innerWidth}
      })
      expect(geometry).toEqual({left:true,right:true,body:true})
    }
    await w.setViewportSize({width:1280,height:900})
    // Native wheel handling zooms the PDF, without zooming the application chrome.
    const oldZoom=Number((await w.locator('.zoom-value').innerText()).replace('%',''))
    const viewportWidth=await w.evaluate(()=>innerWidth)
    const pdfBox=await w.locator('.pdf-pane').boundingBox()
    await w.mouse.move(pdfBox!.x+pdfBox!.width/2,pdfBox!.y+150)
    await w.keyboard.down('Control');await w.mouse.wheel(0,-100);await w.keyboard.up('Control')
    expect(await w.evaluate(()=>innerWidth)).toBe(viewportWidth)
    await expect.poll(async()=>Number((await w.locator('.zoom-value').innerText()).replace('%',''))).toBeGreaterThan(oldZoom)
    await w.locator('.zoom-value').click()
    await expect(w.getByRole('spinbutton',{name:'PDF 页码'})).toHaveValue('2')
    const initialWidth=Number(await w.getByRole('separator',{name:'目录宽度'}).getAttribute('aria-valuenow'))
    await w.getByRole('separator',{name:'目录宽度'}).focus()
    await w.keyboard.press('ArrowRight')
    await expect(w.getByRole('separator',{name:'目录宽度'})).toHaveAttribute('aria-valuenow',String(initialWidth+10))
    // Exercise actual pointer dragging on the right panel.
    const handle=await w.getByRole('separator',{name:'学习记录宽度'}).boundingBox()
    const beforeNotes=Number(await w.getByRole('separator',{name:'学习记录宽度'}).getAttribute('aria-valuenow'))
    await w.mouse.move(handle!.x+3,handle!.y+30);await w.mouse.down();await w.mouse.move(handle!.x-27,handle!.y+30);await w.mouse.up()
    await expect(w.getByRole('separator',{name:'学习记录宽度'})).toHaveAttribute('aria-valuenow',String(beforeNotes+30))
    await w.getByRole('button',{name:'学习记录',exact:true}).click()
    await expect(w.locator('.notes-panel')).toHaveCount(0)
    await w.getByRole('button',{name:'学习记录',exact:true}).click()
    await w.getByRole('button',{name:'目录',exact:true}).click()
    await expect(w.locator('.library-sidebar')).toBeHidden()
    await w.getByRole('button',{name:'目录',exact:true}).click()
    await w.getByRole('button',{name:'＋ 笔记',exact:true}).click()
    await w.locator('.modal textarea').fill('Offline training note 中文持久化验证')
    await w.getByRole('button',{name:'保存记录',exact:true}).click()
    await expect(w.locator('.notes-panel')).toContainText('Offline training note')
    await w.locator('.notes-panel .record-card').first().getByTitle('编辑记录').click()
    await w.locator('.modal textarea').fill('Edited persistent note')
    await w.getByRole('button',{name:'保存记录',exact:true}).click()
    await expect(w.locator('.notes-panel')).toContainText('Edited persistent note')
    await w.getByRole('button',{name:'知识卡片',exact:true}).click()
    await w.getByRole('button',{name:'＋ 新建卡片',exact:true}).click()
    await w.locator('.modal textarea').fill('Training principle knowledge card')
    await w.locator('.modal input[type="checkbox"]').check()
    await w.getByRole('button',{name:'保存记录',exact:true}).click()
    await expect(w.locator('.record-grid')).toContainText('Training principle knowledge card')
    await w.getByRole('button',{name:'复习中心',exact:true}).click()
    await expect(w.locator('.record-grid')).toContainText('Training principle knowledge card')
    await w.getByRole('button',{name:'学习计划',exact:true}).click()
    await w.getByRole('button',{name:'＋ 新建任务',exact:true}).click()
    await w.locator('.modal textarea').fill('Finish Chapter 1')
    await w.getByRole('button',{name:'保存记录',exact:true}).click()
    await w.getByRole('button',{name:'标记完成',exact:true}).click()
    await expect(w.locator('.record-grid .record-card')).toHaveClass(/done/)
    await w.getByRole('button',{name:'教材阅读',exact:true}).click()
    await w.getByTitle('收藏当前页',{exact:true}).click()
    await expect(w.locator('.notes-panel .record-card')).toHaveCount(5)
    await w.getByRole('combobox',{name:'章节学习状态',exact:true}).selectOption('已完成')
    await w.getByRole('button',{name:'学习概览',exact:true}).click()
    await expect(w.locator('.stat').first().locator('b')).toHaveText('1')
    await mkdir('.local/screenshots',{recursive:true})
    await w.screenshot({path:'.local/screenshots/dashboard.png',fullPage:true})
    await w.getByRole('button',{name:'教材阅读',exact:true}).click()
    await expect(current.locator('.textLayer span').first()).toBeVisible()
    await selectPDF()
    await w.getByTitle('green 高亮',{exact:true}).click()
    await expect(w.locator('.pdf-mark')).toHaveCount(2)
    await w.getByRole('button',{name:'全文搜索',exact:true}).click()
    await w.locator('.global-search').fill('adaptation')
    await expect(w.locator('.search-results button').first()).toBeVisible()
    await w.locator('.search-results button').first().click()
    const backup=join(root,'backup.json'),markdown=join(root,'notes.md')
    await app!.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path})},backup)
    await w.evaluate(()=>window.desktop.exportData('json'))
    const exported=JSON.parse(await readFile(backup,'utf8'));expect(exported.records).toHaveLength(6)
    await app!.evaluate(({dialog},path)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:path})},markdown)
    await w.evaluate(()=>window.desktop.exportData('markdown'))
    expect(await readFile(markdown,'utf8')).toContain('Edited persistent note')
    await mkdir('.local/screenshots',{recursive:true})
    await w.screenshot({path:'.local/screenshots/reader.png',fullPage:true})
    await w.evaluate(()=>window.desktop.call('setting',{key:'mode',value:'html'}))
    await w.waitForTimeout(450)
    await app!.close();app=undefined
    w=await launch(data)
    const restoredPreferences=await w.evaluate(async()=> (await window.desktop.call<Snapshot>('snapshot')).settings)
    expect(restoredPreferences.tocWidth).toBe(initialWidth+10)
    expect(restoredPreferences.notesWidth).toBe(beforeNotes+30)
    await w.getByRole('button',{name:'学习记录',exact:true}).click()
    await expect(w.locator('.html-reader')).toHaveCount(0)
    await expect(w.locator('.pdf-pane')).toBeVisible()
    await expect(w.locator('.notes-panel')).toContainText('Edited persistent note')
    const detail=await w.evaluate(async()=>{const snapshot=await window.desktop.call<Snapshot>('snapshot');return window.desktop.call<BookDetail>('detail',snapshot.books[0].id)})
    expect(detail.records).toHaveLength(6);expect(detail.book.status).toBe('ready')
    await w.locator('.notes-panel .record-card').filter({hasText:'Edited persistent note'}).getByTitle('编辑记录').click()
    await w.getByRole('button',{name:'删除记录',exact:true}).click()
    await expect(w.locator('.notes-panel')).not.toContainText('Edited persistent note')
    await app!.close();app=undefined
    w=await launch(join(root,'restored-library'))
    await app!.evaluate(({dialog},path)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]})},backup)
    const restored=await w.evaluate(()=>window.desktop.restoreData())
    expect(restored).toEqual({inserted:6,skipped:0})
    const again=await w.evaluate(()=>window.desktop.restoreData());expect(again).toEqual({inserted:0,skipped:6})
    const state=await w.evaluate(()=>window.desktop.call<Snapshot>('snapshot'));expect(state.books[0].status).toBe('missing')
    expect(errors).toEqual([])
    expect(requests.filter(url=>/^https?:/.test(url) && !(process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)))).toEqual([])
  }finally{await app?.close()}
})
