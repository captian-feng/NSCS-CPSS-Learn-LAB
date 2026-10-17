import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
const stage=resolve('.local/windows-app')
const pkg=JSON.parse(await readFile('package.json','utf8'))
delete pkg.build
await mkdir(stage,{recursive:true})
await rm(resolve(stage,'out'),{recursive:true,force:true})
await cp('out',resolve(stage,'out'),{recursive:true})
await cp('package-lock.json',resolve(stage,'package-lock.json'))
await writeFile(resolve(stage,'package.json'),JSON.stringify(pkg,null,2))
if(!process.env.npm_execpath)throw new Error('请通过 npm run dist:win:cross 调用此脚本')
const result=spawnSync(process.execPath,[process.env.npm_execpath,'ci','--omit=dev','--ignore-scripts','--os=win32','--cpu=x64','--no-audit','--no-fund'],{cwd:stage,stdio:'inherit'})
if(result.status!==0)process.exit(result.status??1)
