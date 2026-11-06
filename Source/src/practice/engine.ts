import {z} from 'zod'
import bank from './bank.json'
import type {LabStore} from '../storage/store'
import type {PracticeAnswer,PracticeState} from '../shared/types'
export const answerSchema=z.object({id:z.string().min(1).max(200),bookId:z.string().min(1).max(200),questionId:z.string().min(1).max(200),selected:z.number().int().min(0).max(3),correct:z.boolean(),created:z.string().datetime()})
const text=z.string().trim().min(1).max(10000)
export const customBankSchema=z.object({
  format:z.literal('cpss-lab-question-bank'),schemaVersion:z.literal(1),sourceHash:z.string().regex(/^[a-f0-9]{64}$/),
  title:text,version:text,
  questions:z.array(z.object({
    id:z.string().trim().min(1).max(200),chapter:z.number().int().positive(),chapterTitle:text,topic:text,prompt:text,
    options:z.array(z.object({text,explanation:text})).length(4),correct:z.number().int().min(0).max(3),
    source:z.object({page:z.number().int().nonnegative(),quote:text})
  }).strict().refine(q=>new Set(q.options.map(o=>o.text)).size===q.options.length,{message:'题目选项重复'})).min(1).max(10000)
}).strict().refine(value=>new Set(value.questions.map(q=>q.id)).size===value.questions.length,{message:'题号重复'})
export function importCustomBank(store:LabStore,bookId:string,input:unknown) {
  const book=store.book(bookId),custom=customBankSchema.parse(input)
  if(book.hash===bank.sourceHash)throw new Error('原有 CPSS 题库已内置，请为其他教材导入题库')
  if(custom.sourceHash!==book.hash)throw new Error('题库的教材指纹与当前教材不一致')
  if(book.status!=='ready')throw new Error('请先完成教材导入')
  if(custom.questions.some(q=>q.source.page>=book.pages))throw new Error('题目来源页超出教材范围')
  store.transaction(()=>{
    const existing=store.db.prepare('SELECT data FROM custom_practice_banks WHERE book_id=?').get(bookId)
    const data=JSON.stringify(custom)
    if(existing && existing.data!==data)throw new Error('当前教材已有题库，更新题库需要保留历史作答，请先导出资料')
    if(!existing)store.db.prepare('INSERT INTO custom_practice_banks VALUES(?,?)').run(bookId,data)
  })
  return practiceState(store,bookId)
}
export function practiceState(store:LabStore,bookId:string):PracticeState {
  const book=store.book(bookId)
  const builtin=book.hash===bank.sourceHash
  const row=store.db.prepare('SELECT data FROM custom_practice_banks WHERE book_id=?').get(bookId)
  const custom=row?customBankSchema.parse(JSON.parse(String(row.data))):null
  const questions=builtin?bank.questions:custom?.questions.map(q=>({...q,task:'',questionType:'基础',priority:1,source:{...q.source,blockId:''},provenance:custom.title}))??[]
  return {available:builtin||!!custom,builtin,version:builtin?bank.version:custom?.version??'',questions,answers:store.db.prepare("SELECT data FROM answers WHERE session_id=? ORDER BY json_extract(data,'$.created'),rowid").all('practice-'+bookId).map(r=>answerSchema.parse(JSON.parse(String(r.data))))}
}
export function persistAnswer(store:LabStore,answer:PracticeAnswer):boolean {
  const current=store.jsonRow('SELECT data FROM answers WHERE id=?',answer.id)
  if(current){if(JSON.stringify(answerSchema.parse(current))!==JSON.stringify(answer))throw new Error('答题记录冲突，已取消操作');return false}
  const custom=store.db.prepare('SELECT data FROM custom_practice_banks WHERE book_id=?').get(answer.bookId)
  const bankVersion=custom?customBankSchema.parse(JSON.parse(String(custom.data))).version:bank.version
  store.db.prepare('INSERT OR IGNORE INTO practice_sessions VALUES(?,?)').run('practice-'+answer.bookId,JSON.stringify({bookId:answer.bookId,bankVersion}))
  store.db.prepare('INSERT INTO answers VALUES(?,?,?,?)').run(answer.id,'practice-'+answer.bookId,answer.questionId,JSON.stringify(answer))
  return true
}
export function submitAnswer(store:LabStore,input:unknown):PracticeAnswer {
  const args=z.object({id:z.string().min(1).max(200),bookId:z.string().min(1).max(200),questionId:z.string().max(200),selected:z.number().int().min(0).max(3)}).parse(input)
  const state=practiceState(store,args.bookId),question=state.questions.find(q=>q.id===args.questionId)
  if(!question)throw new Error('题目不属于当前教材版本')
  const existing=store.jsonRow('SELECT data FROM answers WHERE id=?',args.id) as PracticeAnswer|null
  if(existing){if(existing.bookId!==args.bookId||existing.questionId!==args.questionId||existing.selected!==args.selected)throw new Error('重复提交编号冲突');return existing}
  const answer={...args,correct:question.correct===args.selected,created:new Date().toISOString()}
  store.transaction(()=>persistAnswer(store,answer));return answer
}
