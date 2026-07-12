const $ = id => document.getElementById(id);

'use strict';
/* ============ Lexora AI shared helpers ============
   Loaded FIRST on every page (index, tools, scan, settings).
   Moved out of app-core/app-documents in Phase 2: one implementation, reused. */

function imgToCanvas(img, maxDim){
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const sc = Math.min(1, maxDim / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w*sc)); c.height = Math.max(1, Math.round(h*sc));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c;
}

async function fileToCanvas(file, maxDim){
  const img = new Image();
  const url = URL.createObjectURL(file);
  try{
    await new Promise((res, rej)=>{ img.onload = res; img.onerror = ()=>rej(new Error('bad image')); img.src = url; });
    return imgToCanvas(img, maxDim);
  } finally { URL.revokeObjectURL(url); }
}

async function ensureJsPDF(){
  if(window.jspdf) return true;
  try{
    await new Promise((res, rej)=>{
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }catch(e){ return false; }
  return !!window.jspdf;
}

function crc32(u8){
  if(!crc32.T){
    crc32.T = new Uint32Array(256);
    for(let n=0;n<256;n++){ let c=n; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320 ^ (c>>>1) : c>>>1; crc32.T[n]=c>>>0; }
  }
  let crc = 0xFFFFFFFF;
  for(let i=0;i<u8.length;i++) crc = crc32.T[(crc ^ u8[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function makeZip(files, mime){
  const enc = new TextEncoder();
  const chunks = [], central = [];
  let offset = 0;
  files.forEach(f=>{
    const nameB = enc.encode(f.name);
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);           /* UTF-8 names */
    lh.setUint16(8, 0, true);                /* stored, no compression */
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true);
    lh.setUint32(22, data.length, true);
    lh.setUint16(26, nameB.length, true);
    chunks.push(new Uint8Array(lh.buffer), nameB, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true); ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true);
    ch.setUint32(24, data.length, true);
    ch.setUint16(28, nameB.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + data.length;
  });
  let cdSize = 0;
  central.forEach(c=> cdSize += c.length);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(eocd.buffer)], {type: mime});
}

function buildDocx(pagesArr){   /* [{title, text}] */
  const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let body = '';
  pagesArr.forEach((pg, i)=>{
    if(i > 0) body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    if(pg.title) body += `<w:p><w:pPr><w:spacing w:after="160"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t xml:space="preserve">${esc(pg.title)}</w:t></w:r></w:p>`;
    String(pg.text).split(/\n+/).forEach(par=>{
      if(par.trim()) body += `<w:p><w:pPr><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr><w:r><w:t xml:space="preserve">${esc(par.trim())}</w:t></w:r></w:p>`;
    });
  });
  const documentXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    body + '<w:sectPr/></w:body></w:document>';
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
  const rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';
  return makeZip([
    {name:'[Content_Types].xml', data: contentTypes},
    {name:'_rels/.rels', data: rels},
    {name:'word/document.xml', data: documentXml}
  ], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
