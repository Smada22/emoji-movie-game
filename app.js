(()=>{
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const P=window.PUZZLES;
const FILMS=[...P.map(p=>({title:p.title,year:p.year})),...window.DECOY_FILMS.filter(d=>!P.some(p=>p.title===d.title))];
const CFG={step:150,timeW:0.5,auto:10,window:60,year:0.85,genre:0.75,wrong:0.85,maxWrong:3,streakCap:5};
const norm=s=>s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/^the\s+/,"").replace(/[^a-z0-9]/g,"");

// ---- scoring (design doc §4.1) ----
function score({n,t,year,genre,wrong,streak}){
  const reveal=1000-CFG.step*(n-1), time=1-CFG.timeW*Math.min(t,60)/60;
  const hint=(year?CFG.year:1)*(genre?CFG.genre:1), w=Math.pow(CFG.wrong,wrong), s=1+0.1*Math.min(streak,CFG.streakCap);
  return {reveal,time,hint,w,s,points:Math.floor(reveal*time*hint*w*s+0.5+1e-9)};
}
window.__score=score;

// ---- seeded RNG for Daily ----
const today=new Date(), dayKey=today.toISOString().slice(0,10);
function rng(seed){let x=0;for(const c of seed)x=(x*31+c.charCodeAt(0))>>>0;return()=>{x^=x<<13;x>>>=0;x^=x>>17;x^=x<<5;x>>>=0;return x/4294967296}}
function shuffle(a,r=Math.random){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a}
const dayNum=Math.floor((Date.UTC(today.getFullYear(),today.getMonth(),today.getDate())-Date.UTC(2026,0,1))/864e5)+1;

// ---- state ----
let S={mode:null,queue:[],idx:0,streak:0,results:[],total:0};
let R=null, tick=null;
const store={get:(k,d)=>{try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set:(k,v)=>localStorage.setItem(k,JSON.stringify(v))};
$("#playerName").value=store.get("er_name","");
$("#playerName").oninput=e=>store.set("er_name",e.target.value.trim());

function show(id){$$(".view").forEach(v=>v.classList.toggle("hidden",v.id!==id));window.scrollTo(0,0);if(id==="board")renderBoard()}
$$("[data-nav]").forEach(b=>b.onclick=()=>{stopRound();show(b.dataset.nav)});
const doneToday=store.get("er_daily_"+dayKey,null);
if(doneToday)$("#dailyInfo").textContent=`Done today: ${doneToday.total} pts · replay for practice`;

$("#btnDaily").onclick=()=>{S={mode:"daily",queue:shuffle(P,rng(dayKey)).slice(0,5),idx:0,streak:0,results:[],total:0};ready()};
$("#btnPractice").onclick=()=>{S={mode:"practice",queue:shuffle(P),idx:0,streak:0,results:[],total:0};ready()};
function cur(){return S.queue[S.idx%S.queue.length]}
function ready(){
  const p=cur();
  $("#readyLabel").textContent=S.mode==="daily"?`Daily #${dayNum} · Puzzle ${S.idx+1} of 5 · ${p.tier}`:`Practice · Puzzle ${S.idx+1} · ${p.tier}`;
  show("ready");
}
$("#btnStart").onclick=startRound;

function startRound(){
  const p=cur();
  R={p,n:1,start:performance.now(),year:false,genre:false,wrong:0,guesses:[],done:false,lastAuto:0};
  $("#roundLabel").textContent=S.mode==="daily"?`Puzzle ${S.idx+1}/5 · ${p.tier}`:`Practice #${S.idx+1} · ${p.tier}`;
  $("#streakLabel").textContent=S.streak?`🔥 streak ${S.streak} (×${(1+0.1*Math.min(S.streak,5)).toFixed(1)})`:"";
  $("#hintOut").textContent="";$("#guess").value="";$("#acList").innerHTML="";
  $("#hintYear").disabled=$("#hintGenre").disabled=false;
  show("round");renderEmojis();renderMeta();$("#guess").focus();
  tick=setInterval(onTick,200);
}
function elapsed(){return (performance.now()-R.start)/1000}
function onTick(){
  if(!R||R.done)return;
  const t=elapsed(), left=Math.max(0,CFG.window-t);
  $("#timer").textContent=Math.ceil(left);$("#timebar").style.width=(left/CFG.window*100)+"%";
  const autoN=Math.min(6,1+Math.floor(t/CFG.auto));
  if(autoN>R.n){R.n=autoN;renderEmojis();}
  renderMeta();
  if(left<=0)endRound(false,"timeout");
}
function stopRound(){clearInterval(tick);tick=null}
function reveal(){if(R.n<6){R.n++;renderEmojis();renderMeta()}}
function renderEmojis(){
  $("#emojis").innerHTML=R.p.emojis.map((e,i)=>i<R.n?`<div class="slot on" aria-label="clue ${i+1}">${e}</div>`:`<div class="slot off">${i+1}</div>`).join("");
  $("#btnReveal").disabled=R.n>=6;
}
function renderMeta(){
  $("#wrongs").textContent=R.wrong?"❌".repeat(R.wrong)+` ${R.wrong}/3 wrong`:"";
  const sc=score({n:R.n,t:elapsed(),year:R.year,genre:R.genre,wrong:R.wrong,streak:S.streak});
  $("#potential").textContent=`Guess right now for ≈ ${sc.points} pts`;
}
$("#btnReveal").onclick=reveal;
$("#hintYear").onclick=()=>{R.year=true;$("#hintYear").disabled=true;hintText();renderMeta()};
$("#hintGenre").onclick=()=>{R.genre=true;$("#hintGenre").disabled=true;hintText();renderMeta()};
function hintText(){const a=[];if(R.year)a.push(`📅 Released ${R.p.year}`);if(R.genre)a.push(`💡 ${R.p.genre} · ${R.p.country}`);$("#hintOut").textContent=a.join("   ")}
$("#btnSkip").onclick=()=>endRound(false,"skip");

// ---- autocomplete ----
let acSel=-1, acItems=[];
$("#guess").addEventListener("input",()=>{
  const q=norm($("#guess").value);acSel=-1;
  acItems=q.length<2?[]:FILMS.filter(f=>norm(f.title).includes(q)).sort((a,b)=>norm(a.title).indexOf(q)-norm(b.title).indexOf(q)).slice(0,7);
  $("#acList").innerHTML=acItems.map((f,i)=>`<li data-i="${i}">${f.title} <span>(${f.year})</span></li>`).join("");
});
$("#acList").addEventListener("mousedown",e=>{const li=e.target.closest("li");if(li){e.preventDefault();pick(acItems[+li.dataset.i])}});
$("#guess").addEventListener("keydown",e=>{
  const lis=$$("#acList li");if(!lis.length)return;
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){e.preventDefault();acSel=(acSel+(e.key==="ArrowDown"?1:-1)+lis.length)%lis.length;lis.forEach((l,i)=>l.classList.toggle("sel",i===acSel))}
  else if(e.key==="Enter"&&acSel>=0){e.preventDefault();pick(acItems[acSel])}
});
function pick(f){$("#guess").value=f.title;$("#acList").innerHTML="";acItems=[];submit()}
$("#guessForm").onsubmit=e=>{e.preventDefault();submit()};

function submit(){
  if(!R||R.done)return;
  const raw=$("#guess").value.trim();if(!raw)return;
  const film=FILMS.find(f=>norm(f.title)===norm(raw))||acItems[0];
  if(!film){toast(`Pick a title from the list (only canonical titles count).`);return}
  $("#guess").value="";$("#acList").innerHTML="";acItems=[];
  if(film.title===R.p.title&&film.year===R.p.year)return endRound(true);
  R.wrong++;R.guesses.push(film.title);
  toast(wrongToast(film.title));
  if(R.wrong>=CFG.maxWrong)return endRound(false,"wrong");
  reveal();renderMeta();
}
// Simulated wrong-guess share (DEMO DATA): decoy weights fade as more emojis are visible.
function demoShare(title,n){
  const d=R.p.decoys.find(x=>x[0]===title);
  if(!d)return 1+(title.length%3);
  return Math.max(2,Math.round(d[1]*(1.25-0.08*n)));
}
function wrongToast(title){
  const pct=demoShare(title,R.n);
  return pct>=8?`❌ Not it, but you're in good company: you and ${pct}% of players guessed <b>${title}</b> at this point. <span class="demo">demo data</span>`
              :`❌ Bold pick! Only ${pct}% guessed <b>${title}</b> here. <span class="demo">demo data</span>`;
}
let toastT;function toast(h){const t=$("#toast");t.innerHTML=h;t.classList.add("show");clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove("show"),3200)}

// ---- end of round ----
function endRound(ok,why){
  if(R.done)return;R.done=true;stopRound();$("#toast").classList.remove("show");
  const t=Math.min(60,elapsed());
  const sc=ok?score({n:R.n,t,year:R.year,genre:R.genre,wrong:R.wrong,streak:S.streak}):{points:0};
  const res={id:R.p.id,ok,n:R.n,t:Math.round(t),year:R.year,genre:R.genre,points:sc.points};
  S.results.push(res);S.total+=sc.points;
  const priorStreak=S.streak;S.streak=ok?S.streak+1:0;
  renderAnswer(R.p,res,sc,why,priorStreak);
}
function renderAnswer(p,res,sc,why,prior){
  const msg=res.ok?`<div class="result-ok">✅ Correct!</div>`:`<div class="result-bad">${why==="timeout"?"⏰ Time's up":why==="skip"?"⏭️ Skipped":"❌ Out of guesses"}</div>`;
  $("#resultHead").innerHTML=`${msg}<h2>${p.title} <span class="sub">(${p.year})</span></h2><div class="total">+${res.points}</div><div class="sub">Total ${S.total} pts${S.streak?` · 🔥 streak ${S.streak}`:""}</div>`;
  $("#whyList").innerHTML=p.emojis.map((e,i)=>`<li><b>${e}</b>${p.why[i]}${i<res.n?"":` <span class="sub">(not revealed)</span>`}</li>`).join("");
  $("#breakdown").innerHTML=res.ok?`<h3>Points breakdown</h3><table class="breakdown">
   <tr><td>Emojis seen: ${res.n}</td><td>${sc.reveal}</td></tr>
   <tr><td>Time: ${res.t}s</td><td>×${sc.time.toFixed(3)}</td></tr>
   <tr><td>Hints ${res.year?"📅":""}${res.genre?"💡":""||""}</td><td>×${sc.hint.toFixed(4)}</td></tr>
   <tr><td>Wrong guesses: ${R.wrong}</td><td>×${sc.w.toFixed(4)}</td></tr>
   <tr><td>Streak bonus (prior ${prior})</td><td>×${sc.s.toFixed(1)}</td></tr>
   <tr><td><b>Points</b></td><td><b>${sc.points}</b></td></tr></table>`:`<h3>Points breakdown</h3><p>Fail, skip or timeout scores 0 and resets the streak.</p>`;
  const top=[...p.decoys].sort((a,b)=>b[1]-a[1]).slice(0,5), max=top[0][1];
  $("#topWrong").innerHTML=top.map(([t,v])=>`<li>${t} — ${v}%<div class="bar" style="width:${v/max*100}%"></div></li>`).join("");
  // Trailer iframe created only now (never during the round).
  const v=p.trailer;
  $("#trailer").innerHTML=`<div class="yt"><iframe src="https://www.youtube-nocookie.com/embed/${v.id}?rel=0" title="${p.title} official trailer" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe></div>
   <p class="note">Official trailer · ${v.channel} on YouTube · <a href="https://www.youtube.com/watch?v=${v.id}" target="_blank" rel="noopener">Watch on YouTube</a></p>`;
  const w=p.watch, grp=(label,a)=>a&&a.length?`<div><b>${label}</b><div class="prov">${a.map(x=>`<span>${x}</span>`).join("")}</div></div>`:"";
  const body=[grp("Stream (subscription)",w.stream),grp("Free with ads",w.free),grp("Rent",w.rent),grp("Buy",w.buy)].join("");
  $("#watch").innerHTML=`<h3>Where to watch now (US)</h3>${w.stream.length?"":`<p class="note">No subscription streaming listed for the US at time of check.</p>`}${body||""}
   <p><a href="${p.jw}" target="_blank" rel="noopener">Check current availability on JustWatch ↗</a></p>
   <p class="note">Availability as of Oct 2026, demo data, may be outdated. Source: JustWatch title page (read Oct 15, 2026). No prices shown; no affiliate links in this prototype.</p>`;
  const last=S.mode==="daily"&&S.idx>=4;
  $("#btnNext").textContent=last?"See results →":"Next puzzle →";
  show("answer");
}
$("#btnNext").onclick=()=>{
  const v=$("#trailer iframe");if(v)$("#trailer").innerHTML="";
  if(S.mode==="daily"&&S.idx>=4)return summary();
  S.idx++;
  if(S.mode==="practice"&&S.idx%S.queue.length===0)S.queue=shuffle(P);
  ready();
};

// ---- summary + share grid (§5) ----
function gridRow(r){
  if(!r.ok)return"🟥🟥🟥🟥🟥🟥";
  return [...Array(6)].map((_,i)=>i<r.n-1?"⬛":i===r.n-1?"🟩":"⬜").join("")+`  ${r.t}s`+(r.year?" 📅":"")+(r.genre?(r.year?"💡":" 💡"):"");
}
function summary(){
  const dayStreak=bumpDayStreak();
  $("#sumTitle").textContent=`Daily #${dayNum} complete!`;$("#sumScore").textContent=`${S.total} pts`;
  const grid=`Emoji Reel #${dayNum} 🎬${dayStreak>1?`  🔥 ${dayStreak}-day streak`:""}\n${S.results.map(gridRow).join("\n")}\nemojireel.example/${dayNum}`;
  $("#shareGrid").textContent=grid;$("#copied").textContent="";
  if(!store.get("er_daily_"+dayKey,null)){store.set("er_daily_"+dayKey,{total:S.total});addScore("daily",S.total)}
  show("summary");
}
function bumpDayStreak(){const d=store.get("er_days",{last:null,n:0});const y=new Date(today-864e5).toISOString().slice(0,10);
  if(d.last!==dayKey){d.n=d.last===y?d.n+1:1;d.last=dayKey;store.set("er_days",d)}return d.n}
$("#btnShare").onclick=async()=>{
  const txt=$("#shareGrid").textContent;
  try{await navigator.clipboard.writeText(txt);$("#copied").textContent="Copied!"}
  catch{const ta=document.createElement("textarea");ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();$("#copied").textContent="Copied!"}
};
// Practice runs post score when leaving.
window.addEventListener("beforeunload",()=>{if(S.mode==="practice"&&S.total>0)addScore("practice",S.total)});
$$('[data-nav]').forEach(b=>b.addEventListener("click",()=>{if(S.mode==="practice"&&S.total>0&&!S.posted){addScore("practice",S.total);S.posted=true}}));

// ---- leaderboard ----
function addScore(mode,total){const a=store.get("er_scores",[]);a.push({name:$("#playerName").value.trim()||"You",score:total,mode,ts:Date.now(),me:true});store.set("er_scores",a)}
const DEMO=[["CineQueen",4870],["PopcornPete",4310],["ReelRaj",3655],["EmojiNerd",2980],["Mo",2210]];
let boardTab="daily";
$$("[data-board]").forEach(b=>b.onclick=()=>{boardTab=b.dataset.board;$$("[data-board]").forEach(x=>x.classList.toggle("on",x===b));renderBoard()});
function renderBoard(){
  const since=boardTab==="daily"?new Date(today.getFullYear(),today.getMonth(),today.getDate()).getTime():Date.now()-7*864e5;
  const mine=store.get("er_scores",[]).filter(s=>s.ts>=since);
  const demo=DEMO.map(([n,s])=>({name:n,score:boardTab==="weekly"?s*4:s,demo:true}));
  const all=[...mine,...demo].sort((a,b)=>b.score-a.score);
  $("#boardList").innerHTML=all.map(s=>`<li class="${s.me?"me":""}">${s.name} — <b>${s.score}</b> ${s.demo?'<span class="demo">demo</span>':`<span class="sub">${s.mode}</span>`}</li>`).join("");
}
$("#btnClearBoard").onclick=()=>{store.set("er_scores",[]);renderBoard()};
})();
