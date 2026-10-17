import {it,expect} from 'vitest'
import {mkdtemp,writeFile,rm,mkdir,chmod} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createHash} from 'node:crypto'
import {LabStore,newRecord} from '../src/storage/store'
import {initializeBundledLibrary,sha256File} from '../src/storage/bundled-library'

async function fixture(root:string,personal=false) {
  const bytes=Buffer.from('%PDF-1.4 self-authored seed identity test fixture'),id=createHash('sha256').update(bytes).digest('hex')
  const seed=new LabStore(root);seed.createBook(id,'Self-authored seed',id)
  seed.putPage(id,{page:0,label:'1',width:600,height:800,status:'text',issues:[],regions:[],blocks:[{id:id+':b',bookId:id,page:0,order:0,text:'Seed training adaptation',runs:[{text:'Seed training adaptation'}],kind:'paragraph',rect:[0,0,100,50],level:0}]})
  seed.setToc(id,[{id:'chapter',bookId:id,parentId:null,title:'Chapter 1 Fixture',page:0,level:0,source:'fixture'}])
  seed.updateBook(id,{pages:1,processed:1,status:'ready'})
  if(personal)seed.saveRecord(newRecord(id,0,'note',null,'This must not be published'))
  seed.db.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE');seed.close()
  await mkdir(join(root,'books',id),{recursive:true});await writeFile(join(root,'books',id,'source.pdf'),bytes)
  const manifest={format:'cpss-bundled-library',schemaVersion:1,bookId:id,sourceHash:id,sourceBytes:bytes.length,databaseHash:await sha256File(join(root,'library.sqlite')),title:'Fixture',pages:1,openAtPage:0,converter:'pdfjs-layout-v1'}
  await writeFile(join(root,'manifest.json'),JSON.stringify(manifest))
  return {id,manifest}
}
it('installs a readonly seed on a fresh profile, is repeatable and preserves later notes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cpss-seed-')),seed=join(root,'seed'),{id}=await fixture(seed),target=new LabStore(join(root,'user'))
  try {
    await chmod(join(seed,'library.sqlite'),0o444);await chmod(seed,0o555)
    expect(await initializeBundledLibrary(target,seed)).toBe(true)
    expect(target.book(id).status).toBe('ready');expect(target.search(id,'adaptation')).toHaveLength(1)
    expect(target.snapshot().settings.lastBook).toBe(id);expect(target.detail(id).position?.page).toBe(0)
    const record=newRecord(id,0,'note',null,'User-owned');target.saveRecord(record)
    expect(await initializeBundledLibrary(target,seed)).toBe(false);expect(target.records(id)).toEqual([record])
  }finally{target.close();await chmod(seed,0o755);await chmod(join(seed,'library.sqlite'),0o644);await rm(root,{recursive:true,force:true})}
})
it('merges into an existing profile without changing notes, reading position, progress or preferences',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cpss-seed-existing-')),seed=join(root,'seed'),{id}=await fixture(seed),target=new LabStore(join(root,'user'))
  try {
    const other='e'.repeat(64);target.createBook(other,'Existing book',other);target.setSetting('lastBook',other);target.setSetting('theme','dark')
    const note=newRecord(id,0,'note',null,'Restored before PDF association');target.saveRecord(note)
    target.savePosition(id,{page:0,blockId:'existing-position'});target.setProgress(id,'chapter','已完成')
    await initializeBundledLibrary(target,seed)
    expect(target.records(id)).toEqual([note]);expect(target.detail(id).position?.blockId).toBe('existing-position')
    expect(target.detail(id).progress[0].status).toBe('已完成');expect(target.snapshot().settings).toEqual({lastBook:other,theme:'dark'})
  }finally{target.close();await rm(root,{recursive:true,force:true})}
})
it('rejects a tampered seed and leaves the existing library unchanged',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cpss-seed-invalid-')),seed=join(root,'seed'),{id}=await fixture(seed),target=new LabStore(join(root,'user'))
  try {
    const note=newRecord('existing',0,'note',null,'Keep');target.saveRecord(note)
    await writeFile(join(seed,'library.sqlite'),'invalid')
    await expect(initializeBundledLibrary(target,seed)).rejects.toThrow('校验失败')
    expect(target.records('existing')).toEqual([note]);expect(target.books()).toEqual([])
  }finally{target.close();await rm(root,{recursive:true,force:true})}
})
it('refuses to distribute a seed containing personal records',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cpss-seed-private-')),seed=join(root,'seed');await fixture(seed,true)
  const target=new LabStore(join(root,'user'))
  try{await expect(initializeBundledLibrary(target,seed)).rejects.toThrow('个人学习资料');expect(target.books()).toEqual([])}
  finally{target.close();await rm(root,{recursive:true,force:true})}
})
