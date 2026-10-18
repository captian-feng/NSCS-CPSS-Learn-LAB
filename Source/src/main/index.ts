import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { Worker } from 'node:worker_threads'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, stat, writeFile, rename } from 'node:fs/promises'
import { Readable } from 'node:stream'

const here=dirname(fileURLToPath(import.meta.url))
app.setName('CPSS LAB')
if(!app.isPackaged && process.env.CPSS_DATA_DIR)app.setPath('userData',resolve(process.env.CPSS_DATA_DIR))
protocol.registerSchemesAsPrivileged([{scheme:'cpss',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true,corsEnabled:true}}])
let service:Worker|undefined,window:BrowserWindow|undefined
if(!app.requestSingleInstanceLock())app.exit(0)
app.on('second-instance',()=>{if(window?.isMinimized())window.restore();window?.focus()})
const pending=new Map<string,{resolve:(value:unknown)=>void;reject:(error:Error)=>void}>()
const publicMethods=new Set(['practice','answer','snapshot','detail','page','search','saveRecord','removeRecord','position','progress','setting','pause','resume','report'])
function rpc<T=unknown>(method:string,args?:unknown):Promise<T> {
  return new Promise((resolve,reject)=>{
    if(!service){reject(new Error('本地数据服务不可用'));return}
    const id=randomUUID();pending.set(id,{resolve:resolve as (value:unknown)=>void,reject});service.postMessage({id,method,args})
  })
}
function assertSender(event:Electron.IpcMainInvokeEvent) {
  if(!window || event.sender!==window.webContents || event.senderFrame!==window.webContents.mainFrame)throw new Error('不受信任的请求来源')
}
async function resources(request:Request):Promise<Response> {
  const url=new URL(request.url)
  if(url.hostname==='app') {
    const root=resolve(here,'../renderer'),path=resolve(root,decodeURIComponent(url.pathname).replace(/^\/+/,'' )||'index.html')
    if(path!==root && !path.startsWith(root+sep))return new Response('Forbidden',{status:403})
    try {
      const {size}=await stat(path)
      const types:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.wasm':'application/wasm','.png':'image/png','.bcmap':'application/octet-stream','.pfb':'application/octet-stream','.ttf':'font/ttf'}
      return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream,{headers:{'Content-Type':types[extname(path)]??'application/octet-stream','Content-Length':String(size)}})
    }catch{return new Response('Not found',{status:404})}
  }
  if(url.hostname!=='book')return new Response('Not found',{status:404})
  const match=/^\/([a-f0-9]{64})\/source\.pdf$/.exec(url.pathname)
  if(!match)return new Response('Not found',{status:404})
  const path=join(app.getPath('userData'),'books',match[1],'source.pdf')
  try {
    const {size}=await stat(path)
    let start=0,end=size-1,status=200
    const range=request.headers.get('range')
    if(range) {
      const parts=/^bytes=(\d+)-(\d*)$/.exec(range)
      if(!parts)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}})
      start=Number(parts[1]);end=parts[2]?Math.min(Number(parts[2]),size-1):size-1;status=206
      if(start>end || start>=size)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}})
    }
    const devOrigin=process.env.ELECTRON_RENDERER_URL?new URL(process.env.ELECTRON_RENDERER_URL).origin:''
    const allowedOrigin=devOrigin && request.headers.get('origin')===devOrigin?devOrigin:'cpss://app'
    const headers:Record<string,string>={'Content-Type':'application/pdf','Content-Length':String(end-start+1),'Accept-Ranges':'bytes','Access-Control-Allow-Origin':allowedOrigin,'Cache-Control':'no-store'}
    if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`
    return new Response(Readable.toWeb(createReadStream(path,{start,end})) as ReadableStream,{status,headers})
  }catch{return new Response('教材文件缺失，请重新导入对应 PDF',{status:404})}
}
app.whenReady().then(async()=>{
  protocol.handle('cpss',resources)
  service=new Worker(join(here,'service.js'),{workerData:{root:app.getPath('userData'),bundledRoot:app.isPackaged?join(process.resourcesPath,'bundled-library'):process.env.CPSS_BUNDLED_ROOT},stderr:true})
  service.stderr?.on('data',chunk=>console.error('[library]',chunk.toString()))
  service.on('error',error=>console.error('[library]',error))
  service.on('exit',code=>{
    service=undefined
    for(const request of pending.values())request.reject(new Error(`本地数据进程退出（${code}），请重新启动软件；已提交资料会保留`))
    pending.clear()
    if(window&&!window.isDestroyed())window.webContents.send('lab:progress',{bookId:'',processed:0,total:0,status:'failed',error:'本地数据线程已退出，请重新启动软件'})
  })
  const ready=new Promise<void>((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('本地数据服务启动超时')),30000)
    service!.once('exit',code=>{clearTimeout(timer);reject(new Error(`本地数据服务启动失败（${code}）`))})
    service!.on('message',message=>{
      if(message.type==='ready'){clearTimeout(timer);resolve()}
      if(message.type==='progress'&&window&&!window.isDestroyed())window.webContents.send('lab:progress',message.event)
      if(message.type==='reply') {
        const callback=pending.get(message.id);pending.delete(message.id)
        if(message.error)callback?.reject(new Error(message.error));else callback?.resolve(message.value)
      }
    })
  })
  await ready
  ipcMain.handle('lab:call',(event,method,args)=>{assertSender(event);if(!publicMethods.has(method))throw new Error('不允许的操作');return rpc(method,args)})
  ipcMain.handle('lab:choose-pdf',async event=>{
    assertSender(event)
    let file=(!app.isPackaged && process.env.CPSS_TESTING==='1')?process.env.CPSS_TEST_PDF:undefined
    if(!file){const result=await dialog.showOpenDialog(window!,{title:'导入英文教材',filters:[{name:'PDF 文档',extensions:['pdf']}],properties:['openFile']});if(result.canceled)return null;file=result.filePaths[0]}
    return rpc('importPath',file)
  })
  ipcMain.handle('lab:export',async(event,format)=>{
    assertSender(event);if(!['json','markdown'].includes(format))throw new Error('未知导出格式')
    const extension=format==='json'?'json':'md'
    const result=await dialog.showSaveDialog(window!,{defaultPath:`CPSS-LAB-Backup.${extension}`,filters:[{name:format,extensions:[extension]}]})
    if(result.canceled || !result.filePath)return null
    const data=await rpc(format==='json'?'backup':'markdown')
    await writeFile(result.filePath+'.partial',format==='json'?JSON.stringify(data,null,2):String(data),'utf8')
    await rename(result.filePath+'.partial',result.filePath)
    return result.filePath
  })
  ipcMain.handle('lab:restore',async event=>{
    assertSender(event)
    const result=await dialog.showOpenDialog(window!,{title:'恢复学习记录',filters:[{name:'CPSS LAB 备份',extensions:['json']}],properties:['openFile']})
    if(result.canceled)return null
    if((await stat(result.filePaths[0])).size>100*1024*1024)throw new Error('备份超过 100 MB，请检查所选文件')
    return rpc('restore',JSON.parse(await readFile(result.filePaths[0],'utf8')))
  })
  ipcMain.handle('lab:open-data',event=>{assertSender(event);return shell.openPath(app.getPath('userData'))})
  window=new BrowserWindow({width:1500,height:960,minWidth:980,minHeight:680,backgroundColor:'#f5f4ef',title:'CPSS LAB',webPreferences:{preload:join(here,'../preload/index.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}})
  window.setMenuBarVisibility(false)
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  window.webContents.on('will-navigate',(event,url)=>{if(!url.startsWith('cpss://app/') && !url.startsWith(process.env.ELECTRON_RENDERER_URL || 'cpss://app/'))event.preventDefault()})
  window.webContents.session.webRequest.onBeforeRequest((details,callback)=>{
    const dev=process.env.ELECTRON_RENDERER_URL
    const allowed=details.url.startsWith('cpss://') || details.url.startsWith('blob:') || details.url.startsWith('data:') || (dev && (details.url.startsWith(dev)||details.url.startsWith(dev.replace('http','ws'))))
    callback({cancel:!allowed})
  })
  if(process.env.ELECTRON_RENDERER_URL)await window.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await window.loadURL('cpss://app/index.html')
  app.on('activate',()=>window?.show())
}).catch(error=>{console.error(error);dialog.showErrorBox('CPSS LAB 启动失败',String(error));app.exit(1)})
app.on('window-all-closed',()=>app.quit())
app.on('before-quit',()=>{void service?.terminate()})
