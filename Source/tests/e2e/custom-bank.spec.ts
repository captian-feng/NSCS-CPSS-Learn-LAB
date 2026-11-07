import { test, expect, _electron as electron } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdir,mkdtemp,readFile,readdir,writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { createFixture } from '../fixtures/create'

const require=createRequire(import.meta.url)
test('imports and answers a bank for an independently imported textbook',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cpss-bank-'))
  const pdf=await createFixture(join(root,'book.pdf'))
  const second=await createFixture(join(root,'second.pdf'),5)
  const hash=createHash('sha256').update(await readFile(pdf)).digest('hex')
  const path=join(root,'bank.json')
  await writeFile(path,JSON.stringify({format:'cpss-lab-question-bank',schemaVersion:1,sourceHash:hash,title:'Fixture bank',version:'1',questions:[{id:'q1',chapter:1,chapterTitle:'First chapter',topic:'Training',prompt:'Which answer is correct?',options:[{text:'Correct',explanation:'Correct explanation'},{text:'B',explanation:'Explanation B'},{text:'C',explanation:'Explanation C'},{text:'D',explanation:'Explanation D'}],correct:0,source:{page:0,quote:'Training'}}]}))
  const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),CPSS_DATA_DIR:join(root,'profile')}
  delete env.CPSS_TESTING
  delete env.CPSS_TEST_PDF
  delete env.ELECTRON_RUN_AS_NODE
  const flags=process.platform==='linux'?['--no-sandbox','--headless','--ozone-platform=headless','--disable-gpu']:[]
  let app=await electron.launch({executablePath:require('electron'),args:[...flags,'.'],env})
  try {
    const page=await app.firstWindow()
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},pdf)
    await page.getByRole('button',{name:'阅读设置'}).click()
    await page.getByRole('button',{name:'检查本地模型'}).click()
    await expect(page.locator('.settings').getByRole('status')).toContainText(/本地模型服务|本地服务/)
    await expect(page.getByTestId('data-location')).toContainText('独立书库')
    await expect(page.getByTestId('data-location')).toContainText(join(root,'profile'))
    await page.locator('.settings').getByRole('button',{name:'×'}).click()
    await page.getByRole('button',{name:'＋ 导入英文教材 PDF',exact:true}).click()
    await expect(page.locator('.pdf-pane')).toBeVisible({timeout:30000})
    await expect.poll(async()=>page.evaluate(async()=>{const data=await window.desktop.call<{books:{status:string}[]}>('snapshot');return data.books[0]?.status})).toBe('ready')
    await page.getByRole('button',{name:'目录',exact:true}).click()
    await page.getByRole('button',{name:'＋ 添加章节'}).click()
    await page.getByLabel('章节名称').fill('自定义章节')
    await page.locator('.modal').getByLabel('PDF 页码').fill('2')
    await page.getByRole('button',{name:'保存章节'}).click()
    await expect(page.getByRole('button',{name:/自定义章节/}).first()).toBeVisible()
    await page.getByRole('button',{name:'编辑章节 自定义章节'}).click()
    await page.getByLabel('章节名称').fill('修改后的章节')
    await page.locator('.modal').getByLabel('PDF 页码').fill('3')
    await page.getByRole('button',{name:'保存章节'}).click()
    await expect(page.getByRole('button',{name:/修改后的章节/}).first()).toBeVisible()
    await page.getByRole('button',{name:'编辑章节 修改后的章节'}).click()
    await page.getByRole('button',{name:'删除章节',exact:true}).click()
    await expect(page.getByRole('button',{name:'确认删除章节及进度'})).toBeVisible()
    await page.getByRole('button',{name:'确认删除章节及进度'}).click()
    await expect(page.getByRole('button',{name:/修改后的章节/})).toHaveCount(0)
    await page.getByRole('button',{name:'编辑教材名称'}).click()
    await page.getByLabel('教材名称',{exact:true}).fill('我的测试教材')
    await page.getByLabel('作者',{exact:true}).fill('测试作者')
    await page.getByLabel('分类',{exact:true}).fill('训练科学')
    await page.getByLabel('语言',{exact:true}).fill('中文')
    await page.getByRole('button',{name:'保存教材名称'}).click()
    await expect(page.getByRole('tab',{name:'我的测试教材'})).toBeVisible()
    await page.getByRole('button',{name:'功能导航',exact:true}).click()
    await page.getByRole('button',{name:'学习概览',exact:true}).click()
    await expect(page.getByText(/中文.*测试作者.*训练科学/)).toBeVisible()
    await page.getByRole('button',{name:'查看索引质量报告'}).click()
    await expect(page.locator('.report')).toContainText('已处理 4 页')
    await expect(page.locator('.report')).toContainText('需要核对的页面')
    await page.locator('.report').getByRole('button',{name:'×'}).click()
    await page.getByRole('button',{name:'练习题库',exact:true}).click()
    await expect(page.getByRole('heading',{name:'本地生成题目草稿'})).toBeVisible()
    await expect(page.getByRole('button',{name:'生成草稿'})).toBeDisabled()
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},path)
    await page.getByRole('button',{name:'导入题库 JSON'}).click()
    await expect(page.getByText('Which answer is correct?')).toBeVisible()
    await page.getByRole('radio',{name:/Correct/}).click()
    await page.getByRole('button',{name:'提交答案'}).click()
    await expect(page.getByText('回答正确',{exact:true})).toBeVisible()
    await page.getByText('查看作答记录',{exact:true}).click()
    await expect(page.getByText('当时的题目：Which answer is correct?')).toBeVisible()
    await expect(page.getByText('当时的正确答案：A')).toBeVisible()
    const backupDirectory=join(root,'exports');await mkdir(backupDirectory)
    await app.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]})},backupDirectory)
    await page.getByRole('button',{name:'阅读设置'}).click()
    await page.getByRole('button',{name:'备份完整书库'}).click()
    await expect.poll(async()=>(await readdir(backupDirectory)).filter(name=>!name.endsWith('.partial')).length).toBe(1)
    const [backupFolder]=await readdir(backupDirectory)
    const manifest=JSON.parse(await readFile(join(backupDirectory,backupFolder,'manifest.json'),'utf8'))
    expect(manifest.books[0].sha256).toBe(hash)
    const restoreDirectory=join(root,'restores');await mkdir(restoreDirectory)
    await app.evaluate(({dialog},folders)=>{let index=0;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folders[index++]]})},[join(backupDirectory,backupFolder),restoreDirectory])
    await page.getByRole('button',{name:'恢复完整书库到新文件夹'}).click()
    await expect(page.getByTestId('restored-library')).toContainText('已恢复到')
    const [restoredFolder]=await readdir(restoreDirectory)
    expect(createHash('sha256').update(await readFile(join(restoreDirectory,restoredFolder,'books',hash,'source.pdf'))).digest('hex')).toBe(hash)
    await page.locator('.settings').getByRole('button',{name:'×'}).click()
    await page.getByRole('button',{name:/查看原文/}).click()
    await expect(page.locator('.pdf-pane')).toBeVisible()
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},second)
    await page.getByRole('button',{name:'添加教材',exact:true}).click()
    await expect.poll(async()=>page.evaluate(async()=>{const data=await window.desktop.call<{books:{id:string}[]}>('snapshot');return data.books.length})).toBe(2)
    const books=await page.evaluate(()=>window.desktop.call<{books:{id:string}[]}>('snapshot'))
    expect(books.books.some(book=>book.id===hash)).toBe(true)
    await expect.poll(async()=>page.evaluate(async()=>{const data=await window.desktop.call<{books:{status:string}[]}>('snapshot');return data.books.every(book=>book.status==='ready')})).toBe(true)
    await page.getByRole('button',{name:'全文搜索',exact:true}).click()
    await page.getByPlaceholder('搜索教材、笔记与高亮…').fill('Self-authored')
    await page.getByLabel('搜索所有已导入教材').check()
    await expect(page.locator('.search-results button').filter({hasText:'我的测试教材'}).first()).toBeVisible()
    await expect(page.locator('.search-results button').filter({hasText:'second'}).first()).toBeVisible()
    await page.getByLabel(/^second ·/).uncheck()
    await expect(page.locator('.search-results button').filter({hasText:'second'})).toHaveCount(0)
    await expect(page.locator('.search-results button').filter({hasText:'我的测试教材'}).first()).toBeVisible()
    await page.getByRole('button',{name:'选择全部'}).click()
    await expect(page.locator('.search-results button').filter({hasText:'second'}).first()).toBeVisible()
    await page.locator('.search-results button').filter({hasText:'我的测试教材'}).first().click()
    await expect(page.getByRole('tab',{name:'我的测试教材'})).toHaveAttribute('aria-selected','true')
    await expect(page.locator('.pdf-pane')).toBeVisible()
    const restoredPath=join(restoreDirectory,restoredFolder)
    await app.evaluate(({app,dialog},path)=>{
      const target=app as typeof app & {originalQuit:typeof app.quit;originalRelaunch:typeof app.relaunch}
      target.originalQuit=app.quit;target.originalRelaunch=app.relaunch
      app.quit=()=>{};app.relaunch=()=>{}
      dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path]})
      dialog.showMessageBox=async()=>{await new Promise(resolve=>setTimeout(resolve,500));return {response:1,checkboxChecked:false}}
    },restoredPath)
    await page.getByRole('button',{name:'阅读设置'}).click()
    await page.getByRole('button',{name:'切换书库'}).click()
    await expect.poll(async()=>{
      try{return JSON.parse(await readFile(join(root,'profile','active-library.json'),'utf8')).path}catch{return ''}
    }).toBe(restoredPath)
    await app.evaluate(({app})=>{
      const target=app as typeof app & {originalQuit:typeof app.quit;originalRelaunch:typeof app.relaunch}
      app.quit=target.originalQuit;app.relaunch=target.originalRelaunch
    })
    await app.close()
    const original=new DatabaseSync(join(root,'profile','library.sqlite'),{readOnly:true})
    try{expect(original.prepare('SELECT count(*) AS n FROM books').get()?.n).toBe(2)}finally{original.close()}
    app=await electron.launch({executablePath:require('electron'),args:[...flags,'.'],env})
    const reopened=await app.firstWindow()
    await expect(reopened.getByRole('tab',{name:'我的测试教材'})).toBeVisible({timeout:30000})
    const restoredBooks=await reopened.evaluate(()=>window.desktop.call<{books:{id:string}[]}>('snapshot'))
    expect(restoredBooks.books.map(book=>book.id)).toEqual([hash])
    await reopened.getByRole('button',{name:'阅读设置'}).click()
    await expect(reopened.getByTestId('data-location')).toContainText(restoredPath)
  } finally { await app.evaluate(({app})=>{const target=app as typeof app & {originalQuit?:typeof app.quit;originalRelaunch?:typeof app.relaunch};if(target.originalQuit)app.quit=target.originalQuit;if(target.originalRelaunch)app.relaunch=target.originalRelaunch}).catch(()=>{});await app.close() }
})

test('reports a missing selected library and opens the starting profile',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cpss-missing-library-')),profile=join(root,'profile')
  await mkdir(profile)
  await writeFile(join(profile,'active-library.json'),JSON.stringify({path:join(root,'missing-library')}))
  const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),CPSS_DATA_DIR:profile}
  delete env.ELECTRON_RUN_AS_NODE
  const flags=process.platform==='linux'?['--no-sandbox','--headless','--ozone-platform=headless','--disable-gpu']:[]
  const app=await electron.launch({executablePath:require('electron'),args:[...flags,'.'],env})
  try{
    const page=await app.firstWindow()
    await expect(page.getByRole('alert')).toContainText('上次选择的书库不可用')
    await page.getByRole('button',{name:'阅读设置'}).click()
    await expect(page.getByTestId('data-location')).toContainText(profile)
  }finally{await app.close()}
})
