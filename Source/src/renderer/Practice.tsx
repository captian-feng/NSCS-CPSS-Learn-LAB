import {useEffect,useMemo,useState} from 'react'
import type {Book,PracticeAnswer,PracticeQuestion,PracticeState} from '../shared/types'
import {ResizeHandle} from './ResizeHandle'
const call=<T,>(method:string,args?:unknown)=>window.desktop.call<T>(method,args)
const priority=(level:number)=>level===1?'核心必会':'重点应用'
export function Practice({book,currentPage,onJump}:{book:Book;currentPage:number;onJump:(page:number)=>void}) {
  const [state,setState]=useState<PracticeState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [chapter,setChapter]=useState('all'),[level,setLevel]=useState('all'),[scope,setScope]=useState('all'),[query,setQuery]=useState('')
  const [pinned,setPinned]=useState<PracticeQuestion|null>(null)
  const [active,setActive]=useState(''),[choice,setChoice]=useState<number|null>(null),[result,setResult]=useState<PracticeAnswer|null>(null),[listWidth,setListWidth]=useState(250)
  useEffect(()=>{let alive=true;setState(null);setError('');void call<PracticeState>('practice',book.id).then(value=>{if(alive){setState(value);setActive(value.questions.find(q=>q.source.page>=currentPage)?.id??value.questions[0]?.id??'')}}).catch(e=>{if(alive)setError(String(e))});return ()=>{alive=false}},[book.id])
  const latest=useMemo(()=>{const map=new Map<string,PracticeAnswer>();for(const a of state?.answers??[])map.set(a.questionId,a);return map},[state?.answers])
  const wrong=[...latest.values()].filter(a=>!a.correct).length,mastered=[...latest.values()].filter(a=>a.correct).length
  const questions=(state?.questions??[]).filter(q=>(chapter==='all'||q.chapter===Number(chapter))&&(level==='all'||q.priority===Number(level))&&(scope==='all'||(scope==='wrong'?latest.get(q.id)?.correct===false:latest.get(q.id)?.correct===true))&&`${q.topic} ${q.prompt}`.toLowerCase().includes(query.toLowerCase()))
  const question=questions.find(q=>q.id===active)??questions[0]
  const displayed=result&&pinned?pinned:question
  useEffect(()=>{setChoice(null);setResult(null)},[displayed?.id])
  const selectQuestion=(q:PracticeQuestion)=>{setActive(q.id);setChoice(null);setResult(null)}
  const submit=async()=>{
    if(!question||choice===null||busy)return
    setBusy(true);setError('')
    try{const answer=await call<PracticeAnswer>('answer',{id:crypto.randomUUID(),bookId:book.id,questionId:question.id,selected:choice});setResult(answer);setState(value=>value?{...value,answers:[...value.answers,answer]}:value)}catch(e){setError(String(e))}finally{setBusy(false)}
  }
  // Pin the submitted question until the learner finishes reading its explanation,
  // even when a correct retry removes it from the active-wrong filter.
  const reset=()=>{setResult(null);setChoice(null);setPinned(null)}
  const changeFilter=(action:()=>void)=>{reset();action()}
  return <section className="practice-page">
    <div className="practice-heading"><div><h1>章节练习与错题集</h1><p>教材依据的自编练习 · 非官方真题 · 学习优先级不代表官方考试权重</p></div><div className="practice-stats"><span><b>{state?.questions.length??0}</b> 道题</span><span><b>{wrong}</b> 当前错题</span><span><b>{state?.answers.length??0}</b> 次作答</span></div></div>
    {error&&<div className="error" role="alert">{error}</div>}
    {!state?<div className="loading">正在读取本地题库…</div>:!state.available?<div className="empty-state">本题库对应预置的 NSCA Sport Science 教材版本。当前教材不匹配，未套用其他版本的题目或页码。</div>:<>
      <div className="practice-filters"><button aria-pressed={scope==='all'} onClick={()=>changeFilter(()=>setScope('all'))}>章节练习</button><button aria-pressed={scope==='wrong'} onClick={()=>changeFilter(()=>setScope('wrong'))}>错题集 {wrong}</button><button aria-pressed={scope==='mastered'} onClick={()=>changeFilter(()=>setScope('mastered'))}>已掌握 {mastered}</button><select aria-label="练习章节" value={chapter} onChange={e=>changeFilter(()=>setChapter(e.target.value))}><option value="all">全部 31 章</option>{[...new Map(state.questions.map(q=>[q.chapter,q.chapterTitle])).entries()].map(([number,title])=><option key={number} value={number}>{title}</option>)}</select><select aria-label="知识点重要程度" value={level} onChange={e=>changeFilter(()=>setLevel(e.target.value))}><option value="all">全部重要程度</option><option value="1">核心必会</option><option value="2">重点应用</option></select><input aria-label="搜索知识点" placeholder="搜索知识点或题目…" value={query} onChange={e=>changeFilter(()=>setQuery(e.target.value))}/></div>
      <div className="practice-workspace" style={{gridTemplateColumns:`${listWidth}px minmax(0,1fr)`}}>
        <aside className="question-list"><div className="question-count">{questions.length} 道 · 按章节与重要程度排列</div>{questions.map(q=><button key={q.id} aria-pressed={displayed?.id===q.id} onClick={()=>{setPinned(null);selectQuestion(q)}}><small>第 {q.chapter} 章 · {priority(q.priority)} {latest.has(q.id)?latest.get(q.id)!.correct?'✓':'待复习':''}</small><strong>{q.topic}</strong></button>)}<ResizeHandle label="题目列表宽度" value={listWidth} min={170} max={400} onChange={setListWidth} onCommit={setListWidth}/></aside>
        <article className="question-detail">{!displayed?<div className="empty-state">{scope==='wrong'?'当前筛选下没有待复习错题。答错的题目会自动收录；重做答对后进入已掌握。':'当前筛选下没有题目，请调整章节、重要程度或搜索条件。'}</div>:<>
          <div className="question-meta"><span>{displayed.chapterTitle}</span><b>{priority(displayed.priority)} · {displayed.topic}</b></div><h2>{displayed.prompt}</h2>
          <div className="question-options" role="radiogroup" aria-label="答案选项">{displayed.options.map((option,i)=><button key={`${displayed.id}-${i}`} role="radio" aria-checked={choice===i} disabled={!!result||busy} className={`${choice===i?'selected':''} ${result&&displayed.correct===i?'correct':''} ${result&&choice===i&&!result.correct?'incorrect':''}`} onClick={()=>setChoice(i)}><b>{String.fromCharCode(65+i)}</b><span>{option.text}</span></button>)}</div>
          {!result?<button className="primary" disabled={choice===null||busy} onClick={()=>{setPinned(displayed);void submit()}}>{busy?'保存中…':'提交答案'}</button>:<div className="answer-explanation" role="status"><h3>{result.correct?'回答正确':'回答错误，已自动加入错题集'}</h3><p>你的答案：{String.fromCharCode(65+result.selected)}；正确答案：{String.fromCharCode(65+displayed.correct)}</p><h4>为什么这样选？</h4>{displayed.options.map((option,i)=><p key={i}><b>{String.fromCharCode(65+i)} · {i===displayed.correct?'正确':'不正确'}：</b>{option.explanation}</p>)}<h4>原文依据 · PDF 第 {displayed.source.page+1} 页</h4><blockquote>{displayed.source.quote}</blockquote><p className="muted">英文摘录为教材依据；中文题干和逐项解析为自编学习说明。可回到原书核对上下文。</p><div className="tool-group"><button onClick={()=>onJump(displayed.source.page)}>查看原文 · PDF 第 {displayed.source.page+1} 页</button><button onClick={reset}>重新作答</button><button onClick={()=>{const index=questions.findIndex(q=>q.id===displayed.id);reset();setActive(questions[(index+1)%Math.max(1,questions.length)]?.id??'')}}>下一题</button></div></div>}
          <div className="question-history">作答历史：{state.answers.filter(a=>a.questionId===displayed.id).length} 次；答错 {state.answers.filter(a=>a.questionId===displayed.id&&!a.correct).length} 次。正确重做会移出当前错题集，历史仍保留。</div>
        </>}</article>
      </div>
    </>}
  </section>
}
