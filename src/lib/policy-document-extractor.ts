export type PolicyDocumentType='pdf'|'docx'|'text'|'form'|'genome';
export interface ExtractedPolicyDocument { sourceType:PolicyDocumentType;text:string;warnings:string[];pages?:number; }

const decoder=new TextDecoder('utf-8');
const latinDecoder=new TextDecoder('latin1');

function xmlText(xml:string){
 return xml
  .replace(/<w:tab\b[^>]*\/>/g,'\t')
  .replace(/<w:br\b[^>]*\/>/g,'\n')
  .replace(/<\/w:p>/g,'\n')
  .replace(/<[^>]+>/g,'')
  .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'")
  .replace(/\r/g,'').replace(/\n{3,}/g,'\n\n').trim();
}

async function inflateRaw(bytes:Uint8Array){
 if(typeof DecompressionStream==='undefined')throw new Error('DEFLATE_UNAVAILABLE');
 const ds=new DecompressionStream('deflate-raw');
 const stream=new Blob([bytes]).stream().pipeThrough(ds);
 return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Minimal dependency-free DOCX extractor. It reads Word XML only and never guesses missing text. */
async function extractDocx(buffer:ArrayBuffer){
 const bytes=new Uint8Array(buffer);const view=new DataView(buffer);let offset=0;
 while(offset+30<=bytes.length){
  if(view.getUint32(offset,true)!==0x04034b50){offset++;continue;}
  const flags=view.getUint16(offset+6,true);const method=view.getUint16(offset+8,true);const compressedSize=view.getUint32(offset+18,true);const nameLen=view.getUint16(offset+26,true);const extraLen=view.getUint16(offset+28,true);
  const name=decoder.decode(bytes.slice(offset+30,offset+30+nameLen));const start=offset+30+nameLen+extraLen;
  if(flags&0x08)throw new Error('DOCX_DATA_DESCRIPTOR_UNSUPPORTED');
  const compressed=bytes.slice(start,start+compressedSize);
  if(name==='word/document.xml'){
    const raw=method===0?compressed:method===8?await inflateRaw(compressed):(()=>{throw new Error('DOCX_COMPRESSION_UNSUPPORTED')})();
    const text=xmlText(decoder.decode(raw));
    if(!text)throw new Error('DOCX_NO_EXTRACTABLE_TEXT');
    return text;
  }
  offset=start+compressedSize;
 }
 throw new Error('DOCX_DOCUMENT_XML_NOT_FOUND');
}

function decodePdfLiteral(input:string){
 let out='';
 for(let i=0;i<input.length;i++){
  const c=input[i];if(c!=='\\'){out+=c;continue;}const n=input[++i];if(n===undefined)break;
  if(n==='n')out+='\n';else if(n==='r')out+='\r';else if(n==='t')out+='\t';else if(n==='b')out+='\b';else if(n==='f')out+='\f';else if(n==='('||n===')'||n==='\\')out+=n;
  else if(/[0-7]/.test(n)){let oct=n;for(let j=0;j<2&&/[0-7]/.test(input[i+1]||'');j++)oct+=input[++i];out+=String.fromCharCode(parseInt(oct,8));}
  else if(n==='\n'){}else out+=n;
 }
 return out;
}
function extractPdfTextOperators(content:string){
 const blocks=content.match(/BT[\s\S]*?ET/g)||[];const lines:string[]=[];
 for(const block of blocks){
  const parts:string[]=[];
  for(const m of block.matchAll(/\(((?:\\.|[^\\()])*)\)\s*Tj/g))parts.push(decodePdfLiteral(m[1]));
  for(const m of block.matchAll(/\[(.*?)\]\s*TJ/gs))for(const s of m[1].matchAll(/\(((?:\\.|[^\\()])*)\)/g))parts.push(decodePdfLiteral(s[1]));
  if(parts.length)lines.push(parts.join(''));
 }
 return lines.join('\n').replace(/\u0000/g,'').replace(/\n{3,}/g,'\n\n').trim();
}
/** Conservative PDF extractor for text PDFs. Unsupported/custom font encodings fail visibly instead of fabricating policy text. */
async function extractPdf(buffer:ArrayBuffer){
 const bytes=new Uint8Array(buffer);const raw=latinDecoder.decode(bytes);let text=extractPdfTextOperators(raw);
 const streamRe=/<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g;let match:RegExpExecArray|null;
 while((match=streamRe.exec(raw))){
  if(!/\/FlateDecode/.test(match[1]))continue;
  try{
   const start=match.index+match[0].indexOf(match[2]);const compressed=bytes.slice(start,start+match[2].length);
   if(typeof DecompressionStream==='undefined')continue;
   const ds=new DecompressionStream('deflate');const inflated=new Uint8Array(await new Response(new Blob([compressed]).stream().pipeThrough(ds)).arrayBuffer());
   const candidate=extractPdfTextOperators(latinDecoder.decode(inflated));if(candidate)text+=`\n${candidate}`;
  }catch{/* explicit quality check below decides whether extraction is usable */}
 }
 text=text.replace(/\n{3,}/g,'\n\n').trim();
 if(text.length<12)throw new Error('PDF_TEXT_EXTRACTION_REQUIRES_REVIEW_OR_OCR');
 return text;
}

export async function extractPolicyDocument(file:File):Promise<ExtractedPolicyDocument>{
 const name=file.name.toLowerCase();const warnings:string[]=[];
 if(name.endsWith('.docx'))return {sourceType:'docx',text:await extractDocx(await file.arrayBuffer()),warnings};
 if(name.endsWith('.pdf')){
  const text=await extractPdf(await file.arrayBuffer());
  warnings.push('PDF extraction is a draft evidence layer. Human review against highlighted source evidence remains mandatory.');
  return {sourceType:'pdf',text,warnings};
 }
 if(name.endsWith('.txt')||name.endsWith('.md')||file.type.startsWith('text/'))return {sourceType:'text',text:await file.text(),warnings};
 throw new Error('UNSUPPORTED_POLICY_DOCUMENT_TYPE');
}
