import {z} from 'zod'
import {createHash} from 'node:crypto'
import bank from './bank.json'
import type {LabStore} from '../storage/store'
import type {Book,PracticeAnswer,PracticeQuestion,PracticeState} from '../shared/types'
import {savedDraftSchema} from './local-draft'
export const questionSnapshotSchema=z.object({
  prompt:z.string().min(1).max(10000),options:z.array(z.object({text:z.string(),explanation:z.string()}).strict()).length(4),
  correct:z.number().int().min(0).max(3),source:z.object({page:z.number().int().nonnegative(),quote:z.string().max(100000)}).strict(),
  caseStudy:z.object({id:z.string(),title:z.string(),scenario:z.string(),columns:z.array(z.string()),rows:z.array(z.array(z.string()))}).strict().optional()
}).strict()
export function snapshotRevision(snapshot:z.infer<typeof questionSnapshotSchema>):string {
  return createHash('sha256').update(JSON.stringify(questionSnapshotSchema.parse(snapshot))).digest('hex')
}
export const answerSchema=z.object({
  id:z.string().min(1).max(200),bookId:z.string().min(1).max(200),questionId:z.string().min(1).max(200),
  selected:z.number().int().min(0).max(3),correct:z.boolean(),created:z.string().datetime(),
  questionSnapshot:questionSnapshotSchema.optional(),revisionId:z.string().regex(/^[a-f0-9]{64}$/).optional()
}).superRefine((answer,ctx)=>{
  if(Boolean(answer.questionSnapshot)!==Boolean(answer.revisionId))ctx.addIssue({code:'custom',message:'答题快照和版本编号必须同时存在'})
  if(answer.questionSnapshot&&(snapshotRevision(answer.questionSnapshot)!==answer.revisionId||answer.correct!==(answer.selected===answer.questionSnapshot.correct)))ctx.addIssue({code:'custom',message:'答题快照与版本或结果不一致'})
})
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
export function publishDraft(store:LabStore,input:unknown):PracticeState {
  const args=z.object({bookId:z.string().min(1).max(200),expected:savedDraftSchema,chapter:z.number().int().positive().max(100000),chapterTitle:z.string().trim().min(1).max(200)}).parse(input)
  store.transaction(()=>{
    const book=store.book(args.bookId)
    if(book.status!=='ready'||args.expected.bookId!==book.id||args.expected.page>=book.pages)throw new Error('教材或来源页面尚未准备好')
    const current=store.jsonRow('SELECT data FROM question_drafts WHERE id=? AND book_id=?',args.expected.id,book.id)
    if(!current||JSON.stringify(savedDraftSchema.parse(current))!==JSON.stringify(args.expected))throw new Error('草稿已更改，请重新打开后发布')
    const text=store.page(book.id,args.expected.page).blocks.map(block=>block.text).join('\n')
    if(!text.includes(args.expected.quote))throw new Error('引用无法在来源页面定位，无法发布')
    const row=store.db.prepare('SELECT data FROM custom_practice_banks WHERE book_id=?').get(book.id)
    const existing=row?customBankSchema.parse(JSON.parse(String(row.data))):null
    const question={id:`draft-${args.expected.id}`,chapter:args.chapter,chapterTitle:args.chapterTitle,topic:args.expected.topic,prompt:args.expected.prompt,options:args.expected.options,correct:args.expected.correct,source:{page:args.expected.page,quote:args.expected.quote}}
    const previous=existing?.questions.find(q=>q.id===question.id)
    if(previous){if(JSON.stringify(previous)!==JSON.stringify(question))throw new Error('草稿已发布，不能覆盖原题');return}
    const updated=customBankSchema.parse(existing?{...existing,questions:[...existing.questions,question]}:{format:'cpss-lab-question-bank',schemaVersion:1,sourceHash:book.hash,title:'自编与审校题库',version:'1',questions:[question]})
    if(existing)store.db.prepare('UPDATE custom_practice_banks SET data=? WHERE book_id=?').run(JSON.stringify(updated),book.id)
    else store.db.prepare('INSERT INTO custom_practice_banks VALUES(?,?)').run(book.id,JSON.stringify(updated))
  })
  return practiceState(store,args.bookId)
}
export function practiceState(store:LabStore,bookId:string):PracticeState {
  const book=store.book(bookId)
  const builtin=book.hash===bank.sourceHash
  const row=store.db.prepare('SELECT data FROM custom_practice_banks WHERE book_id=?').get(bookId)
  const custom=row?customBankSchema.parse(JSON.parse(String(row.data))):null
  const extra=custom?.questions.map(q=>({...q,task:'',questionType:'基础',priority:1,source:{...q.source,blockId:''},provenance:custom.title}))??[]
  if(builtin&&extra.some(question=>bank.questions.some(original=>original.id===question.id)))throw new Error('自编题号与 CPSS 内置题库冲突，请检查书库备份')
  const questions=builtin?[...bank.questions,...extra]:extra
  return {available:builtin||!!custom,builtin,version:builtin?bank.version:custom?.version??'',questions,answers:store.db.prepare("SELECT data FROM answers WHERE session_id=? ORDER BY json_extract(data,'$.created'),rowid").all('practice-'+bookId).map(r=>answerSchema.parse(JSON.parse(String(r.data))))}
}
function checkSource(store:LabStore,book:Book,question:PracticeQuestion,cache:Map<number,string|null>) {
  if(book.status!=='ready')return {status:'unavailable' as const,page:question.source.page,message:'教材尚未准备好，无法核验引用。'}
  if(question.source.page>=book.pages)return {status:'unavailable' as const,page:question.source.page,message:'来源页超出教材范围，无法核验。'}
  if(!cache.has(question.source.page)) {
    const row=store.db.prepare('SELECT 1 FROM pages WHERE book_id=? AND page=?').get(book.id,question.source.page)
    cache.set(question.source.page,row?store.page(book.id,question.source.page).blocks.map(block=>block.text).join('\n'):null)
  }
  const text=cache.get(question.source.page)
  if(text===null || text===undefined)return {status:'unavailable' as const,page:question.source.page,message:'来源页尚未处理，无法核验。'}
  if(!text.trim())return {status:'unavailable' as const,page:question.source.page,message:'来源页没有可提取文本，需人工对照原书。'}
  const exact=text.includes(question.source.quote)
  const normalize=(value:string)=>value.replace(/\s+/g,' ').trim()
  const found=exact||normalize(text).includes(normalize(question.source.quote))
  return {status:found?'matched' as const:'not-found' as const,page:question.source.page,message:found?(exact?'引用与本页提取文字逐字匹配；仍需人工核对上下文和答案。':'引用忽略空白与换行差异后匹配；仍需人工核对原文、上下文和答案。'):'未在本页提取文字中找到完整引用，请对照原书检查页码和内容。'}
}
export function verifyQuestionSource(store:LabStore,input:unknown) {
  const args=z.object({bookId:z.string().min(1).max(200),questionId:z.string().min(1).max(200)}).parse(input)
  const book=store.book(args.bookId),question=practiceState(store,args.bookId).questions.find(q=>q.id===args.questionId)
  if(!question)throw new Error('题目不属于当前教材')
  return checkSource(store,book,question,new Map())
}
export function verifyBankSources(store:LabStore,bookId:string) {
  const book=store.book(bookId),questions=practiceState(store,bookId).questions,cache=new Map<number,string|null>()
  return questions.map(question=>({questionId:question.id,topic:question.topic,...checkSource(store,book,question,cache)}))
}
export function persistAnswer(store:LabStore,answer:PracticeAnswer):boolean {
  const current=store.jsonRow('SELECT data FROM answers WHERE id=?',answer.id)
  if(current){
    const existing=answerSchema.parse(current),incoming=answerSchema.parse(answer)
    const {questionSnapshot:oldSnapshot,revisionId:oldRevision,...oldFields}=existing
    const {questionSnapshot:newSnapshot,revisionId:newRevision,...newFields}=incoming
    if(JSON.stringify(oldFields)!==JSON.stringify(newFields)||(oldSnapshot&&newSnapshot&&oldRevision!==newRevision))throw new Error('答题记录冲突，已取消操作')
    if(!oldSnapshot&&newSnapshot)store.db.prepare('UPDATE answers SET data=? WHERE id=?').run(JSON.stringify(incoming),answer.id)
    return false
  }
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
  const questionSnapshot=questionSnapshotSchema.parse({prompt:question.prompt,options:question.options,correct:question.correct,source:{page:question.source.page,quote:question.source.quote},...(question.caseStudy?{caseStudy:question.caseStudy}:{})})
  const answer={...args,correct:question.correct===args.selected,created:new Date().toISOString(),questionSnapshot,revisionId:snapshotRevision(questionSnapshot)}
  store.transaction(()=>persistAnswer(store,answer));return answer
}
