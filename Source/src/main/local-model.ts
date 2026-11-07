import { get } from 'node:http'

export type LocalModelStatus = { available:boolean; models:string[]; error?:string }

// Only the loopback service is contacted. The port parameter enables isolated tests.
export function checkLocalModels(port=11434):Promise<LocalModelStatus> {
  return new Promise(resolve=>{
    let done=false
    const finish=(result:LocalModelStatus)=>{if(!done){done=true;resolve(result)}}
    const request=get({hostname:'127.0.0.1',port,path:'/api/tags',timeout:3000},response=>{
      if(response.statusCode!==200){response.resume();finish({available:false,models:[],error:`本地模型服务返回状态 ${response.statusCode}`});return}
      const chunks:Buffer[]=[]
      let size=0
      response.on('data',(chunk:Buffer)=>{
        size+=chunk.length
        if(size>1024*1024){request.destroy();finish({available:false,models:[],error:'本地模型列表过大'});return}
        chunks.push(chunk)
      })
      response.on('end',()=>{
        try {
          const data=JSON.parse(Buffer.concat(chunks).toString('utf8')) as {models?:unknown}
          if(!Array.isArray(data.models))throw new Error('invalid response')
          const models=data.models.map(item=>item?.name).filter((name):name is string=>typeof name==='string'&&name.length>0&&name.length<=200)
          finish({available:true,models})
        }catch{finish({available:false,models:[],error:'本地模型服务返回了无效数据'})}
      })
      response.on('error',()=>finish({available:false,models:[],error:'读取本地模型列表失败'}))
      response.on('aborted',()=>finish({available:false,models:[],error:'本地模型服务中断了响应'}))
    })
    request.on('timeout',()=>request.destroy())
    request.on('error',()=>finish({available:false,models:[],error:'本地模型服务未启动或无法连接'}))
  })
}
