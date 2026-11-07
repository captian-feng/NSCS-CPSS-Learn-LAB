import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { generateLocalDraft } from '../src/practice/local-draft'

describe('local textbook question drafts',()=>{
  it('accepts a structured local result only when its citation is in the selected page',async()=>{
    const source='肌力训练能够提升肌肉产生力量的能力。科学训练需要合理安排负荷与恢复时间。逐步增加负荷有助于训练适应。'
    const draft={topic:'肌力',prompt:'训练需要合理安排什么？',options:[{text:'负荷和恢复',explanation:'原文提及负荷与恢复'},{text:'只有体重',explanation:'原文未说明'},{text:'只有饮水',explanation:'原文未说明'},{text:'只有身高',explanation:'原文未说明'}],correct:0,quote:'合理安排负荷与恢复时间'}
    let generated=draft
    const server=createServer((req,res)=>{
      expect(req.url).toBe('/api/generate');expect(req.method).toBe('POST')
      req.resume();req.on('end',()=>res.end(JSON.stringify({response:JSON.stringify(generated)})))
    })
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
    try{
      const address=server.address();if(!address||typeof address==='string')throw new Error('No test port')
      const result=await generateLocalDraft(2,source,'example:local',address.port)
      expect(result.quote).toBe(draft.quote);expect(result.page).toBe(2)
      generated={...draft,quote:'不存在的教材引用'}
      await expect(generateLocalDraft(2,source,'example:local',address.port)).rejects.toThrow('无法在当前页面定位')
      await expect(generateLocalDraft(2,source,'example:cloud',address.port)).rejects.toThrow('本地模型')
      await expect(generateLocalDraft(2,'短文本','example:local',address.port)).rejects.toThrow('文字不足')
    }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}
  })
})
