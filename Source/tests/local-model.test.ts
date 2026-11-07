import { createServer } from 'node:http'
import { describe, expect, it } from 'vitest'
import { checkLocalModels } from '../src/main/local-model'

describe('local model detection',()=>{
  it('lists models from the loopback service and handles malformed responses',async()=>{
    let valid=true
    const server=createServer((request,response)=>{
      expect(request.url).toBe('/api/tags')
      response.setHeader('content-type','application/json')
      response.end(valid?JSON.stringify({models:[{name:'example:local'}]}):'{invalid')
    })
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
    try {
      const address=server.address()
      if(!address || typeof address==='string')throw new Error('No test port')
      expect(await checkLocalModels(address.port)).toEqual({available:true,models:['example:local']})
      valid=false
      expect((await checkLocalModels(address.port)).available).toBe(false)
    }finally{await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()))}
  })
})
