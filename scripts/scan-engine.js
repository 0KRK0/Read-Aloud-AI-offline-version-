'use strict';
/* ============ Scan engine: paper detection, perspective fix, filters ============
   Plain canvas math, no CV library, works offline.
   Pure functions, shared by the in-app camera (app-documents.js) and scan.html. */

function detectQuad(c){
  const inset = f => [
    {x:c.width*f, y:c.height*f}, {x:c.width*(1-f), y:c.height*f},
    {x:c.width*(1-f), y:c.height*(1-f)}, {x:c.width*f, y:c.height*(1-f)}
  ];
  try{
    const DW = 240, sc = DW / c.width, DH = Math.max(24, Math.round(c.height*sc));
    const t = document.createElement('canvas'); t.width = DW; t.height = DH;
    const tctx = t.getContext('2d');
    tctx.drawImage(c, 0, 0, DW, DH);
    const d = tctx.getImageData(0, 0, DW, DH).data;
    const N = DW*DH, g = new Uint8Array(N);
    for(let i=0;i<N;i++) g[i] = (d[i*4]*3 + d[i*4+1]*6 + d[i*4+2])/10 | 0;
    /* Otsu threshold */
    const hist = new Array(256).fill(0);
    for(let i=0;i<N;i++) hist[g[i]]++;
    let sum=0; for(let i=0;i<256;i++) sum += i*hist[i];
    let sumB=0, wB=0, best=0, thr=127;
    for(let i=0;i<256;i++){
      wB += hist[i]; if(!wB) continue;
      const wF = N - wB; if(!wF) break;
      sumB += i*hist[i];
      const mB = sumB/wB, mF = (sum-sumB)/wF, between = wB*wF*(mB-mF)*(mB-mF);
      if(between > best){ best = between; thr = i; }
    }
    const mask = new Uint8Array(N);
    let brightN = 0;
    for(let i=0;i<N;i++){ if(g[i] > thr){ mask[i]=1; brightN++; } }
    if(brightN < N*0.10 || brightN > N*0.985) return inset(0.02);   /* no clear paper region */
    /* largest bright connected blob (BFS) */
    const lbl = new Int32Array(N).fill(-1);
    let bestSize = 0, bestId = -1, id = 0;
    const qx = new Int32Array(N);
    for(let s=0;s<N;s++){
      if(!mask[s] || lbl[s]>=0) continue;
      let head=0, tail=0, size=0;
      qx[tail++]=s; lbl[s]=id;
      while(head<tail){
        const p = qx[head++]; size++;
        const px = p%DW, py = (p/DW)|0;
        if(px>0 && mask[p-1] && lbl[p-1]<0){ lbl[p-1]=id; qx[tail++]=p-1; }
        if(px<DW-1 && mask[p+1] && lbl[p+1]<0){ lbl[p+1]=id; qx[tail++]=p+1; }
        if(py>0 && mask[p-DW] && lbl[p-DW]<0){ lbl[p-DW]=id; qx[tail++]=p-DW; }
        if(py<DH-1 && mask[p+DW] && lbl[p+DW]<0){ lbl[p+DW]=id; qx[tail++]=p+DW; }
      }
      if(size > bestSize){ bestSize = size; bestId = id; }
      id++;
    }
    if(bestSize < N*0.10) return inset(0.02);
    /* extreme corners of the blob */
    let tl=null, tr=null, br=null, bl=null, vtl=1e9, vtr=-1e9, vbr=-1e9, vbl=-1e9;
    for(let p=0;p<N;p++){
      if(lbl[p] !== bestId) continue;
      const x = p%DW, y = (p/DW)|0;
      if(x+y < vtl){ vtl = x+y; tl = {x,y}; }
      if(x-y > vtr){ vtr = x-y; tr = {x,y}; }
      if(x+y > vbr){ vbr = x+y; br = {x,y}; }
      if(y-x > vbl){ vbl = y-x; bl = {x,y}; }
    }
    const up = p => ({x: Math.max(0, Math.min(c.width,  p.x/sc)), y: Math.max(0, Math.min(c.height, p.y/sc))});
    const quad = [up(tl), up(tr), up(br), up(bl)];
    /* sanity: reject degenerate quads */
    const area = Math.abs(
      (quad[1].x-quad[0].x)*(quad[3].y-quad[0].y) - (quad[3].x-quad[0].x)*(quad[1].y-quad[0].y)
    );
    if(area < c.width*c.height*0.12) return inset(0.02);
    quad.found = true;      /* real page detected (fallback insets stay undefined) */
    return quad;
  }catch(e){ return inset(0.02); }
}

function warpPerspective(src, corners, maxOut){
  const [p0,p1,p2,p3] = corners;             /* TL, TR, BR, BL */
  const dist = (a,b)=>Math.hypot(a.x-b.x, a.y-b.y);
  let W = Math.max(dist(p0,p1), dist(p3,p2));
  let H = Math.max(dist(p0,p3), dist(p1,p2));
  const s = Math.min(1, maxOut / Math.max(W,H));
  W = Math.max(8, Math.round(W*s)); H = Math.max(8, Math.round(H*s));
  const x0=p0.x,y0=p0.y, x1=p1.x,y1=p1.y, x2=p2.x,y2=p2.y, x3=p3.x,y3=p3.y;
  const dx1=x1-x2, dx2=x3-x2, dy1=y1-y2, dy2=y3-y2;
  const sx=x0-x1+x2-x3, sy=y0-y1+y2-y3;
  const den=(dx1*dy2 - dx2*dy1) || 1e-9;
  const g=(sx*dy2 - dx2*sy)/den, h=(dx1*sy - sx*dy1)/den;
  const a=x1-x0+g*x1, b=x3-x0+h*x3, cc=x0;
  const d2=y1-y0+g*y1, e=y3-y0+h*y3, f=y0;
  const sw=src.width, sh=src.height;
  const sd = src.getContext('2d').getImageData(0,0,sw,sh).data;
  const out = document.createElement('canvas'); out.width=W; out.height=H;
  const octx = out.getContext('2d');
  const odata = octx.createImageData(W,H), od = odata.data;
  for(let j=0;j<H;j++){
    const v=j/H;
    for(let i=0;i<W;i++){
      const u=i/W, wq=g*u+h*v+1;
      let px=(a*u+b*v+cc)/wq, py=(d2*u+e*v+f)/wq;
      px = px<0?0:(px>sw-1.001?sw-1.001:px);
      py = py<0?0:(py>sh-1.001?sh-1.001:py);
      const xi=px|0, yi=py|0, fx=px-xi, fy=py-yi;
      const i00=(yi*sw+xi)*4, i10=i00+4, i01=i00+sw*4, i11=i01+4;
      const oi=(j*W+i)*4;
      od[oi]  = sd[i00]*(1-fx)*(1-fy) + sd[i10]*fx*(1-fy) + sd[i01]*(1-fx)*fy + sd[i11]*fx*fy;
      od[oi+1]= sd[i00+1]*(1-fx)*(1-fy) + sd[i10+1]*fx*(1-fy) + sd[i01+1]*(1-fx)*fy + sd[i11+1]*fx*fy;
      od[oi+2]= sd[i00+2]*(1-fx)*(1-fy) + sd[i10+2]*fx*(1-fy) + sd[i01+2]*(1-fx)*fy + sd[i11+2]*fx*fy;
      od[oi+3]=255;
    }
  }
  octx.putImageData(odata,0,0);
  return out;
}

function applyScanFilter(canvas, mode){
  if(mode === 'original') return canvas;
  const ctx = canvas.getContext('2d');
  const im = ctx.getImageData(0,0,canvas.width,canvas.height), d = im.data;
  const W = canvas.width, H = canvas.height, n = W*H;
  if(mode === 'enhance'){
    const hist = new Array(256).fill(0);
    for(let i=0;i<n;i++) hist[(d[i*4]*3 + d[i*4+1]*6 + d[i*4+2])/10 | 0]++;
    let acc=0, lo=0, hi=255;
    const loT = n*0.02, hiT = n*0.99;
    for(let i=0;i<256;i++){ acc += hist[i]; if(acc <= loT) lo = i; if(acc <= hiT) hi = i; }
    const range = Math.max(24, hi-lo);
    for(let i=0;i<n*4;i+=4){
      d[i]   = Math.max(0, Math.min(255, (d[i]-lo)  *255/range));
      d[i+1] = Math.max(0, Math.min(255, (d[i+1]-lo)*255/range));
      d[i+2] = Math.max(0, Math.min(255, (d[i+2]-lo)*255/range));
    }
  }else if(mode === 'bw'){
    const g = new Uint8Array(n);
    for(let i=0;i<n;i++) g[i] = (d[i*4]*3 + d[i*4+1]*6 + d[i*4+2])/10;
    const integ = new Float64Array((W+1)*(H+1));
    for(let y=0;y<H;y++){
      let rs = 0;
      for(let x=0;x<W;x++){ rs += g[y*W+x]; integ[(y+1)*(W+1)+x+1] = integ[y*(W+1)+x+1] + rs; }
    }
    const win = Math.max(8, (Math.min(W,H)/16)|0);
    for(let y=0;y<H;y++){
      const y0=Math.max(0,y-win), y1=Math.min(H-1,y+win);
      for(let x=0;x<W;x++){
        const x0=Math.max(0,x-win), x1=Math.min(W-1,x+win);
        const area=(x1-x0+1)*(y1-y0+1);
        const s=integ[(y1+1)*(W+1)+x1+1]-integ[y0*(W+1)+x1+1]-integ[(y1+1)*(W+1)+x0]+integ[y0*(W+1)+x0];
        const v = g[y*W+x]*area < s*0.90 ? 0 : 255;
        const i4=(y*W+x)*4; d[i4]=d[i4+1]=d[i4+2]=v;
      }
    }
  }
  ctx.putImageData(im,0,0);
  return canvas;
}

function rotate90(c){
  const o = document.createElement('canvas');
  o.width = c.height; o.height = c.width;
  const ctx = o.getContext('2d');
  ctx.translate(o.width, 0); ctx.rotate(Math.PI/2);
  ctx.drawImage(c, 0, 0);
  return o;
}
