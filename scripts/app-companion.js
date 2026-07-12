/* ---------------- AI backend ---------------- */
function companionLang(){
  const v = currentVoice();
  const code = v ? v.lang : 'en';
  if(/^en/i.test(code)) return 'English';
  try{ return new Intl.DisplayNames(['en'], {type:'language'}).of(code.split('-')[0]) || 'English'; }
  catch(e){ return 'English'; }
}
/* Build the best possible document context for a question.
   Small docs: send everything. Big docs: current area + parts matching the question. */
function buildContext(question){
  const full = lines.map(l=>`[p${l.page}] ${l.text}`).join('\n');
  if(full.length <= 8000) return full;
  const parts = [];
  parts.push('DOCUMENT START:\n' + full.slice(0, 500));
  if(current >= 0 && sentences.length){
    parts.push('CURRENT READING POSITION:\n' + sentences.slice(Math.max(0,current-2), current+3).map(s=>`[p${s.page}] ${s.text}`).join('\n'));
  }
  const words = (question||'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(w=>w.length>3);
  if(words.length){
    const scored = [];
    lines.forEach((l,i)=>{
      const t = l.text.toLowerCase();
      const score = words.reduce((n,w)=> n + (t.includes(w)?1:0), 0);
      if(score>0) scored.push({i, score});
    });
    scored.sort((a,b)=>b.score-a.score);
    const picked = new Set();
    scored.slice(0,12).forEach(s=>{ for(let k=Math.max(0,s.i-1); k<=Math.min(lines.length-1,s.i+1); k++) picked.add(k); });
    if(picked.size){
      const rel = [...picked].sort((a,b)=>a-b).map(i=>`[p${lines[i].page}] ${lines[i].text}`).join('\n');
      parts.push('RELEVANT PARTS FOUND FOR THIS QUESTION:\n' + rel);
    }
  }
  parts.push('DOCUMENT END:\n' + full.slice(-500));
  return parts.join('\n\n').slice(0, 8500);
}

/* Fresh access token; forceRefresh asks Supabase for a new one (stale-token fix, e.g. Brave) */
async function authToken(forceRefresh){
  if(!sb) return null;
  try{
    if(forceRefresh){
      const {data} = await sb.auth.refreshSession();
      if(data && data.session) return data.session.access_token;
    }
    const {data:{session:s}} = await sb.auth.getSession();
    return s ? s.access_token : null;
  }catch(e){ return null; }
}
async function askAI(question, context){
  let token = await authToken();
  if(!token) throw new Error('Not logged in');
  const call = t => fetch(CONFIG.API_URL, {
    method:'POST',
    headers:{'content-type':'application/json', 'authorization':'Bearer '+t},
    body: JSON.stringify({question, context, docName, history: chatHistory.slice(-6), lang: companionLang(),
      tier: aiTier, optimize: aiSaver})
  });
  let res = await call(token);
  if(res.status === 401){                     /* stale token — refresh once and retry */
    token = await authToken(true);
    if(token) res = await call(token);
  }
  if(!res.ok){
    let msg = 'server '+res.status;
    try{ const j = await res.json(); if(j.error) msg = j.error; }catch(e){}
    if(res.status === 401) msg = 'Your login session has expired — tap 🔑 in the top bar and login again.';
    throw new Error(msg);
  }
  const d = await res.json();
  chatHistory.push({role:'user', content:question});
  chatHistory.push({role:'assistant', content:d.answer});
  updateBalance(d.tokens_left);
  return d.answer;
}

/* ---------------- Companion conversation ---------------- */
function localTopicSearch(q){
  const needle = q.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  if(needle.length < 3) return -1;
  let idx = sentences.findIndex(s=>s.text.toLowerCase().includes(needle));
  if(idx >= 0) return idx;
  const words = needle.split(' ').filter(w=>w.length>3);
  if(!words.length) return -1;
  let best = -1, bestScore = 0;
  sentences.forEach((s,i)=>{
    const t = s.text.toLowerCase();
    const score = words.reduce((n,w)=> n + (t.includes(w)?1:0), 0);
    if(score > bestScore){ bestScore = score; best = i; }
  });
  return bestScore >= Math.max(1, Math.ceil(words.length/2)) ? best : -1;
}
function handleStartReply(t){
  const s = t.toLowerCase().trim();
  /* only treat as "from the beginning" when the message is really just that */
  if(/^(from\s+)?(the\s+)?(first\s+page|beginning|top|start|start from the beginning|from the start)\.?$/.test(s)){
    awaitingStart=false; say('From the top it is!'); playing=true; setPlayBtn(); speakLine(0); return true;
  }
  const isQuestion = /\?/.test(t)
    || /^(what|which|who|why|how|when|where|can|could|would|should|do|does|did|is|are|explain|tell|summari|translate)\b/i.test(t.trim())
    || t.trim().split(/\s+/).length > 5;
  if(!isQuestion){
    const idx = localTopicSearch(t);
    if(idx >= 0){
      awaitingStart = false;
      const found = `Found it — "${t}" appears on page ${sentences[idx].page}. Starting there.`;
      say(found); speakText(found, ()=>{ playing=true; setPlayBtn(); speakLine(idx); });
      return true;
    }
    if(!companionAvailable()){
      say(`I could not find "${t}". Try another topic, a page number, or say "from the first page".`);
      return true;
    }
  }
  return false;
}
async function explainPage(p){
  const sents = sentences.filter(x=>x.page===p);
  if(!sents.length){ say(`Page ${p} has no readable text.`); return; }
  if(!companionAvailable()){ say(session ? 'Turn the 🤖 companion on first.' : 'Login to unlock explanations.'); return; }
  const wasPlaying = playing;
  if(playing) togglePlay();
  const idx = sentences.findIndex(x=>x.page===p);
  if(idx>=0){ current = idx; positionMarker(lines[sentences[idx].parts[0].line]); scrollToLine(lines[sentences[idx].parts[0].line]); updateProgress(); }
  sayProgress('Thinking…');
  try{
    const txt = sents.map(x=>x.text).join(' ').slice(0, 7000);
    const ans = await askAI(`Explain page ${p} of the document simply and briefly.`, txt);
    removeProgress();
    say(ans);
    speakText(ans, ()=>{ if(wasPlaying){ playing=true; setPlayBtn(); speakLine(current); } });
  }catch(e){ removeProgress(); say('Could not explain ('+e.message+').'); }
}

let lastFoundIdx = -1;
function searchAndRead(q){
  const idx = localTopicSearch(q);
  if(idx >= 0){
    awaitingStart = false;
    lastFoundIdx = idx;
    say(`Found it on page ${sentences[idx].page} — reading from there.`);
    playing = true; setPlayBtn(); speakLine(idx);
  }else{
    lastFoundIdx = -1;
    say(`I could not find "${q}" in the document.`);
    speakText(`I could not find ${q} in the document.`);
  }
  return true;
}

function handleCommand(t){
  const s = t.toLowerCase().trim();
  /* "read from there" / "start from there / that" — use the last found spot */
  if(/\b(from|at)\s+(there|that|here|it)\b/.test(s) || /^(read|start|continue|go|begin)\s+(it|on|reading)?\s*$/.test(s)){
    if(lastFoundIdx >= 0){ awaitingStart=false; say('Reading from there.'); playing=true; setPlayBtn(); speakLine(lastFoundIdx); return true; }
  }
  /* explain / summarize a page (either word order: "page 5 and explain" or "explain page 5") */
  const pgEx = s.match(/page\s+(\d+)\s+and\s+(?:explain|summari[sz]e)/) || s.match(/(?:explain|summari[sz]e)\s+(?:the\s+)?(\d+)(?:st|nd|rd|th)?\s+page/) || s.match(/(?:explain|summari[sz]e)\s+page\s+(\d+)/);
  if(pgEx){ explainPage(parseInt(pgEx[1])); return true; }
  if(/^(?:explain|summari[sz]e)\s+(?:this\s+)?page$/.test(s)){
    explainPage(sentences[Math.max(current,0)]?.page || 1); return true;
  }
  /* page number: "page 17", "page number 17", "pg 17", "17 page", "17th page" */
  const pageM = s.match(/(?:page|pg)\.?\s*(?:number\s*|no\.?\s*|#\s*)?(\d+)/) || s.match(/\b(\d+)(?:st|nd|rd|th)?\s+page\b/);
  if(pageM){
    const p = parseInt(pageM[1]);
    /* if they also named a topic, jump to that topic (searching whole doc) */
    const topic = s.replace(/\b(read|reading|go|going|to|start|starting|begin|from|at|the|page|pg|number|no|st|nd|rd|th|can|could|we|you|i|please|part|section|on|of)\b/g,' ')
                    .replace(/\d+/g,' ').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
    if(topic.length > 3){
      const idx = localTopicSearch(topic);
      if(idx >= 0){ lastFoundIdx = idx; awaitingStart=false; say(`Found "${topic}" on page ${sentences[idx].page} — reading from there.`); playing=true; setPlayBtn(); speakLine(idx); return true; }
      say(`I couldn't find "${topic}", so I'll start at page ${p}.`);
    }
    if(!goPage(p)) say(`I don't see a page ${p} — this document has ${numPages} pages.`);
    else { lastFoundIdx = sentences.findIndex(x=>x.page===p); awaitingStart=false; if(topic.length<=3) say(`Reading from page ${p}.`); playing=true; setPlayBtn(); const si=sentences.findIndex(x=>x.page===p); if(si>=0) speakLine(si); }
    return true;
  }
  const searchM = s.match(/^(?:search|find|look)(?:\s+for)?\s+(.+)$/);
  if(searchM) return searchAndRead(searchM[1]);
  /* "start/read from <topic>", "can we start from the red blood cells section" */
  const fromM = s.match(/(?:can (?:we|you) )?(?:start|read|begin|go|jump)\s+(?:reading\s+)?(?:from|at|to)\s+(?:the\s+)?(.+?)(?:\s+section|\s+part|\s+chapter)?$/);
  if(fromM && fromM[1].length > 3 && !/^(there|here|that|it|first|top|beginning|start)$/.test(fromM[1].trim())){
    return searchAndRead(fromM[1].trim());
  }
  const goM = s.match(/^go to\s+(.+)$/);
  if(goM) return searchAndRead(goM[1].replace(/^the\s+/,''));
  if(/^(play|start|read|resume|continue)$/.test(s)){ if(!playing) togglePlay(); say('Reading.'); return true; }
  if(/^(pause|stop|wait|halt)$/.test(s)){ if(playing) togglePlay(); say('Paused. Say "play" when you are ready.'); return true; }
  if(/^(slower|slow down)$/.test(s)){ const o=$('rateSel'); o.selectedIndex=Math.max(0,o.selectedIndex-1); if(playing) speakLine(current); say(`chd: ${o.value}×.`); return true; }
  if(/^(faster|speed up)$/.test(s)){ const o=$('rateSel'); o.selectedIndex=Math.min(o.options.length-1,o.selectedIndex+1); if(playing) speakLine(current); say(`Speed: ${o.value}×.`); return true; }
  if(/^(next|skip)$/.test(s)){ jumpTo(current+1); if(!playing) togglePlay(); return true; }
  if(/^(back|previous|repeat|again)$/.test(s)){ jumpTo(/repeat|again/.test(s)?current:current-1); if(!playing) togglePlay(); return true; }
  if(/^explain( this| that)?$/.test(s)){ if(current>=0 && sentences[current]){ selText=sentences[current].text; selLine=sentences[current].parts[0].line; $('selExplain').click(); } else say('Start reading first, then ask me to explain.'); return true; }
  return false;
}
async function sendChat(){
  const t = $('chatInput').value.trim();
  if(!t) return;
  $('chatInput').value='';
  say(t,'user');
  if(handleCommand(t)) return;
  if(awaitingStart && lines.length){ if(handleStartReply(t)) return; }
  if(companionAvailable()){
    const wasPlaying = playing;
    if(playing) togglePlay();
    sayProgress('Thinking…');
    try{
      const ans = await askAI(t, buildContext(t));
      removeProgress();
      say(ans);
      speakText(ans, ()=>{ if(wasPlaying){ playing=true; setPlayBtn(); speakLine(current+1); } });
    }catch(e){
      removeProgress();
      say('I could not reach my brain ('+e.message+').');
    }
  }else{
    say(session
      ? 'Companion is off — toggle 🤖 in the top bar to chat. Commands: play, pause, slower, faster, next, back, read page N.'
      : 'Login to chat with me! Without login I understand: play, pause, slower, faster, next, back, read page N.');
  }
}
$('sendBtn').addEventListener('click', sendChat);
$('chatInput').addEventListener('keydown', e=>{ if(e.key==='Enter') sendChat(); });

/* ---------------- Mic — hybrid speech recognition ----------------
   1) Browser SpeechRecognition (Chrome/Edge): free and instant.
   2) If unsupported (Brave, Firefox…) or it fails with an unrecoverable
      error, fall back automatically to recording the mic and transcribing
      on the server (Cloudflare Worker → OpenAI), no user action needed. */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null, listening = false, srBroken = !SR;
let mediaRec = null, mediaChunks = [], mediaStream = null, mediaTimer = null;
if(SR){
  rec = new SR();
  rec.lang = 'en-IN';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  rec.onresult = e=>{ $('chatInput').value = e.results[0][0].transcript; sendChat(); };
  rec.onend = ()=> setListening(false);
  rec.onerror = e=>{
    setListening(false);
    if(e.error === 'not-allowed'){ say('Please allow microphone access in your browser to talk to me.','sys'); return; }
    if(e.error === 'no-speech' || e.error === 'aborted') return;
    /* network / service-not-allowed / audio-capture etc. → this browser cannot do it natively */
    console.warn('SpeechRecognition failed:', e.error, '→ switching to cloud transcription');
    srBroken = true;
    startServerSTT();   /* take over seamlessly */
  };
}
function setListening(on){
  listening = on;
  $('micBtn').classList.toggle('listening', on);
  $('micBar').classList.toggle('listening', on);
}
function startListening(){
  if(listening){ stopAnyListening(); return; }
  if(playing) togglePlay();
  cancelSpeech2();
  if(rec && !srBroken){
    setListening(true);
    try{ rec.start(); }catch(e){ srBroken = true; setListening(false); startServerSTT(); }
  }else{
    startServerSTT();
  }
}
function stopAnyListening(){
  if(mediaRec && mediaRec.state === 'recording'){ clearTimeout(mediaTimer); mediaRec.stop(); return; }
  if(rec){ try{ rec.stop(); }catch(e){} }
  setListening(false);
}
async function startServerSTT(){
  if(!session || !configured){ say('This browser needs cloud voice recognition — please login first, then the 🎤 will work.','sys'); return; }
  if(!navigator.mediaDevices || !window.MediaRecorder){ say('Microphone recording is not available in this browser.','sys'); return; }
  try{ mediaStream = await navigator.mediaDevices.getUserMedia({audio:true}); }
  catch(e){ say('Please allow microphone access in your browser to talk to me.','sys'); return; }
  mediaChunks = [];
  const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
             : MediaRecorder.isTypeSupported('audio/mp4')  ? 'audio/mp4' : '';
  try{ mediaRec = new MediaRecorder(mediaStream, mime ? {mimeType:mime} : undefined); }
  catch(e){ mediaStream.getTracks().forEach(t=>t.stop()); say('Recording is not supported here.','sys'); return; }
  mediaRec.ondataavailable = e=>{ if(e.data && e.data.size) mediaChunks.push(e.data); };
  mediaRec.onstop = async ()=>{
    if(mediaStream){ mediaStream.getTracks().forEach(t=>t.stop()); mediaStream = null; }
    setListening(false);
    const blob = new Blob(mediaChunks, {type: mime || 'audio/webm'});
    mediaChunks = [];
    if(blob.size < 1500) return;              /* too short to contain speech */
    sayProgress('👂 Understanding…');
    try{
      const call = t => fetch(CONFIG.API_URL + '/stt', {
        method:'POST',
        headers:{ authorization:'Bearer '+t, 'content-type': blob.type },
        body: blob
      });
      let token = await authToken();
      let r = token ? await call(token) : null;
      if(!r || r.status === 401){             /* stale token — refresh once and retry */
        token = await authToken(true);
        if(token) r = await call(token);
      }
      const j = r ? await r.json().catch(()=>null) : null;
      removeProgress();
      if(r && r.ok && j && j.text){ $('chatInput').value = j.text; sendChat(); }
      else if(r && r.status === 401) say('Your login session has expired — tap 🔑 in the top bar and login again, then the mic will work.','sys');
      else say((j && j.error) || 'I could not hear that clearly — please try again.','sys');
    }catch(e){ removeProgress(); say('Voice transcription failed ('+e.message+').','sys'); }
  };
  setListening(true);
  say('🎙 Listening… tap the mic again when you finish speaking.','sys');
  mediaRec.start();
  clearTimeout(mediaTimer);
  mediaTimer = setTimeout(()=>{ if(mediaRec && mediaRec.state === 'recording') mediaRec.stop(); }, 20000);
}
$('micBtn').addEventListener('click', startListening);
$('micBar').addEventListener('click', startListening);
$('moreBtn').addEventListener('click', ()=> $('playbar').classList.toggle('expanded'));

