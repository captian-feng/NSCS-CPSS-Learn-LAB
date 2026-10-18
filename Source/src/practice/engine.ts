import {z} from 'zod'
import bank from './bank.json'
import type {LabStore} from '../storage/store'
import type {PracticeAnswer,PracticeState} from '../shared/types'
export const answerSchema=z.object({id:z.string().min(1).max(200),bookId:z.string().min(1).max(200),questionId:z.string().min(1).max(200),selected:z.number().int().min(0).max(3),correct:z.boolean(),created:z.string().datetime()})
export function practiceState(store:LabStore,bookId:string):PracticeState {
  const book=store.book(bookId)
  const available=book.hash===bank.sourceHash
  return {available,version:bank.version,questions:available?bank.questions:[],answers:store.db.prepare("SELECT data FROM answers WHERE session_id=? ORDER BY json_extract(data,'$.created'),rowid").all('practice-'+bookId).map(r=>answerSchema.parse(JSON.parse(String(r.data))))}
}
export function persistAnswer(store:LabStore,answer:PracticeAnswer):boolean {
  const current=store.jsonRow('SELECT data FROM answers WHERE id=?',answer.id)
  if(current){if(JSON.stringify(answerSchema.parse(current))!==JSON.stringify(answer))throw new Error('答题记录冲突，已取消操作');return false}
  store.db.prepare('INSERT OR IGNORE INTO practice_sessions VALUES(?,?)').run('practice-'+answer.bookId,JSON.stringify({bookId:answer.bookId,bankVersion:bank.version}))
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
