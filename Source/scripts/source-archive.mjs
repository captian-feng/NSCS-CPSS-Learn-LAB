import { cp, mkdir, readdir, rm } from 'node:fs/promises'
import { resolve, join, extname } from 'node:path'
import { spawnSync } from 'node:child_process'
const stage=resolve('.local/source-archive'),output=resolve(process.env.CPSS_SOURCE_ARCHIVE||'release/CPSS-LAB-Source.zip')
await rm(stage,{recursive:true,force:true});await mkdir(stage,{recursive:true});await mkdir('release',{recursive:true})
const roots=['src','tests','scripts','docs','README.md','package.json','package-lock.json','tsconfig.json','electron.vite.config.ts','electron-builder.textbook.cjs','vitest.config.ts','playwright.config.ts','playwright.textbook.config.ts','.gitignore']
async function copy(source,target) {
  if(source.replaceAll('\\','/').includes('src/renderer/public/pdf-assets') || ['.pdf','.sqlite','.log'].includes(extname(source).toLowerCase()))return
  const entries=await readdir(source,{withFileTypes:true}).catch(()=>null)
  if(entries){await mkdir(target,{recursive:true});for(const entry of entries)await copy(join(source,entry.name),join(target,entry.name))}
  else await cp(source,target)
}
for(const path of roots)await copy(path,join(stage,path))
await rm(output,{force:true})
const command=process.platform==='win32'?'powershell.exe':'zip'
const args=process.platform==='win32'?['-NoProfile','-Command',"Compress-Archive -Path (Join-Path $env:CPSS_ARCHIVE_STAGE '*') -DestinationPath $env:CPSS_ARCHIVE_PATH -Force"]:['-q','-r',output,'.']
const result=spawnSync(command,args,{cwd:stage,stdio:'inherit',env:{...process.env,CPSS_ARCHIVE_STAGE:stage,CPSS_ARCHIVE_PATH:output}})
if(result.status!==0)process.exit(result.status??1)
console.log(output)
