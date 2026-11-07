import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('desktop',{
  call:(method:string,args:unknown)=>ipcRenderer.invoke('lab:call',method,args),
  choosePDF:()=>ipcRenderer.invoke('lab:choose-pdf'),
  importQuestionBank:(bookId:string)=>ipcRenderer.invoke('lab:import-question-bank',bookId),
  exportData:(format:string)=>ipcRenderer.invoke('lab:export',format),
  restoreData:()=>ipcRenderer.invoke('lab:restore'),
  exportFullBackup:()=>ipcRenderer.invoke('lab:full-backup'),
  restoreFullBackup:()=>ipcRenderer.invoke('lab:restore-full-backup'),
  switchLibrary:()=>ipcRenderer.invoke('lab:switch-library'),
  openReference:(url:string)=>ipcRenderer.invoke('lab:open-reference',url),
  openDataFolder:()=>ipcRenderer.invoke('lab:open-data'),
  dataLocation:()=>ipcRenderer.invoke('lab:data-location'),
  checkLocalModels:()=>ipcRenderer.invoke('lab:check-local-models'),
  onProgress:(callback:(event:unknown)=>void)=>{
    const listener=(_event:unknown,data:unknown)=>callback(data)
    ipcRenderer.on('lab:progress',listener)
    return ()=>ipcRenderer.removeListener('lab:progress',listener)
  }
})
