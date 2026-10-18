import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktop',{
  call:(method:string,args:unknown)=>ipcRenderer.invoke('lab:call',method,args),
  choosePDF:()=>ipcRenderer.invoke('lab:choose-pdf'),
  exportData:(format:string)=>ipcRenderer.invoke('lab:export',format),
  restoreData:()=>ipcRenderer.invoke('lab:restore'),
  openReference:(url:string)=>ipcRenderer.invoke('lab:open-reference',url),
  openDataFolder:()=>ipcRenderer.invoke('lab:open-data'),
  onProgress:(callback:(event:unknown)=>void)=>{
    const listener=(_event:unknown,data:unknown)=>callback(data)
    ipcRenderer.on('lab:progress',listener)
    return ()=>ipcRenderer.removeListener('lab:progress',listener)
  }
})
