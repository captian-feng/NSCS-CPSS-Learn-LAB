import {afterEach,describe,expect,it} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {LabStore} from '../src/storage/store'
import {practiceState,submitAnswer} from '../src/practice/engine'
import bank from '../src/practice/bank.json'
const roots:string[]=[],stores:LabStore[]=[]
function open(root=mkdtempSync(join(tmpdir(),'cpss-practice-'))){if(!roots.includes(root))roots.push(root);const store=new LabStore(root);stores.push(store);return store}
afterEach(()=>{for(const s of stores.splice(0))try{s.close()}catch{};for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true})})
describe('chapter practice and learning data',()=>{
 it('covers 31 chapters with two priorities, unique choices and source references',()=>{
  expect(bank.questions).toHaveLength(62)
  expect(new Set(bank.questions.map(q=>q.id)).size).toBe(62)
  for(let ch=1;ch<=31;ch++)expect(bank.questions.filter(q=>q.chapter===ch).map(q=>q.priority)).toEqual([1,2])
  for(const q of bank.questions){expect(q.options).toHaveLength(4);expect(new Set(q.options.map(o=>o.text)).size).toBe(4);expect(q.correct).toBeGreaterThanOrEqual(0);expect(q.correct).toBeLessThan(4);expect(q.source.quote.length).toBeGreaterThan(30);for(const o of q.options)expect(o.explanation.length).toBeGreaterThan(8)}
 })
 it('scores on the server, persists retries, rejects foreign questions and duplicate mutations',()=>{
  const s=open(),id=bank.sourceHash;s.createBook(id,'Textbook',id)
  const q=practiceState(s,id).questions[0],wrong=(q.correct+1)%4
  const input={id:'attempt-1',bookId:id,questionId:q.id,selected:wrong,correct:true}
  expect(submitAnswer(s,input).correct).toBe(false)
  expect(submitAnswer(s,input).correct).toBe(false);expect(practiceState(s,id).answers).toHaveLength(1)
  expect(()=>submitAnswer(s,{...input,selected:q.correct})).toThrow('冲突')
  submitAnswer(s,{...input,id:'attempt-2',selected:q.correct})
  s.close();stores.pop();const reopened=open(s.root)
  const answers=practiceState(reopened,id).answers;expect(answers.map(a=>a.correct)).toEqual([false,true])
  const latest=new Map(answers.map(a=>[a.questionId,a]));expect([...latest.values()].filter(a=>!a.correct)).toHaveLength(0)
  expect(()=>submitAnswer(reopened,{...input,id:'invalid',selected:4})).toThrow()
  expect(()=>submitAnswer(reopened,{...input,id:'invalid',questionId:'not-a-question'})).toThrow('教材版本')
 })
 it('merges older backups without making an old mistake the latest result',()=>{
  const source=open(),id=bank.sourceHash;source.createBook(id,'Book',id)
  const q=bank.questions[0]
  submitAnswer(source,{id:'old',bookId:id,questionId:q.id,selected:(q.correct+1)%4})
  const backup=source.backup();backup.practiceAnswers[0].created='2025-01-01T00:00:00.000Z'
  const target=open();target.createBook(id,'Book',id)
  submitAnswer(target,{id:'new',bookId:id,questionId:q.id,selected:q.correct})
  target.restore(backup)
  expect(practiceState(target,id).answers.at(-1)?.correct).toBe(true)
 })
 it('restores attempts idempotently, keeps old backups compatible and rolls back conflicting answers',()=>{
  const s=open(),id=bank.sourceHash;s.createBook(id,'Book',id)
  submitAnswer(s,{id:'a1',bookId:id,questionId:bank.questions[0].id,selected:0})
  const backup=s.backup(),target=open();expect(target.restore(backup)).toEqual({inserted:1,skipped:0})
  expect(target.restore(backup)).toEqual({inserted:0,skipped:1});expect(practiceState(target,id).answers).toEqual(practiceState(s,id).answers)
  const conflict={...backup,practiceAnswers:[{...backup.practiceAnswers[0],id:'new'},{...backup.practiceAnswers[0],selected:1}]}
  expect(()=>target.restore(conflict)).toThrow('冲突');expect(practiceState(target,id).answers).toHaveLength(1)
  const {practiceAnswers:_,...legacy}=backup;expect(open().restore(legacy)).toEqual({inserted:0,skipped:0})
  const other='f'.repeat(64);target.createBook(other,'Other edition',other);expect(practiceState(target,other).available).toBe(false)
 })
})
