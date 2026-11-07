import { test,expect,_electron as electron } from '@playwright/test'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createFixture } from '../fixtures/create'

const require=createRequire(import.meta.url)
test('creates and publishes a manual question without a model',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cpss-manual-'))
  const pdf=await createFixture(join(root,'book.pdf'))
  const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),CPSS_DATA_DIR:join(root,'profile')}
  delete env.CPSS_TESTING;delete env.CPSS_TEST_PDF;delete env.ELECTRON_RUN_AS_NODE
  const flags=process.platform==='linux'?['--no-sandbox','--headless','--ozone-platform=headless','--disable-gpu']:[]
  const app=await electron.launch({executablePath:require('electron'),args:[...flags,'.'],env})
  try{
    const page=await app.firstWindow()
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},pdf)
    await page.getByRole('button',{name:'＋ 导入英文教材 PDF',exact:true}).click()
    await expect.poll(async()=>page.evaluate(async()=>{const data=await window.desktop.call<{books:{status:string}[]}>('snapshot');return data.books[0]?.status})).toBe('ready')
    await page.getByRole('button',{name:'功能导航',exact:true}).click()
    await page.getByRole('button',{name:'练习题库',exact:true}).click()
    await page.getByRole('button',{name:'手工创建单选题'}).click()
    await page.getByLabel('知识点').fill('手工知识点')
    await page.getByLabel('题干').fill('手工题目是什么？')
    for(const [index,letter] of ['A','B','C','D'].entries()){
      await page.getByLabel(`选项 ${letter}`,{exact:true}).fill(`选项 ${index+1}`)
      await page.getByLabel(`选项 ${letter} 解析`,{exact:true}).fill(`解析 ${index+1}`)
    }
    await page.getByLabel('原文引用').fill('Self-authored sample')
    await page.getByRole('button',{name:'保存草稿'}).click()
    await expect(page.getByText('手工题目是什么？')).toBeVisible()
    await page.getByRole('button',{name:'审校并发布'}).click()
    await page.getByLabel('我已核对原文、答案和所有选项解析').check()
    await page.getByRole('button',{name:'确认发布'}).click()
    await expect(page.getByText('此草稿已发布到当前教材题库。')).toBeVisible()
    await page.getByRole('button',{name:'检查全部题目来源'}).click()
    await expect(page.getByRole('status').filter({hasText:'已检查 1 题：匹配 1'})).toBeVisible()
    await page.getByRole('button',{name:'核验教材引用'}).click()
    await expect(page.getByRole('status').filter({hasText:'逐字匹配'})).toBeVisible()
    await page.getByRole('radio',{name:'A 选项 1'}).click()
    await page.getByRole('button',{name:'提交答案'}).click()
    await expect(page.getByText('回答正确',{exact:true})).toBeVisible()
  }finally{await app.close()}
})
test('generates a draft, reopens it and jumps to its textbook source',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cpss-draft-'))
  const pdf=await createFixture(join(root,'book.pdf'))
  const question={topic:'Sample',prompt:'What is this document?',options:[{text:'A fixture',explanation:'The source describes a sample.'},{text:'A planet',explanation:'Not supported.'},{text:'A recipe',explanation:'Not supported.'},{text:'A vehicle',explanation:'Not supported.'}],correct:0,quote:'Self-authored sample'}
  const requests:{url:string|undefined;body:string}[]=[]
  const server=createServer((req,res)=>{
    let body=''
    req.setEncoding('utf8');req.on('data',chunk=>{body+=chunk})
    req.on('end',()=>{requests.push({url:req.url,body});res.setHeader('content-type','application/json');res.end(JSON.stringify({response:JSON.stringify(question)}))})
  })
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
  const address=server.address()
  if(!address || typeof address==='string')throw new Error('No test port')
  const env:Record<string,string>={...Object.fromEntries(Object.entries(process.env).filter((entry):entry is [string,string]=>entry[1]!==undefined)),CPSS_DATA_DIR:join(root,'profile'),CPSS_TESTING:'1',CPSS_TEST_MODEL_PORT:String(address.port)}
  delete env.CPSS_TEST_PDF;delete env.ELECTRON_RUN_AS_NODE
  const flags=process.platform==='linux'?['--no-sandbox','--headless','--ozone-platform=headless','--disable-gpu']:[]
  const launch=()=>electron.launch({executablePath:require('electron'),args:[...flags,'.'],env})
  let app=await launch()
  try{
    let page=await app.firstWindow()
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]})},pdf)
    await page.getByRole('button',{name:'＋ 导入英文教材 PDF',exact:true}).click()
    await expect(page.locator('.pdf-pane')).toBeVisible({timeout:30000})
    await expect.poll(async()=>page.evaluate(async()=>{const data=await window.desktop.call<{books:{status:string}[]}>('snapshot');return data.books[0]?.status})).toBe('ready')
    await page.getByRole('button',{name:'功能导航',exact:true}).click()
    await page.getByRole('button',{name:'练习题库',exact:true}).click()
    await page.getByLabel('本地模型名称').fill('test-model')
    await page.getByRole('button',{name:'生成草稿',exact:true}).click()
    await expect(page.getByText('What is this document?')).toBeVisible()
    expect(requests).toHaveLength(1)
    expect(requests[0].url).toBe('/api/generate')
    expect(JSON.parse(requests[0].body).prompt).toContain('Self-authored sample')
    await expect(page.getByRole('button',{name:'查看草稿来源 · PDF 第 1 页'})).toBeVisible()
    await page.getByRole('button',{name:'编辑草稿'}).click()
    await page.getByLabel('题干').fill('Edited textbook question')
    await page.getByLabel('正确答案').selectOption('1')
    await page.getByRole('button',{name:'保存草稿'}).click()
    await expect(page.getByText('Edited textbook question')).toBeVisible()
    await app.close()
    app=await launch();page=await app.firstWindow()
    await expect(page.locator('.pdf-pane')).toBeVisible({timeout:30000})
    await page.getByRole('button',{name:'功能导航',exact:true}).click()
    await page.getByRole('button',{name:'练习题库',exact:true}).click()
    await page.getByRole('button',{name:'Sample · PDF 第 1 页'}).click()
    await expect(page.getByText('Edited textbook question')).toBeVisible()
    await expect(page.getByText('建议答案：B')).toBeVisible()
    await page.getByRole('button',{name:'审校并发布'}).click()
    await page.getByLabel('我已核对原文、答案和所有选项解析').check()
    await page.getByRole('button',{name:'确认发布'}).click()
    await expect(page.getByText('此草稿已发布到当前教材题库。')).toBeVisible()
    await page.getByRole('radio',{name:'B A planet'}).click()
    await page.getByRole('button',{name:'提交答案'}).click()
    await expect(page.getByText('回答正确',{exact:true})).toBeVisible()
    await page.getByRole('button',{name:'查看草稿来源 · PDF 第 1 页'}).click()
    await expect(page.locator('.pdf-pane')).toBeVisible()
    await expect(page.locator('.pdf-page[data-page-index="0"]')).toBeVisible()
  }finally{
    await app.close()
    await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))
  }
})
