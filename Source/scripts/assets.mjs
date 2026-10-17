import { cp, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
const require=createRequire(import.meta.url)
const root=dirname(require.resolve('pdfjs-dist/package.json'))
await mkdir('src/renderer/public/pdf-assets',{recursive:true})
for(const folder of ['cmaps','standard_fonts','wasm'])await cp(join(root,folder),join('src/renderer/public/pdf-assets',folder),{recursive:true})
console.log('Offline PDF fonts, CMaps and WASM prepared')
