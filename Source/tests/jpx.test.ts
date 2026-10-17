import {it,expect} from 'vitest'
import {PDFDocument,PDFRawStream} from 'pdf-lib'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {join} from 'node:path'
import {tmpdir} from 'node:os'
import {openPDF,extractPage} from '../src/importer/importer'

it('decodes a self-authored JPEG2000 image using the bundled local WASM decoder',async()=>{
  const root=await mkdtemp(join(tmpdir(),'cpss-jpx-')),file=join(root,'jpx.pdf')
  // A 16x16 RGB gradient generated locally with OpenJPEG; no textbook content.
  const bytes=Buffer.from('AAAADGpQICANCocKAAAAFGZ0eXBqcDIgAAAAAGpwMiAAAAAtanAyaAAAABZpaGRyAAAAEAAAABAAAwcHAAAAAAAPY29scgEAAAAAABAAAADfanAyY/9P/1EALwAAAAAAEAAAABAAAAAAAAAAAAAAABAAAAAQAAAAAAAAAAAAAwcBAQcBAQcBAf9SAAwAAAABAAQEBAAB/1wAEEBASEhQSEhQSEhQSEhQ/2QAJQABQ3JlYXRlZCBieSBPcGVuSlBFRyB2ZXJzaW9uIDIuNS40/5AACgAAAAAAWwAB/5PH1AQIL8fUBAgvx9QCCM/ACARfp+AEBF+Ax9oGAA0CBaPtAwALPYSAw+oFACIaCF1/ofUCgAN/3VI/gMHzhAA2oZnPoPnCgD2mNGB/gP/Z','base64')
  try {
    const doc=await PDFDocument.create(),page=doc.addPage([612,792])
    const image=doc.context.register(PDFRawStream.of(doc.context.obj({Type:'XObject',Subtype:'Image',Width:16,Height:16,ColorSpace:'DeviceRGB',BitsPerComponent:8,Filter:'JPXDecode'}),bytes))
    const name=page.node.newXObject('Jpx',image)
    page.node.addContentStream(doc.context.register(doc.context.flateStream(`q 200 0 0 200 70 70 cm ${name} Do Q`)))
    await writeFile(file,await doc.save())
    const pdf=await openPDF(file)
    try{const result=await extractPage(pdf,'fixture',0,'1');expect(result.regions).toHaveLength(1);expect(result.regions[0].rect).toEqual([64,516,276,728])}finally{await pdf.destroy()}
  }finally{await rm(root,{recursive:true,force:true})}
})
