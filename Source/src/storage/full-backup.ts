import { createHash,randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile,lstat,mkdir,readFile,realpath,rename,rm,stat,writeFile } from 'node:fs/promises'
import { dirname,isAbsolute,join,relative,sep } from 'node:path'
import { backup,DatabaseSync } from 'node:sqlite'
import { z } from 'zod'

const digest=z.string().regex(/^[a-f0-9]{64}$/)
const manifestSchema=z.object({
  format:z.literal('cpss-lab-full-backup'),schemaVersion:z.literal(1),created:z.string().datetime(),databaseSha256:digest,
  books:z.array(z.object({bookId:digest,sha256:digest,size:z.number().int().nonnegative().safe()}).strict()).max(10000)
}).strict().refine(data=>new Set(data.books.map(book=>book.bookId)).size===data.books.length,{message:'备份中教材编号重复'})

async function sha256(path:string):Promise<string> {
  const hash=createHash('sha256')
  for await(const chunk of createReadStream(path))hash.update(chunk)
  return hash.digest('hex')
}

/** Check a library chosen by the user before switching to it. */
export async function validateLibrary(directory:string):Promise<string> {
  const root=await realpath(directory)
  const database=join(root,'library.sqlite')
  if(!(await lstat(database)).isFile())throw new Error('所选文件夹没有有效的书库数据库')
  const snapshot=new DatabaseSync(database,{readOnly:true})
  let books:{id:string;hash:string;status:string}[]
  try{
    const check=snapshot.prepare('PRAGMA integrity_check').get() as {integrity_check:string}
    if(check.integrity_check!=='ok')throw new Error('书库数据库完整性检查失败')
    const schema=snapshot.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as {value:string}|undefined
    if(schema?.value!=='1')throw new Error('书库数据库版本不受支持')
    books=snapshot.prepare('SELECT id,hash,status FROM books').all() as {id:string;hash:string;status:string}[]
  }finally{snapshot.close()}
  for(const book of books){
    if(!/^[a-f0-9]{64}$/.test(book.id)||book.id!==book.hash||!['ready','paused'].includes(book.status))throw new Error('书库包含未完成或身份无效的教材')
    const pdf=join(root,'books',book.id,'source.pdf'),info=await lstat(pdf).catch(()=>null)
    if(!info?.isFile()||await sha256(pdf)!==book.hash)throw new Error('书库教材文件缺失或校验失败')
  }
  return root
}

/** Create a verified snapshot without modifying the live library. */
export async function exportFullBackup(db:DatabaseSync,libraryRoot:string,directory:string):Promise<string> {
  const root=await realpath(libraryRoot),destination=await realpath(directory)
  const within=relative(root,destination)
  if(within===''||(!(within==='..'||within.startsWith(`..${sep}`))&&!isAbsolute(within)))throw new Error('请选择资料目录以外的备份位置')
  if(!(await stat(destination)).isDirectory())throw new Error('备份位置不是文件夹')
  const name=`CPSS-LAB-Backup-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`
  const temporary=join(destination,`${name}.partial`),final=join(destination,name)
  await mkdir(temporary)
  try{
    const databasePath=join(temporary,'library.sqlite')
    await backup(db,databasePath)
    const snapshot=new DatabaseSync(databasePath,{readOnly:true})
    let books:{id:string;hash:string;status:string}[]
    try{
      const check=snapshot.prepare('PRAGMA integrity_check').get() as {integrity_check:string}
      if(check.integrity_check!=='ok')throw new Error('数据库快照完整性检查失败')
      books=snapshot.prepare('SELECT id,hash,status FROM books').all() as {id:string;hash:string;status:string}[]
    }finally{snapshot.close()}
    const files:{bookId:string;sha256:string;size:number}[]=[]
    for(const book of books){
      if(!/^[a-f0-9]{64}$/.test(book.id)||book.hash!==book.id)throw new Error('教材身份无效，无法创建完整备份')
      if(!['ready','paused'].includes(book.status))throw new Error('请先完成或暂停所有教材导入，并重新关联缺失教材')
      const source=join(root,'books',book.id,'source.pdf')
      const info=await lstat(source).catch(()=>null)
      if(!info?.isFile())throw new Error('教材文件缺失，请先重新关联教材')
      const target=join(temporary,'books',book.id,'source.pdf')
      await mkdir(dirname(target),{recursive:true})
      await copyFile(source,target)
      const digest=await sha256(target)
      if(digest!==book.hash)throw new Error('教材文件校验失败，备份已取消')
      files.push({bookId:book.id,sha256:digest,size:info.size})
    }
    const manifest={format:'cpss-lab-full-backup',schemaVersion:1,created:new Date().toISOString(),databaseSha256:await sha256(databasePath),books:files}
    await writeFile(join(temporary,'manifest.json'),JSON.stringify(manifest,null,2),'utf8')
    await rename(temporary,final)
    return final
  }catch(error){
    await rm(temporary,{recursive:true,force:true})
    throw error
  }
}

/** Verify and restore into a newly created independent folder. */
export async function restoreFullBackup(libraryRoot:string,sourceDirectory:string,directory:string):Promise<string> {
  const root=await realpath(libraryRoot),source=await realpath(sourceDirectory),destination=await realpath(directory)
  for(const forbidden of [root,source]){
    const path=relative(forbidden,destination)
    if(path===''||(!(path==='..'||path.startsWith(`..${sep}`))&&!isAbsolute(path)))throw new Error('请选择备份与当前资料目录以外的恢复位置')
  }
  const manifestFile=join(source,'manifest.json'),manifestInfo=await lstat(manifestFile)
  if(!manifestInfo.isFile()||manifestInfo.size>2*1024*1024)throw new Error('备份清单无效')
  const manifest=manifestSchema.parse(JSON.parse(await readFile(manifestFile,'utf8')))
  const databaseFile=join(source,'library.sqlite')
  if(!(await lstat(databaseFile)).isFile())throw new Error('备份数据库无效')
  const name=`CPSS-LAB-Restored-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`
  const temporary=join(destination,`${name}.partial`),final=join(destination,name)
  await mkdir(temporary)
  try{
    const targetDatabase=join(temporary,'library.sqlite')
    await copyFile(databaseFile,targetDatabase)
    if(await sha256(targetDatabase)!==manifest.databaseSha256)throw new Error('备份数据库校验失败')
    const snapshot=new DatabaseSync(targetDatabase,{readOnly:true})
    try{
      const check=snapshot.prepare('PRAGMA integrity_check').get() as {integrity_check:string}
      if(check.integrity_check!=='ok')throw new Error('备份数据库完整性检查失败')
      const schema=snapshot.prepare("SELECT value FROM meta WHERE key='schema_version'").get() as {value:string}|undefined
      if(schema?.value!=='1')throw new Error('备份资料库版本不受支持')
      const books=snapshot.prepare('SELECT id,hash,status FROM books').all() as {id:string;hash:string;status:string}[]
      if(books.length!==manifest.books.length)throw new Error('备份教材清单与数据库不一致')
      for(const book of books){
        const file=manifest.books.find(item=>item.bookId===book.id)
        if(!file||file.sha256!==book.hash||book.id!==book.hash||!['ready','paused'].includes(book.status))throw new Error('备份教材身份或状态不一致')
      }
    }finally{snapshot.close()}
    for(const book of manifest.books){
      const bookDirectory=join(source,'books',book.bookId)
      if(!(await lstat(bookDirectory)).isDirectory())throw new Error('备份教材目录无效')
      const pdf=join(bookDirectory,'source.pdf'),info=await lstat(pdf)
      if(!info.isFile()||info.size!==book.size)throw new Error('备份教材文件缺失或大小不符')
      const target=join(temporary,'books',book.bookId,'source.pdf')
      await mkdir(dirname(target),{recursive:true});await copyFile(pdf,target)
      if(await sha256(target)!==book.sha256)throw new Error('备份教材校验失败')
    }
    await writeFile(join(temporary,'manifest.json'),JSON.stringify(manifest,null,2),'utf8')
    await rename(temporary,final)
    return final
  }catch(error){
    await rm(temporary,{recursive:true,force:true})
    throw error
  }
}
