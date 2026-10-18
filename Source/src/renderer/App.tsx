import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ResizeHandle } from './ResizeHandle'
import { Practice } from './Practice'
import type { Anchor, BookDetail, PageData, SearchHit, Snapshot, StudyRecord, TocNode } from '../shared/types'
import { PDFPane, useDocument } from './PDF'

type View='dashboard'|'read'|'search'|'review'|'cards'|'plan'|'questions'
const labels:Record<StudyRecord['kind'],string>={highlight:'高亮',underline:'下划线',note:'笔记',bookmark:'书签',card:'知识卡片',task:'学习任务'}
const call=<T,>(method:string,args?:unknown)=>window.desktop.call<T>(method,args)
const empty:Snapshot={books:[],settings:{}}
const today=()=>new Date().toLocaleDateString('sv-SE')
function makeRecord(bookId:string,page:number,kind:StudyRecord['kind'],anchor:Anchor|null):StudyRecord {
  return {id:crypto.randomUUID(),bookId,page,kind,anchor,text:'',color:'yellow',important:false,due:'',done:false,updated:new Date().toISOString()}
}
export default function App() {
  const [snapshot,setSnapshot]=useState<Snapshot>(empty),[selected,setSelected]=useState(''),[detail,setDetail]=useState<BookDetail|null>(null)
  const [view,setView]=useState<View>('dashboard'),[page,setPage]=useState(0),[pageData,setPageData]=useState<PageData|null>(null)
  const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false)
  const [anchor,setAnchor]=useState<Anchor|null>(null),[editor,setEditor]=useState<StudyRecord|null>(null),[settings,setSettings]=useState(false)
  const [report,setReport]=useState<unknown|null>(null)
  const [query,setQuery]=useState(''),[hits,setHits]=useState<SearchHit[]>([]),[tocQuery,setTocQuery]=useState(''),[notesQuery,setNotesQuery]=useState('')
  const [leftTab,setLeftTab]=useState<'toc'|'annotations'>('toc'),[annotationColor,setAnnotationColor]=useState('all'),[annotationOrder,setAnnotationOrder]=useState('page')
  const [focusedRecord,setFocusedRecord]=useState(''),[inlineEditor,setInlineEditor]=useState<StudyRecord|null>(null)
  const [collapsed,setCollapsed]=useState<string[]>([]),[noteScope,setNoteScope]=useState('all')
  const [immersive,setImmersive]=useState(false),[theme,setTheme]=useState('light')
  const [showToc,setShowToc]=useState(false),[showNotes,setShowNotes]=useState(false),[showRail,setShowRail]=useState(true)
  const [railWidth,setRailWidth]=useState(88),[tocWidth,setTocWidth]=useState(220),[notesWidth,setNotesWidth]=useState(250),[pdfZoom,setPdfZoom]=useState(1)
  const [pdfJump,setPdfJump]=useState<{page:number;serial:number;top?:number}>({page:0,serial:0})
  const lastBook=useRef('')
  const book=detail?.book,records=detail?.records??[]
  const {document,error:pdfError}=useDocument(book?.status==='ready'?book.id:undefined)
  const reportError=useCallback((error:unknown)=>setError(error instanceof Error?error.message:String(error)),[])
  const act=useCallback((task:()=>Promise<unknown>)=>{void task().catch(reportError)},[reportError])
  const refresh=useCallback(async(id?:string)=>{
    const state=await call<Snapshot>('snapshot');setSnapshot(state)
    if(id){const value=await call<BookDetail>('detail',id);if(lastBook.current===id)setDetail(value)}
  },[])
  const openBook=useCallback(async(id:string)=>{
    const firstOpen=!lastBook.current
    const result=await call<BookDetail>('detail',id)
    lastBook.current=id;setSelected(id);setDetail(result);setPage(result.position?.page??0);setPdfJump(value=>({page:result.position?.page??0,serial:value.serial+1}));setAnchor(null);setView('read');setInlineEditor(null);setFocusedRecord('');if(firstOpen){setShowRail(false);setShowToc(false);setShowNotes(false)}
    await call('setting',{key:'lastBook',value:id})
  },[])
  useEffect(()=>{
    void call<Snapshot>('snapshot').then(async state=>{
      setSnapshot(state)
      if(state.bootstrapError)reportError(state.bootstrapError)
      const prefs=state.settings
      setTheme(prefs.theme==='dark'?'dark':'light')
      const width=(value:unknown,fallback:number,min:number,max:number)=>Math.min(max,Math.max(min,Number(value)||fallback))
      setRailWidth(width(prefs.navWidth,88,72,160));setTocWidth(width(prefs.tocWidth,220,150,420));setNotesWidth(width(prefs.notesWidth,250,180,440));setPdfZoom(width(prefs.pdfZoom,1,.4,3))
      const previous=state.books.find(b=>b.id===prefs.lastBook)
      if(previous)await openBook(previous.id)
    }).catch(reportError)
  },[openBook,reportError])
  useEffect(()=>{documentElementTheme(theme)},[theme])
  useEffect(()=>window.desktop.onProgress(event=>{
    if(event.error)reportError(event.error)
    setSnapshot(state=>({...state,books:state.books.map(b=>b.id===event.bookId?{...b,status:event.status,processed:event.processed,pages:event.total,error:event.error??null}:b)}))
    if(event.bookId===lastBook.current)setDetail(state=>state?{...state,book:{...state.book,status:event.status,processed:event.processed,pages:event.total,error:event.error??null}}:state)
    if(event.status==='ready' || event.status==='failed' || event.status==='paused')act(()=>refresh(lastBook.current||undefined))
  }),[act,refresh,reportError])
  useEffect(()=>{
    setPageData(null);setAnchor(null)
    if(!selected || !book || page>=book.processed)return
    let active=true
    call<PageData>('page',{bookId:selected,page}).then(value=>{if(active)setPageData(value)}).catch(reportError)
    return ()=>{active=false}
  },[selected,page,book?.processed,reportError])
  useEffect(()=>{
    if(!selected || book?.status!=='ready')return
    const timer=setTimeout(()=>act(()=>call('position',{bookId:selected,page})),300)
    return ()=>clearTimeout(timer)
  },[selected,page,book?.status,act])
  useEffect(()=>{
    if(!selected || view!=='search'){setHits([]);return}
    let active=true
    const timer=setTimeout(()=>{call<SearchHit[]>('search',{bookId:selected,query}).then(result=>{if(active)setHits(result)}).catch(reportError)},250)
    return ()=>{active=false;clearTimeout(timer)}
  },[query,selected,view,reportError])
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),5000);return ()=>clearTimeout(timer)},[notice])
  const pref=(key:string,value:unknown)=>act(()=>call('setting',{key,value}))
  const zoom=useCallback((value:number)=>{const next=Math.min(3,Math.max(.4,Math.round(value*100)/100));setPdfZoom(next)},[])
  useEffect(()=>{const timer=setTimeout(()=>act(()=>call('setting',{key:'pdfZoom',value:pdfZoom})),350);return ()=>clearTimeout(timer)},[pdfZoom,act])
  const choose=()=>act(async()=>{
    setBusy(true);setError('')
    try{const result=await window.desktop.choosePDF();if(result){await refresh();await openBook(result.bookId)}}finally{setBusy(false)}
  })
  const save=async(record:StudyRecord)=>{
    await call('saveRecord',{...record,updated:new Date().toISOString()});await refresh(selected);setEditor(null);setAnchor(null);window.getSelection()?.removeAllRanges()
  }
  const create=(kind:StudyRecord['kind'],color='yellow')=>{
    if(!selected)return
    const record={...makeRecord(selected,anchor?.page??page,kind,anchor),color}
    if(kind==='highlight'||kind==='underline'||kind==='bookmark')act(()=>save(record))
    else setEditor(record)
  }
  const jump=(newPage:number,_blockId='',top?:number)=>{const next=Math.max(0,Math.min((book?.pages??1)-1,newPage));setPage(next);setPdfJump(value=>({page:next,serial:value.serial+1,top}));setAnchor(null);setView('read')}
  const focusAnnotation=(record:StudyRecord)=>{jump(record.page,'',record.anchor?.rects?.[0]?.[1]);setFocusedRecord(record.id);setInlineEditor({...record});setShowNotes(true);setImmersive(false)}
  const saveInline=(record:StudyRecord)=>act(async()=>{await call('saveRecord',{...record,updated:new Date().toISOString()});await refresh(record.bookId);setNotice('批注已保存')})
  const scrollPage=useCallback((value:number)=>{setPage(value);setAnchor(null)},[])
  useEffect(()=>{const keys=(e:KeyboardEvent)=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='f'){e.preventDefault();setView('search')}if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='a'){e.preventDefault();setShowToc(true);setLeftTab('annotations');setView('read');setImmersive(false)}};window.addEventListener('keydown',keys);return ()=>window.removeEventListener('keydown',keys)},[])
  const currentNode=detail?.toc.filter(n=>n.page<=page).sort((a,b)=>b.page-a.page||b.level-a.level)[0]
  const nextNode=detail?.toc.filter(n=>n.page>(currentNode?.page??-1) && n.level<=(currentNode?.level??0)).sort((a,b)=>a.page-b.page)[0]
  const visibleNode=(node:TocNode)=>{
    if(tocQuery)return node.title.toLowerCase().includes(tocQuery.toLowerCase())
    let parent=node.parentId
    while(parent){if(collapsed.includes(parent))return false;parent=detail?.toc.find(n=>n.id===parent)?.parentId??null}
    return true
  }
  const visibleRecord=(record:StudyRecord)=>`${record.text} ${record.anchor?.quote??''}`.toLowerCase().includes(notesQuery.toLowerCase()) && (noteScope==='all' || (noteScope==='page'?record.page===page:record.page>=(currentNode?.page??0) && record.page<(nextNode?.page??book?.pages??Infinity)))
  const chapterNodes=detail?.toc.filter(n=>/chapter\s+\d+/i.test(n.title))??[]
  const completed=detail?.progress.filter(p=>p.status==='已完成').length??0
  const progressPercent=book?.pages?Math.round((page+1)/book.pages*100):0
  const setStatus=(node:TocNode,status:string)=>act(async()=>{await call('progress',{bookId:selected,nodeId:node.id,status});await refresh(selected)})
  const exportData=(format:'json'|'markdown')=>act(async()=>{const path=await window.desktop.exportData(format);if(path)setNotice(`已导出到 ${path}`)})
  const restore=()=>act(async()=>{const result=await window.desktop.restoreData();if(result){await refresh(selected||undefined);setNotice(`恢复完成：新增 ${result.inserted} 条，已有 ${result.skipped} 条；缺失教材需重新关联 PDF`)}})
  const navItems:{id:View;icon:string;title:string}[]=[{id:'dashboard',icon:'◫',title:'学习概览'},{id:'read',icon:'▤',title:'教材阅读'},{id:'search',icon:'⌕',title:'全文搜索'},{id:'review',icon:'↻',title:'复习中心'},{id:'cards',icon:'▱',title:'知识卡片'},{id:'plan',icon:'▦',title:'学习计划'},{id:'questions',icon:'◎',title:'练习题库'}]
  return <div className={`app ${immersive?'immersive':''} ${showToc?'':'library-sidebar-hidden'} ${showRail?'':'rail-hidden'} ${view==='read'?'reading-view':''}`} style={{'--nav-width':`${railWidth}px`,'--toc-width':`${tocWidth}px`,'--notes-width':`${notesWidth}px`} as CSSProperties}>
    <aside className="rail"><div className="logo" title="CPSS LAB">C<span>·</span></div><div className="rail-nav">{navItems.map(item=><button key={item.id} className={view===item.id?'active':''} onClick={()=>setView(item.id)} title={item.title} aria-label={item.title}><span className="nav-icon" aria-hidden="true">{item.icon}</span><span className="nav-label">{item.title}</span></button>)}</div><button className="rail-setting" onClick={()=>setSettings(true)} title="设置与备份" aria-label="设置与备份"><span className="nav-icon" aria-hidden="true">⚙</span><span className="nav-label">设置备份</span></button><ResizeHandle label="功能导航宽度" value={railWidth} min={72} max={160} onChange={setRailWidth} onCommit={v=>pref('navWidth',v)}/></aside>
    <aside className="library-sidebar">
      <div className="brand">CPSS <b>LAB</b><span>SPORT SCIENCE / STUDY SPACE</span></div>
      <div className="library-label">我的教材库 <button onClick={choose} title="导入教材" disabled={busy}>＋</button></div>
      <select className="book-select" aria-label="选择教材" value={selected} onChange={e=>act(()=>openBook(e.target.value))}><option value="" disabled>选择或导入一本教材</option>{snapshot.books.map(b=><option key={b.id} value={b.id}>{b.title}</option>)}</select>
      <div className="local-badge"><span/> 本地保存 · 离线可用</div>
      <div className="sidebar-tabs" role="tablist" aria-label="原书侧栏"><button role="tab" aria-selected={leftTab==='toc'} onClick={()=>setLeftTab('toc')}>目录</button><button role="tab" aria-selected={leftTab==='annotations'} onClick={()=>setLeftTab('annotations')}>批注</button></div>
      {leftTab==='toc'?<><div className="library-label">教材目录 <span>{detail?.toc.length??0}</span></div>
      <input className="toc-search" placeholder="查找章节…" value={tocQuery} onChange={e=>setTocQuery(e.target.value)}/>
      <nav className="toc-list">{detail?.toc.filter(visibleNode).map(n=>{
        const status=detail.progress.find(p=>p.nodeId===n.id)?.status
        const children=detail.toc.some(child=>child.parentId===n.id)
        return <div key={n.id} className="toc-row">{children&&<button className="toc-toggle" title={`${collapsed.includes(n.id)?'展开':'收起'} ${n.title}`} onClick={()=>setCollapsed(values=>values.includes(n.id)?values.filter(id=>id!==n.id):[...values,n.id])}>{collapsed.includes(n.id)?'▸':'▾'}</button>}<button style={{paddingLeft:12+Math.min(n.level,3)*12}} className={`${n.id===currentNode?.id?'active':''} level-${n.level}`} onClick={()=>jump(n.page)} title={`${n.title} · PDF 第 ${n.page+1} 页 · ${n.source}`}><span className="toc-status">{status==='已完成'?'✓':status==='需要复习'?'↻':'·'}</span><span>{n.title}</span><small>{n.page+1}</small></button></div>
      })}{!detail?.toc.length&&<p className="muted empty-toc">导入后将在这里显示真实目录</p>}</nav>
</>:<><div className="annotation-filters"><input aria-label="搜索批注" placeholder="搜索引用或笔记…" value={notesQuery} onChange={e=>setNotesQuery(e.target.value)}/><div><select aria-label="批注颜色" value={annotationColor} onChange={e=>setAnnotationColor(e.target.value)}><option value="all">全部颜色</option>{['yellow','green','blue','pink'].map(c=><option key={c} value={c}>{({yellow:'黄色',green:'绿色',blue:'蓝色',pink:'粉色'})[c]}</option>)}</select><select aria-label="批注排序" value={annotationOrder} onChange={e=>setAnnotationOrder(e.target.value)}><option value="page">按页码</option><option value="recent">最近修改</option></select></div></div><div className="annotation-list">{records.filter(r=>['highlight','underline','note','bookmark'].includes(r.kind)&&(annotationColor==='all'||r.color===annotationColor)&&`${r.text} ${r.anchor?.quote??''}`.toLowerCase().includes(notesQuery.toLowerCase())).sort((a,b)=>annotationOrder==='page'?a.page-b.page:b.updated.localeCompare(a.updated)).map(r=><button key={r.id} data-record-id={r.id} className={`annotation-item ${focusedRecord===r.id?'selected':''}`} onClick={()=>focusAnnotation(r)}><small><i className={`record-dot ${r.color}`}/>{labels[r.kind]} · PDF {r.page+1}</small>{r.anchor?.quote&&<blockquote>{r.anchor.quote.slice(0,220)}</blockquote>}<span>{r.text||(!r.anchor?.quote?'页面记录':'点击编辑笔记')}</span></button>)}{!records.length&&<p className="muted">选中 PDF 文字添加高亮，批注会按页码列在这里。</p>}</div></>}
      <div className="library-sidebar-footer"><span>学习是一场长期实验。</span><small>CPSS LAB / 本地学习空间</small></div>
      <ResizeHandle label="目录宽度" value={tocWidth} min={150} max={420} onChange={setTocWidth} onCommit={v=>pref('tocWidth',v)}/>
    </aside>
    <main className="workspace">
      <header className="topbar"><div className="top-heading"><button className="nav-toggle" onClick={()=>{setImmersive(false);setShowRail(v=>!v)}} aria-label="功能导航" aria-pressed={showRail&&!immersive}>☰ 功能导航</button><div><span className="eyebrow">你的运动科学学习空间</span>{view==='read'?<div className="document-tabs" role="tablist" aria-label="教材标签页">{snapshot.books.filter(b=>b.status==='ready').map(b=><button key={b.id} data-book-id={b.id} role="tab" aria-selected={b.id===selected} title={b.title} onClick={()=>act(()=>openBook(b.id))}>{b.title}</button>)}</div>:<strong>{navItems.find(n=>n.id===view)?.title}</strong>}</div></div><div className="top-actions"><span className="offline-dot">离线模式</span><button onClick={()=>setImmersive(v=>!v)} title="沉浸阅读">{immersive?'退出沉浸':'专注阅读'}</button><button onClick={()=>setSettings(true)} aria-label="阅读设置">设置</button><span className="avatar">学</span></div></header>
      {error&&<div className="error banner" role="alert"><span>{error}</span><button onClick={()=>setError('')}>关闭</button></div>}
      {notice&&<div className="toast" role="status">✓ {notice}</div>}
      {!book?<div className="welcome">
        <div className="eyebrow">CPSS LAB · PERSONAL LEARNING PLATFORM</div><h1>让知识，成为<br/><em>你的运动表现优势。</em></h1><p>把教材带进你的学习空间。阅读、思考、记录，<br/>在每一段原文中建立自己的知识体系。</p>
        <button className="primary large" onClick={choose} disabled={busy}>{busy?'正在校验教材…':'＋ 导入英文教材 PDF'}</button><button className="text-button" onClick={restore}>从学习记录备份恢复</button>
        <div className="welcome-grid"><div><b>01 / 原版阅读</b><p>保留教材版式，连续滚动阅读 PDF</p></div><div><b>02 / 原书批注</b><p>随时核对图表、公式和来源页码</p></div><div><b>03 / 本地资料</b><p>教材与笔记保留在你的电脑</p></div></div><small className="muted">安装包不包含教材。首次导入在本机完成，不使用远程处理服务。</small>
      </div>:book.status!=='ready'?<div className="import-screen">
        <span className="eyebrow">YOUR LOCAL LIBRARY</span><h1>{book.status==='missing'?'重新关联教材':book.status==='ready'?'教材已就绪':'准备你的数字教材'}</h1><p>{book.title}</p>
        <div className="import-card"><h3>{book.status==='importing'?'正在建立教材检索索引':book.status==='paused'?'导入已暂停，可继续':book.status==='failed'?'导入未完成':'教材源文件尚未导入'}</h3><progress value={book.processed} max={book.pages||1}/><div className="between"><span>已完成 {book.processed} / {book.pages} 页</span><span>{book.pages?Math.round(book.processed/book.pages*100):0}%</span></div><p>逐页建立本地检索索引并保存检查点。阅读始终使用原版 PDF。</p>{book.error&&<p className="error">{book.error}</p>}
        {book.status==='importing'?<button onClick={()=>act(()=>call('pause',selected))}>暂停导入</button>:book.status==='missing'?<button className="primary" onClick={choose}>选择对应的 PDF</button>:<button className="primary" onClick={()=>act(()=>call('resume',selected))}>继续导入</button>}</div>
      </div>:<>
        {view==='read'?<div className="reader-layout">
          <section className="reader-column">
            <div className="reader-toolbar compact-tools" aria-label="阅读工具栏">
              <div className="tool-group"><button onClick={()=>{setImmersive(false);setShowToc(v=>leftTab!=='toc'||immersive?true:!v);setLeftTab('toc')}} aria-pressed={showToc&&leftTab==='toc'&&!immersive}>目录</button><button onClick={()=>{setShowToc(true);setLeftTab('annotations');setImmersive(false)}}>批注</button><button title="搜索原文 · Ctrl+F" onClick={()=>setView('search')}>搜索</button><button disabled={page<=0} onClick={()=>jump(page-1)} aria-label="← 上一页">‹</button><label>PDF <input aria-label="PDF 页码" type="number" min={1} max={book.pages} value={page+1} onChange={e=>jump(Number(e.target.value)-1)}/> / {book.pages}</label><button disabled={page>=book.pages-1} onClick={()=>jump(page+1)} aria-label="下一页 →">›</button></div>
              <div className="tool-group zoom-tools"><button aria-label="缩小 PDF" onClick={()=>zoom(pdfZoom-.1)}>−</button><button className="zoom-value" title="恢复 100% · Ctrl＋滚轮缩放" onClick={()=>zoom(1)}>{Math.round(pdfZoom*100)}%</button><button aria-label="放大 PDF" onClick={()=>zoom(pdfZoom+.1)}>＋</button></div>
              <div className="tool-group"><button onClick={()=>create('bookmark')} title="收藏当前页">☆ 书签</button><button onClick={()=>setEditor(makeRecord(selected,page,'note',null))}>＋ 笔记</button><button onClick={()=>{setImmersive(false);setShowNotes(v=>immersive?true:!v)}} aria-pressed={showNotes&&!immersive}>学习记录</button></div>
            </div>
            <div className="reading-panes">
              {pdfError?<div className="error" role="alert">原书资源加载异常：{pdfError}</div>:<PDFPane document={document} page={page} jumpRequest={pdfJump} records={records} onSelect={setAnchor} onPageChange={scrollPage} zoom={pdfZoom} onZoom={zoom} focusedRecord={focusedRecord} onRecordClick={focusAnnotation}/>}
            </div>
            {anchor&&<div className="selection-toolbar"><span>已选 {anchor.quote.length} 字符</span>{['yellow','green','blue','pink'].map(color=><button key={color} className={`color-button ${color}`} title={`${color} 高亮`} onMouseDown={e=>e.preventDefault()} onClick={()=>create('highlight',color)}/>)}<button onMouseDown={e=>e.preventDefault()} onClick={()=>create('underline')}>下划线</button><button onMouseDown={e=>e.preventDefault()} onClick={()=>create('note')}>＋ 笔记</button><button onMouseDown={e=>e.preventDefault()} onClick={()=>create('card')}>知识卡片</button><button onClick={()=>setAnchor(null)}>×</button></div>}
            <footer className="reading-footer"><span>{currentNode?.title??book.title}</span><span>{progressPercent}% · 阅读位置</span>{currentNode&&<select aria-label="章节学习状态" value={detail.progress.find(p=>p.nodeId===currentNode.id)?.status??'未开始'} onChange={e=>setStatus(currentNode,e.target.value)}>{['未开始','学习中','已完成','需要复习'].map(s=><option key={s}>{s}</option>)}</select>}</footer>
          </section>
          {showNotes&&<aside className="notes-panel"><ResizeHandle label="学习记录宽度" value={notesWidth} min={180} max={440} reverse onChange={setNotesWidth} onCommit={v=>pref('notesWidth',v)}/><div className="notes-heading"><h3>我的学习记录 <small>{records.length}</small></h3><button onClick={()=>setEditor(makeRecord(selected,page,'note',null))}>＋</button></div><input placeholder="搜索笔记与高亮…" value={notesQuery} onChange={e=>setNotesQuery(e.target.value)}/><select aria-label="学习记录范围" className="note-scope" value={noteScope} onChange={e=>setNoteScope(e.target.value)}><option value="all">全部学习记录</option><option value="chapter">当前章节 / 小节</option><option value="page">当前页</option></select>{inlineEditor&&<form className="inline-annotation-editor" onSubmit={e=>{e.preventDefault();saveInline(inlineEditor)}}><div className="between"><strong>编辑{labels[inlineEditor.kind]} · PDF {inlineEditor.page+1}</strong><button type="button" aria-label="关闭批注编辑" onClick={()=>setInlineEditor(null)}>×</button></div>{inlineEditor.anchor?.quote&&<blockquote>{inlineEditor.anchor.quote.slice(0,350)}</blockquote>}<textarea aria-label="批注笔记内容" rows={5} value={inlineEditor.text} onChange={e=>setInlineEditor({...inlineEditor,text:e.target.value})} onBlur={()=>saveInline(inlineEditor)} placeholder="在原文旁记录思考…"/><button className="primary" type="submit">保存批注</button><small>离开编辑框自动保存；记录保留原页引用。</small></form>}<div className="notes-scroll">{records.filter(visibleRecord).map(record=><RecordCard key={record.id} record={record} onJump={()=>focusAnnotation(record)} onEdit={()=>setEditor(record)}/>)}{!records.length&&<div className="notes-empty"><span>✎</span><h4>把思考留在这里</h4><p>选中一段正文，添加高亮或笔记。<br/>你的每一次思考，都会被保存。</p></div>}</div><div className="notes-footer"><button onClick={()=>exportData('markdown')}>导出 Markdown</button><button onClick={()=>exportData('json')}>备份 JSON</button></div></aside>}
        </div>:view==='dashboard'?<section className="content-page dashboard"><div className="eyebrow">A LITTLE PROGRESS, EVERY DAY</div><h1>今天，也离目标更近一步。</h1><p className="muted">从理解一个概念开始，建立属于你的运动科学知识体系。</p><div className="stats-grid"><Stat value={String(completed)} label="已标记完成的目录项"/><Stat value={String(chapterNodes.length)} label="识别到的 Chapter 条目"/><Stat value={String(records.filter(r=>r.kind==='note').length)} label="学习笔记"/><Stat value={String(records.filter(r=>r.important || (r.due && !r.done && r.due<=today())).length)} label="重点与到期复习"/></div><div className="continue-card"><div><span className="eyebrow">CONTINUE READING</span><h2>{currentNode?.title??book.title}</h2><p>上次阅读位置 · PDF 第 {page+1} 页 / {book.pages} 页</p><button className="primary" onClick={()=>setView('read')}>继续阅读 →</button></div><div className="progress-ring" style={{background:`conic-gradient(var(--green) ${progressPercent}%,var(--border) 0)`}}><span>{progressPercent}%<small>阅读位置</small></span></div></div><div className="dashboard-bottom"><div className="surface"><h3>近期笔记</h3>{records.filter(r=>r.kind==='note').slice(0,3).map(r=><RecordCard key={r.id} record={r} onJump={()=>focusAnnotation(r)} onEdit={()=>setEditor(r)}/>)}{!records.some(r=>r.kind==='note')&&<p className="muted">还没有笔记，开始阅读并记录第一个想法。</p>}</div><div className="surface"><h3>教材状态</h3><p>{book.title}</p><p className="muted">{book.pages} 页 · 英文原文 · 本地存储</p><button onClick={()=>act(async()=>{const report=await call('report',selected);setNotice('质量报告已打开');setReport(report)})}>查看索引质量报告</button></div></div></section>:view==='search'?<section className="content-page"><div className="eyebrow">FIND A CONNECTION</div><h1>从一个问题，找到知识的连接。</h1><input autoFocus className="global-search" placeholder="搜索英文教材、笔记与高亮…" value={query} onChange={e=>setQuery(e.target.value)}/><p className="muted">{query?`${hits.length} 条结果（最多 90 条）`:'输入英文术语或笔记内容。检索全部已导入正文。'}</p><div className="search-results">{hits.map((hit,index)=><button key={`${hit.id}-${index}`} onClick={()=>jump(hit.page,hit.type==='text'?hit.id:records.find(r=>r.id===hit.id)?.anchor?.startBlock)}><small>{hit.type==='text'?'教材正文':'学习记录'} · PDF 第 {hit.page+1} 页</small><p>{hit.text.slice(0,600)}</p><span>跳转来源 →</span></button>)}</div></section>:view==='questions'?<Practice book={book} currentPage={page} onJump={jump}/>:<section className="content-page"><div className="eyebrow">{view==='review'?'MAKE KNOWLEDGE STICK':view==='cards'?'BUILD YOUR KNOWLEDGE':'ONE CHAPTER AT A TIME'}</div><div className="between"><h1>{view==='review'?'温故，才能知新。':view==='cards'?'把理解，变成知识卡片。':'让学习，有迹可循。'}</h1>{view!=='review'&&<button className="primary" onClick={()=>setEditor(makeRecord(selected,page,view==='cards'?'card':'task',null))}>＋ {view==='cards'?'新建卡片':'新建任务'}</button>}</div><p className="muted">{view==='review'?'汇总重点笔记、已设复习日期的记录，以及标记为需要复习的章节。':view==='cards'?'卡片保留原文引用，随时回到教材核对。':'为章节安排目标日期，完成后手动标记。'}</p>{view==='review'&&detail.toc.filter(n=>detail.progress.some(p=>p.nodeId===n.id&&p.status==='需要复习')).map(n=><button className="review-chapter" key={n.id} onClick={()=>jump(n.page)}>↻ {n.title}<span>PDF 第 {n.page+1} 页 →</span></button>)}<div className="record-grid">{records.filter(r=>view==='cards'?r.kind==='card':view==='plan'?r.kind==='task':r.important||Boolean(r.due)).map(r=><RecordCard key={r.id} record={r} onJump={()=>focusAnnotation(r)} onEdit={()=>setEditor(r)} onToggle={()=>act(()=>save({...r,done:!r.done}))}/>)}</div>{!records.some(r=>view==='cards'?r.kind==='card':view==='plan'?r.kind==='task':r.important||r.due)&&<div className="empty-state">{view==='review'?'将记录标记为重点或设置复习日期，它们就会出现在这里。':'从教材原文创建内容，或者使用右上方按钮添加。'}</div>}</section>}
      </>}
    </main>
    {editor&&<div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setEditor(null)}}><form className="modal" onSubmit={e=>{e.preventDefault();act(()=>save(editor))}}><div className="between"><h2>{labels[editor.kind]}</h2><button type="button" onClick={()=>setEditor(null)}>×</button></div><p className="muted">PDF 第 {editor.page+1} 页 · {editor.anchor?.mode==='pdf'?'原书文字锚点':editor.anchor?'HTML 文本锚点':'页面记录'}</p>{editor.anchor?.quote&&<blockquote>{editor.anchor.quote}</blockquote>}<label>我的内容<textarea autoFocus rows={7} value={editor.text} onChange={e=>setEditor({...editor,text:e.target.value})} placeholder={editor.kind==='card'?'写下核心知识、问题和你的回答…':'记录你的理解、疑问和学习任务…'}/></label><div className="form-row"><label>颜色<select value={editor.color} onChange={e=>setEditor({...editor,color:e.target.value})}>{['yellow','green','blue','pink'].map(c=><option key={c}>{c}</option>)}</select></label><label>复习 / 目标日期<input type="date" value={editor.due} onChange={e=>setEditor({...editor,due:e.target.value})}/></label><label className="checkbox"><input type="checkbox" checked={editor.important} onChange={e=>setEditor({...editor,important:e.target.checked})}/>重点</label></div><div className="modal-actions">{records.some(r=>r.id===editor.id)&&<button type="button" className="danger" onClick={()=>act(async()=>{await call('removeRecord',editor.id);setEditor(null);await refresh(selected)})}>删除记录</button>}<button type="button" onClick={()=>setEditor(null)}>取消</button><button className="primary" type="submit">保存记录</button></div></form></div>}
    {settings&&<div className="modal-backdrop"><div className="modal settings"><div className="between"><h2>阅读偏好与资料管理</h2><button onClick={()=>setSettings(false)}>×</button></div><label>外观<select value={theme} onChange={e=>{setTheme(e.target.value);pref('theme',e.target.value)}}><option value="light">浅色 · 纸张</option><option value="dark">深色 · 夜读</option></select></label><p className="muted">原版 PDF 保留教材字体和版式，可使用阅读区的缩放按钮调整显示大小。</p><hr/><h3>学习资料</h3><p className="muted">JSON 用于完整恢复学习记录；Markdown 用于阅读和整理。备份不包含教材 PDF，恢复到新电脑后需导入同一教材。</p><div className="settings-buttons"><button onClick={()=>exportData('json')}>导出 JSON 备份</button><button onClick={()=>exportData('markdown')}>导出 Markdown</button><button onClick={restore}>恢复 JSON 备份</button><button onClick={()=>act(()=>window.desktop.openDataFolder())}>打开资料目录</button></div></div></div>}
    {report!==null&&<div className="modal-backdrop"><div className="modal report"><div className="between"><h2>索引质量报告</h2><button onClick={()=>setReport(null)}>×</button></div><p className="muted">自动处理情况与人工核验分开记录，未核验内容不能视为无误。</p><pre>{JSON.stringify(report,null,2)}</pre></div></div>}
  </div>
  function documentElementTheme(value:string){window.document.documentElement.dataset.theme=value}
}
function Stat({value,label}:{value:string;label:string}){return <div className="stat"><b>{value}</b><span>{label}</span></div>}
function RecordCard({record,onJump,onEdit,onToggle}:{record:StudyRecord;onJump:()=>void;onEdit:()=>void;onToggle?:()=>void}) {
  return <div className={`record-card ${record.done?'done':''}`}><div className="record-meta"><span className={`record-dot ${record.color}`}/><span>{labels[record.kind]}{record.important?' · ★ 重点':''}</span><button title="编辑记录" onClick={onEdit}>···</button></div>{record.anchor?.quote&&<blockquote onClick={onJump}>{record.anchor.quote.slice(0,400)}</blockquote>}{record.text&&<p onClick={onEdit}>{record.text}</p>}<div className="record-bottom"><button onClick={onJump}>PDF 第 {record.page+1} 页 ↗</button>{record.due&&<span>{record.due}</span>}{onToggle&&<button onClick={onToggle}>{record.done?'重新打开':'标记完成'}</button>}</div></div>
}
