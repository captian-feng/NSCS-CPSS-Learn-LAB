import { test, expect, _electron as electron } from '@playwright/test'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
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
  const app=await electron.launch({executablePath:require('electron'),args:[...flags,'.'],env})
  try {
    const page=await app.firstWindow()
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},pdf)
    await page.getByRole('button',{name:'阅读设置'}).click()
    await expect(page.getByTestId('data-location')).toContainText('独立体验资料')
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
    await expect(page.getByRole('button',{name:/自定义章节/})).toBeVisible()
    await page.getByRole('button',{name:'编辑教材名称'}).click()
    await page.getByLabel('教材名称',{exact:true}).fill('我的测试教材')
    await page.getByRole('button',{name:'保存教材名称'}).click()
    await expect(page.getByRole('tab',{name:'我的测试教材'})).toBeVisible()
    await page.getByRole('button',{name:'功能导航',exact:true}).click()
    await page.getByRole('button',{name:'学习概览',exact:true}).click()
    await page.getByRole('button',{name:'查看索引质量报告'}).click()
    await expect(page.locator('.report')).toContainText('已处理 4 页')
    await expect(page.locator('.report')).toContainText('需要核对的页面')
    await page.locator('.report').getByRole('button',{name:'×'}).click()
    await page.getByRole('button',{name:'练习题库',exact:true}).click()
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},path)
    await page.getByRole('button',{name:'导入题库 JSON'}).click()
    await expect(page.getByText('Which answer is correct?')).toBeVisible()
    await page.getByRole('radio',{name:/Correct/}).click()
    await page.getByRole('button',{name:'提交答案'}).click()
    await expect(page.getByText('回答正确',{exact:true})).toBeVisible()
    await page.getByRole('button',{name:/查看原文/}).click()
    await expect(page.locator('.pdf-pane')).toBeVisible()
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},second)
    await page.getByRole('button',{name:'添加教材',exact:true}).click()
    await expect.poll(async()=>page.evaluate(async()=>{const data=await window.desktop.call<{books:{id:string}[]}>('snapshot');return data.books.length})).toBe(2)
    const books=await page.evaluate(()=>window.desktop.call<{books:{id:string}[]}>('snapshot'))
    expect(books.books.some(book=>book.id===hash)).toBe(true)
  } finally { await app.close() }
})
