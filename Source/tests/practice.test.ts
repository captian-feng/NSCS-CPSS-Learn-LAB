import {afterEach,describe,expect,it} from 'vitest'
import {mkdtempSync,rmSync} from 'node:fs'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {LabStore} from '../src/storage/store'
import {importCustomBank,practiceState,submitAnswer} from '../src/practice/engine'
import bank from '../src/practice/bank.json'
import blueprint from '../src/practice/blueprint.json'
import legacy from './fixtures/legacy-practice-0.4.json'
const roots:string[]=[],stores:LabStore[]=[]
function open(root=mkdtempSync(join(tmpdir(),'cpss-practice-'))){if(!roots.includes(root))roots.push(root);const store=new LabStore(root);stores.push(store);return store}
afterEach(()=>{for(const s of stores.splice(0))try{s.close()}catch{};for(const r of roots.splice(0))rmSync(r,{recursive:true,force:true})})
describe('chapter practice and learning data',()=>{
 it('imports a textbook-specific bank, preserves attempts and restores it with backups',()=>{
  const s=open(),id='e'.repeat(64),other='f'.repeat(64)
  s.createBook(id,'New book',id);s.updateBook(id,{status:'ready',pages:2});s.createBook(other,'Other book',other);s.updateBook(other,{status:'ready',pages:2})
  const custom={format:'cpss-lab-question-bank',schemaVersion:1,sourceHash:id,title:'Test bank',version:'1',questions:[{id:'q1',chapter:1,chapterTitle:'Chapter 1',topic:'Force',prompt:'What is force?',options:[{text:'A',explanation:'yes'},{text:'B',explanation:'no'},{text:'C',explanation:'no'},{text:'D',explanation:'no'}],correct:0,source:{page:0,quote:'Force is a concept.'}}]}
  expect(()=>importCustomBank(s,other,custom)).toThrow('指纹')
  expect(()=>importCustomBank(s,id,{...custom,questions:[{...custom.questions[0],source:{page:3,quote:'x'}}]})).toThrow('超出')
  expect(importCustomBank(s,id,custom).questions).toHaveLength(1)
  expect(importCustomBank(s,id,custom).builtin).toBe(false)
  expect(submitAnswer(s,{id:'custom-answer',bookId:id,questionId:'q1',selected:0}).correct).toBe(true)
  expect(()=>importCustomBank(s,id,{...custom,version:'2'})).toThrow('已有题库')
  const target=open();target.restore(s.backup())
  expect(practiceState(target,id).questions[0].id).toBe('q1')
  expect(practiceState(target,id).answers[0].correct).toBe(true)
  expect(practiceState(target,other).available).toBe(false)
 })
 it('covers 31 chapters, all 2026 tasks and nine original case groups, unique choices and source references',()=>{
  expect(bank.questions).toHaveLength(215)
  expect(new Set(bank.questions.map(q=>q.id)).size).toBe(215)
  for(let ch=1;ch<=31;ch++)expect(bank.questions.filter(q=>q.chapter===ch).length).toBeGreaterThanOrEqual(6)
  const tasks=blueprint.domains.flatMap(d=>d.tasks.map(t=>t.id));expect(tasks).toHaveLength(24);expect(blueprint.domains.reduce((n,d)=>n+d.scoredItems,0)).toBe(100)
  for(const task of tasks)expect(bank.questions.some(q=>q.task===task),task).toBe(true)
  for(const q of bank.questions)expect(tasks).toContain(q.task)
  const cases=bank.questions.filter(q=>'caseStudy' in q);expect(cases).toHaveLength(27);expect(new Set(cases.map(q=>'caseStudy' in q?q.caseStudy?.id:'')).size).toBe(9)
  for(const q of bank.questions){expect(q.options).toHaveLength(4);expect(new Set(q.options.map(o=>o.text)).size).toBe(4);expect(q.correct).toBeGreaterThanOrEqual(0);expect(q.correct).toBeLessThan(4);expect(q.source.quote.length).toBeGreaterThan(30);for(const o of q.options)expect(o.explanation.length).toBeGreaterThan(3)}
 })
 it('preserves every 0.4 question ID, correct index and option meaning for saved attempts',()=>{
  for(const old of legacy){const current=bank.questions.find(q=>q.id===old.id)!;expect(current).toBeTruthy();expect(current.correct).toBe(old.correct);expect(current.options).toEqual(old.options)}
 })
 it('keeps quantitative answers consistent with the stated arithmetic and units',()=>{
  const examples:[string,string][]=[['02-03',`${45*6} AU`],['02-05',`${(2400-2000)/2000*100}%`],['06-03',`${(70-50)/10}`],['08-03',`${5/100*100}%`],['10-03',`${30/5} m/s`],['11-03',`${(8-2)/2} m/s²`],['12-03',`${200*.3} N·s`],['13-03',`${(160/80).toFixed(1)}`],['14-03',`${60+.7*(200-60)}次/分`],['19-03',`每1000小时${6/3000*1000}次`],['21-04',`${Math.round((10-9.5)/10*100)}%`],['23-03',`${7/8*100}%`],['24-03',`${6*70} g`],['25-03',`${(.6+.5).toFixed(1)} L/h`]]
  for(const [id,value] of examples){const q=bank.questions.find(q=>q.id===`cpss-ch${id}`)!;expect(q.options[q.correct].text,id).toBe(value)}
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
