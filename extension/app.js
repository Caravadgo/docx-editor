console.info('[ext] FSA:', 'showOpenFilePicker' in window, 'showSaveFilePicker' in window);

const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main',XNS='http://www.w3.org/XML/1998/namespace';
let gDirty=1,zip,doc,body,fname='',paras=[],starts=[],sec=0,styleName={},styleId={1:'Heading1',2:'Heading2',3:'Heading3'},cur=null,hits=[],hk=-1,fs=19;
const $=id=>document.getElementById(id);
const kids=(n,ln)=>Array.from(n.childNodes).filter(c=>c.localName===ln);
const mk=n=>doc.createElementNS(W,'w:'+n);
function pText(p){let s='';for(const n of p.getElementsByTagNameNS(W,'*')){if(n.localName==='t')s+=n.textContent;else if(n.localName==='tab')s+='\t';else if(n.localName==='br'&&n.getAttributeNS(W,'type')!=='page')s+='\n'}return s}
function setText(p,val){
  const runs=kids(p,'r');
  for(const r of runs)for(const c of Array.from(r.childNodes))if(['t','tab'].includes(c.localName)||(c.localName==='br'&&c.getAttributeNS(W,'type')!=='page'))r.removeChild(c);
  let r0=runs[0];if(!r0){r0=mk('r');p.appendChild(r0)}
  for(const r of runs.slice(1))if(!Array.from(r.childNodes).some(c=>c.localName!=='rPr'))r.parentNode.removeChild(r);
  val.split('\n').forEach((line,i)=>{if(i)r0.appendChild(mk('br'));line.split('\t').forEach((part,j)=>{if(j)r0.appendChild(mk('tab'));if(part){const t=mk('t');t.setAttributeNS(XNS,'xml:space','preserve');t.textContent=part;r0.appendChild(t)}})});
}
function getStyle(p){const pPr=kids(p,'pPr')[0];if(!pPr)return'';const ps=kids(pPr,'pStyle')[0];return ps?ps.getAttributeNS(W,'val'):''}
function setStyle(p,id){let pPr=kids(p,'pPr')[0];if(!pPr){pPr=mk('pPr');p.insertBefore(pPr,p.firstChild)}let ps=kids(pPr,'pStyle')[0];if(!id){if(ps)pPr.removeChild(ps);return}if(!ps){ps=mk('pStyle');pPr.insertBefore(ps,pPr.firstChild)}ps.setAttributeNS(W,'w:val',id)}
function lvl(p){
  const pPr=kids(p,'pPr')[0];
  if(pPr){const o=kids(pPr,'outlineLvl')[0];if(o){const v=parseInt(o.getAttributeNS(W,'val'),10);if(v>=0&&v<=2)return v+1}}
  const s=getStyle(p);if(!s)return 0;
  const nm=(styleName[s]||'').replace(/[\u00a0\s]+/g,' ').trim().toLowerCase();
  for(const k of [1,2,3])if(s===styleId[k])return k;
  const m=/^(?:heading|заголовок|h)[\s-]*([1-3])$/.exec(nm);
  if(m)return +m[1];
  if(/^(chapter|part|часть|глава|пролог|эпилог)$/.test(nm))return 1;
  return 0;
}
function collect(){paras=Array.from(body.getElementsByTagNameNS(W,'p'));gDirty=1}
const CH_RE=/^(глава|часть|книга|пролог|эпилог|послесловие|интермедия|приложение)\b/i;
const CH_SEP=/^(\*{2,}|\* ?\* ?\*|—+|#+|§+)$/;
function pFmt(p){
  const pPr=kids(p,'pPr')[0];let jc='',outline=-1;
  if(pPr){const j=kids(pPr,'jc')[0];if(j)jc=j.getAttributeNS(W,'val');
    const o=kids(pPr,'outlineLvl')[0];if(o)outline=parseInt(o.getAttributeNS(W,'val'),10)}
  let bold=false,maxSz=0;
  for(const r of p.getElementsByTagNameNS(W,'r')){
    const rPr=kids(r,'rPr')[0];if(!rPr)continue;
    if(kids(rPr,'b')[0])bold=true;
    const sz=kids(rPr,'sz')[0];if(sz){const v=parseInt(sz.getAttributeNS(W,'val'),10);if(v>maxSz)maxSz=v}
  }
  return {jc,bold,maxSz,outline};
}
function bodyFontSize(){
  const c=[];
  paras.forEach(p=>{const r=p.getElementsByTagNameNS(W,'r')[0];if(!r)return;const rPr=kids(r,'rPr')[0];if(!rPr)return;
    const sz=kids(rPr,'sz')[0];if(!sz)return;const v=parseInt(sz.getAttributeNS(W,'val'),10);if(v>0)c.push(v)});
  if(!c.length)return 0;
  c.sort((a,b)=>a-b);return c[Math.floor(c.length/2)];
}
function isChapterText(t){
  const x=(t||'').trim();
  if(!x||x.length>120||CH_SEP.test(x))return false;
  return CH_RE.test(x);
}
function chapterIdx(){
  if(!paras.length)return [];
  const byLvl=[];
  paras.forEach((p,i)=>{if(lvl(p)===1)byLvl.push(i)});
  const byText=[];
  paras.forEach((p,i)=>{if(isChapterText(pText(p)))byText.push(i)});
  if(byLvl.length>=2)return byLvl;
  if(byText.length>=2)return byText;
  const base=bodyFontSize(),cut=base?base*1.15:0;
  if(!cut)return [];
  const byFmt=[];
  paras.forEach((p,i)=>{
    const t=pText(p).trim();
    if(!t||t.length>80||CH_SEP.test(t))return;
    const f=pFmt(p);
    if(f.jc==='center'&&f.bold&&f.maxSz>=cut)byFmt.push(i);
  });
  return byFmt.length>=2?byFmt:[];
}
function computeSections(){
  starts=[];
  if(!paras.length)return;
  const src=chapterIdx();
  if(!src.length){starts=[0];return}
  for(const i of src)if(starts[starts.length-1]!==i)starts.push(i);
  if(starts[0]!==0)starts.unshift(0);
}
function restructure(){collect();computeSections()}
function secOf(p){const i=Math.max(0,paras.indexOf(p));let s=0;starts.forEach((x,k)=>{if(x<=i)s=k});return s}
let _meas=null;
function measurer(){
  if(_meas&&_meas.isConnected)return _meas;
  const w=document.createElement('div');w.setAttribute('aria-hidden','true');
  w.style.cssText='position:absolute;left:0;top:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none';
  const m=document.createElement('textarea');m.tabIndex=-1;m.rows=1;m.readOnly=true;
  w.appendChild(m);(document.querySelector('main')||document.body).appendChild(w);_meas=m;return m;
}
function grow(t){
  // Высота через measurer (без height:auto-мерцания).
  // При уменьшении высоты компенсируем скролл: верх стоит, низ подтягивается.
  const oldH = t.offsetHeight || 0;
  const focused = document.activeElement === t;
  const anchorTop = focused && oldH > 0 ? t.getBoundingClientRect().top : 0;

  const cw = t.getBoundingClientRect().width;
  let newH = 0;
  if (cw > 0) {
    const m = measurer();
    m.className = t.className;
    m.style.width = cw + 'px';
    m.style.height = '0px';
    m.value = t.value || ' ';
    newH = m.scrollHeight;
  }
  if (!(newH > 0)) {
    t.style.height = 'auto';
    newH = t.scrollHeight;
  }

  if (newH > 0 && t.style.height !== newH + 'px') {
    t.style.height = newH + 'px';

    if (focused && oldH > 0 && newH < oldH) {
      const newTop = t.getBoundingClientRect().top;
      const delta = newTop - anchorTop;
      if (Math.abs(delta) > 0.5) {
        window.scrollBy(0, delta);
      }
      // Очень короткое подавление, чтобы ensureCaret не успел дёрнуть
      if (typeof tapUntil !== 'undefined') tapUntil = Date.now() + 60;
    }
  }
}
function mkItem(p){
  const t=document.createElement('textarea');t._p=p;t.rows=1;t.value=pText(p);const hc=lvl(p)?'h'+lvl(p):'';t.className=hc;t.spellcheck=false;
  const w=document.createElement('div');w.className='pw '+hc;const m=document.createElement('div');m.className='mir '+hc;
  w.append(m,t);t._w=w;t._m=m;w._t=t;if(bmHas(p))w.classList.add('bm');
  t._last=t.value;
  t.addEventListener('input',()=>{gDirty=1;const b=t._last;t._last=t.value;setText(p,t.value);grow(t);recText(p,b,t.value);refreshMirror(t)});
  t.addEventListener('focus',()=>{cur=t});
  ['input','click','keyup','focus','select','touchend'].forEach(ev=>t.addEventListener(ev,schedSave));
  t.addEventListener('beforeinput',e=>{
    if(e.inputType==='insertLineBreak'||e.inputType==='insertParagraph'){e.preventDefault();split(t)}
    else if(e.inputType==='historyUndo'){e.preventDefault();undo()}
    else if(e.inputType==='historyRedo'){e.preventDefault();redo()}
    else if(e.inputType==='deleteContentBackward'&&t.selectionStart===0&&t.selectionEnd===0){e.preventDefault();merge(t)}
  });
  const pick=e=>{if(!fragMode)return;e.preventDefault();e.stopPropagation();onFragTap(p)};
  w.addEventListener('click',pick,true);
  t.addEventListener('mousedown',e=>{if(fragMode){e.preventDefault();onFragTap(p)}});
  t.addEventListener('touchstart',e=>{if(fragMode){e.preventDefault();onFragTap(p)}},{passive:false});
  refreshMirror(t);
  return t;
}
let readMode=false;
function render(){
  gDirty=1;bmFix();
  const L=$('list');L.textContent='';
  const a=starts[sec],b=sec+1<starts.length?starts[sec+1]:paras.length;
  const ts=[];
  if(readMode){
    for(let i=a;i<b;i++){const q=paras[i],d=document.createElement('div');d.className='rd '+(lvl(q)?'h'+lvl(q):'')+(bmHas(q)?' bm':'');d._p=q;d.textContent=pText(q)||'\u00a0';L.appendChild(d)}
  }else for(let i=a;i<b;i++){const t=mkItem(paras[i]);L.appendChild(t._w);ts.push(t)}
  requestAnimationFrame(()=>{ts.forEach(grow);schedThumb();setTimeout(updThumb,120);setTimeout(updThumb,400);if(fragMode)highlightFragRange()});
  const c=$('cn');c.textContent='';
  if(sec>0){const x=document.createElement('button');x.textContent='← Назад';x.onclick=()=>{sec--;render();scrollTo(0,0)};c.appendChild(x)}else c.appendChild(document.createElement('span'));
  if(sec<starts.length-1){const x=document.createElement('button');x.className='p';x.textContent='Дальше →';x.onclick=()=>{sec++;render();scrollTo(0,0)};c.appendChild(x)}
}
let posT;
const posNorm=n=>String(n||'').replace(/\.[^.\/\\]+$/,'').replace(/\s*\(\d+\)$/,'').replace(/(_ред)+$/i,'').trim().toLowerCase();
function savePos(){bmSave();if(!cur||!doc)return;const i=paras.indexOf(cur._p);if(i<0)return;try{const v=JSON.stringify({i,c:cur.selectionStart});localStorage.setItem('pos:'+fname,v);localStorage.setItem('pos:~'+posNorm(fname),v)}catch(e){}}
function schedSave(){clearTimeout(posT);posT=setTimeout(savePos,300)}
addEventListener('pagehide',savePos);
document.addEventListener('visibilitychange',()=>{if(document.hidden)savePos()});
function tas(){return Array.from($('list').querySelectorAll('textarea'))}
function wOf(p){return readMode?Array.from($('list').querySelectorAll('.rd')).find(e=>e._p===p):(tas().find(t=>t._p===p)||{})._w}
function topPara(){
  const els=readMode?Array.from($('list').querySelectorAll('.rd')):tas().map(t=>t._w);
  const hh=document.querySelector('header').getBoundingClientRect().bottom;
  for(const e of els){if(e.getBoundingClientRect().top>=hh-2)return e._p||(e._t&&e._t._p)}
  return null;
}
function setRead(on){
  if(!doc||on===readMode)return;
  const p=topPara();
  readMode=on;document.body.classList.toggle('reading',on);
  try{getSelection().removeAllRanges()}catch(e){}
  render();
  requestAnimationFrame(()=>setTimeout(()=>{const e=p&&wOf(p);if(e)e.scrollIntoView({block:'start'});updThumb()},60));
  flash(on?'Режим чтения: текст можно выделять':'Режим правки');
}
$('edBtn').onclick=()=>setRead(false);
function focusP(p,pos){const t=tas().find(x=>x._p===p);if(t){t.focus({preventScroll:true});const n=pos==null?0:pos;t.setSelectionRange(n,n);return t}}
function go(p){const s=secOf(p);if(s!==sec||!tas().some(x=>x._p===p)){sec=s;render()}}
function split(t){
  const full=t.value,p=t._p,pos=t.selectionStart,before=t.value.slice(0,pos),after=t.value.slice(pos),n=mk('p');
  const pPr=kids(p,'pPr')[0];if(pPr&&!lvl(p))n.appendChild(pPr.cloneNode(true));
  p.parentNode.insertBefore(n,p.nextSibling);
  setText(p,before);if(after)setText(n,after);
  t.value=before;grow(t);refreshMirror(t);
  const nt=mkItem(n);t._w.parentNode.insertBefore(nt._w,t._w.nextSibling);
  t._last=before;nt._last=after;pushOp({t:'split',p,n,full,before,after});
  restructure();sec=Math.min(sec,Math.max(0,starts.length-1));
  nt.focus();nt.setSelectionRange(0,0);grow(nt);
  nt.scrollIntoView({block:'center'});
}
function merge(t){
  const pvw=t._w.previousElementSibling;if(!pvw)return;const pv=pvw._t;
  const len=pv.value.length,pb=pv.value,nt=t.value;
  pv.value+=t.value;setText(pv._p,pv.value);
  t._p.parentNode.removeChild(t._p);t._w.remove();
  pv._last=pv.value;refreshMirror(pv);pushOp({t:'merge',p:pv._p,n:t._p,pb,nt});
  restructure();sec=Math.min(sec,Math.max(0,starts.length-1));
  pv.focus();pv.setSelectionRange(len,len);grow(pv);
}
const SB=$('sb'),TH=$('th'),GP=$('gp');let sbDrag=false,sbActT=null;
function sbHeaderH(){
  const hd=document.querySelector('header');
  // Always reserve full header height so track never sits under it
  // (transform .hide does not change offsetHeight)
  return hd?hd.offsetHeight:0;
}
function sbVV(){const v=window.visualViewport;return v?{top:v.offsetTop,h:v.height}:{top:0,h:innerHeight}}
let sbTop0=0;
function sbGeom(){
  const t=sbHeaderH()+2;
  const h=Math.max(48,sbVV().h-t-6);
  return{t,h,th:48};
}
function sbMax(){
  if(frozen){
    const list=$('list');
    const sh=list?list.scrollHeight+sbHeaderH()+80:document.documentElement.scrollHeight;
    return Math.max(0,sh-innerHeight);
  }
  return Math.max(0,document.documentElement.scrollHeight-innerHeight);
}
function sbY(){return frozen?frozenY:window.scrollY}
function updThumb(){
  const max=sbMax();
  const show=!!doc&&max>48;
  SB.classList.toggle('on',show);
  if(!show)return;
  const g=sbGeom();
  // hit strip begins right under the visible part of the header (so it never blocks header buttons);
  // thumb range itself is constant in screen coordinates and does not depend on header state
  // strip is pinned to the VISIBLE viewport (keyboard / visual-viewport panning moves header and
  // fixed elements off screen together, the slider must stay on screen)
  const hd=document.querySelector('header'),v=sbVV();
  const top0=hd?Math.max(0,Math.round(hd.getBoundingClientRect().bottom-v.top)):0;
  sbTop0=top0;
  SB.style.top=(v.top+top0)+'px';SB.style.bottom='auto';SB.style.height=Math.max(0,v.h-top0)+'px';
  const y=sbY();
  const ratio=max>0?Math.min(1,Math.max(0,y/max)):0;
  TH.style.top=(g.t+ratio*(g.h-g.th)-top0)+'px';
  updG(g,top0,v);
}
// inactive indicator: position of the current reading/caret line within the WHOLE file (by characters)
let gCum=[],gTot=0,gIdx=new Map(),gT=0;
function gBuild(){
  if(!gDirty)return;
  const now=performance.now();
  if(gCum.length===paras.length&&now-gT<400)return;
  gT=now;gDirty=0;let a=0;gCum=new Array(paras.length);gIdx=new Map();
  for(let i=0;i<paras.length;i++){gCum[i]=a;gIdx.set(paras[i],i);a+=pText(paras[i]).length}
  gTot=a;
}
function updG(g,top0,v){
  if(starts.length<2||!paras.length){GP.style.display='none';return}
  gBuild();
  const kl=$('list').children;let n=kl.length;
  if(!gTot||!n||!kl[0]._t){GP.style.display='none';return}
  const max=sbMax(),r=max>0?Math.min(1,Math.max(0,sbY()/max)):0;
  const yref=v.top+r*v.h;
  let lo=0,hi=n-1;
  while(lo<hi){const m=(lo+hi+1)>>1;if(kl[m].getBoundingClientRect().top<=yref)lo=m;else hi=m-1}
  const w=kl[lo],i=gIdx.get(w._t._p);
  if(i===undefined){GP.style.display='none';return}
  const rc=w.getBoundingClientRect(),fr=Math.min(1,Math.max(0,(yref-rc.top)/Math.max(1,rc.height)));
  const len=(i+1<gCum.length?gCum[i+1]:gTot)-gCum[i];
  const ratio=Math.min(1,Math.max(0,(gCum[i]+fr*len)/gTot));
  GP.style.display='block';
  GP.style.top=(g.t+ratio*(g.h-g.th)-top0)+'px';
}
function flashThumb(){SB.classList.add('act');clearTimeout(sbActT);sbActT=setTimeout(()=>SB.classList.remove('act'),900)}
function trackSb(){const t0=performance.now();(function f(){updThumb();if(performance.now()-t0<320)requestAnimationFrame(f)})()}
function sbMove(e){
  const g=sbGeom(),max=sbMax();
  const loc=e.clientY-SB.getBoundingClientRect().top+sbTop0;
  const rel=Math.min(1,Math.max(0,(loc-g.t-g.th/2)/Math.max(1,g.h-g.th)));
  const y=rel*max;
  if(frozen){
    frozenY=y;
    const m=document.querySelector('main');
    const h=sbHeaderH();
    if(m)m.style.top=(h-frozenY)+'px';
    updThumb();
  }else{
    window.scrollTo(0,y);
  }
}
SB.addEventListener('pointerdown',e=>{sbDrag=true;SB.classList.add('drag');SB.setPointerCapture(e.pointerId);sbMove(e);e.preventDefault()});
SB.addEventListener('pointermove',e=>{if(sbDrag)sbMove(e)});
const sbEnd=()=>{sbDrag=false;SB.classList.remove('drag')};
SB.addEventListener('pointerup',sbEnd);SB.addEventListener('pointercancel',sbEnd);
addEventListener('scroll',()=>{updThumb();flashThumb()},{passive:true});addEventListener('resize',updThumb);
if(window.visualViewport){visualViewport.addEventListener('resize',updThumb);visualViewport.addEventListener('scroll',updThumb)}
try{
  const ro=new ResizeObserver(()=>{requestAnimationFrame(updThumb)});
  ro.observe($('list'));
  ro.observe(document.querySelector('header'));
  ro.observe(document.body);
}catch(e){}
function schedThumb(){requestAnimationFrame(()=>{updThumb();requestAnimationFrame(updThumb)})}
let undoS=[],redoS=[];
function updBtns(){$('un').disabled=!undoS.length;$('re').disabled=!redoS.length}
function pushOp(o){undoS.push(o);if(undoS.length>100)undoS.shift();redoS.length=0;updBtns()}
function recText(p,before,after){
  const now=Date.now(),top=undoS[undoS.length-1];
  if(top&&top.t==='text'&&top.p===p&&now-top.ts<1500&&!redoS.length){top.after=after;top.ts=now}
  else pushOp({t:'text',p,before,after,ts:now});
}
function applyOp(o,dir){
  const u=dir==='u';let f=null;
  if(o.t==='text'){setText(o.p,u?o.before:o.after);f=o.p}
  else if(o.t==='split'){
    if(u){setText(o.p,o.full);if(o.n.parentNode)o.n.parentNode.removeChild(o.n)}
    else{setText(o.p,o.before);o.p.parentNode.insertBefore(o.n,o.p.nextSibling);setText(o.n,o.after)}
    f=o.p;
  }else if(o.t==='merge'){
    if(u){o.p.parentNode.insertBefore(o.n,o.p.nextSibling);setText(o.p,o.pb);f=o.n}
    else{if(o.n.parentNode)o.n.parentNode.removeChild(o.n);setText(o.p,o.pb+o.nt);f=o.p}
  }else if(o.t==='repl'){o.items.forEach(([t,b,a])=>{t.textContent=u?b:a})}
  return f;
}
function afterHist(f){
  restructure();sec=f?secOf(f):Math.min(sec,starts.length-1);render();
  if(f){const t=focusP(f,1e9);if(t)t.scrollIntoView({block:'center'})}
  updBtns();
}
function undo(){const o=undoS.pop();if(!o)return;const f=applyOp(o,'u');redoS.push(o);afterHist(f)}
function redo(){const o=redoS.pop();if(!o)return;const f=applyOp(o,'r');undoS.push(o);afterHist(f)}
$('un').onclick=undo;$('re').onclick=redo;
['un','re'].forEach(i=>$(i).addEventListener('pointerdown',e=>e.preventDefault()));
let hdrAcc=0,hdrY=0;
function setHdr(h){const hd=document.querySelector('header');if(hd.classList.contains('hide')===h)return;hd.classList.toggle('hide',h);trackSb()}
addEventListener('scroll',()=>{
  const y=scrollY,d=y-hdrY;hdrY=y;
  if(sbDrag||Date.now()<tapUntil)return;
  if(d*hdrAcc<0)hdrAcc=0;hdrAcc+=d;
  if(y<=10||$('sp').classList.contains('on'))setHdr(false);
  else if(hdrAcc>48)setHdr(true);   // harder to hide on slow scroll
  else if(hdrAcc<-12)setHdr(false);
  updThumb();
},{passive:true});
let userDict=[],live=true,spellEn=false,enLoaded=false,enP=null,wk=null,wkId=0,spellReady=null;const wkP=new Map(),okC=new Map(),pendW=new Set();let pendT=null;
try{userDict=JSON.parse(localStorage.getItem('userDict')||'[]');live=localStorage.getItem('live')!=='0';spellEn=localStorage.getItem('spellEn')==='1'}catch(e){}
const WRE=/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*/g;
const WRE_EN=/[А-Яа-яЁё]+(?:-[А-Яа-яЁё]+)*|[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+(?:['’][A-Za-z]+)*)*/g;
const wreSrc=()=>spellEn?WRE_EN.source:WRE.source;
const esc=x=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const tick=()=>new Promise(res=>setTimeout(res,0));
function saveDict(){try{localStorage.setItem('userDict',JSON.stringify(userDict))}catch(e){}}
const WORKER_CODE=`
;let sp=null;
let spe=null;
const LAT=/^[A-Za-z]/;
const okOne=(s,w)=>s.correct(w)||(w.includes('-')&&w.split('-').every(p=>s.correct(p)));
const ok=w=>LAT.test(w)?(spe?okOne(spe,w.replace(/’/g,"'")):true):okOne(sp,w);
onmessage=e=>{const m=e.data;try{
 if(m.cmd==='init'){sp=makeSpell(m.aff,m.dic);(m.user||[]).forEach(w=>sp.add(w));postMessage({id:m.id,ok:1})}
 else if(m.cmd==='initEn'){spe=makeSpell(m.aff,m.dic);(m.user||[]).forEach(w=>spe.add(w));postMessage({id:m.id,ok:1})}
 else if(m.cmd==='check'){postMessage({id:m.id,bad:m.words.filter(w=>!ok(w))})}
 else if(m.cmd==='suggest'){postMessage({id:m.id,sug:(LAT.test(m.word)&&spe?spe:sp).suggest(m.word).slice(0,6)})}
 else if(m.cmd==='add'){sp.add(m.word);if(spe)spe.add(m.word);postMessage({id:m.id,ok:1})}
}catch(err){postMessage({id:m.id,err:String(err)})}};`;
function wcall(msg){return new Promise(res=>{const id=++wkId;let settled=false;const done=r=>{if(settled)return;settled=true;clearTimeout(to);wkP.delete(id);res(r)};const to=setTimeout(()=>done({err:'timeout'}),20000);wkP.set(id,done);try{wk.postMessage(Object.assign({id},msg))}catch(e){done({err:String(e)})}})}
function ensureSpell(){
  if(spellReady)return spellReady;
  spellReady=(async()=>{
    const src=document.getElementById('nspellsrc').textContent;
    wk=new Worker(URL.createObjectURL(new Blob([src+WORKER_CODE],{type:'text/javascript'})));
    wk.onmessage=e=>{const r=wkP.get(e.data.id);if(r)r(e.data)};
    wk.onerror=()=>{wkP.forEach(r=>r({err:'worker'}));wkP.clear();spellReady=null;wk=null;enLoaded=false;enP=null};
    const z=await JSZip.loadAsync(document.getElementById('dictzip').textContent.trim(),{base64:true});
    const aff=await z.file('ru.aff').async('string'),dic=await z.file('ru.dic').async('string');
    const r=await wcall({cmd:'init',aff,dic,user:userDict});
    if(r.err)throw new Error(r.err);
    if(spellEn)await loadEn();
  })();
  spellReady.catch(()=>{spellReady=null});
  return spellReady;
}
function loadEn(){
  if(enLoaded)return Promise.resolve();
  if(enP)return enP;
  enP=(async()=>{
    const z=await JSZip.loadAsync(document.getElementById('dictzip_en').textContent.trim(),{base64:true});
    const aff=await z.file('en.aff').async('string'),dic=await z.file('en.dic').async('string');
    const r=await wcall({cmd:'initEn',aff,dic,user:userDict});
    if(r.err)throw new Error(r.err);
    enLoaded=true;
  })();
  enP.catch(()=>{enP=null});
  return enP;
}
const escH=x=>x.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function mirrorHTML(txt){
  let out='',last=0,m;const re=new RegExp(wreSrc(),'g');
  while((m=re.exec(txt))){if(okC.get(m[0])===true){out+=escH(txt.slice(last,m.index))+'<span class="e">'+escH(m[0])+'</span>';last=m.index+m[0].length}}
  return out+escH(txt.slice(last));
}
function remirror(){tas().forEach(t=>{t._m.innerHTML=live?mirrorHTML(t.value):''})}
function refreshMirror(t){
  if(!live){return}
  t._m.innerHTML=mirrorHTML(t.value);
  const re=new RegExp(wreSrc(),'g');let m,any=false;
  while((m=re.exec(t.value))){if(!okC.has(m[0])){pendW.add(m[0]);any=true}}
  if(any&&wk&&spellReady){clearTimeout(pendT);pendT=setTimeout(flushPending,500)}
}
async function flushPending(){
  if(!live)return;
  try{await ensureSpell()}catch(e){return}
  const words=Array.from(pendW);pendW.clear();if(!words.length)return;
  const r=await wcall({cmd:'check',words});if(r.err)return;
  const bad=new Set(r.bad);words.forEach(w=>okC.set(w,bad.has(w)));remirror();
}
async function startLive(){
  flash('Загружаю словарь…');
  try{await ensureSpell()}catch(e){flash('Словарь не загрузился');return}
  tas().forEach(t=>{const re=new RegExp(wreSrc(),'g');let m;while((m=re.exec(t.value)))if(!okC.has(m[0]))pendW.add(m[0])});
  await flushPending();
  remirror();
  flash('Подчёркивание ошибок включено');
}
function wordRe(w,g){const c=spellEn?'А-Яа-яЁёA-Za-z':'А-Яа-яЁё';return new RegExp('(^|[^'+c+'-])('+esc(w)+')(?=$|[^'+c+'-])',g?'g':'')}
function jumpTo(r){
  const re=wordRe(r.w),idx=paras.findIndex(p=>re.test(pText(p)));
  if(idx<0){flash('Слово не найдено');return}
  const p=paras[idx];go(p);if(readMode){const e=wOf(p);if(e)e.scrollIntoView({block:'center'});return}const t=tas().find(z=>z._p===p);if(!t)return;
  const m=re.exec(t.value),pos=m.index+m[1].length;
  t.focus({preventScroll:true});t.setSelectionRange(pos,pos+r.w.length);t.scrollIntoView({block:'center'});
}
function replaceWord(w,rep){
  const re=wordRe(w,true);let n=0;const items=[];
  for(const t of Array.from(body.getElementsByTagNameNS(W,'t'))){
    const s0=t.textContent;if(!s0.includes(w))continue;
    const ns=s0.replace(re,(m,a)=>{n++;return a+rep});
    if(ns!==s0){items.push([t,s0,ns]);t.textContent=ns;t.setAttributeNS(XNS,'xml:space','preserve')}
  }
  if(items.length)pushOp({t:'repl',items});
  return n;
}
function applyTypography(){
  if(!body)return;
  const all=ln=>Array.from(body.getElementsByTagNameNS(W,ln));
  let q=0,d=0,sp=0;
  for(const t of all('t')){
    let s=t.textContent,o=s;
    // кавычки: "текст" → «текст»
    s=s.replace(/(^|[\s(«])"([^"]{1,400}?)"(?=[\s)».,;:!?]|$)/g,(m,a,b)=>{q++;return a+'«'+b+'»'});
    // оставшиеся парные "
    s=s.replace(/"([^"]{1,200})"/g,(m,b)=>{q++;return '«'+b+'»'});
    // тире: --- или -- → —
    s=s.replace(/\s*---\s*/g,()=>{d++;return ' — '}).replace(/\s*--\s*/g,()=>{d++;return ' — '});
    // дефис как тире между словами с пробелами: "слово - слово"
    s=s.replace(/(\S)\s+-\s+(\S)/g,(m,a,b)=>{d++;return a+' — '+b});
    // многоточие
    s=s.replace(/\.{3,}/g,()=>{sp++;return '…'});
    if(s!==o){t.textContent=s;t.setAttributeNS(XNS,'xml:space','preserve')}
  }
  restructure();undoS=[];redoS=[];updBtns();render();
  const parts=[];
  if(q)parts.push('кавычек: '+q);
  if(d)parts.push('тире: '+d);
  if(sp)parts.push('многоточий: '+sp);
  flash(parts.length?'Типографика: '+parts.join(', '):'Изменений не найдено');
}
async function runSpell(){
  const o=$('spo');o.textContent='';panelShow(o);
  const top=document.createElement('div');top.className='top';
  const x=document.createElement('button');x.className='back';x.textContent='← Назад';x.onclick=()=>panelHide(o);
  const st=document.createElement('div');st.style.cssText='color:var(--mut);font-size:13px;margin:6px 0 2px;line-height:1.35';
  top.append(x,st);o.appendChild(top);
  const list=document.createElement('div');o.appendChild(list);
  st.textContent='Загружаю словарь, это занимает несколько секунд…';await tick();
  try{await ensureSpell()}catch(e){st.textContent='Не удалось загрузить словарь: '+e.message;return}
  st.textContent='Проверяю…';await tick();
  const map=new Map();let total=0;
  paras.forEach(p=>{const t=pText(p);let m;const re=new RegExp(wreSrc(),'g');while((m=re.exec(t))){total++;const r=map.get(m[0]);if(r)r.n++;else map.set(m[0],{w:m[0],n:1})}});
  const rr=await wcall({cmd:'check',words:Array.from(map.keys())});
  if(rr.err){st.textContent='Ошибка проверки: '+rr.err;return}
  const badSet=new Set(rr.bad);map.forEach((r,w)=>okC.set(w,badSet.has(w)));remirror();
  const bad=rr.bad.map(w=>map.get(w));
  bad.sort((a,b)=>a.n-b.n||a.w.localeCompare(b.w,'ru'));
  let left=bad.length;
  const upd=()=>{st.textContent='Слов: '+total.toLocaleString('ru-RU')+' · неизвестных: '+left+'. Сверху редкие (чаще опечатки). Имена — в словарь.'};
  upd();
  const btn=(txt,fn,cls)=>{const b=document.createElement('button');b.textContent=txt;if(cls)b.className=cls;b.onclick=fn;return b};
  bad.forEach(r=>{
    const row=document.createElement('div');row.className='wr';
    const h=document.createElement('div');h.className='h';
    const w=document.createElement('span');w.className='w';w.textContent=r.w;
    const n=document.createElement('span');n.className='n';n.textContent='×'+r.n;
    h.append(w,n);
    const acts=document.createElement('div');acts.className='acts';
    let sg=null;
    const done=()=>{row.remove();left--;upd()};
    acts.append(
      btn('Найти',()=>{panelHide(o);jumpTo(r)}),
      btn('Исправить',async()=>{
        if(sg){sg.remove();sg=null;return}
        sg=document.createElement('div');sg.className='sg';row.appendChild(sg);
        const apply=s=>{const c=replaceWord(r.w,s);okC.delete(r.w);render();flash('Заменено: '+c+(c<r.n?' из '+r.n+' (остальные разбиты форматированием)':''));done()};
        const rs=await wcall({cmd:'suggest',word:r.w});
        if(!sg)return;
        (rs.sug||[]).forEach(s=>sg.appendChild(btn(s,()=>apply(s))));
        const inp=document.createElement('input');inp.type='text';inp.placeholder='своё';
        sg.append(inp,btn('Заменить везде',()=>{if(inp.value.trim())apply(inp.value.trim())},'p'));
      }),
      btn('+ словарь',()=>{userDict.push(r.w);saveDict();okC.set(r.w,false);wcall({cmd:'add',word:r.w});remirror();done()},'sec')
    );
    row.append(h,acts);list.appendChild(row);
  });
}
let litSnap=null;
const NS_A='http://schemas.openxmlformats.org/drawingml/2006/main';
const EMO=/ ?[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{20E3}]+/gu;
const ZWC=/[\u00AD\u200B\u200C\u200D\u2060\uFEFF]/g;
const SPX=/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;
const LITRES_BAD=/[\u02CA\u02C8\u02BB\u02BC\u02CB\u02B9\u02D0\u02CC\u02B0-\u02FF\uA700-\uA71F]/g;
const PPR_AFTER_IND=['contextualSpacing','mirrorIndents','suppressOverlap','jc','textDirection','textAlignment','textboxTightWrap','outlineLvl','divId','cnfStyle','rPr','sectPr','pPrChange'];
function setIndent(p,tw){
  let pPr=kids(p,'pPr')[0];if(!pPr){pPr=mk('pPr');p.insertBefore(pPr,p.firstChild)}
  let ind=kids(pPr,'ind')[0];
  if(!ind){ind=mk('ind');const nx=Array.from(pPr.childNodes).find(c=>PPR_AFTER_IND.includes(c.localName));pPr.insertBefore(ind,nx||null)}
  ['hanging','hangingChars','firstLineChars'].forEach(a=>ind.removeAttributeNS(W,a));
  ind.setAttributeNS(W,'w:firstLine',String(tw));
}
function stripLead(p){
  let ch=false;
  for(const n of Array.from(p.getElementsByTagNameNS(W,'*'))){
    if(n.localName==='tab'){if(n.parentNode.localName==='r'){n.parentNode.removeChild(n);ch=true}continue}
    if(n.localName!=='t')continue;
    const s0=n.textContent,s1=s0.replace(/^[ \t\u3000]+/,'');
    if(s1!==s0){n.textContent=s1;ch=true}
    if(s1.length)break;
  }
  return ch;
}
function fixNumbers(){
  const log=[],chs=[],scs=[];let cn=-1;
  paras.forEach(p=>{
    if(!lvl(p))return;const t=pText(p);
    let m=/^(\s*глава\s+)(\d+)/i.exec(t);
    if(m){cn++;chs.push({p,t,n:+m[2],name:'Глава'});return}
    m=/^(\s*сцена\s+)(\d+)/i.exec(t);
    if(m)scs.push({p,t,n:+m[2],c:cn,name:'Сцена'});
  });
  const plan=[];
  chs.forEach((x,i)=>plan.push([x,chs[0].n+i]));
  const groups=new Map();scs.forEach(x=>{if(!groups.has(x.c))groups.set(x.c,[]);groups.get(x.c).push(x)});
  const firsts=Array.from(groups.values()).map(g=>g[0].n);
  const restart=firsts.filter(n=>n===1).length>=firsts.length/2;
  if(restart)groups.forEach(g=>g.forEach((x,i)=>plan.push([x,1+i])));
  else scs.forEach((x,i)=>plan.push([x,scs[0].n+i]));
  plan.forEach(([x,exp])=>{
    if(x.n===exp)return;
    setText(x.p,x.t.replace(/^(\s*(?:глава|сцена)\s+)(\d+)/i,(m,a)=>a+exp));
    log.push(x.name+' '+x.n+' → '+exp+(x.name==='Сцена'&&x.c>=0?' (гл. '+(chs[0].n+x.c)+')':''));
  });
  return log;
}
async function litres(){
  const sf=zip.file('word/styles.xml');
  if(!litSnap){litSnap={doc:new XMLSerializer().serializeToString(doc),styles:sf?await sf.async('string'):null}}
  const did=[],warn=[];
  const all=ln=>Array.from(body.getElementsByTagNameNS(W,ln));
  const rmAll=els=>{els.forEach(e=>e.parentNode&&e.parentNode.removeChild(e));return els.length};
  const sname=p=>{const sid=getStyle(p);return(styleName[sid]||sid||'').toLowerCase()};
  collect();
  const tl=paras.filter(p=>/^(title|subtitle|название|подзаголовок)$/.test(sname(p))&&pText(p).trim());
  if(tl.length){did.push('Удалены название и подзаголовок: '+tl.map(p=>'«'+pText(p).trim().slice(0,40)+'»').join(', '));rmAll(tl)}
  let toc=0;
  all('sdt').forEach(x=>{const g=x.getElementsByTagNameNS(W,'docPartGallery')[0];if(g&&/table of contents/i.test(g.getAttributeNS(W,'val')||'')){rmAll([x]);toc++}});
  collect();
  const tp=paras.filter(p=>/^(toc|оглавление|содержание|table of contents|заголовок оглавления)/.test(sname(p))||/^toc/i.test(getStyle(p)));
  toc+=rmAll(tp);if(toc)did.push('Удалено оглавление: '+toc);
  let hf=rmAll(all('headerReference').concat(all('footerReference')));
  hf+=rmAll(all('fldSimple').filter(x=>/\bPAGE\b/.test(x.getAttributeNS(W,'instr')||'')));
  rmAll(all('pgNumType').concat(all('titlePg')));
  if(hf)did.push('Убраны колонтитулы и номера страниц: '+hf);
  let pb=rmAll(all('br').filter(b=>b.getAttributeNS(W,'type')==='page'));
  rmAll(all('lastRenderedPageBreak'));pb+=rmAll(all('pageBreakBefore'));
  if(litSnap.styles){
    const sx=new DOMParser().parseFromString(litSnap.styles,'application/xml');
    const n=Array.from(sx.getElementsByTagNameNS(W,'pageBreakBefore'));
    if(n.length){rmAll(n);pb+=n.length;zip.file('word/styles.xml',new XMLSerializer().serializeToString(sx))}
  }
  const sec2=rmAll(all('sectPr').filter(x=>x.parentNode!==body));
  if(pb||sec2)did.push('Убраны разрывы страниц: '+pb+(sec2?', разрывы разделов: '+sec2:''));
  let emo=0,zw=0,spc=0,bad=0;
  for(const t of all('t')){
    const s0=t.textContent;
    const s1=s0.replace(EMO,()=>{emo++;return''}).replace(ZWC,()=>{zw++;return''}).replace(SPX,()=>{spc++;return' '}).replace(LITRES_BAD,()=>{bad++;return''});
    if(s1!==s0){t.textContent=s1;t.setAttributeNS(XNS,'xml:space','preserve')}
  }
  if(emo)did.push('Удалены смайлы и эмодзи: '+emo);
  if(zw)did.push('Удалены невидимые символы (мягкие переносы, нулевой ширины): '+zw);
  if(spc)did.push('Неразрывные и тонкие пробелы заменены обычными: '+spc);
  if(bad)did.push('Удалены спецсимволы, запрещённые ЛитРес: '+bad);
  collect();let ind=0;
  paras.forEach(p=>{if(!lvl(p)&&/^[ \t\u3000]+\S/.test(pText(p))&&stripLead(p)){setIndent(p,567);ind++}});
  if(ind)did.push('Отступ пробелами и табуляцией заменён абзацным отступом Word: '+ind+' абз.');
  let il=0;
  for(const tag of ['hlinkClick','hlinkHover'])il+=rmAll(Array.from(body.getElementsByTagNameNS(NS_A,tag)));
  all('hyperlink').forEach(h=>{if(h.getElementsByTagNameNS(W,'drawing').length){while(h.firstChild)h.parentNode.insertBefore(h.firstChild,h);h.parentNode.removeChild(h);il++}});
  if(il)did.push('Убраны гиперссылки у изображений: '+il);
  // ЛитРес собирает оглавление по стилям: назначаем «Заголовок 1» найденным главам
  collect();
  {
    let hid=styleId[1]||'Heading1';
    let have=!!styleName[hid];
    if(!have){
      const sf2=zip.file('word/styles.xml');
      if(sf2){
        const sx=new DOMParser().parseFromString(await sf2.async('string'),'application/xml');
        const st=sx.createElementNS(W,'w:style');
        st.setAttributeNS(W,'w:type','paragraph');
        st.setAttributeNS(W,'w:styleId',hid);
        const nm=sx.createElementNS(W,'w:name');nm.setAttributeNS(W,'w:val','heading 1');st.appendChild(nm);
        const bo=sx.createElementNS(W,'w:basedOn');bo.setAttributeNS(W,'w:val','Normal');st.appendChild(bo);
        st.appendChild(sx.createElementNS(W,'w:qFormat'));
        sx.documentElement.appendChild(st);
        zip.file('word/styles.xml',new XMLSerializer().serializeToString(sx));
        styleName[hid]='heading 1';have=true;
      }
    }
    if(have){
      const baseSz=bodyFontSize(),cutSz=baseSz?baseSz*1.15:0;
      let cand=paras.filter(p=>lvl(p)!==1&&isChapterText(pText(p)));
      if(!cand.length&&cutSz)cand=paras.filter(p=>{
        const t=pText(p).trim();
        if(!t||t.length>80||CH_SEP.test(t))return false;
        if(lvl(p)===1)return false;
        const f=pFmt(p);
        return f.jc==='center'&&f.bold&&f.maxSz>=cutSz;
      });
      if(cand.length){
        cand.forEach(p=>setStyle(p,hid));
        did.push('Назначен стиль «Заголовок 1»: '+cand.length+' заголовк'+(cand.length===1?'':'ов'));
      }
    }else{
      warn.push('В файле нет styles.xml — стили заголовков назначить не удалось, сделайте это в Word.');
    }
  }
  // Пустые абзацы сразу после заголовков — частая причина проблем у ЛитРес
  collect();
  let emptyAfterH=0;
  const toRm=[];
  for(let i=0;i<paras.length-1;i++){
    if(lvl(paras[i])>0 && !pText(paras[i+1]).trim() && !paras[i+1].getElementsByTagNameNS(W,'drawing').length){
      toRm.push(paras[i+1]);
      emptyAfterH++;
    }
  }
  if(toRm.length){rmAll(toRm);did.push('Удалены пустые строки сразу после заголовков: '+emptyAfterH)}
  collect();
  const nf=fixNumbers();
  if(nf.length){
    const preview=nf.slice(0,4).join('; ');
    did.push('Исправлена нумерация ('+nf.length+'): '+preview+(nf.length>4?' … и ещё '+(nf.length-4):''));
  }
  collect();
  const un=paras.filter(p=>!lvl(p)&&pText(p).trim().length<100&&/^\s*(глава|часть|пролог|эпилог|сцена)(\s|$|\.)/i.test(pText(p)));
  const tr=all('ins').length+all('del').length;
  if(tr)warn.push('В файле есть непринятые исправления ('+tr+'). Примите или отклоните их в Word.');
  if(zip.file('word/comments.xml'))warn.push('В файле есть комментарии, лучше удалить их в Word.');
  const img=all('drawing').length+all('pict').length;
  if(img)warn.push('Изображений в тексте: '+img+'. Проверьте, что они нужны.');
  const emptyParas=paras.filter(p=>!pText(p).trim()&&!p.getElementsByTagNameNS(W,'drawing').length);
  // Объём
  let chars=0;
  paras.forEach(p=>{chars+=pText(p).length});
  if(chars<4000)warn.push('Объём текста: '+chars.toLocaleString('ru-RU')+' знаков. ЛитРес требует минимум 4000 знаков с пробелами.');
  else did.push('Объём текста: '+chars.toLocaleString('ru-RU')+' знаков (норма для ЛитРес ≥ 4000).');
  warn.push('Вручную проверьте: нет аннотации, выходных данных и имени автора внутри текста.');
  restructure();sec=Math.min(sec,starts.length-1);undoS=[];redoS=[];updBtns();render();
  showReport(did,warn,{nf,un,emptyParas});
}
function litresRestore(){
  if(!litSnap)return;
  doc=new DOMParser().parseFromString(litSnap.doc,'application/xml');body=doc.getElementsByTagNameNS(W,'body')[0];
  if(litSnap.styles!==null)zip.file('word/styles.xml',litSnap.styles);
  restructure();sec=Math.min(sec,starts.length-1);undoS=[];redoS=[];updBtns();render();flash('Возвращено как было');
}
function showReport(did,warn,extra){
  extra=extra||{};
  const nf=extra.nf||[];
  const un=extra.un||[];
  const emptyParas=extra.emptyParas||[];
  const o=$('spo');o.textContent='';panelShow(o);
  const el=(tag,txt,cls,css)=>{const e=document.createElement(tag);if(txt)e.textContent=txt;if(cls)e.className=cls;if(css)e.style.cssText=css;return e};
  const top=el('div','', 'top');
  const x=el('button','← Назад','back');x.onclick=()=>panelHide(o);
  const u=el('button','Вернуть как было');
  u.style.cssText='margin-left:6px;opacity:0.65;font-size:13.5px;padding:8px 12px';
  u.onclick=()=>{litresRestore();panelHide(o)};
  top.append(x,u,el('div','Подготовка для ЛитРес выполнена. Файл ещё не сохранён: кнопка внизу отчёта или 💾 вверху.','',"color:var(--mut);font-size:13px;margin-top:6px;line-height:1.35"));
  o.appendChild(top);
  const card=(title,items,mark)=>{
    const c=el('div','','wr');c.appendChild(el('div',title,'w'));
    items.forEach(t=>{
      const line=el('div','','',"margin-top:8px;font-size:14.5px;line-height:1.45");
      const m=el('span',mark+' ','',"color:var(--ac);font-weight:600");
      line.appendChild(m);
      line.appendChild(document.createTextNode(t));
      c.appendChild(line);
    });
    o.appendChild(c);
    return c;
  };
  // Сделано — с раскрывающимся списком нумерации
  const didCard=card('Сделано',did.length?did:['Изменений не потребовалось, файл уже соответствует.'],'✓');
  if(nf.length>4){
    const det=el('details','','',"margin-top:10px");
    const sum=el('summary','Показать все исправления нумерации ('+nf.length+')','',"cursor:pointer;color:var(--ac);font-size:14px");
    det.appendChild(sum);
    const box=el('div','','',"margin-top:8px;font-size:13.5px;line-height:1.5;color:var(--mut);max-height:200px;overflow:auto");
    nf.forEach(t=>box.appendChild(el('div',t,'',"margin-bottom:4px")));
    det.appendChild(box);
    didCard.appendChild(det);
  }
  // Проверьте вручную
  const warnCard=card('Проверьте вручную',warn,'•');
  // Actionable: похожи на заголовки
  if(un.length){
    const block=el('div','','',"margin-top:12px;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--ac) 22%,var(--bd))");
    block.appendChild(el('div','Похожи на заголовки, но без стиля ('+un.length+')','w'));
    un.slice(0,8).forEach(p=>{
      const t=pText(p).trim().slice(0,50);
      const row=el('div','','',"margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center");
      row.appendChild(el('span','«'+t+(pText(p).trim().length>50?'…':'')+'»','',"flex:1;min-width:120px;font-size:14px"));
      const show=el('button','Показать','');show.style.cssText='padding:7px 10px;min-height:34px;font-size:13px';
      show.onclick=()=>{panelHide(o);go(p);requestAnimationFrame(()=>{const e=wOf(p);if(e)e.scrollIntoView({block:'center'});const ta=Array.from(document.querySelectorAll('textarea')).find(x=>x._p===p);if(ta){ta.focus({preventScroll:true})}})};
      const mkH=el('button','→ Заголовок 1','');mkH.style.cssText='padding:7px 10px;min-height:34px;font-size:13px';
      mkH.onclick=()=>{
        const id=styleId[1]||'Heading1';
        setStyle(p,id);
        restructure();undoS=[];redoS=[];updBtns();render();
        row.style.opacity='0.45';mkH.disabled=true;show.disabled=true;
        flash('Стиль «Заголовок 1» назначен');
      };
      row.append(show,mkH);
      block.appendChild(row);
    });
    if(un.length>8)block.appendChild(el('div','…и ещё '+(un.length-8),'',"margin-top:6px;color:var(--mut);font-size:13px"));
    warnCard.appendChild(block);
  }
  // Actionable: пустые абзацы
  if(emptyParas.length){
    const block=el('div','','',"margin-top:12px;padding-top:10px;border-top:1px solid color-mix(in srgb,var(--ac) 22%,var(--bd))");
    block.appendChild(el('div','Пустых абзацев: '+emptyParas.length,'w'));
    const rm=el('button','Удалить все пустые абзацы','');
    rm.style.cssText='margin-top:8px;padding:10px 14px;font-size:14px';
    rm.onclick=()=>{
      emptyParas.forEach(p=>{if(p.parentNode)p.parentNode.removeChild(p)});
      restructure();undoS=[];redoS=[];updBtns();render();
      block.style.opacity='0.5';rm.disabled=true;rm.textContent='Удалено: '+emptyParas.length;
      flash('Удалено пустых абзацев: '+emptyParas.length);
    };
    block.appendChild(rm);
    warnCard.appendChild(block);
  }
  const sv=el('button','Сохранить подготовленный .docx','p');
  sv.style.cssText='display:block;width:100%;margin-top:6px;padding:14px;font-size:16px;border-radius:var(--r)';
  sv.onclick=openSm;
  o.appendChild(sv);
}
let tapUntil=0,lastTap=0,userMoved=false,touchY0=0,ensT=null,frozen=false,frozenY=0,frozenT=null,tapPending=false;
function ensureSoon(ms){clearTimeout(ensT);ensT=setTimeout(()=>{const t=document.activeElement;if(t&&t.tagName==='TEXTAREA'&&t._m)ensureCaretVisible(t)},ms)}
function caretRect(t){
  const m=t._m,old=m.innerHTML,pos=t.selectionStart;
  m.innerHTML=escH(t.value.slice(0,pos))+'<span id="cpr">\u200b</span>'+escH(t.value.slice(pos));
  const r=m.querySelector('#cpr').getBoundingClientRect();
  m.innerHTML=old;return r;
}
function ensureCaretVisible(t){
  // Временно отключено для теста новой компенсации в grow()
  return;
  /*
  const vv=window.visualViewport,vTop=vv?vv.offsetTop:0,vH=vv?vv.height:innerHeight;
  const hd=document.querySelector('header'),hh=hd.classList.contains('hide')?0:hd.offsetHeight;
  const lh=parseFloat(getComputedStyle(t).lineHeight)||28;
  const top=vTop+hh+lh*0.6,bot=vTop+vH-lh*1.2;
  const r=caretRect(t);
  let d=0;
  if(r.bottom>bot)d=r.bottom-bot;else if(r.top<top)d=r.top-top;
  if(!d)return;
  tapUntil=Date.now()+250;
  scrollBy(0,d);
  */
}
function freezePage(){
  // Временно отключено для теста
  return;
  /*
  if(frozen)return;
  const m=document.querySelector('main'),h=document.querySelector('header').offsetHeight;
  frozenY=scrollY;frozen=true;tapUntil=Date.now()+2500;
  m.style.position='fixed';m.style.top=(h-frozenY)+'px';m.style.left='0';m.style.right='0';
  */
}
function unfreezePage(){
  if(!frozen)return;
  const m=document.querySelector('main');
  m.style.position='';m.style.top='';m.style.left='';m.style.right='';
  frozen=false;tapUntil=Date.now()+250;scrollTo(0,frozenY);hdrY=frozenY;
  updThumb();
}
(function(){
  const L=document.getElementById('list');
  // freezePage на фокусе временно отключён
  L.addEventListener('pointerdown',e=>{
    if(e.target.tagName!=='TEXTAREA')return;
    lastTap=Date.now();userMoved=false;tapPending=true;setTimeout(()=>{tapPending=false},700);
  },true);
  L.addEventListener('touchstart',e=>{touchY0=e.touches[0].clientY},{passive:true,capture:true});
  L.addEventListener('touchmove',e=>{
    if(Math.abs(e.touches[0].clientY-touchY0)>12){userMoved=true;clearTimeout(ensT);clearTimeout(frozenT);unfreezePage()}
  },{passive:true,capture:true});
})();
function words(){return(paras.map(pText).join(' ').match(/\S+/g)||[]).length}

// ========== Export FB2 / EPUB ==========
function escXml(s){
  return String(s==null?'':s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;')
    .replace(/'/g,'&apos;');
}
function getBookMeta(){
  return new Promise(res=>{
    const defTitle=baseName(fname||'Книга');
    let defAuthor='Silas Kraven';try{defAuthor=localStorage.getItem('bookAuthor')||defAuthor}catch(e){}
    const o=$('spo');o.textContent='';panelShow(o);
    const el=(tag,txt,cls)=>{const e=document.createElement(tag);if(txt)e.textContent=txt;if(cls)e.className=cls;return e};
    const top=el('div','','top');
    const x=el('button','← Назад','back');x.onclick=()=>{panelHide(o);res(null)};
    top.appendChild(x);o.appendChild(top);
    const card=el('div','','wr');
    const mk1=(label,val)=>{const l=el('div',label,'n');l.style.cssText='margin:8px 0 4px;flex:none';const inp=document.createElement('input');inp.type='text';inp.value=val;inp.style.cssText='width:100%;font-size:16px';card.append(l,inp);return inp};
    const it=mk1('Название книги',defTitle),ia=mk1('Автор',defAuthor);
    const ok=el('button','Создать','p');ok.style.cssText='margin-top:12px;width:100%;padding:12px';
    ok.onclick=()=>{
      const title=it.value.trim()||defTitle,author=ia.value.trim()||defAuthor;
      try{localStorage.setItem('bookAuthor',author)}catch(e){}
      panelHide(o);res({title,author});
    };
    card.appendChild(ok);o.appendChild(card);
  });
}
function downloadBlob(blob,name){
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=name;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},2000);
  flash('Скачан: '+name);
}
function buildContentTree(){
  const tree=[];
  let curH1=null,curH2=null;
  function flushH2(){if(curH2){if(curH1)curH1.children.push(curH2);else tree.push(curH2);curH2=null}}
  function flushH1(){flushH2();if(curH1){tree.push(curH1);curH1=null}}
  paras.forEach(p=>{
    const l=lvl(p);
    const t=pText(p).replace(/\u00A0/g,' ').trim();
    if(!t&&l===0)return;
    if(l===1){
      flushH1();
      curH1={title:t||'Без названия',children:[]};
    }else if(l===2){
      flushH2();
      curH2={title:t||'Без названия',children:[]};
    }else if(l===3){
      const item={type:'h3',text:t};
      if(curH2)curH2.children.push(item);
      else if(curH1)curH1.children.push(item);
      else tree.push(item);
    }else{
      const item={type:'p',text:t};
      if(curH2)curH2.children.push(item);
      else if(curH1)curH1.children.push(item);
      else tree.push(item);
    }
  });
  flushH1();
  return tree;
}
async function makeFb2(){
  const meta=await getBookMeta();if(!meta)return;
  const tree=buildContentTree();
  const id='fb2-'+Date.now().toString(36);
  let body='';
  const leaf=it=>it.type==='h3'?'<p><strong>'+escXml(it.text)+'</strong></p>\n':'<p>'+escXml(it.text)+'</p>\n';
  function renderItems(items){
    let out='';
    if(items.some(it=>it.title!=null)){
      let loose='';
      items.forEach(it=>{
        if(it.title!=null){
          if(loose){out+='<section>\n'+loose+'</section>\n';loose=''}
          out+='<section>\n<title><p>'+escXml(it.title)+'</p></title>\n'+renderItems(it.children||[])+'</section>\n';
        }else loose+=leaf(it);
      });
      if(loose)out+='<section>\n'+loose+'</section>\n';
    }else items.forEach(it=>{out+=leaf(it)});
    return out;
  }
  const authXml=a=>{const w=String(a).trim().split(/\s+/);return '<author><first-name>'+escXml(w[0]||'')+'</first-name>'+(w.length>1?'<last-name>'+escXml(w.slice(1).join(' '))+'</last-name>':'')+'</author>'};
  const hasSections=tree.some(x=>x.title!=null);
  if(hasSections){
    body=renderItems(tree);
  }else{
    body='<section>\n'+renderItems(tree)+'</section>\n';
  }
  const xml=`<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description>
<title-info>
<genre>sf_fantasy</genre>
${authXml(meta.author)}
<book-title>${escXml(meta.title)}</book-title>
<lang>ru</lang>
</title-info>
<document-info>
${authXml(meta.author)}
<date>${new Date().toISOString().slice(0,10)}</date>
<id>${id}</id>
<version>1.0</version>
</document-info>
</description>
<body>
<title><p>${escXml(meta.title)}</p></title>
${body}
</body>
</FictionBook>`;
  const blob=new Blob([xml],{type:'application/x-fictionbook+xml'});
  const name=baseName(fname||meta.title)+'.fb2';
  downloadBlob(blob,name);
}
async function makeEpub(){
  const meta=await getBookMeta();if(!meta)return;
  const tree=buildContentTree();
  const bookId='urn:uuid:'+(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16)}));
  const now=new Date().toISOString().replace(/\.\d+Z$/,'Z');

  const chapters=[];
  let introParas=[];
  tree.forEach(it=>{
    if(it.title!=null){
      if(introParas.length){
        chapters.push({title:'Вступление',html:introParas.map(p=>'<p>'+escXml(p.text)+'</p>').join('\n')});
        introParas=[];
      }
      let html='';
      function render(items){
        items.forEach(c=>{
          if(c.type==='p')html+='<p>'+escXml(c.text)+'</p>\n';
          else if(c.type==='h3')html+='<h3>'+escXml(c.text)+'</h3>\n';
          else if(c.title!=null){
            html+='<h2>'+escXml(c.title)+'</h2>\n';
            render(c.children||[]);
          }
        });
      }
      html+='<h1>'+escXml(it.title)+'</h1>\n';
      render(it.children||[]);
      chapters.push({title:it.title,html});
    }else if(it.type==='p'){
      introParas.push(it);
    }
  });
  if(introParas.length){
    chapters.unshift({title:'Вступление',html:introParas.map(p=>'<p>'+escXml(p.text)+'</p>').join('\n')});
  }
  if(!chapters.length){
    chapters.push({title:meta.title,html:'<p></p>'});
  }

  const epub=new JSZip();
  epub.file('mimetype','application/epub+zip',{compression:'STORE'});
  epub.folder('META-INF').file('container.xml',`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);

  const oebps=epub.folder('OEBPS');
  oebps.file('style.css',`body{font-family:serif;line-height:1.5;margin:1em}
h1{font-size:1.6em;text-align:center;margin:1.4em 0 0.8em;page-break-before:always}
h2{font-size:1.25em;margin:1.2em 0 0.6em}
h3{font-size:1.1em;margin:1em 0 0.4em}
p{text-indent:1.5em;margin:0 0 0.4em;text-align:justify}
h1+p,h2+p,h3+p{text-indent:0}`);

  const manifest=[];
  const spine=[];
  const navPoints=[];
  chapters.forEach((ch,i)=>{
    const id='chap'+(i+1);
    const fname=`chap${i+1}.xhtml`;
    const content=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ru" lang="ru">
<head>
<meta charset="utf-8"/>
<title>${escXml(ch.title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${ch.html}
</body>
</html>`;
    oebps.file(fname,content);
    manifest.push(`<item id="${id}" href="${fname}" media-type="application/xhtml+xml"/>`);
    spine.push(`<itemref idref="${id}"/>`);
    navPoints.push(`<li><a href="${fname}">${escXml(ch.title)}</a></li>`);
  });

  const navContent=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ru" lang="ru">
<head>
<meta charset="utf-8"/>
<title>Оглавление</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
<nav epub:type="toc" id="toc">
<h1>Оглавление</h1>
<ol>
${navPoints.join('\n')}
</ol>
</nav>
</body>
</html>`;
  oebps.file('nav.xhtml',navContent);
  manifest.unshift(`<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`);
  manifest.unshift(`<item id="css" href="style.css" media-type="text/css"/>`);

  const opf=`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId" xml:lang="ru">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="BookId">${bookId}</dc:identifier>
<dc:title>${escXml(meta.title)}</dc:title>
<dc:creator>${escXml(meta.author)}</dc:creator>
<dc:language>ru</dc:language>
<meta property="dcterms:modified">${now}</meta>
</metadata>
<manifest>
${manifest.join('\n')}
</manifest>
<spine>
${spine.join('\n')}
</spine>
</package>`;
  oebps.file('content.opf',opf);

  const blob=await epub.generateAsync({type:'blob',mimeType:'application/epub+zip',compression:'DEFLATE'});
  const name=baseName(fname||meta.title)+'.epub';
  downloadBlob(blob,name);
}
// ========== end export ==========

let drPushed=false;
let fragMode=false,fragA=null,fragB=null;
function clearFragHighlight(){
  document.querySelectorAll('.pw.frag-sel,.pw.frag-start,.pw.frag-end').forEach(el=>{
    el.classList.remove('frag-sel','frag-start','frag-end');
  });
}
function highlightFragRange(){
  clearFragHighlight();
  if(fragA==null)return;
  const ia=paras.indexOf(fragA);
  const ib=fragB!=null?paras.indexOf(fragB):ia;
  if(ia<0)return;
  const lo=Math.min(ia,ib),hi=Math.max(ia,ib);
  tas().forEach(t=>{
    const i=paras.indexOf(t._p);
    if(i<lo||i>hi)return;
    if(i===lo)t._w.classList.add('frag-start');
    else if(i===hi)t._w.classList.add('frag-end');
    else t._w.classList.add('frag-sel');
  });
}
function updateFragBar(){
  const bar=$('fragBar'),hint=$('fragHint'),copy=$('fragCopy');
  if(!fragMode){bar.classList.remove('on');document.body.classList.remove('frag-mode');return}
  bar.classList.add('on');document.body.classList.add('frag-mode');
  if(fragA==null){
    hint.textContent='Нажмите на первый абзац фрагмента';
    copy.disabled=true;copy.textContent='Копировать';
  }else if(fragB==null){
    hint.textContent='Первый абзац выбран. Нажмите на последний (можно тот же).';
    copy.disabled=false;copy.textContent='Копировать 1 абз.';
  }else{
    const ia=paras.indexOf(fragA),ib=paras.indexOf(fragB);
    const n=Math.abs(ia-ib)+1;
    const chars=paras.slice(Math.min(ia,ib),Math.max(ia,ib)+1).reduce((s,p)=>s+pText(p).length,0);
    hint.textContent='Выбрано абзацев: '+n+' · знаков: '+chars.toLocaleString('ru-RU');
    copy.disabled=false;copy.textContent='Копировать '+n+' абз.';
  }
  highlightFragRange();
}
function exitFragMode(){
  fragMode=false;fragA=null;fragB=null;
  clearFragHighlight();
  updateFragBar();
}
function startFragMode(){
  closeDr();
  if(readMode){readMode=false;document.body.classList.remove('reading');render()}
  fragMode=true;fragA=null;fragB=null;
  updateFragBar();
  flash('Режим фрагмента: выберите абзацы');
}
function onFragTap(p){
  if(!fragMode)return;
  if(fragA==null){fragA=p;fragB=null}
  else if(fragB==null){fragB=p}
  else{fragA=p;fragB=null}
  const s=secOf(p);
  if(s!==sec){sec=s;render();requestAnimationFrame(()=>{updateFragBar();const t=tas().find(z=>z._p===p);if(t)t._w.scrollIntoView({block:'center'})})}
  else updateFragBar();
}
async function copyFragment(){
  if(!fragA)return;
  const ia=paras.indexOf(fragA);
  const ib=fragB!=null?paras.indexOf(fragB):ia;
  if(ia<0)return;
  const lo=Math.min(ia,ib),hi=Math.max(ia,ib);
  const parts=[];
  for(let i=lo;i<=hi;i++){
    const t=pText(paras[i]).replace(/\u00A0/g,' ').trimEnd();
    parts.push(t);
  }
  const text=parts.join('\n\n').replace(/\n{3,}/g,'\n\n').trim();
  try{
    await navigator.clipboard.writeText(text);
    flash('Скопировано: '+(hi-lo+1)+' абз., '+text.length.toLocaleString('ru-RU')+' знаков');
  }catch(e){
    const ta=document.createElement('textarea');
    ta.value=text;ta.style.cssText='position:fixed;left:-9999px;top:0';
    document.body.appendChild(ta);ta.select();
    try{document.execCommand('copy');flash('Скопировано: '+(hi-lo+1)+' абз.')}
    catch(e2){alert('Не удалось скопировать');}
    ta.remove();
  }
  exitFragMode();
}
$('fragCancel').onclick=exitFragMode;
$('fragCopy').onclick=()=>copyFragment().catch(()=>flash('Ошибка копирования'));
try{history.scrollRestoration='manual'}catch(e){}
function panelShow(el){
  el.hidden=false;
  el.classList.remove('on');
  // force reflow so transition runs
  void el.offsetWidth;
  el.classList.add('on');
}
function panelHide(el,done){
  el.classList.remove('on');
  const fin=()=>{el.hidden=true;el.removeEventListener('transitionend',fin);if(done)done()};
  el.addEventListener('transitionend',fin);
  setTimeout(fin,260); // fallback
}
function closeDr(){
  const d=$('dr').hidden?$('mn'):$('dr');
  panelHide(d,()=>{if(drPushed){drPushed=false;try{history.back()}catch(e){}}});
}
addEventListener('popstate',()=>{if(!$('dr').hidden||!$('mn').hidden){drPushed=false;panelHide($('dr').hidden?$('mn'):$('dr'))}});
$('chap').onclick=()=>{
  const d=$('dr');d.textContent='';
  const top=document.createElement('div');top.className='top';
  const x=document.createElement('button');x.className='back';x.textContent='← Назад';x.onclick=closeDr;
  top.append(x);
  d.appendChild(top);
  const items=[];paras.forEach(p=>{const l=lvl(p);if(l===1||l===2)items.push([p,l])});
  if(!items.length)starts.forEach(i=>items.push([paras[i],1]));
  // статистика: от заголовка до следующего заголовка того же или старшего уровня
  const pi=new Map();paras.forEach((p,i)=>pi.set(p,i));
  const cpre=[0],wpre=[0];
  paras.forEach((p,i)=>{const t=pText(p);cpre.push(cpre[i]+t.length);wpre.push(wpre[i]+(t.match(/\S+/g)||[]).length)});
  const endOf=k=>{const l=items[k][1];for(let j=k+1;j<items.length;j++)if(items[j][1]<=l)return pi.get(items[j][0]);return paras.length};
  const fmt=n=>n.toLocaleString('ru-RU');
  let flt=null;
  if(items.length>=8){flt=document.createElement('input');flt.type='text';flt.placeholder='Найти главу';flt.setAttribute('autocomplete','off');top.append(flt)}
  const curStart=paras[starts[sec]];let curBtn=null;const btns=[];
  items.forEach(([p,l],k)=>{
    const b=document.createElement('button');
    const full=pText(p).trim()||'(без названия)';
    const t=document.createElement('div');t.textContent=full.length>64?full.slice(0,62)+'…':full;t.style.cssText='overflow:hidden;text-overflow:ellipsis';
    const i0=pi.get(p),i1=endOf(k);
    const st=document.createElement('div');st.textContent=fmt(cpre[i1]-cpre[i0])+' зн. · '+fmt(wpre[i1]-wpre[i0])+' сл.';
    st.style.cssText='font-size:12px;font-weight:400;color:var(--mut);margin-top:2px';
    b.append(t,st);b.title=full;b._k=full.toLowerCase();
    if(l===2){
      b.style.paddingLeft='28px';
      b.style.fontSize='14.5px';
      b.style.opacity='0.92';
    }else{
      b.style.fontWeight='600';
      b.style.fontSize='15.5px';
    }
    if(p===curStart){b.classList.add('cur');curBtn=b}
    b.onclick=()=>{closeDr();sec=secOf(p);render();const e=wOf(p);if(e)e.scrollIntoView({block:'start'})};
    d.appendChild(b);btns.push(b);
  });
  const none=document.createElement('div');none.textContent='Ничего не найдено';none.style.cssText='display:none;color:var(--mut);font-size:14px;padding:10px 4px';d.appendChild(none);
  if(flt){
    flt.oninput=()=>{const q=flt.value.trim().toLowerCase();let n=0;btns.forEach(b=>{const ok=!q||b._k.includes(q);b.style.display=ok?'':'none';if(ok)n++});none.style.display=n?'none':'block'};
    flt.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();const f=btns.find(b=>b.style.display!=='none');if(f)f.click()}};
  }
  panelShow(d);
  try{history.pushState({dr:1},'');drPushed=true}catch(e){}
  if(curBtn)curBtn.scrollIntoView({block:'center'});
};

/* ===== Закладки: хранятся на устройстве по имени файла, в сам файл не пишутся ===== */
let bms=[],bmFor='';
const bmKey=()=>'bm:'+fname,bmKey2=()=>'bm:~'+posNorm(fname);
const bmSnip=p=>pText(p).replace(/\s+/g,' ').trim().slice(0,48);
function bmHas(p){return !!p&&bms.some(b=>b.p===p)}
function bmFind(i,s){
  if(!paras.length)return null;
  i=Math.min(Math.max(0,i|0),paras.length-1);
  if(!s||bmSnip(paras[i])===s)return paras[i];
  let best=-1,bd=1e9;
  for(let k=0;k<paras.length;k++)if(bmSnip(paras[k])===s){const d=Math.abs(k-i);if(d<bd){bd=d;best=k}}
  if(best<0&&s.length>=8)for(let k=0;k<paras.length;k++)if(pText(paras[k]).replace(/\s+/g,' ').includes(s)){const d=Math.abs(k-i);if(d<bd){bd=d;best=k}}
  return best>=0?paras[best]:paras[i];
}
function bmLoad(){
  bms=[];bmFor=fname;
  try{
    const arr=JSON.parse(localStorage.getItem(bmKey())||localStorage.getItem(bmKey2())||'[]');
    arr.forEach(o=>{const p=bmFind(o.i,o.s);if(p&&!bms.some(b=>b.p===p))bms.push({p,i:paras.indexOf(p),s:bmSnip(p),t:o.t||0})});
    bms.sort((a,c)=>a.i-c.i);
  }catch(e){}
}
function bmFix(){
  if(!bms.length)return;
  bms.forEach(b=>{
    let k=paras.indexOf(b.p);
    if(k<0){b.p=bmFind(b.i,b.s);k=paras.indexOf(b.p)}
    b.i=k;
  });
  const seen=new Set();
  bms=bms.filter(b=>b.p&&b.i>=0&&!seen.has(b.p)&&seen.add(b.p));
  bms.sort((a,c)=>a.i-c.i);
}
function bmSave(){
  if(!doc||!fname||bmFor!==fname)return;
  try{
    bmFix();
    bms.forEach(b=>{b.s=bmSnip(b.p)});
    if(bms.length){const v=JSON.stringify(bms.map(b=>({i:b.i,s:b.s,t:b.t})));localStorage.setItem(bmKey(),v);localStorage.setItem(bmKey2(),v)}
    else{localStorage.removeItem(bmKey());localStorage.removeItem(bmKey2())}
  }catch(e){}
}
function bmHere(){
  if(!doc)return null;
  if(cur&&cur._w&&paras.indexOf(cur._p)>=0){const r=cur._w.getBoundingClientRect();if(r.bottom>0&&r.top<innerHeight)return cur._p}
  return topPara();
}
function bmMarks(){
  document.querySelectorAll('#list .pw').forEach(w=>{const p=w._t&&w._t._p;w.classList.toggle('bm',bmHas(p))});
  document.querySelectorAll('#list .rd').forEach(d=>d.classList.toggle('bm',bmHas(d._p)));
}
function bmToggle(){
  const p=bmHere();if(!p){flash('Не нашёл место для закладки');return}
  const k=bms.findIndex(b=>b.p===p);
  if(k>=0){bms.splice(k,1);flash('Закладка снята')}
  else{bms.push({p,i:paras.indexOf(p),s:bmSnip(p),t:Date.now()});flash('Закладка поставлена')}
  bmFix();bmSave();bmMarks();
}
function bmChap(i){
  for(let k=i;k>=0;k--){const l=lvl(paras[k]);if(l===1||l===2){const t=pText(paras[k]).trim();return t.length>40?t.slice(0,38)+'…':t}}
  return '';
}
function bmGo(p){
  closeDr();
  sec=secOf(p);render();
  const fix=()=>{const e=wOf(p);if(e)e.scrollIntoView({block:'center'});updThumb()};
  requestAnimationFrame(()=>setTimeout(fix,80));setTimeout(fix,400);
}
function bmView(){
  bmFix();
  const d=$('mn');d.textContent='';
  const back=document.createElement('button');back.textContent='← Меню';back.onclick=buildMenu;d.appendChild(back);
  const hp=bmHere();
  const add=document.createElement('button');add.className='bmadd';
  add.textContent=hp&&bmHas(hp)?'Снять закладку здесь':'＋ Закладка здесь';
  add.onclick=()=>{bmToggle();bmView()};d.appendChild(add);
  if(!bms.length){
    const e=document.createElement('div');e.textContent='Закладок пока нет.';
    e.style.cssText='color:var(--mut);font-size:14px;padding:8px 4px';d.appendChild(e);return;
  }
  const tot=Math.max(1,paras.length-1);
  bms.forEach(b=>{
    const row=document.createElement('div');row.className='bmrow';
    const g=document.createElement('button');g.className='bmg';
    const s=document.createElement('div');s.textContent=b.s||'(пустой абзац)';
    s.style.cssText='overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    const m=document.createElement('div');
    m.textContent=[bmChap(b.i),Math.round(b.i/tot*100)+'%'].filter(Boolean).join(' · ');
    m.style.cssText='font-size:12px;font-weight:400;color:var(--mut);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
    g.append(s,m);g.onclick=()=>bmGo(b.p);
    const x=document.createElement('button');x.className='bmx';x.textContent='✕';x.title='Удалить закладку';
    x.onclick=()=>{const k=bms.indexOf(b);if(k>=0)bms.splice(k,1);bmSave();bmMarks();flash('Закладка удалена');bmView()};
    row.append(g,x);d.appendChild(row);
  });
}
$('bmk').onclick=()=>{
  if(!$('mn').hidden&&$('mn').classList.contains('on')){closeDr();return}
  if(!$('dr').hidden||!$('spo').hidden||!$('sm').hidden||fragMode)return;
  openMenu();bmView();
};
$('mnb').onclick=()=>menuToggle();
$('thm').onclick=()=>{if(window.__theme)window.__theme.toggleTheme()};
$('fsb').onclick=()=>{try{if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen()}catch(e){}};
function openMenu(){
  buildMenu();const d=$('mn');panelShow(d);
  try{history.pushState({dr:1},'');drPushed=true}catch(e){}
}
function buildMenu(){
  const d=$('mn');d.textContent='';
  const info=document.createElement('div');info.className='info';
  info.style.cssText='color:var(--fg);opacity:0.78;font-size:13.5px;line-height:1.4;margin:2px 2px 10px';
  let nch=0;paras.forEach(p=>{nch+=pText(p).length});
  info.textContent=(fname||'Без имени')+' · '+nch.toLocaleString('ru-RU')+' знаков · '+words().toLocaleString('ru-RU')+' слов'+(draftTime?' · черновик сохранён в '+new Date(draftTime).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'}):'');
  d.appendChild(info);
  if(doc){
    const bk=document.createElement('button');bk.textContent='🔖 Закладки'+(bms.length?' ('+bms.length+')':'');bk.onclick=bmView;d.appendChild(bk);
    const bh=document.createElement('button');const hp=bmHere();bh.textContent=hp&&bmHas(hp)?'Снять закладку здесь':'＋ Закладка здесь';bh.onclick=()=>{closeDr();bmToggle()};d.appendChild(bh);
  }
  const top=d;
  const rm=document.createElement('button');rm.textContent=readMode?'✎ Режим правки':'📖 Режим чтения';rm.onclick=()=>{closeDr();setRead(!readMode)};top.appendChild(rm);
  const cf=document.createElement('button');cf.textContent='Копировать фрагмент';cf.onclick=startFragMode;top.appendChild(cf);
  const sb=document.createElement('button');sb.textContent='Проверить орфографию';sb.onclick=()=>{closeDr();runSpell().catch(e=>flash('Ошибка проверки: '+(e.message||e)))};top.appendChild(sb);
  const rb=document.createElement('button');rb.textContent='Подготовить для ЛитРес';rb.onclick=()=>{closeDr();litres().catch(e=>alert('Ошибка: '+e.message))};top.appendChild(rb);
  const fb=document.createElement('button');fb.textContent='Экспорт FB2';fb.onclick=()=>{closeDr();makeFb2().catch(e=>alert('Ошибка FB2: '+e.message))};top.appendChild(fb);
  const eb=document.createElement('button');eb.textContent='Экспорт EPUB';eb.onclick=()=>{closeDr();makeEpub().catch(e=>alert('Ошибка EPUB: '+e.message))};top.appendChild(eb);
  const ty=document.createElement('button');ty.textContent='Типографика (ёлочки, тире)';ty.onclick=()=>{closeDr();applyTypography()};top.appendChild(ty);
  const lb=document.createElement('button');const lt=()=>{lb.textContent='Подчёркивание ошибок: '+(live?'вкл':'выкл')};lt();
  lb.onclick=()=>{live=!live;try{localStorage.setItem('live',live?'1':'0')}catch(e){}lt();if(live)startLive().catch(()=>{});else remirror()};top.appendChild(lb);
  const eb2=document.createElement('button');const lt2=()=>{eb2.textContent='Проверка английских слов: '+(spellEn?'вкл':'выкл')};lt2();
  eb2.onclick=async()=>{
    spellEn=!spellEn;try{localStorage.setItem('spellEn',spellEn?'1':'0')}catch(e){}lt2();
    if(spellEn){flash('Загружаю английский словарь…');try{await ensureSpell();await loadEn()}catch(err){spellEn=false;try{localStorage.setItem('spellEn','0')}catch(e){}lt2();flash('Английский словарь не загрузился');return}}
    if(live)startLive().catch(()=>{});else{remirror();flash(spellEn?'Проверка английских слов включена':'Проверка английских слов выключена')}
  };
  top.appendChild(eb2);
  const th=document.createElement('button');
  const thLabel=()=>{th.textContent=(window.__theme&&window.__theme.isDark()?'☀ Светлая тема':'☾ Тёмная тема')};
  thLabel();
  th.onclick=()=>{if(window.__theme){window.__theme.toggleTheme();thLabel()}};
  top.appendChild(th);
  if(APP_SUPPORT){const spm=document.createElement('a');spm.className='mnlink';spm.textContent='♥ Поддержать автора';spm.href=APP_SUPPORT;spm.target='_blank';spm.rel='noopener';spm.onclick=()=>{setTimeout(closeDr,50)};top.appendChild(spm)}
  const abm=document.createElement('button');abm.textContent='О программе';abm.onclick=()=>{closeDr();showAbout()};top.appendChild(abm);
}
(function swipeMenu(){
  let sx=0,sy=0,mode=null;
  const mnOpen=()=>!$('mn').hidden&&$('mn').classList.contains('on');
  const canOpen=()=>!String(getSelection())&&!$('chap').disabled&&$('dr').hidden&&$('mn').hidden&&!fragMode&&$('spo').hidden&&$('sm').hidden;
  document.addEventListener('touchstart',e=>{
    mode=null;
    if(e.touches.length!==1)return;
    const t=e.touches[0];sx=t.clientX;sy=t.clientY;
    if(mnOpen())mode='close';
    else if(sx<=40&&canOpen())mode='open';
  },{passive:true});
  document.addEventListener('touchmove',e=>{
    if(!mode)return;
    const t=e.touches[0],dx=t.clientX-sx,dy=t.clientY-sy;
    if(Math.abs(dy)>14&&Math.abs(dy)>Math.abs(dx)*0.8){mode=null;return}
    if(mode==='open'&&dx>45){mode=null;openMenu()}
    else if(mode==='close'&&dx<-50){mode=null;closeDr()}
  },{passive:true});
  ['touchend','touchcancel'].forEach(ev=>document.addEventListener(ev,()=>{mode=null},{passive:true}));
  $('drBg').addEventListener('click',()=>{if(mnOpen())closeDr()});
  new MutationObserver(()=>$('drBg').classList.toggle('on',mnOpen())).observe($('mn'),{attributes:true,attributeFilter:['class','hidden']});
})();

// ===== Кнопка «Назад» в APK: сначала закрываем открытое, потом двойное нажатие для выхода =====
(function backButton(){
  if(!(window.AppMint&&AppMint.setBackHandler))return;
  let armed=0;
  AppMint.setBackHandler(function(){
    if(closeTop())return true;
    const now=Date.now();
    if(now-armed<2200)return false;
    armed=now;flash('Нажмите «Назад» ещё раз для выхода');
    return true;
  });
})();
function findNext(dir){
  const q=$('find').value.toLowerCase();if(!q)return;
  hits=[];paras.forEach((p,i)=>{if(pText(p).toLowerCase().includes(q))hits.push(p)});
  if(!hits.length){$('hc').textContent='0';return}
  if(hk<0&&dir<0)hk=0;
  hk=((hk+dir)%hits.length+hits.length)%hits.length;
  $('hc').textContent=(hk+1)+'/'+hits.length;
  const p=hits[hk];go(p);
  if(readMode){const e=wOf(p);if(e)e.scrollIntoView({block:'center'});return}
  const t=tas().find(x=>x._p===p);if(!t)return;
  const pos=t.value.toLowerCase().indexOf(q);
  t.focus({preventScroll:true});t.setSelectionRange(pos,pos+q.length);t.scrollIntoView({block:'center'});
}
$('find').oninput=()=>{hk=-1;$('hc').textContent=''};
$('find').onkeydown=e=>{if(e.key==='Enter')findNext(1)};
$('fnext').onclick=()=>findNext(1);$('fprev').onclick=()=>findNext(-1);
function toggleSearch(on){const o=on===undefined?!$('sp').classList.contains('on'):on;$('sp').classList.toggle('on',o);$('srch').classList.toggle('p',o);if(o)$('find').focus()}
$('srch').onclick=()=>toggleSearch();$('sx').onclick=()=>toggleSearch(false);
$('rall').onclick=()=>{
  const q=$('find').value,r=$('repl').value;if(!q)return;let n=0;const items=[];
  for(const t of Array.from(body.getElementsByTagNameNS(W,'t'))){const s=t.textContent;if(s.includes(q)){n+=s.split(q).length-1;const ns=s.split(q).join(r);items.push([t,s,ns]);t.textContent=ns;t.setAttributeNS(XNS,'xml:space','preserve')}}
  if(items.length)pushOp({t:'repl',items});
  alert('Замен: '+n+(n?'':'. Если слово разбито форматированием, правьте вручную.'));render();
};
function setFs(d){fs=Math.min(30,Math.max(14,fs+d));document.documentElement.style.setProperty('--fs',fs+'px');tas().forEach(grow);try{localStorage.setItem('fs',fs)}catch(e){}}
$('fm').onclick=()=>setFs(-1);$('fp').onclick=()=>setFs(1);
try{const v=+localStorage.getItem('fs');if(v){fs=v;setFs(0)}}catch(e){}
(function initTheme(){
  const root=document.documentElement;
  function sysDark(){return !!(window.matchMedia&&matchMedia('(prefers-color-scheme:dark)').matches)}
  function apply(mode){
    root.classList.remove('dark','light');
    if(mode==='dark')root.classList.add('dark');
    else if(mode==='light')root.classList.add('light');
  }
  function currentMode(){
    try{const m=localStorage.getItem('theme');if(m==='dark'||m==='light')return m}catch(e){}
    return 'auto';
  }
  function isDark(){
    const m=currentMode();
    return m==='dark'||(m!=='light'&&sysDark());
  }
  function toggleTheme(){
    const next=isDark()?'light':'dark';
    try{localStorage.setItem('theme',next)}catch(e){}
    apply(next);
    return next;
  }
  window.__theme={apply,currentMode,isDark,toggleTheme,sysDark};
  apply(currentMode());
  try{
    matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{
      if(currentMode()==='auto')apply('auto');
    });
  }catch(e){}
})();
async function openFile(f){
  try{
    // close stuck overlays / dimmers if any
    try{
      const dr=$('dr'),spo=$('spo'),sm=$('sm');
      if(dr){dr.classList.remove('on');dr.hidden=true}
      const mn=$('mn');if(mn){mn.classList.remove('on');mn.hidden=true}
      readMode=false;document.body.classList.remove('reading');
      if(spo){spo.classList.remove('on');spo.hidden=true}
      if(sm)sm.hidden=true;
    }catch(e){}
    const ext=extOf(f.name);
    fname=f.name;
    if(ext==='docx'){
      zip=await JSZip.loadAsync(await f.arrayBuffer());
      doc=new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'),'application/xml');
      body=doc.getElementsByTagNameNS(W,'body')[0];
      if(!body)throw new Error('В файле нет word/document.xml body');
      styleName={};
      const sf=zip.file('word/styles.xml');
      if(sf){const sx=new DOMParser().parseFromString(await sf.async('string'),'application/xml');
        for(const s of sx.getElementsByTagNameNS(W,'style')){const id=s.getAttributeNS(W,'styleId'),n=kids(s,'name')[0],name=n?n.getAttributeNS(W,'val'):'';styleName[id]=name;const m=/^(heading|заголовок) ([123])$/i.exec(name);if(m)styleId[m[2]]=id}}
    }else if(ext==='txt'){
      const raw=await f.text();
      itemsToDoc(parseTxt(raw));
    }else if(ext==='md'||ext==='markdown'){
      const raw=await f.text();
      itemsToDoc(parseMd(raw));
    }else if(ext==='fb2'){
      const raw=await f.text();
      itemsToDoc(parseFb2(raw));
    }else{
      // try by content: zip → docx, else text
      const buf=await f.arrayBuffer();
      const u8=new Uint8Array(buf);
      const isZip=u8.length>3&&u8[0]===0x50&&u8[1]===0x4b;
      if(isZip){
        zip=await JSZip.loadAsync(buf);
        const dx=zip.file('word/document.xml');
        if(!dx)throw new Error('Это ZIP, но не .docx');
        doc=new DOMParser().parseFromString(await dx.async('string'),'application/xml');
        body=doc.getElementsByTagNameNS(W,'body')[0];styleName={};
        const sf=zip.file('word/styles.xml');
        if(sf){const sx=new DOMParser().parseFromString(await sf.async('string'),'application/xml');
          for(const s of sx.getElementsByTagNameNS(W,'style')){const id=s.getAttributeNS(W,'styleId'),n=kids(s,'name')[0],name=n?n.getAttributeNS(W,'val'):'';styleName[id]=name;const m=/^(heading|заголовок) ([123])$/i.exec(name);if(m)styleId[m[2]]=id}}
      }else{
        const raw=new TextDecoder('utf-8').decode(u8);
        if(/<FictionBook[\s>]/i.test(raw)||/<fb2[\s>]/i.test(raw))itemsToDoc(parseFb2(raw));
        else itemsToDoc(parseTxt(raw));
      }
    }
    restructure();bmLoad();sec=0;undoS=[];redoS=[];updBtns();draftBase();hideM('ob');
    if(typeof exitFragMode==='function')exitFragMode();
    ['save','chap','srch','bmk','mnb'].forEach(i=>$(i).disabled=false);
    render();scrollTo(0,0);cur=null;schedThumb();setTimeout(updThumb,200);if(live)startLive().catch(()=>{});
    try{const sp=JSON.parse(localStorage.getItem('pos:'+fname)||localStorage.getItem('pos:~'+posNorm(fname)));
      if(sp&&paras[sp.i]){const p=paras[sp.i];sec=secOf(p);render();
        requestAnimationFrame(()=>requestAnimationFrame(()=>{const t=focusP(p,sp.c);if(t)t.scrollIntoView({block:'center'})}))}}catch(e){}
    if(!autoOpen)lastSnap();
    if(typeof nativeMarkCurrent==='function')nativeMarkCurrent();
    else if(NATIVE&&!fh&&fname)nCur=nCur||fname;
    flash('Открыто: '+fname+' · '+paras.length+' абз.');
  }catch(e){alert('Не удалось открыть файл: '+e.message)}
}
let fh=null,nCur=null,nCurBlocked=false;
const NATIVE=window.webkit&&window.webkit.messageHandlers&&window.webkit.messageHandlers.native;
const toB64=b=>new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result.split(',')[1]);fr.readAsDataURL(b)});
window.nativeOpened=(name,b64)=>{
  const bin=atob(b64),u=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  fh=null;nCurBlocked=false;
  nCur=name||null;
  openFile(new File([u],name||'document.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));
};
window.nativeSaved=(m,n)=>{
  if(n)nCur=n;
  const t=String(m==null?'':m).replace(/\s*\(\s*[\d\s\u00a0.,]+\s*(?:б|байт\w*|B|КБ|кб|KB)\s*\)\s*$/i,'');
  flash(t);
  if(/^Сохранен/i.test(t))markDraftClean();
};
// Натив сообщает, что URI для записи есть. Не требуем точного совпадения имени.
window.nativeTarget=(name,writable)=>{
  try{
    if(fh)return;
    if(writable===false){nCur=null;nCurBlocked=true;return}
    nCurBlocked=false;
    nCur=name||fname||nCur||'document.docx';
  }catch(e){}
};
function askNativeTarget(){try{if(NATIVE)NATIVE.postMessage({cmd:'getTarget'})}catch(e){}}
// После любого открытия в APK считаем, что native может писать в текущий URI.
function nativeMarkCurrent(){
  if(NATIVE&&!fh&&fname)nCur=nCur||fname;
}
const hasPick='showOpenFilePicker' in window,hasSave='showSaveFilePicker' in window;
const DT='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const FT=[{
  description:'Документы',
  accept:{
    [DT]:['.docx'],
    'text/plain':['.txt'],
    'text/markdown':['.md','.markdown'],
    'application/x-fictionbook+xml':['.fb2'],
    'application/xml':['.fb2']
  }
}];

function createBlankPackage(){
  const z=new JSZip();
  z.file('[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`);
  z.folder('_rels').file('.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  z.folder('word').folder('_rels').file('document.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);
  const stylesXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:qFormat/></w:style>
</w:styles>`;
  z.folder('word').file('styles.xml',stylesXml);
  const docXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body></w:body>
</w:document>`;
  z.folder('word').file('document.xml',docXml);
  return z;
}

function itemsToDoc(items){
  zip=createBlankPackage();
  doc=new DOMParser().parseFromString(
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}"><w:body/></w:document>`,'application/xml');
  body=doc.getElementsByTagNameNS(W,'body')[0];
  styleName={Heading1:'heading 1',Heading2:'heading 2',Heading3:'heading 3',Normal:'Normal'};
  styleId={1:'Heading1',2:'Heading2',3:'Heading3'};
  for(const it of items){
    const p=mk('p');
    if(it.level)setStyle(p,styleId[it.level]);
    body.appendChild(p);
    setText(p,it.text||'');
  }
  if(!items.length){
    const p=mk('p');body.appendChild(p);setText(p,'');
  }
  zip.file('word/document.xml',new XMLSerializer().serializeToString(doc));
}

function joinBlockLines(block){
  const lines=String(block).replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').map(l=>l.replace(/[ \t]+$/,'')).filter((l,i,a)=>l.length||(i&&i<a.length-1));
  if(!lines.length)return '';
  // poetry / hard-wrap heuristic: most lines short → keep line breaks
  const nonEmpty=lines.filter(l=>l.trim());
  if(nonEmpty.length>=2){
    const short=nonEmpty.filter(l=>l.trim().length<=48).length;
    if(short>=nonEmpty.length*0.7)return nonEmpty.join('\n').trim();
  }
  return nonEmpty.join(' ').replace(/\s+/g,' ').trim();
}
function parseTxt(raw){
  const text=String(raw).replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  const blocks=text.split(/\n\s*\n/);
  const items=[];
  for(const b of blocks){
    const t=joinBlockLines(b);
    if(!t)continue;
    items.push({level:0,text:t});
  }
  if(!items.length&&text.trim())items.push({level:0,text:joinBlockLines(text)});
  return items;
}

function parseMd(raw){
  const text=String(raw).replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  const lines=text.split('\n');
  const items=[];
  let buf=[];
  const clean=s=>s
    .replace(/^>\s?/,'')
    .replace(/^\s*[-*+]\s+/,'')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g,'$1')
    .replace(/`([^`]+)`/g,'$1')
    .replace(/\*\*(.+?)\*\*/g,'$1')
    .replace(/__(.+?)__/g,'$1')
    .replace(/\*([^*\n]+)\*/g,'$1')
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g,'$1$2');
  const flush=()=>{
    const t=joinBlockLines(buf.map(clean).join('\n'));
    if(t)items.push({level:0,text:t});
    buf=[];
  };
  for(const line of lines){
    const h=line.match(/^(#{1,3})\s+(.*)$/);
    if(h){
      flush();
      items.push({level:h[1].length,text:clean(h[2]).trim()});
      continue;
    }
    if(/^\s*$/.test(line)){flush();continue}
    buf.push(line);
  }
  flush();
  return items;
}

function parseFb2(raw){
  let xml=String(raw);
  if(xml.charCodeAt(0)===0xFEFF)xml=xml.slice(1);
  const FBNS='http://www.gribuser.ru/xml/fictionbook/2.0';
  const dom=new DOMParser().parseFromString(xml,'application/xml');
  if(dom.getElementsByTagName('parsererror').length){
    throw new Error('Не удалось разобрать FB2 (битый XML)');
  }
  const byNS=(node,ln)=>node.getElementsByTagNameNS
    ? Array.from(node.getElementsByTagNameNS(FBNS,ln)).concat(Array.from(node.getElementsByTagName(ln)))
    : Array.from(node.getElementsByTagName(ln));
  // de-dupe by identity
  const uniq=arr=>{const s=new Set();return arr.filter(x=>{if(s.has(x))return false;s.add(x);return true})};
  const items=[];
  const walk=(node,depth)=>{
    if(!node||node.nodeType!==1)return;
    const name=node.localName||node.nodeName.replace(/^.*:/,'');
    if(name==='title'){
      let t='';
      const ps=uniq(byNS(node,'p'));
      if(ps.length){
        t=ps.map(p=>p.textContent||'').join(' ').replace(/\s+/g,' ').trim();
      }else t=(node.textContent||'').replace(/\s+/g,' ').trim();
      if(t)items.push({level:Math.min(3,Math.max(1,depth||1)),text:t});
      return;
    }
    if(name==='p'||name==='subtitle'||name==='text-author'||name==='v'){
      const t=(node.textContent||'').replace(/\s+/g,' ').trim();
      if(t)items.push({level:0,text:t});
      return;
    }
    if(name==='empty-line')return;
    if(name==='section'||name==='body'){
      const nextDepth=name==='section'?depth+1:depth;
      for(const ch of Array.from(node.childNodes))walk(ch,nextDepth);
      return;
    }
    for(const ch of Array.from(node.childNodes))walk(ch,depth);
  };
  const bodies=uniq(byNS(dom, 'body'));
  if(bodies.length){
    let main=null;
    for(const b of bodies){
      const n=(b.getAttribute('name')||'').toLowerCase();
      if(!n||(n!=='notes'&&n!=='comments')){main=b;break}
    }
    walk(main||bodies[0],0);
  }else{
    walk(dom.documentElement,0);
  }
  return items;
}

function extOf(name){
  const m=/\.([^.]+)$/.exec(name||'');
  return m?m[1].toLowerCase():'';
}
function baseName(name){
  return String(name||'').replace(/\.[^.]+$/,'')||'Книга';
}

let flashT=0;
function flash(m){
  const t=$('ts');
  t.textContent=m;
  t.style.opacity=1;
  clearTimeout(flashT);
  flashT=setTimeout(()=>t.style.opacity=0,2200);
}
async function makeBlob(){zip.file('word/document.xml',new XMLSerializer().serializeToString(doc));return zip.generateAsync({type:'blob',mimeType:DT,compression:'DEFLATE'})}
async function writeTo(h,blob){
  if(h.requestPermission){const r=await h.requestPermission({mode:'readwrite'});if(r!=='granted')throw new Error('нет разрешения на запись')}
  const w=await h.createWritable();await w.write(blob);await w.close();
}
function closeSm(){$('sm').hidden=true}
function openSm(){
  // В APK после открытия через 📂 native держит URI — разрешаем «В текущий».
  if(NATIVE&&!fh&&doc&&fname&&!nCurBlocked)nCur=nCur||fname;
  const can=!!(fh||nCur);
  $('sc').disabled=!can;
  if(can)$('sh').textContent='В текущий: «'+(fh?fh.name:nCur)+'». Файл будет перезаписан.';
  else if(NATIVE)$('sh').textContent='Документ открыт из копии: адрес файла неизвестен. Нажмите 📂 и выберите тот же файл — перезапись станет доступна, либо сохраните как новый.';
  else $('sh').textContent='Текущий файл недоступен для записи: браузер открыл его без права перезаписи. Можно сохранить как новый.';
  $('sm').hidden=false;
}
async function saveCurrent(){
  closeSm();
  if(NATIVE&&(nCur||(fname&&!nCurBlocked))){
    if(!nCur)nCur=fname;
    NATIVE.postMessage({cmd:'saveCurrent',b64:await toB64(await makeBlob())});
    return;
  }
  try{await writeTo(fh,await makeBlob());flash('Сохранено в текущий файл');markDraftClean()}
  catch(e){alert('Не удалось записать в текущий файл: '+e.message+'. Сохраните как новый файл.')}
}
async function saveNew(){
  closeSm();savePos();const blob=await makeBlob(),name=baseName(fname)+'_ред.docx';
  if(NATIVE){NATIVE.postMessage({cmd:'saveNew',name,b64:await toB64(blob)});return}
  if(hasSave){
    try{const h=await showSaveFilePicker({suggestedName:name,types:FT});await writeTo(h,blob);fh=h;flash('Сохранено: '+h.name);markDraftClean();return}
    catch(e){if(e.name==='AbortError')return}
  }
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;
  document.body.appendChild(a);a.click();a.remove();flash('Файл скачан');markDraftClean();
}
$('open').onclick=async()=>{
  if(NATIVE){NATIVE.postMessage({cmd:'open'});return}
  // showOpenFilePicker on Android often leaves a black scrim / broken UI — prefer input
  const inApp=!!(window.AppMint||window.WebToApk);
  const preferInput=false;
  if(hasPick&&!preferInput){
    try{
      const[h]=await showOpenFilePicker({types:FT});
      fh=h;
      await openFile(await h.getFile());
      return;
    }catch(e){
      console.warn('[ext] picker:',e&&e.name,e&&e.message);
      if(e&&e.name==='AbortError')return;
      // fall through to input
    }
  }
  $('file').click();
};
$('file').onchange=async e=>{
  const f=e.target.files&&e.target.files[0];
  e.target.value='';
  if(!f)return;
  fh=null;
  try{await openFile(f)}catch(err){alert('Не удалось открыть файл: '+(err.message||err))}
};
$('save').onclick=openSm;$('sc').onclick=saveCurrent;$('sn').onclick=saveNew;$('sk').onclick=closeSm;
$('sm').addEventListener('click',e=>{if(e.target.id==='sm')closeSm()});

/* ===== v1.1: автосохранение черновика, подсказка, «О программе», горячие клавиши ===== */
const APP_VERSION='1.3.4',APP_REPO='https://github.com/Caravadgo/docx-editor',APP_SUPPORT='https://boosty.to/silas_kraven',APP_LICENSE='';
const DRAFT_DB='docxEditorDrafts',DRAFT_ST='drafts',DRAFT_MAX=5;
let draftS='',draftT=0,draftFirst=0,draftBusy=false,draftTime=0;
const mkEl=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const showM=id=>{$(id).hidden=false};
const hideM=id=>{$(id).hidden=true};
const coarse=()=>{try{return matchMedia('(pointer:coarse)').matches}catch(e){return 'ontouchstart' in window}};
const fmtT=t=>new Date(t).toLocaleString('ru-RU',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'});

function dbOpen(){return new Promise((res,rej)=>{try{const r=indexedDB.open(DRAFT_DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(DRAFT_ST,{keyPath:'key'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}})}
async function dbAll(){const db=await dbOpen();return new Promise((res,rej)=>{const q=db.transaction(DRAFT_ST).objectStore(DRAFT_ST).getAll();q.onsuccess=()=>{db.close();res(q.result||[])};q.onerror=()=>{db.close();rej(q.error)}})}
async function dbPut(v){const db=await dbOpen();return new Promise((res,rej)=>{const t=db.transaction(DRAFT_ST,'readwrite');t.objectStore(DRAFT_ST).put(v);t.oncomplete=()=>{db.close();res()};t.onerror=t.onabort=()=>{db.close();rej(t.error)}})}
async function dbDel(key){const db=await dbOpen();return new Promise((res,rej)=>{const t=db.transaction(DRAFT_ST,'readwrite');t.objectStore(DRAFT_ST).delete(key);t.oncomplete=()=>{db.close();res()};t.onerror=t.onabort=()=>{db.close();rej(t.error)}})}
async function pruneDrafts(){const a=(await dbAll()).sort((x,y)=>y.time-x.time);for(const d of a.slice(DRAFT_MAX))await dbDel(d.key)}
const serDoc=()=>new XMLSerializer().serializeToString(doc);
function draftBase(){try{draftS=serDoc()}catch(e){draftS=''}clearTimeout(draftT);draftFirst=0;draftTime=0}
async function saveDraft(o){
  o=o||{};
  if(!doc||!zip||!fname)return;
  if(draftBusy){if(!o.force)return;while(draftBusy)await new Promise(r=>setTimeout(r,50))}
  let s;try{s=serDoc()}catch(e){return}
  if(!o.force&&s===draftS)return;
  draftBusy=true;
  try{
    zip.file('word/document.xml',s);
    const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
    const rec={key:'d:'+fname,name:fname,bytes,time:Date.now(),clean:!!o.clean};
    await dbPut(rec);draftS=s;draftTime=rec.time;
    lastPut({key:'last',name:rec.name,bytes:rec.bytes,time:rec.time,clean:rec.clean}).catch(()=>{});
    pruneDrafts().catch(()=>{});
  }catch(e){}
  draftBusy=false;
}
function markDraftClean(){return saveDraft({force:true,clean:true})}
function touchDraft(){
  if(!doc)return;
  const n=Date.now();if(!draftFirst)draftFirst=n;
  clearTimeout(draftT);
  if(n-draftFirst>25000){draftFirst=0;saveDraft();return}
  draftT=setTimeout(()=>{draftFirst=0;saveDraft()},5000);
}
['input','keydown','touchend','click'].forEach(ev=>document.addEventListener(ev,touchDraft,true));
document.addEventListener('visibilitychange',()=>{if(document.hidden)saveDraft()});
addEventListener('pagehide',()=>{saveDraft()});

function themeBtn(){const b=mkEl('button','');const l=()=>{b.textContent=window.__theme&&window.__theme.isDark()?'☀ Светлая тема':'☾ Тёмная тема'};l();b.onclick=()=>{if(window.__theme){window.__theme.toggleTheme();l()}};return b}
function stepEl(n,t,sub){const d=mkEl('div','st');d.append(mkEl('i','',n));const w=mkEl('div','');w.append(document.createTextNode(t));if(sub)w.append(mkEl('span','',sub));d.append(w);return d}

function showOnb(){
  const m=$('ob');m.textContent='';const b=mkEl('div','box');
  b.append(mkEl('h2','','Как начать'));
  b.append(stepEl('1','Откройте файл','Кнопка 📂 вверху: .docx, .txt, .md или .fb2'));
  b.append(stepEl('2','Пишите','Правки сами попадают в черновик на устройстве'));
  b.append(stepEl('3',coarse()?'Свайп от левого края — меню':'Ctrl+M или F2 — меню','Орфография, подготовка под ЛитРес, режим чтения, экспорт'));
  const ok=mkEl('button','p','Понятно');ok.onclick=()=>closeModal('ob');
  b.append(ok,themeBtn());
  m.append(b);m.onclick=e=>{if(e.target===m)closeModal('ob')};showM('ob');
}
function maybeOnb(){try{if(localStorage.getItem('onb')==='1')return}catch(e){}if(!doc)showOnb()}
function closeModal(id){hideM(id);if(id==='ob'){try{localStorage.setItem('onb','1')}catch(e){}}}

function showAbout(){
  const m=$('ab');m.textContent='';const b=mkEl('div','box');
  b.append(mkEl('h2','','DOCX-редактор'));
  b.append(mkEl('p','','Версия '+APP_VERSION+'. Редактор книг в .docx, .txt, .md и .fb2: правка текста, орфография, подготовка файла под ЛитРес. Всё работает на устройстве, файлы никуда не отправляются.'));
  b.append(mkEl('p','',APP_LICENSE?('Лицензия: '+APP_LICENSE+'.'):'Лицензия: см. файл LICENSE в репозитории.'));
  const gh=mkEl('a','btn','GitHub: код и релизы');gh.href=APP_REPO;gh.target='_blank';gh.rel='noopener';b.append(gh);
  if(APP_SUPPORT){const sp=mkEl('a','btn','Поддержать автора');sp.href=APP_SUPPORT;sp.target='_blank';sp.rel='noopener';b.append(sp)}
  const k=mkEl('div','keys');
  [['Ctrl+O','открыть файл'],['Ctrl+S','сохранить'],['Ctrl+F','поиск'],['Ctrl+Z / Ctrl+Y','отменить / повторить'],['Ctrl+M или F2','меню'],['Ctrl+B','закладка здесь'],['Esc','закрыть панель']].forEach(r=>{k.append(mkEl('kbd','',r[0]),mkEl('span','',r[1]))});
  b.append(k);
  b.append(mkEl('p','sm','Используются: JSZip и pako (MIT), nspell (MIT), словари ru_RU (А. И. Лебедев, лицензия в стиле BSD) и en_US (SCOWL, Kevin Atkinson; аффиксы — BSD, Geoff Kuenning).'));
  const hint=mkEl('button','','Показать подсказку «Как начать»');hint.onclick=()=>{hideM('ab');showOnb()};
  const cl=mkEl('button','p','Закрыть');cl.onclick=()=>closeModal('ab');
  b.append(hint,themeBtn(),cl);
  m.append(b);m.onclick=e=>{if(e.target===m)closeModal('ab')};showM('ab');
}
{const a0=$('abt');if(a0)a0.onclick=showAbout}

function showRestore(ds){
  const m=$('rs');m.textContent='';const b=mkEl('div','box');
  b.append(mkEl('h2','','Найден несохранённый черновик'));
  b.append(mkEl('p','','Приложение закрылось, пока правки не были записаны в файл. Файл откроется как копия: сохраните его через «Как новый файл».'));
  ds.slice(0,DRAFT_MAX).forEach(d=>{const r=mkEl('button','p',d.name+' · '+fmtT(d.time));r.onclick=()=>restoreDraft(d);b.append(r)});
  const del=mkEl('button','','Удалить черновики');del.onclick=async()=>{for(const d of ds){try{await dbDel(d.key)}catch(e){}}hideM('rs');maybeOnb()};
  const no=mkEl('button','','Не сейчас');no.onclick=()=>hideM('rs');
  b.append(del,no);m.append(b);showM('rs');
}
async function restoreDraft(d){
  hideM('rs');
  const nm=extOf(d.name)==='docx'?d.name:baseName(d.name)+'.docx';
  fh=null;nCur=null;
  await openFile(new File([d.bytes],nm,{type:DT}));
  if(!doc)return;
  await saveDraft({force:true});
  if(d.key!=='d:'+fname){try{await dbDel(d.key)}catch(e){}}
}

/* закрытие верхнего слоя: Esc на ПК и кнопка «Назад» в APK */
function closeTop(){
  for(const id of ['ab','ob','rs']){if(!$(id).hidden){closeModal(id);return true}}
  if(!$('sm').hidden){closeSm();return true}
  if(!$('spo').hidden){panelHide($('spo'));return true}
  if(!$('dr').hidden||!$('mn').hidden){closeDr();return true}
  if(fragMode){exitFragMode();return true}
  if($('sp').classList.contains('on')){toggleSearch(false);return true}
  if(readMode){setRead(false);return true}
  return false;
}
function menuToggle(){
  if(!$('mn').hidden&&$('mn').classList.contains('on')){closeDr();return}
  if(!$('dr').hidden||!$('mn').hidden||!$('spo').hidden||!$('sm').hidden||fragMode)return;
  for(const id of ['ab','ob','rs'])if(!$(id).hidden)return;
  openMenu();
}
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(closeTop())e.preventDefault();return}
  const mod=(e.ctrlKey||e.metaKey)&&!e.altKey,c=e.code;
  if(mod&&c==='KeyO'){e.preventDefault();$('open').click();return}
  if(!doc)return;
  if(e.key==='F2'){e.preventDefault();menuToggle();return}
  if(!mod)return;
  if(c==='KeyS'){e.preventDefault();if(!$('sm').hidden)return;if(NATIVE&&!fh&&doc&&fname&&!nCurBlocked)nCur=nCur||fname;if(fh||nCur)saveCurrent();else openSm();return}
  if(c==='KeyF'){e.preventDefault();toggleSearch(true);$('find').select();return}
  if(c==='KeyM'){e.preventDefault();menuToggle();return}
  if(c==='KeyB'&&!e.shiftKey){e.preventDefault();bmToggle();return}
  if(c==='KeyZ'||c==='KeyY'){
    const t=e.target;if(t&&t.tagName==='INPUT')return;
    e.preventDefault();
    if(c==='KeyY'||e.shiftKey)redo();else undo();
  }
});

/* ===== v1.2: при запуске открывается последний файл ===== */
const LAST_DB='docxEditorLast',LAST_ST='last';
let autoOpen=false;
function lastDb(){return new Promise((res,rej)=>{try{const r=indexedDB.open(LAST_DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(LAST_ST,{keyPath:'key'});r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)}catch(e){rej(e)}})}
async function lastGet(){const db=await lastDb();return new Promise((res,rej)=>{const q=db.transaction(LAST_ST).objectStore(LAST_ST).get('last');q.onsuccess=()=>{db.close();res(q.result||null)};q.onerror=()=>{db.close();rej(q.error)}})}
async function lastPut(v){const db=await lastDb();return new Promise((res,rej)=>{const t=db.transaction(LAST_ST,'readwrite');t.objectStore(LAST_ST).put(v);t.oncomplete=()=>{db.close();res()};t.onerror=t.onabort=()=>{db.close();rej(t.error)}})}
async function lastSnap(){
  if(!doc||!zip||!fname)return;
  try{
    zip.file('word/document.xml',serDoc());
    const bytes=await zip.generateAsync({type:'uint8array',compression:'DEFLATE'});
    await lastPut({key:'last',name:fname,bytes,time:Date.now(),clean:true});
  }catch(e){}
}

/* старт: последний файл, восстановление черновика или подсказка новичку */
(async()=>{
  let rec=null;
  try{rec=await lastGet()}catch(e){}
  if(rec&&rec.bytes&&!doc){
    autoOpen=true;
    try{
      const nm=extOf(rec.name)==='docx'?rec.name:baseName(rec.name)+'.docx';
      fh=null;nCur=null;
      if(!doc)await openFile(new File([rec.bytes],nm,{type:DT}));
    }catch(e){}
    autoOpen=false;
    if(doc){
      askNativeTarget();
      if(!rec.clean)flash('Открыт последний файл: в нём есть несохранённые правки');
      try{
        const own=['d:'+rec.name,'d:'+fname];
        const ds=(await dbAll()).filter(d=>!d.clean&&d.bytes&&own.indexOf(d.key)<0).sort((a,b)=>b.time-a.time);
        if(ds.length)showRestore(ds);
      }catch(e){}
      return;
    }
  }
  try{
    const ds=(await dbAll()).filter(d=>!d.clean&&d.bytes).sort((a,b)=>b.time-a.time);
    if(ds.length&&!doc){showRestore(ds);return}
  }catch(e){}
  maybeOnb();
})();
