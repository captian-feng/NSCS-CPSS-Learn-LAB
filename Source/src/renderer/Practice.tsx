import {useEffect,useMemo,useState} from 'react'
import type {Book,PracticeAnswer,PracticeQuestion,PracticeState} from '../shared/types'
import blueprint from '../practice/blueprint.json'
import {ResizeHandle} from './ResizeHandle'
import type {SavedDraft} from '../practice/local-draft'
const call=<T,>(method:string,args?:unknown)=>window.desktop.call<T>(method,args)
const priority=(level:number)=>level===1?'核心必会':level===2?'重点应用':'综合研判'
type SourceResult={questionId:string;topic:string;page:number;status:'matched'|'not-found'|'unavailable';message:string}
export function Practice({book,currentPage,onJump}:{book:Book;currentPage:number;onJump:(page:number)=>void}) {
  const [state,setState]=useState<PracticeState|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const [model,setModel]=useState(''),[draft,setDraft]=useState<SavedDraft|null>(null),[drafts,setDrafts]=useState<SavedDraft[]>([])
  const [editingDraft,setEditingDraft]=useState(false)
  const [creatingDraft,setCreatingDraft]=useState(false)
  const [publishingDraft,setPublishingDraft]=useState(false)
  const [sourceResults,setSourceResults]=useState<SourceResult[]|null>(null)
  const [domain,setDomain]=useState('all'),[taskFilter,setTaskFilter]=useState('all'),[questionType,setQuestionType]=useState('all'),[coverage,setCoverage]=useState(false)
  const [chapter,setChapter]=useState('all'),[level,setLevel]=useState('all'),[scope,setScope]=useState('all'),[query,setQuery]=useState('')
  const [pinned,setPinned]=useState<PracticeQuestion|null>(null)
  const [active,setActive]=useState(''),[choice,setChoice]=useState<number|null>(null),[result,setResult]=useState<PracticeAnswer|null>(null),[listWidth,setListWidth]=useState(250)
  useEffect(()=>{let alive=true;setState(null);setError('');void call<PracticeState>('practice',book.id).then(value=>{if(alive){setState(value);setActive(value.questions.find(q=>q.source.page>=currentPage)?.id??value.questions[0]?.id??'')}}).catch(e=>{if(alive)setError(String(e))});return ()=>{alive=false}},[book.id])
  useEffect(()=>{let alive=true;void call<SavedDraft[]>('questionDrafts',book.id).then(value=>{if(alive)setDrafts(value)}).catch(e=>{if(alive)setError(String(e))});return ()=>{alive=false}},[book.id])
  const latest=useMemo(()=>{const map=new Map<string,PracticeAnswer>();for(const a of state?.answers??[])map.set(a.questionId,a);return map},[state?.answers])
  const wrong=[...latest.values()].filter(a=>!a.correct).length,mastered=[...latest.values()].filter(a=>a.correct).length
  const questions=(state?.questions??[]).filter(q=>(domain==='all'||q.task.startsWith(domain))&&(taskFilter==='all'||q.task===taskFilter)&&(questionType==='all'||(questionType==='case-group'?!!q.caseStudy:q.questionType===questionType))&&(chapter==='all'||q.chapter===Number(chapter))&&(level==='all'||q.priority===Number(level))&&(scope==='all'||(scope==='wrong'?latest.get(q.id)?.correct===false:latest.get(q.id)?.correct===true))&&`${q.topic} ${q.prompt}`.toLowerCase().includes(query.toLowerCase()))
  const question=questions.find(q=>q.id===active)??questions[0]
  const displayed=result&&pinned?pinned:question
  useEffect(()=>{setChoice(null);setResult(null)},[displayed?.id])
  const importBank=async()=>{
    setBusy(true);setError('')
    try{const value=await window.desktop.importQuestionBank(book.id);if(value){setState(value);setActive(value.questions[0]?.id??'');setSourceResults(null)}}catch(e){setError(String(e))}finally{setBusy(false)}
  }
  const generate=async()=>{
    setBusy(true);setError('');setDraft(null);setCreatingDraft(false);setEditingDraft(false);setPublishingDraft(false)
    try{const value=await call<SavedDraft>('generateLocalDraft',{bookId:book.id,page:currentPage,model:model.trim()});setDraft(value);setDrafts(items=>[value,...items])}catch(e){setError(String(e))}finally{setBusy(false)}
  }
  const saveDraft=async(updated:SavedDraft)=>{
    if(!draft||busy)return
    setBusy(true);setError('')
    try{
      const value=await call<SavedDraft>('updateQuestionDraft',{bookId:book.id,expected:draft,updated})
      setDraft(value);setDrafts(items=>items.map(item=>item.id===value.id?value:item));setEditingDraft(false)
    }catch(e){setError(String(e))}finally{setBusy(false)}
  }
  const createDraft=async(updated:SavedDraft)=>{
    if(busy)return
    setBusy(true);setError('')
    try{
      const {id:_,bookId:__,created:___,...content}=updated
      const value=await call<SavedDraft>('createManualDraft',{bookId:book.id,draft:content})
      setDraft(value);setDrafts(items=>[value,...items]);setCreatingDraft(false)
    }catch(e){setError(String(e))}finally{setBusy(false)}
  }
  const startManualDraft=()=>{
    setError('');setEditingDraft(false);setPublishingDraft(false);setCreatingDraft(true)
    setDraft({id:crypto.randomUUID(),bookId:book.id,page:currentPage,model:'手工创建',created:new Date().toISOString(),topic:'',prompt:'',options:Array.from({length:4},()=>({text:'',explanation:''})),correct:0,quote:''})
  }
  const publish=async(chapter:number,chapterTitle:string)=>{
    if(!draft||busy)return
    setBusy(true);setError('')
    try{
      const value=await call<PracticeState>('publishDraft',{bookId:book.id,expected:draft,chapter,chapterTitle})
      setState(value);setActive(`draft-${draft.id}`);setPublishingDraft(false);setSourceResults(null)
    }catch(e){setError(String(e))}finally{setBusy(false)}
  }
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
  const checkBank=async()=>{
    setBusy(true);setError('')
    try{setSourceResults(await call<SourceResult[]>('verifyBankSources',book.id))}catch(e){setError(String(e))}finally{setBusy(false)}
  }
  return <section className="practice-page">
    <div className="practice-heading"><div><h1>章节练习与错题集</h1><p>{state?.builtin?'CPSS 2026 大纲映射 · 自编练习，非官方真题 · 学习优先级不等同于考试权重':'按当前教材学习和复习'}</p></div><div className="practice-stats"><span><b>{state?.questions.length??0}</b> 道题</span><span><b>{wrong}</b> 当前错题</span><span><b>{state?.answers.length??0}</b> 次作答</span></div></div>
    {state?.questions.length? <section aria-label="题库来源核验"><button disabled={busy} onClick={()=>void checkBank()}>检查全部题目来源</button>{sourceResults&&<div className="report-issues"><p role="status">已检查 {sourceResults.length} 题：匹配 {sourceResults.filter(r=>r.status==='matched').length}，未找到 {sourceResults.filter(r=>r.status==='not-found').length}，无法核验 {sourceResults.filter(r=>r.status==='unavailable').length}。匹配允许空白与换行差异，仍需人工检查题意和答案。</p>{sourceResults.filter(r=>r.status!=='matched').map(item=><button key={item.questionId} onClick={()=>changeFilter(()=>{setDomain('all');setTaskFilter('all');setChapter('all');setLevel('all');setQuestionType('all');setScope('all');setQuery('');setPinned(null);setActive(item.questionId);setSourceResults(null)})}>{item.topic} · PDF 第 {item.page+1} 页 · {item.message} 查看题目 →</button>)}<button onClick={()=>setSourceResults(null)}>关闭来源结果</button></div>}</section>:null}
    {error&&<div className="error" role="alert">{error}</div>}
    {drafts.length>0&&<section aria-label="已保存的题目草稿"><h3>已保存的题目草稿</h3>{drafts.map(item=><button key={item.id} onClick={()=>{setDraft(item);setCreatingDraft(false);setEditingDraft(false);setPublishingDraft(false)}}>{item.topic} · PDF 第 {item.page+1} 页</button>)}</section>}
    {draft&&creatingDraft&&<DraftEditor key={draft.id} draft={draft} busy={busy} onSave={createDraft} onCancel={()=>{setCreatingDraft(false);setDraft(null)}}/>}
    {draft&&publishingDraft&&<PublishDraft key={draft.id} busy={busy} onPublish={publish} onCancel={()=>setPublishingDraft(false)}/>}
    {draft&&editingDraft&&<DraftEditor key={draft.id} draft={draft} busy={busy} onSave={saveDraft} onCancel={()=>setEditingDraft(false)}/>}
    {draft&&!creatingDraft&&!editingDraft&&!publishingDraft&&<section className="answer-explanation"><h3>{draft.topic}</h3><p>{draft.prompt}</p>{draft.options.map((option,index)=><p key={index}>{String.fromCharCode(65+index)}. {option.text} · {option.explanation}</p>)}<p>建议答案：{String.fromCharCode(65+draft.correct)}</p><blockquote>{draft.quote}</blockquote><p>来源：PDF 第 {draft.page+1} 页 · {draft.model}。引用位置已匹配，请人工核对题目和解析。草稿已保存到本地。</p>{state?.questions.some(q=>q.id===`draft-${draft.id}`)?<p>此草稿已发布到当前教材题库。</p>:<><button onClick={()=>setEditingDraft(true)}>编辑草稿</button><button onClick={()=>setPublishingDraft(true)}>审校并发布</button></>}<button onClick={()=>onJump(draft.page)}>查看草稿来源 · PDF 第 {draft.page+1} 页</button></section>}
    {state&&<section className="empty-state"><hr/><h3>创建题目草稿</h3><p>以当前阅读的 PDF 第 {currentPage+1} 页为来源，手工出题或通过本地模型生成。发布前请检查引用和答案。</p><button disabled={busy} onClick={startManualDraft}>手工创建单选题</button><h3>本地生成题目草稿</h3><label>本地模型名称 <input value={model} onChange={e=>setModel(e.target.value)} placeholder="例如已安装模型的名称"/></label><button disabled={busy||!model.trim()} onClick={()=>void generate()}>{busy?'正在处理…':'生成草稿'}</button></section>}
    {!state?<div className="loading">正在读取本地题库…</div>:!state.available?<div className="empty-state"><p>当前教材还没有题库。可导入与此教材匹配的 JSON 题库。</p><p>教材 SHA-256：{book.hash}</p><button disabled={busy} onClick={()=>void importBank()}>导入题库 JSON</button></div>:<>
      {state.builtin&&<div className="blueprint-summary"><span>大纲：2026-07-01 生效 · {blueprint.domains.reduce((n,d)=>n+d.tasks.length,0)} 项任务均有代表性练习</span><button aria-expanded={coverage} onClick={()=>setCoverage(v=>!v)}>大纲覆盖与来源</button></div>}
      {state.builtin&&coverage&&<div className="coverage-panel"><p>官方领域分布为 100 道计分题中的题量；本库不是按比例拼成的模拟卷。任务映射为本平台整理；有映射不等于全部考点已穷尽或题目经官方认可。</p><button onClick={()=>void window.desktop.openReference(blueprint.sourceUrl).catch(e=>setError(String(e)))}>查看 NSCA 官方 2026 大纲</button><table><thead><tr><th>领域 / 任务</th><th>题量</th><th>已作答</th></tr></thead><tbody>{blueprint.domains.flatMap(d=>[<tr className="domain-row" key={d.id}><th colSpan={3}>{d.title} · 官方 {d.scoredItems}/100 题</th></tr>,...d.tasks.map(t=>{const mapped=state.questions.filter(q=>q.task===t.id);return <tr key={t.id}><td><button onClick={()=>changeFilter(()=>{setDomain(d.id);setTaskFilter(t.id)})}>{t.id} · {t.title}</button></td><td>{mapped.length}</td><td>{mapped.filter(q=>latest.has(q.id)).length}</td></tr>})])}</tbody></table></div>}
      <div className="practice-filters"><button aria-pressed={scope==='all'} onClick={()=>changeFilter(()=>setScope('all'))}>章节练习</button><button aria-pressed={scope==='wrong'} onClick={()=>changeFilter(()=>setScope('wrong'))}>错题集 {wrong}</button><button aria-pressed={scope==='mastered'} onClick={()=>changeFilter(()=>setScope('mastered'))}>已掌握 {mastered}</button>{state.builtin&&<><select aria-label="考试领域" value={domain} onChange={e=>changeFilter(()=>{setDomain(e.target.value);setTaskFilter('all')})}><option value="all">全部考试领域</option>{blueprint.domains.map(d=><option key={d.id} value={d.id}>{d.id} · {d.title}</option>)}</select><select aria-label="大纲任务" value={taskFilter} onChange={e=>changeFilter(()=>setTaskFilter(e.target.value))}><option value="all">全部任务</option>{blueprint.domains.filter(d=>domain==='all'||d.id===domain).flatMap(d=>d.tasks.map(t=><option key={t.id} value={t.id}>{t.id} · {t.title}</option>))}</select></>}<select aria-label="题型" value={questionType} onChange={e=>changeFilter(()=>setQuestionType(e.target.value))}><option value="all">全部题型</option><option value="case-group">综合案例组</option>{['基础','计算','案例','研究'].map(t=><option key={t}>{t}</option>)}</select><select aria-label="练习章节" value={chapter} onChange={e=>changeFilter(()=>setChapter(e.target.value))}><option value="all">全部章节</option>{[...new Map(state.questions.map(q=>[q.chapter,q.chapterTitle])).entries()].map(([number,title])=><option key={number} value={number}>{title}</option>)}</select><select aria-label="知识点重要程度" value={level} onChange={e=>changeFilter(()=>setLevel(e.target.value))}><option value="all">全部重要程度</option><option value="1">核心必会</option><option value="2">重点应用</option><option value="3">综合研判</option></select><input aria-label="搜索知识点" placeholder="搜索知识点或题目…" value={query} onChange={e=>changeFilter(()=>setQuery(e.target.value))}/></div>
      <div className="practice-workspace" style={{gridTemplateColumns:`${listWidth}px minmax(0,1fr)`}}>
        <aside className="question-list"><div className="question-count">{questions.length} 道 · 按章节与重要程度排列</div>{questions.map(q=><button key={q.id} aria-pressed={displayed?.id===q.id} onClick={()=>{setPinned(null);selectQuestion(q)}}><small>第 {q.chapter} 章 · {q.questionType} · {q.task} · {priority(q.priority)} {latest.has(q.id)?latest.get(q.id)!.correct?'✓':'待复习':''}</small><strong>{q.topic}</strong></button>)}<ResizeHandle label="题目列表宽度" value={listWidth} min={170} max={400} onChange={setListWidth} onCommit={setListWidth}/></aside>
        <article className="question-detail">{!displayed?<div className="empty-state">{scope==='wrong'?'当前筛选下没有待复习错题。答错的题目会自动收录；重做答对后进入已掌握。':'当前筛选下没有题目，请调整章节、重要程度或搜索条件。'}</div>:<>
          <div className="question-meta"><span>{displayed.chapterTitle}</span><b>{priority(displayed.priority)} · {displayed.questionType} · {displayed.task} · {displayed.topic}</b></div>{displayed.caseStudy&&<section className="case-study"><h3>{displayed.caseStudy.id} · {displayed.caseStudy.title}</h3><p>{displayed.caseStudy.scenario}</p><table><thead><tr>{displayed.caseStudy.columns.map(c=><th key={c}>{c}</th>)}</tr></thead><tbody>{displayed.caseStudy.rows.map((row,i)=><tr key={i}>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table><div className="case-links">本案例问题：{state.questions.filter(q=>q.caseStudy?.id===displayed.caseStudy!.id).map((q,i)=><button key={q.id} onClick={()=>{changeFilter(()=>{setDomain('all');setTaskFilter('all');setChapter(String(q.chapter));setLevel('all');setQuestionType('all');setScope('all');setQuery('');selectQuestion(q)})}}>{i+1} · {q.topic}</button>)}</div></section>}<h2>{displayed.prompt}</h2>
          <div className="question-options" role="radiogroup" aria-label="答案选项">{displayed.options.map((option,i)=><button key={`${displayed.id}-${i}`} role="radio" aria-checked={choice===i} disabled={!!result||busy} className={`${choice===i?'selected':''} ${result&&displayed.correct===i?'correct':''} ${result&&choice===i&&!result.correct?'incorrect':''}`} onClick={()=>setChoice(i)}><b>{String.fromCharCode(65+i)}</b><span>{option.text}</span></button>)}</div>
          {!result?<button className="primary" disabled={choice===null||busy} onClick={()=>{setPinned(displayed);void submit()}}>{busy?'保存中…':'提交答案'}</button>:<div className="answer-explanation" role="status"><h3>{result.correct?'回答正确':'回答错误，已自动加入错题集'}</h3><p>你的答案：{String.fromCharCode(65+result.selected)}；正确答案：{String.fromCharCode(65+displayed.correct)}</p><h4>为什么这样选？</h4>{displayed.options.map((option,i)=><p key={i}><b>{String.fromCharCode(65+i)} · {i===displayed.correct?'正确':'不正确'}：</b>{option.explanation}</p>)}<h4>教材依据与背景 · PDF 第 {displayed.source.page+1} 页</h4><blockquote>{displayed.source.quote}</blockquote><p className="muted">来源摘录提供教材依据和背景，请回到原书核对上下文。</p><div className="tool-group"><button onClick={()=>onJump(displayed.source.page)}>查看原文 · PDF 第 {displayed.source.page+1} 页</button><button onClick={reset}>重新作答</button><button onClick={()=>{const index=questions.findIndex(q=>q.id===displayed.id);reset();setActive(questions[(index+1)%Math.max(1,questions.length)]?.id??'')}}>下一题</button></div></div>}
          <SourceCheck key={displayed.id} bookId={book.id} question={displayed} onJump={onJump}/>
          <div className="question-history">作答历史：{state.answers.filter(a=>a.questionId===displayed.id).length} 次；答错 {state.answers.filter(a=>a.questionId===displayed.id&&!a.correct).length} 次。正确重做会移出当前错题集，历史仍保留。</div>
          <details className="question-history"><summary>查看作答记录</summary>{state.answers.filter(answer=>answer.questionId===displayed.id).slice().reverse().map(answer=><article key={answer.id}><p>{new Date(answer.created).toLocaleString()} · 选择 {String.fromCharCode(65+answer.selected)} · {answer.correct?'正确':'错误'}</p>{answer.questionSnapshot?<>{answer.questionSnapshot.caseStudy&&<section className="case-study"><h4>{answer.questionSnapshot.caseStudy.title}</h4><p>{answer.questionSnapshot.caseStudy.scenario}</p><table><thead><tr>{answer.questionSnapshot.caseStudy.columns.map((column,index)=><th key={index}>{column}</th>)}</tr></thead><tbody>{answer.questionSnapshot.caseStudy.rows.map((row,index)=><tr key={index}>{row.map((cell,cellIndex)=><td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></section>}<strong>当时的题目：{answer.questionSnapshot.prompt}</strong>{answer.questionSnapshot.options.map((option,index)=><p key={index}>{String.fromCharCode(65+index)}. {option.text} · {option.explanation}</p>)}<p>当时的正确答案：{String.fromCharCode(65+answer.questionSnapshot.correct)}</p><blockquote>{answer.questionSnapshot.source.quote}</blockquote><button onClick={()=>onJump(answer.questionSnapshot!.source.page)}>查看当时的教材来源</button></>:<p>此记录创建时未保存题目快照。</p>}</article>)}</details>
        </>}</article>
      </div>
    </>}
  </section>
}

function SourceCheck({bookId,question,onJump}:{bookId:string;question:PracticeQuestion;onJump:(page:number)=>void}) {
  const [result,setResult]=useState<{status:string;page:number;message:string}|null>(null)
  const [busy,setBusy]=useState(false)
  const check=async()=>{
    setBusy(true)
    try{setResult(await call('verifyQuestionSource',{bookId,questionId:question.id}))}
    catch(error){setResult({status:'unavailable',page:question.source.page,message:String(error)})}
    finally{setBusy(false)}
  }
  return <section className="question-history" aria-label="题目来源核验"><button disabled={busy} onClick={()=>void check()}>核验教材引用</button>{result&&<><p role="status">{result.message}</p>{result.status!=='unavailable'&&<button onClick={()=>onJump(result.page)}>返回来源页核对</button>}</>}</section>
}

function DraftEditor({draft,busy,onSave,onCancel}:{draft:SavedDraft;busy:boolean;onSave:(value:SavedDraft)=>void;onCancel:()=>void}) {
  const [value,setValue]=useState(draft)
  const updateOption=(index:number,field:'text'|'explanation',text:string)=>{
    setValue(current=>({...current,options:current.options.map((option,i)=>i===index?{...option,[field]:text}:option)}))
  }
  return <form className="answer-explanation" onSubmit={event=>{event.preventDefault();onSave(value)}}>
    <h3>审校题目草稿</h3>
    <label>知识点<input required maxLength={500} value={value.topic} onChange={event=>setValue({...value,topic:event.target.value})}/></label>
    <label>题干<textarea required maxLength={4000} value={value.prompt} onChange={event=>setValue({...value,prompt:event.target.value})}/></label>
    {value.options.map((option,index)=><div key={index}>
      <label>选项 {String.fromCharCode(65+index)}<input required maxLength={2000} value={option.text} onChange={event=>updateOption(index,'text',event.target.value)}/></label>
      <label>选项 {String.fromCharCode(65+index)} 解析<textarea required maxLength={4000} value={option.explanation} onChange={event=>updateOption(index,'explanation',event.target.value)}/></label>
    </div>)}
    <label>正确答案<select value={value.correct} onChange={event=>setValue({...value,correct:Number(event.target.value)})}>{value.options.map((_,index)=><option key={index} value={index}>{String.fromCharCode(65+index)}</option>)}</select></label>
    <label>原文引用<textarea required minLength={5} maxLength={2000} value={value.quote} onChange={event=>setValue({...value,quote:event.target.value})}/></label>
    <p>保存时会检查引用是否存在于 PDF 第 {value.page+1} 页的提取文字中。</p>
    <button type="button" onClick={onCancel} disabled={busy}>取消编辑</button>
    <button type="submit" disabled={busy}>保存草稿</button>
  </form>
}

function PublishDraft({busy,onPublish,onCancel}:{busy:boolean;onPublish:(chapter:number,title:string)=>void;onCancel:()=>void}) {
  const [chapter,setChapter]=useState('1')
  const [title,setTitle]=useState('第一章')
  const [reviewed,setReviewed]=useState(false)
  return <form className="answer-explanation" onSubmit={event=>{event.preventDefault();if(reviewed)onPublish(Number(chapter),title)}}>
    <h3>发布到教材题库</h3>
    <label>章节编号<input type="number" min={1} max={100000} required value={chapter} onChange={event=>setChapter(event.target.value)}/></label>
    <label>章节标题<input required maxLength={200} value={title} onChange={event=>setTitle(event.target.value)}/></label>
    <label><input type="checkbox" checked={reviewed} onChange={event=>setReviewed(event.target.checked)}/>我已核对原文、答案和所有选项解析</label>
    <p>发布后本题暂不支持修改，修改功能正在开发。</p>
    <button type="button" onClick={onCancel} disabled={busy}>取消发布</button>
    <button type="submit" disabled={busy||!reviewed}>确认发布</button>
  </form>
}
