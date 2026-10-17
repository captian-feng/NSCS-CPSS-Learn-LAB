import { PDFDocument, PDFName, PDFString, StandardFonts, rgb } from 'pdf-lib'
import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

/** Entirely self-authored: no textbook excerpts or copyrighted source assets. */
export async function createFixture(file:string,pages=4) {
  const doc=await PDFDocument.create(),regular=await doc.embedFont(StandardFonts.TimesRoman),bold=await doc.embedFont(StandardFonts.TimesRomanBold)
  doc.setTitle('CPSS LAB self-authored integration fixture')
  for(let index=0;index<pages;index++) {
    const page=doc.addPage([612,792])
    if(index===3) {
      const image=await doc.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64'))
      page.drawImage(image,{x:60,y:120,width:480,height:550});continue
    }
    page.drawText(index===0?'CPSS LAB — Learning Fixture'.replace('—','-'):index===1?'Chapter 1 Training Principles':'Chapter 2 Data Analysis',{x:48,y:730,font:bold,size:24})
    if(index===0)page.drawText('Self-authored sample for offline reader validation. Not examination material.',{x:48,y:680,font:regular,size:12})
    else {
      for(let row=0;row<10;row++) {
        page.drawText(`Left ${row+1}: Performance science studies training.`,{x:48,y:680-row*19,font:regular,size:11})
        page.drawText(`Right ${row+1}: Recovery supports adaptation.`,{x:326,y:680-row*19,font:regular,size:11})
      }
      page.drawText('A reliable learning record persists after restart.',{x:48,y:450,font:regular,size:13})
      page.drawText('Important interpretation in bold.',{x:48,y:420,font:bold,size:13})
      page.drawRectangle({x:90,y:170,width:380,height:170,borderColor:rgb(.2,.4,.3),borderWidth:1})
      page.drawLine({start:{x:100,y:185},end:{x:445,y:315},thickness:2,color:rgb(.2,.4,.3)})
      page.drawText('Work = force x distance',{x:150,y:255,font:regular,size:14})
      page.drawText(`Figure ${index}.1 Self-authored vector training model`,{x:90,y:147,font:regular,size:11})
      page.drawText('No network connection is required to read this content.',{x:48,y:95,font:regular,size:12})
    }
    page.drawText(String(index+1),{x:300,y:20,size:10,font:regular})
  }
  if(pages>=3) {
    const outline=doc.context.obj({Type:'Outlines',Count:3}),outlineRef=doc.context.register(outline)
    const part=doc.context.obj({Title:PDFString.of('Part I - Learning fixture'),Parent:outlineRef,Dest:[doc.getPage(1).ref,PDFName.of('Fit')],Count:2}),partRef=doc.context.register(part)
    const ch1=doc.context.obj({Title:PDFString.of('Chapter 1 Training Principles'),Parent:partRef,Dest:[doc.getPage(1).ref,PDFName.of('Fit')]}),ch1Ref=doc.context.register(ch1)
    const ch2=doc.context.obj({Title:PDFString.of('Chapter 2 Data Analysis'),Parent:partRef,Dest:[doc.getPage(2).ref,PDFName.of('Fit')],Prev:ch1Ref}),ch2Ref=doc.context.register(ch2)
    ch1.set(PDFName.of('Next'),ch2Ref);part.set(PDFName.of('First'),ch1Ref);part.set(PDFName.of('Last'),ch2Ref)
    outline.set(PDFName.of('First'),partRef);outline.set(PDFName.of('Last'),partRef);doc.catalog.set(PDFName.of('Outlines'),outlineRef)
  }
  await mkdir(dirname(file),{recursive:true});await writeFile(file,await doc.save())
  return file
}
