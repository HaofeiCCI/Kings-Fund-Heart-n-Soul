/* ═══ State ═══ */
const meds = [];
const selReminders = new Set();
let calOff = 0;
let dayOff = 0;
let planWeekOff = 0;
let planMonthOff = 0;
let isSpeaking = false;
let recog = null;

const MED_COLORS = [
  '#e53e3e',  /* red      */
  '#2b6cb0',  /* blue     */
  '#276749',  /* green    */
  '#c05621',  /* orange   */
  '#6b46c1',  /* purple   */
  '#0987a0',  /* teal     */
  '#b83280',  /* pink     */
  '#744210',  /* brown    */
];
let colorIdx = 0;

/* ═══ Spell check ═══ */
const knownMeds = [
  'metformin','lisinopril','amlodipine','atorvastatin','omeprazole','levothyroxine',
  'ramipril','aspirin','paracetamol','ibuprofen','amoxicillin','sertraline',
  'citalopram','fluoxetine','bisoprolol','furosemide','prednisolone','warfarin',
  'lansoprazole','simvastatin','gabapentin','metoprolol','salbutamol','cetirizine',
  'losartan','carvedilol','duloxetine','venlafaxine','quetiapine','risperidone',
  'clonazepam','diazepam','codeine','tramadol','morphine','oxycodone',
  'insulin','doxycycline','azithromycin','clarithromycin','trimethoprim'
];
const knownDoses = [
  '5mg','10mg','20mg','25mg','40mg','50mg','75mg','100mg','150mg','200mg',
  '250mg','300mg','400mg','500mg','600mg','750mg','1000mg','1g','2g',
  '0.5mg','2.5mg','1.25mg','2mg','4mg','8mg','12.5mg','37.5mg',
  '1ml','2ml','5ml','10ml','0.1mg','0.25mg','0.5ml','1.5mg'
];

function lev(a,b){
  const m=a.length,n=b.length,dp=Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>j===0?i:0));
  for(let j=1;j<=n;j++) dp[0][j]=j;
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++) dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}
function bestMatch(word,list){
  word=word.toLowerCase().trim();
  if(!word||word.length<3) return null;
  if(list.includes(word)) return null;
  let best=null,bd=Infinity;
  for(const w of list){const d=lev(word,w);if(d<bd&&d<=Math.max(2,Math.floor(word.length*.35))){best=w;bd=d;}}
  return best;
}
function chkSpell(inId,warnId,sugId,isDose){
  const val=document.getElementById(inId).value;
  const warn=document.getElementById(warnId);
  const sug=document.getElementById(sugId);
  const list=isDose?knownDoses:knownMeds;
  let found=null;
  for(const w of val.trim().split(/\s+/)){const m=bestMatch(w,list);if(m){found=m;break;}}
  if(found){sug.textContent=found;warn.classList.add('on');}
  else warn.classList.remove('on');
}

/* ═══ Method tabs ═══ */
function showMethod(m){
  ['chat','type','photo','barcode'].forEach(id=>{
    document.getElementById('method-'+id).style.display=id===m?'block':'none';
    document.getElementById('tab-'+id).classList.toggle('active',id===m);
  });
  if(m==='chat'&&!chatReady) initChat();
}

/* ═══ Meal pills ═══ */
function toggleMpill(el){ el.classList.toggle('on'); }
function getSelectedMeals(){ return [...document.querySelectorAll('#mealPills .mpill.on')].map(p=>p.dataset.v); }

/* ═══ Default times ═══ */
const defTimes={once:['08:00'],twice:['08:00','20:00'],three:['08:00','13:00','20:00'],four:['08:00','12:00','17:00','21:00'],weekly:['08:00'],asneeded:[]};

/* ═══ Push med ═══ */
function medActiveOn(m,date){
  if(!m.duration||m.duration==='ongoing') return true;
  const start=new Date(m.startDate||Date.now());
  start.setHours(0,0,0,0);
  const end=new Date(start.getTime()+parseInt(m.duration)*864e5);
  const d=new Date(date); d.setHours(0,0,0,0);
  return d>=start && d<end;
}

function pushMed(m){
  m.times=[...(defTimes[m.freq]||['08:00'])];
  m.color=MED_COLORS[colorIdx%MED_COLORS.length];
  m.startDate=new Date().toISOString();
  colorIdx++;
  meds.push(m);
  renderMedList();
}

function freqLbl(f){return{once:'Once a day',twice:'Twice a day',three:'3× a day',four:'4× a day',weekly:'Once a week',asneeded:'As needed'}[f]||f;}

function renderMedList(){
  const list=document.getElementById('medList');
  const card=document.getElementById('medListCard');
  list.innerHTML='';
  if(!meds.length){card.style.display='none';return;}
  card.style.display='block';
  meds.forEach((m,i)=>{
    const el=document.createElement('div');
    el.className='med-item';
    const ml=m.meals&&m.meals.length?`🍽️ ${m.meals.join(', ')} meal`:'';
    const durTxt=m.duration&&m.duration!=='ongoing'?`📅 ${m.duration} days`:'📅 Ongoing';
    el.innerHTML=`<button class="xbtn" onclick="removeMed(${i})" aria-label="Remove ${m.name}">✕</button>
      <div class="mn" style="border-left:3px solid ${m.color};padding-left:.5rem">💊 ${m.name}</div>
      <div class="md" style="padding-left:.5rem">${m.dose} · ${freqLbl(m.freq)} · ${durTxt}${ml?' · '+ml:''}${m.notes?' · '+m.notes:''}</div>`;
    list.appendChild(el);
  });
}
function removeMed(i){meds.splice(i,1);renderMedList();}

/* ═══ Manual add ═══ */
function addManual(){
  const name=document.getElementById('mN').value.trim();
  const dose=document.getElementById('mD').value.trim();
  const freq=document.getElementById('mF').value;
  if(!name||!dose||!freq){alert('Please fill in the medicine name, dose, and how often.');return;}
  const duration=document.getElementById('mDur').value;
  pushMed({name,dose,freq,duration,meals:getSelectedMeals(),notes:document.getElementById('mNt').value.trim(),source:'typed'});
  ['mN','mD','mNt'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('mF').value='';
  document.getElementById('mDur').value='ongoing';
  document.querySelectorAll('#mealPills .mpill').forEach(p=>p.classList.remove('on'));
  ['wN','wD'].forEach(id=>document.getElementById(id).classList.remove('on'));
}

/* ═══ Photo + OCR ═══ */
async function handlePhoto(e){
  const file=e.target.files[0];if(!file)return;
  e.target.value='';
  const reader=new FileReader();
  reader.onload=async ev=>{
    const img=document.getElementById('photoPreview');
    img.src=ev.target.result;
    img.style.display='block';

    // Reset all fields and show loading
    ['pN','pD','pNotes'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('pF').value='';
    document.querySelectorAll('#mealPillsPhoto .mpill').forEach(p=>p.classList.remove('on'));
    ['wpN','wpD'].forEach(id=>document.getElementById(id).classList.remove('on'));
    document.getElementById('ocrRaw').textContent='';
    document.getElementById('photoResult').style.display='block';
    document.getElementById('photoLoading').style.display='block';
    document.getElementById('photoFields').style.display='none';
    document.getElementById('ocrError').style.display='none';

    try {
      const result=await Tesseract.recognize(ev.target.result,'eng',{
        logger:m=>{
          if(m.status==='recognizing text'){
            document.getElementById('ocrProgress').textContent=
              `Reading… ${Math.round(m.progress*100)}%`;
          }
        }
      });
      const text=result.data.text||'';
      document.getElementById('ocrRaw').textContent=text.trim()||'(nothing readable found)';

      const parsed=parseOcrText(text);
      if(parsed.name) document.getElementById('pN').value=parsed.name;
      if(parsed.dose) document.getElementById('pD').value=parsed.dose;
      if(parsed.freq) document.getElementById('pF').value=parsed.freq;
      if(parsed.meal){
        const pill=document.querySelector(`#mealPillsPhoto .mpill[data-v="${parsed.meal}"]`);
        if(pill) pill.classList.add('on');
      }
      // Spell-check auto-filled values
      if(parsed.name) chkSpell('pN','wpN','spN',false);
      if(parsed.dose) chkSpell('pD','wpD','spD',true);

    } catch(err){
      document.getElementById('ocrError').style.display='flex';
    }

    document.getElementById('photoLoading').style.display='none';
    document.getElementById('photoFields').style.display='block';
  };
  reader.readAsDataURL(file);
}

function parseOcrText(text){
  const res={};

  // Dose: number + unit (e.g. 500mg, 5 ml, 1.25mg)
  const doseM=text.match(/(\d+\.?\d*)\s*(mg|ml|g\b|mcg|iu|units?)/i);
  if(doseM) res.dose=(doseM[1]+doseM[2]).toLowerCase();

  // Frequency — prescription abbreviations and plain English
  const freqRules=[
    {r:/\b(q\.?d\.?s\.?|qds|four\s*times|4\s*times|4x)\b/i,       v:'four'},
    {r:/\b(t\.?d\.?s\.?|tds|tid|three\s*times|3\s*times|3x)\b/i,  v:'three'},
    {r:/\b(b\.?d\.?|bid|twice|two\s*times|2\s*times|2x)\b/i,       v:'twice'},
    {r:/\b(o\.?d\.?|qd|once\s*daily|once\s*a\s*day|1\s*time|daily|every\s*day)\b/i, v:'once'},
    {r:/\b(p\.?r\.?n\.?|prn|as\s*needed|when\s*required|if\s*needed)\b/i, v:'asneeded'},
    {r:/\bweekly\b/i,                                                v:'weekly'},
  ];
  for(const{r,v}of freqRules){if(r.test(text)){res.freq=v;break;}}

  // Meal instructions
  if(/before\s*(meal|food|eating)/i.test(text))          res.meal='before';
  else if(/after\s*(meal|food|eating)/i.test(text))      res.meal='after';
  else if(/(with|during)\s*(meal|food|eating)|with food/i.test(text)) res.meal='with';

  // Medicine name — match each word against known list, fuzzy if needed
  for(const w of text.split(/[\s\n,;:()/]+/)){
    const clean=w.replace(/[^a-zA-Z]/g,'').toLowerCase();
    if(clean.length<3) continue;
    if(knownMeds.includes(clean)){
      res.name=clean[0].toUpperCase()+clean.slice(1);break;
    }
    const bm=bestMatch(clean,knownMeds);
    if(bm){res.name=bm[0].toUpperCase()+bm.slice(1);break;}
  }
  return res;
}

function addPhoto(){
  const n=document.getElementById('pN').value.trim();
  const d=document.getElementById('pD').value.trim();
  if(!n||!d){alert('Please fill in the medicine name and dose.');return;}
  const freq=document.getElementById('pF').value||'once';
  const duration=document.getElementById('pDur').value;
  const meals=[...document.querySelectorAll('#mealPillsPhoto .mpill.on')].map(p=>p.dataset.v);
  const notes=document.getElementById('pNotes').value.trim();
  pushMed({name:n,dose:d,freq,duration,meals,notes,source:'photo'});
  // Reset UI
  document.getElementById('photoResult').style.display='none';
  document.getElementById('photoPreview').style.display='none';
  document.getElementById('photoFields').style.display='none';
  document.getElementById('photoLoading').style.display='none';
  document.getElementById('ocrError').style.display='none';
  document.querySelectorAll('#mealPillsPhoto .mpill').forEach(p=>p.classList.remove('on'));
}

/* ═══ Barcode ═══ */
function handleBarcode(e){
  if(!e.target.files[0])return;
  document.getElementById('bcResult').style.display='block';
  document.getElementById('bcN').value='';
  document.getElementById('bcD').value='';
  e.target.value='';
}
function addBarcode(){
  const n=document.getElementById('bcN').value.trim();
  const d=document.getElementById('bcD').value.trim();
  if(!n||!d){alert('Please check the medicine name and dose.');return;}
  const dur=document.getElementById('bcDur').value;
  pushMed({name:n,dose:d,freq:'once',duration:dur,meals:[],notes:'Added from barcode',source:'barcode'});
  document.getElementById('bcResult').style.display='none';
}

/* ═══ Schedule helpers ═══ */
function getPeriod(t){
  const h=parseInt(t);
  return isNaN(h)?'':h<12?'Morning':h<17?'Afternoon':'Evening';
}
function formatTime12(t){
  const[h,m]=t.split(':').map(Number);
  const p=h<12?'AM':'PM';
  const h12=h%12||12;
  return`${h12}:${String(m).padStart(2,'0')} ${p}`;
}
function makeTimePicker(mi,ti,val){
  const[hh,mm]=val.split(':');
  const h24=parseInt(hh); const min=mm;
  const period=h24<12?'AM':'PM';
  const h12=h24%12||12;
  let hOpts='';
  for(let i=1;i<=12;i++) hOpts+=`<option value="${i}"${i===h12?' selected':''}>${i}</option>`;
  const minOpts=['00','15','30','45'].map(m=>`<option value="${m}"${m===min?' selected':''}>${m}</option>`).join('');
  return`<div class="time-picker" data-mi="${mi}" data-ti="${ti}"><select class="tp-h" onchange="updateTimePicker(${mi},${ti})">${hOpts}</select><span class="tp-sep">:</span><select class="tp-m" onchange="updateTimePicker(${mi},${ti})">${minOpts}</select><select class="tp-p" onchange="updateTimePicker(${mi},${ti})"><option value="AM"${period==='AM'?' selected':''}>AM</option><option value="PM"${period==='PM'?' selected':''}>PM</option></select></div>`;
}
function updateTimePicker(mi,ti){
  const picker=document.querySelector(`.time-picker[data-mi="${mi}"][data-ti="${ti}"]`);
  if(!picker) return;
  const h=parseInt(picker.querySelector('.tp-h').value);
  const m=picker.querySelector('.tp-m').value;
  const p=picker.querySelector('.tp-p').value;
  let h24=h%12; if(p==='PM') h24+=12;
  updateTime(mi,ti,`${String(h24).padStart(2,'0')}:${m}`);
}
function mealTag(meals){
  if(!meals||!meals.length)return'';
  const v=meals[0];
  return`<span class="meal-tag">${v==='with'?'🍽️ with meal':v==='before'?'🌅 before meal':v==='after'?'🌇 after meal':'🤷 any time'}</span>`;
}

function renderSchedule(){
  // Chips
  renderChips('schedChips');
  const list=document.getElementById('schedList');
  list.innerHTML='';
  if(!meds.length){list.innerHTML='<p style="color:#888">No medicines added yet. Go back and add some!</p>';return;}

  meds.forEach((m,mi)=>{
    if(m.freq==='asneeded'){
      const d=document.createElement('div');
      d.className='asneeded-section';
      d.style.borderLeftColor=m.color;
      d.style.background=m.color+'18';
      const durTxt=m.duration&&m.duration!=='ongoing'?`📅 ${m.duration} days`:'📅 Ongoing';
      d.innerHTML=`<div class="sched-name">💊 ${m.name}</div>
        <div class="sched-dose">${m.dose} <span class="meal-tag">As needed</span></div>
        <div class="sched-notes">${durTxt}${m.notes?' · '+m.notes:''}</div>`;
      list.appendChild(d);
      return;
    }
    m.times.forEach((t,ti)=>{
      const div=document.createElement('div');
      div.className='sched-item';
      div.style.borderLeftColor=m.color;
      div.style.background=m.color+'18';
      const durTxt=m.duration&&m.duration!=='ongoing'?`📅 ${m.duration} days`:'📅 Ongoing';
      div.innerHTML=`
        <div class="time-col">
          ${makeTimePicker(mi,ti,t)}
          <span class="period-lbl" id="per-${mi}-${ti}">${getPeriod(t.split(':')[0])}</span>
        </div>
        <div style="flex:1">
          <div class="sched-name">💊 ${m.name}</div>
          <div class="sched-dose">${m.dose} ${mealTag(m.meals)}</div>
          <div class="sched-notes">${durTxt}${m.notes?' · '+m.notes:''}</div>
        </div>`;
      list.appendChild(div);
    });
  });
  renderCal();
}

function updateTime(mi,ti,val){
  meds[mi].times[ti]=val;
  const p=document.getElementById(`per-${mi}-${ti}`);
  if(p) p.textContent=getPeriod(val.split(':')[0]);
  renderCal();
  renderWeekPlan();
}

/* ═══ View toggle ═══ */
function setView(v){
  document.getElementById('listView').style.display=v==='list'?'block':'none';
  document.getElementById('calView').style.display=v==='cal'?'block':'none';
  document.getElementById('vListBtn').classList.toggle('active',v==='list');
  document.getElementById('vCalBtn').classList.toggle('active',v==='cal');
  if(v==='cal') renderCal();
}

/* ═══ Calendar ═══ */
function moveWeek(d){calOff+=d;renderCal();}
function renderCal(){
  const today=new Date();
  const mon=new Date(today);
  mon.setDate(today.getDate()-((today.getDay()+6)%7)+calOff*7);
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sun=new Date(mon.getTime()+6*864e5);
  document.getElementById('calLabel').textContent=`${mon.getDate()} ${MONTHS[mon.getMonth()]} – ${sun.getDate()} ${MONTHS[sun.getMonth()]}`;
  const grid=document.getElementById('calGrid');
  grid.innerHTML='';
  const legend=document.getElementById('calLegend');
  if(legend){
    legend.innerHTML='';
    const seenColors=new Set();
    meds.filter(m=>m.freq!=='asneeded').forEach(m=>{
      if(!seenColors.has(m.color)){
        seenColors.add(m.color);
        const item=document.createElement('div');item.className='cal-leg-item';
        item.innerHTML=`<span class="cal-leg-dot" style="background:${m.color}"></span>${m.name} <span style="color:var(--m);font-weight:400;margin-left:2px">${m.dose}</span>`;
        legend.appendChild(item);
      }
    });
  }
  for(let d=0;d<7;d++){
    const date=new Date(mon.getTime()+d*864e5);
    const isToday=date.toDateString()===today.toDateString();
    const col=document.createElement('div');
    col.className='cal-day'+(isToday?' today':'');
    col.innerHTML=`<div class="cal-dlbl">${DAYS[d]}</div><div class="cal-dnum">${date.getDate()}</div>`;
    const entries=[];
    meds.forEach(m=>{
      if(!medActiveOn(m,date)) return;
      if(m.freq==='weekly'&&d!==0) return;
      if(m.freq==='asneeded') return;
      m.times.forEach(t=>entries.push({t,m}));
    });
    entries.sort((a,b)=>a.t.localeCompare(b.t));
    const amE=entries.filter(({t})=>parseInt(t.split(':')[0])<12);
    const pmE=entries.filter(({t})=>parseInt(t.split(':')[0])>=12);
    const amS=document.createElement('div');amS.className='wdot-section';
    amS.innerHTML='<div class="wdot-section-lbl">AM</div>';
    const amR=document.createElement('div');amR.className='wdot-row';
    amE.forEach(({t,m})=>{const d=document.createElement('span');d.className='wdot';d.style.background=m.color;d.title=`${m.name} ${m.dose} at ${formatTime12(t)}`;amR.appendChild(d);});
    amS.appendChild(amR);
    const hr=document.createElement('hr');hr.className='wdot-divider';
    const pmS=document.createElement('div');pmS.className='wdot-section';
    pmS.innerHTML='<div class="wdot-section-lbl">PM</div>';
    const pmR=document.createElement('div');pmR.className='wdot-row';
    pmE.forEach(({t,m})=>{const d=document.createElement('span');d.className='wdot';d.style.background=m.color;d.title=`${m.name} ${m.dose} at ${formatTime12(t)}`;pmR.appendChild(d);});
    pmS.appendChild(pmR);
    col.appendChild(amS);col.appendChild(hr);col.appendChild(pmS);
    grid.appendChild(col);
  }
}

/* ═══ Med chips (summary) ═══ */
function renderChips(containerId){
  const c=document.getElementById(containerId);
  c.innerHTML='';
  if(!meds.length){c.innerHTML='<span style="color:#888;font-size:.88rem">None added yet</span>';return;}
  meds.forEach(m=>{
    const chip=document.createElement('div');
    chip.className='med-chip';
    chip.textContent=`${m.name} ${m.dose}`;
    c.appendChild(chip);
  });
}

/* ═══ Reminders ═══ */
function toggleR(id){
  const el=document.getElementById(id);
  el.classList.toggle('on');
  if(el.classList.contains('on')) selReminders.add(id);
  else selReminders.delete(id);
  document.getElementById('notifExtra').style.display=
    (selReminders.has('r-notif')||selReminders.has('r-alarm'))?'block':'none';
  document.getElementById('contactsExtra').style.display=selReminders.has('r-contacts')?'block':'none';
  document.getElementById('smsExtra').style.display=selReminders.has('r-sms')?'block':'none';
}

function medListText(){
  return meds.map(m=>`${m.name} ${m.dose}`).join(', and ');
}
const rMsgs={
  notif: ()=>`You will get a phone notification that says: Time to take your medicine! ${medListText()}.`,
  alarm: ()=>`Your alarm will sound and say: It is time for your medicine! ${medListText()}.`,
  calendar: ()=>`A calendar event will be added: Take your medicine — ${medListText()}.`,
  contacts: ()=>`Your contacts will be told: It is time to take your medicine: ${medListText()}.`,
  sms: ()=>`You will receive a text saying: Reminder — time for your medicine: ${medListText()}.`
};
function speakR(type){ speak((rMsgs[type]||(() => ''))() ); }
function previewReminder(){
  speak(`This is your medicine reminder. It is time to take your medicine. ${medListText()}. Please take your medicine now.`);
}

/* ═══ TTS ═══ */
function speak(text){
  window.speechSynthesis.cancel();
  if(!text) return;
  const u=new SpeechSynthesisUtterance(text);
  u.rate=0.88; u.pitch=1; u.volume=1;
  u.onstart=()=>{isSpeaking=true;updTTSBtn();};
  u.onend=u.onerror=()=>{isSpeaking=false;updTTSBtn();};
  window.speechSynthesis.speak(u);
}
function togglePageTTS(){
  if(isSpeaking){window.speechSynthesis.cancel();isSpeaking=false;updTTSBtn();return;}
  const pg=document.querySelector('.page.active');
  if(pg) speak(pg.innerText.replace(/\s+/g,' ').trim());
}
function updTTSBtn(){
  const btn=document.getElementById('ttsFloat');
  btn.textContent=isSpeaking?'⏹ Stop reading':'🔊 Read page';
  btn.classList.toggle('speaking',isSpeaking);
}

/* ═══ Navigation ═══ */
function goTo(n){
  if(n>=1&&!meds.length){alert('Please add at least one medicine first! 💊');return;}
  document.querySelectorAll('.page').forEach((p,i)=>p.classList.toggle('active',i===n));
  document.querySelectorAll('.step-btn').forEach((b,i)=>{
    b.classList.remove('active','done');
    if(i===n) b.classList.add('active'); else if(i<n) b.classList.add('done');
  });
  document.getElementById('pf').style.width=[25,50,75,100][n]+'%';
  if(n===1) renderSchedule();
  if(n===2) renderChips('remindChips');
  if(n===3){renderPlanLegend();setPlanView('day');}
  window.scrollTo({top:0,behavior:'smooth'});
}

function saveAll(){
  if(!selReminders.size){alert('Please choose at least one reminder! 🔔');return;}
  if('Notification' in window&&selReminders.has('r-notif')) Notification.requestPermission();
  document.getElementById('confirmBox').classList.add('on');
  window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
  speak('You are all set! Your medicine plan has been saved. We will remind you when it is time to take your medicine.');
}
function startAgain(){
  // Reset only the input form/chat — keep existing medicines in the list
  document.getElementById('confirmBox').classList.remove('on');
  chatReady=false; chatMed={}; chatState='NAME';
  document.getElementById('chatWin').innerHTML='';
  goTo(0); showMethod('chat'); initChat();
}

/* ═══ My Plan page ═══ */
function renderPlanLegend(){
  const el=document.getElementById('planLegend');
  el.innerHTML='';
  meds.forEach(m=>{
    const item=document.createElement('div');
    item.className='legend-item';
    item.innerHTML=`<span class="legend-dot" style="background:${m.color}"></span><strong>${m.name}</strong> <span class="legend-dose">${m.dose}</span>`;
    el.appendChild(item);
  });
}

function setPlanView(v){
  document.getElementById('planDayView').style.display=v==='day'?'block':'none';
  document.getElementById('planWeekView').style.display=v==='week'?'block':'none';
  document.getElementById('planMonthView').style.display=v==='month'?'block':'none';
  document.getElementById('pDayBtn').classList.toggle('active',v==='day');
  document.getElementById('pWeekBtn').classList.toggle('active',v==='week');
  document.getElementById('pMonthBtn').classList.toggle('active',v==='month');
  if(v==='day') renderDayView();
  else if(v==='week') renderWeekPlan();
  else renderMonthPlan();
}

function moveDay(d){dayOff+=d;renderDayView();}

function renderDayView(){
  const today=new Date();
  const target=new Date(today.getTime()+dayOff*864e5);
  const DAYS=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const lbl=document.getElementById('dayLabel');
  lbl.innerHTML=`<strong>${dayOff===0?'Today — ':''}${DAYS[target.getDay()]}</strong><small>${target.getDate()} ${MONTHS[target.getMonth()]} ${target.getFullYear()}</small>`;
  const content=document.getElementById('dayContent');
  content.innerHTML='';
  if(!meds.length){
    content.innerHTML='<div class="empty-plan"><span class="ep-icon">💊</span>No medicines added yet.<br>Go back and add some!</div>';
    return;
  }
  const dow=target.getDay(); // 0=Sun,1=Mon
  const periods=[
    {label:'🌅 Morning',entries:[]},
    {label:'☀️ Afternoon',entries:[]},
    {label:'🌙 Evening',entries:[]}
  ];
  const asneeded=[];
  meds.forEach(m=>{
    if(!medActiveOn(m,target)) return;
    if(m.freq==='asneeded'){asneeded.push(m);return;}
    if(m.freq==='weekly'&&dow!==1) return;
    m.times.forEach(t=>{
      const h=parseInt(t.split(':')[0]);
      if(h<12) periods[0].entries.push({t,m});
      else if(h<17) periods[1].entries.push({t,m});
      else periods[2].entries.push({t,m});
    });
  });
  periods.forEach(p=>p.entries.sort((a,b)=>a.t.localeCompare(b.t)));
  let anyTimed=false;
  periods.forEach(p=>{
    if(!p.entries.length) return;
    anyTimed=true;
    const block=document.createElement('div');
    block.className='period-block';
    block.innerHTML=`<div class="period-header">${p.label}</div>`;
    p.entries.forEach(({t,m})=>{
      const mealInfo=m.meals&&m.meals.length?`🍽️ Take ${m.meals[0]} meal`:'';
      const div=document.createElement('div');
      div.className='day-entry';
      div.style.borderLeftColor=m.color;
      div.style.background=m.color+'44';
      div.innerHTML=`<div class="day-time">${formatTime12(t)}</div>
        <div><div class="day-med-name"><span class="day-badge" style="background:${m.color}"></span>${m.name}</div>
        <div class="day-med-dose">${m.dose}${mealInfo?' · '+mealInfo:''}</div>
        ${m.notes?`<div class="day-med-detail">${m.notes}</div>`:''}
        </div>`;
      block.appendChild(div);
    });
    content.appendChild(block);
  });
  if(!anyTimed&&!asneeded.length){
    const div=document.createElement('div');
    div.className='empty-plan';
    div.innerHTML='<span class="ep-icon">✅</span>No medicines scheduled for this day.';
    content.appendChild(div);
  }
  if(asneeded.length){
    const block=document.createElement('div');
    block.className='period-block';
    block.innerHTML=`<div class="period-header">🤷 As Needed</div>`;
    asneeded.forEach(m=>{
      const div=document.createElement('div');
      div.className='day-entry';
      div.style.borderLeftColor=m.color;
      div.style.background='#f5f5ff';
      div.innerHTML=`<div class="day-time" style="color:#aaa">—</div>
        <div><div class="day-med-name"><span class="day-badge" style="background:${m.color}"></span>${m.name}</div>
        <div class="day-med-dose">${m.dose}</div>
        <div class="day-med-detail">Take when needed${m.notes?' · '+m.notes:''}</div></div>`;
      block.appendChild(div);
    });
    content.appendChild(block);
  }
}

function movePlanWeek(d){planWeekOff+=d;renderWeekPlan();}

function renderWeekPlan(){
  const today=new Date();
  const mon=new Date(today);
  mon.setDate(today.getDate()-((today.getDay()+6)%7)+planWeekOff*7);
  const DAYS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const sun=new Date(mon.getTime()+6*864e5);
  document.getElementById('weekPlanLabel').textContent=
    `${mon.getDate()} ${MONTHS[mon.getMonth()]} – ${sun.getDate()} ${MONTHS[sun.getMonth()]}`;
  const grid=document.getElementById('weekPlanGrid');
  grid.innerHTML='';
  const asneeded=meds.filter(m=>m.freq==='asneeded');
  for(let d=0;d<7;d++){
    const date=new Date(mon.getTime()+d*864e5);
    const isToday=date.toDateString()===today.toDateString();
    const col=document.createElement('div');
    col.className='wday'+(isToday?' today':'');
    col.innerHTML=`<div class="wday-lbl">${DAYS[d]}</div><div class="wday-num">${date.getDate()}</div>`;
    const entries=[];
    meds.forEach(m=>{
      if(!medActiveOn(m,date)) return;
      if(m.freq==='asneeded') return;
      if(m.freq==='weekly'&&d!==0) return;
      m.times.forEach(t=>entries.push({t,m}));
    });
    entries.sort((a,b)=>a.t.localeCompare(b.t));
    const amE=entries.filter(({t})=>parseInt(t.split(':')[0])<12);
    const pmE=entries.filter(({t})=>parseInt(t.split(':')[0])>=12);

    const amSec=document.createElement('div');
    amSec.className='wdot-section';
    amSec.innerHTML='<div class="wdot-section-lbl">AM</div>';
    const amRow=document.createElement('div');amRow.className='wdot-row';
    amE.forEach(({t,m})=>{const d=document.createElement('span');d.className='wdot';d.style.background=m.color;d.title=`${m.name} ${m.dose} at ${formatTime12(t)}`;amRow.appendChild(d);});
    amSec.appendChild(amRow);

    const div2=document.createElement('hr');div2.className='wdot-divider';

    const pmSec=document.createElement('div');
    pmSec.className='wdot-section';
    pmSec.innerHTML='<div class="wdot-section-lbl">PM</div>';
    const pmRow=document.createElement('div');pmRow.className='wdot-row';
    pmE.forEach(({t,m})=>{const d=document.createElement('span');d.className='wdot';d.style.background=m.color;d.title=`${m.name} ${m.dose} at ${formatTime12(t)}`;pmRow.appendChild(d);});
    pmSec.appendChild(pmRow);

    col.appendChild(amSec);col.appendChild(div2);col.appendChild(pmSec);
    grid.appendChild(col);
  }
  const asDiv=document.getElementById('asneededWeek');
  asDiv.innerHTML='';
  if(asneeded.length){
    asDiv.innerHTML='<h4>🤷 As needed (any day):</h4>';
    asneeded.forEach(m=>{
      const div=document.createElement('div');
      div.className='asneeded-row';
      div.style.borderLeftColor=m.color;
      div.innerHTML=`<span class="day-badge" style="background:${m.color}"></span><strong>${m.name}</strong> — ${m.dose}${m.notes?' · '+m.notes:''}`;
      asDiv.appendChild(div);
    });
  }
}

function movePlanMonth(d){planMonthOff+=d;renderMonthPlan();}

function renderMonthPlan(){
  const today=new Date();
  const ref=new Date(today.getFullYear(),today.getMonth()+planMonthOff,1);
  const MNAMES=['January','February','March','April','May','June','July','August','September','October','November','December'];
  const DNAMES=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  document.getElementById('monthPlanLabel').textContent=`${MNAMES[ref.getMonth()]} ${ref.getFullYear()}`;
  const grid=document.getElementById('monthPlanGrid');
  grid.innerHTML='';
  // Day headers
  DNAMES.forEach(d=>{const h=document.createElement('div');h.className='month-day-hdr';h.textContent=d;grid.appendChild(h);});
  // Start offset: Mon=0
  const firstDow=(new Date(ref.getFullYear(),ref.getMonth(),1).getDay()+6)%7;
  const lastDate=new Date(ref.getFullYear(),ref.getMonth()+1,0).getDate();
  const totalCells=Math.ceil((firstDow+lastDate)/7)*7;
  for(let i=0;i<totalCells;i++){
    const dayNum=i-firstDow+1;
    const date=new Date(ref.getFullYear(),ref.getMonth(),dayNum);
    const isCurMonth=date.getMonth()===ref.getMonth();
    const isToday=date.toDateString()===today.toDateString();
    const cell=document.createElement('div');
    cell.className='month-day'+(isToday?' today':'')+(isCurMonth?'':' other-month');
    const num=document.createElement('div');num.className='month-day-num';num.textContent=date.getDate();cell.appendChild(num);
    const dots=document.createElement('div');dots.className='month-dots';
    const dow=date.getDay();
    meds.forEach(m=>{
      if(!medActiveOn(m,date)) return;
      if(m.freq==='asneeded') return;
      if(m.freq==='weekly'&&dow!==1) return;
      const dot=document.createElement('span');dot.className='month-dot';dot.style.background=m.color;dot.title=`${m.name} ${m.dose}`;dots.appendChild(dot);
    });
    cell.appendChild(dots);grid.appendChild(cell);
  }
  // As-needed list
  const asDiv=document.getElementById('asneededMonth');asDiv.innerHTML='';
  const asn=meds.filter(m=>m.freq==='asneeded');
  if(asn.length){
    asDiv.innerHTML='<h4 style="font-size:.84rem;color:var(--m);margin-bottom:.38rem">🤷 As needed (any day):</h4>';
    asn.forEach(m=>{
      const div=document.createElement('div');div.className='asneeded-row';div.style.borderLeftColor=m.color;
      div.innerHTML=`<span class="day-badge" style="background:${m.color}"></span><strong>${m.name}</strong> <span style="color:var(--b);font-weight:700">${m.dose}</span>${m.notes?' · '+m.notes:''}`;
      asDiv.appendChild(div);
    });
  }
}

/* ══════════════════════════════════════
   AI CHATBOT
══════════════════════════════════════ */
let chatState='NAME';
let chatMed={};
let chatReady=false;

const freqKw={
  once:['once','once a day','one time a day','every day','daily','1 time'],
  twice:['twice','twice a day','two times','2 times','twice daily'],
  three:['three times','3 times','thrice','three times a day','three daily'],
  four:['four times','4 times','four times a day','every 6 hours'],
  weekly:['weekly','once a week','every week','one time a week'],
  asneeded:['as needed','when needed','sometimes','only when','prn','occasionally']
};
const mealKw={
  before:['before meal','before food','before eating','before meals','pre meal'],
  with:['with meal','with food','with eating','during meal','with meals','with my food'],
  after:['after meal','after food','after eating','post meal','after meals'],
  any:["doesn't matter","any time","anytime","no preference","no","doesn't","it doesn't"]
};
function parseFreq(t){t=t.toLowerCase();for(const[k,ws]of Object.entries(freqKw))for(const w of ws)if(t.includes(w))return k;return null;}
function parseDuration(t){
  t=t.toLowerCase();
  if(/ongoing|indefinite|forever|no end|always|long.?term/.test(t)) return 'ongoing';
  const wk=t.match(/(\d+)\s*week/);if(wk) return String(parseInt(wk[1])*7);
  const mn=t.match(/(\d+)\s*month/);if(mn) return String(parseInt(mn[1])*30);
  const dy=t.match(/(\d+)\s*day/);if(dy) return dy[1];
  const num=t.match(/^\s*(\d+)\s*$/);if(num) return num[1];
  return null;
}
function parseMeal(t){t=t.toLowerCase();for(const[k,ws]of Object.entries(mealKw))for(const w of ws)if(t.includes(w))return k;return null;}
function parseDose(t){const m=t.match(/(\d+\.?\d*\s*(?:mg|ml|g|mcg|iu|units?))/i);return m?m[1].replace(/\s+/,'').toLowerCase():null;}
function parseName(t){
  let s=t.replace(/(\d+\.?\d*\s*(?:mg|ml|g|mcg|iu|units?))/gi,'')
          .replace(/\b(once|twice|three|four|five|daily|weekly|times|a day|per day|as needed|take|i take|my|the|please|it's|i'm|taking|i need|i use|every|each)\b/gi,'')
          .trim();
  const words=s.split(/\s+/).filter(w=>w.length>2);
  for(const w of words){const l=w.toLowerCase();if(knownMeds.includes(l))return l.charAt(0).toUpperCase()+l.slice(1);const bm=bestMatch(l,knownMeds);if(bm)return bm.charAt(0).toUpperCase()+bm.slice(1);}
  return words[0]?words[0].charAt(0).toUpperCase()+words[0].slice(1):null;
}

function botSay(text,ms=450){
  return new Promise(res=>{
    const win=document.getElementById('chatWin');
    const t=document.createElement('div');t.className='cb typing';t.textContent='…';
    win.appendChild(t);win.scrollTop=win.scrollHeight;
    setTimeout(()=>{
      t.remove();
      const b=document.createElement('div');b.className='cb bot';b.textContent=text;
      win.appendChild(b);win.scrollTop=win.scrollHeight;res();
    },ms);
  });
}
function userSay(text){
  const win=document.getElementById('chatWin');
  const b=document.createElement('div');b.className='cb user';b.textContent=text;
  win.appendChild(b);win.scrollTop=win.scrollHeight;
}

async function initChat(){
  if(chatReady) return;
  chatReady=true; chatState='NAME'; chatMed={};
  await botSay('👋 Hello! I am here to help you add your medicine.',250);
  await botSay('What is the name of your medicine? You can also say a full sentence like "I take Metformin 500mg twice a day".',600);
}

async function sendChat(){
  const inp=document.getElementById('chatIn');
  const text=inp.value.trim();if(!text)return;
  inp.value='';userSay(text);
  await processChatInput(text);
}

async function processChatInput(text){
  const t=text.toLowerCase().trim();

  if(chatState==='NAME'){
    const autoName=parseName(text);
    const autoDose=parseDose(text);
    const autoFreq=parseFreq(text);
    const autoMeal=parseMeal(text);
    if(!autoName){await botSay("Sorry, I didn't catch a medicine name. Could you say the name again? For example: Metformin, Aspirin");return;}
    const suggestion=bestMatch(autoName.toLowerCase(),knownMeds);
    if(suggestion&&suggestion.toLowerCase()!==autoName.toLowerCase()){
      chatMed={_raw:autoName,_sug:suggestion,_dose:autoDose,_freq:autoFreq,_meal:autoMeal};
      await botSay(`I heard "${autoName}". Did you mean "${suggestion.charAt(0).toUpperCase()+suggestion.slice(1)}"? Please say yes or no, or type the correct name.`);
      chatState='SPELL_NAME';return;
    }
    chatMed.name=autoName;
    if(autoDose) chatMed.dose=autoDose;
    if(autoFreq) chatMed.freq=autoFreq;
    if(autoMeal) chatMed.meals=[autoMeal];
    await nextQuestion();return;
  }

  if(chatState==='SPELL_NAME'){
    if(t==='yes'||t==='yeah'||t==='yep'){
      const s=chatMed._sug;
      chatMed={name:s.charAt(0).toUpperCase()+s.slice(1),dose:chatMed._dose,freq:chatMed._freq,meals:chatMed._meal?[chatMed._meal]:[]};
    } else if(t==='no'||t==='nope'){
      chatMed={name:chatMed._raw};
    } else {
      chatMed={name:text.trim()};
    }
    await nextQuestion();return;
  }

  if(chatState==='DOSE'){
    const dose=parseDose(text)||text.trim();
    const sug=bestMatch(dose.toLowerCase().replace(/\s/g,''),knownDoses);
    chatMed.dose=dose;
    if(sug&&sug!==dose.toLowerCase()){
      chatMed._doseSug=sug;
      await botSay(`I heard "${dose}". Did you mean "${sug}"? Say yes or no, or type the correct dose.`);
      chatState='SPELL_DOSE';return;
    }
    await nextQuestion();return;
  }

  if(chatState==='SPELL_DOSE'){
    if(t==='yes'||t==='yeah'||t==='yep') chatMed.dose=chatMed._doseSug;
    delete chatMed._doseSug;
    await nextQuestion();return;
  }

  if(chatState==='FREQ'){
    const freq=parseFreq(text);
    if(!freq){await botSay("Sorry, I didn't understand. Please say something like: once a day, twice a day, three times a day, or as needed.");return;}
    chatMed.freq=freq;await nextQuestion();return;
  }

  if(chatState==='MEAL'){
    const meal=parseMeal(text);
    chatMed.meals=meal&&meal!=='any'?[meal]:[];
    await nextQuestion();return;
  }

  if(chatState==='NOTES'){
    chatMed.notes=(t==='no'||t==='none'||t==='skip'||t==='nothing')?'':text;
    await botSay('How many days will you take this medicine? For example: "7 days", "30 days", or say "ongoing" if there is no end date.');
    chatState='DURATION';return;
  }

  if(chatState==='DURATION'){
    chatMed.duration=parseDuration(t)||'ongoing';
    await showConfirm();return;
  }

  if(chatState==='CONFIRM'){
    if(t==='yes'||t==='yeah'||t==='yep'||t==='correct'||t==='right'){
      const name=chatMed.name;
      pushMed({...chatMed});
      chatMed={};
      await botSay(`✅ ${name} has been added to your list!`);
      await botSay('Would you like to add another medicine? Say yes or no.');
      chatState='ANOTHER';
    } else {
      await botSay("No problem! Let's start again. What is the medicine name?");
      chatMed={};chatState='NAME';
    }
    return;
  }

  if(chatState==='ANOTHER'){
    if(t==='yes'||t==='yeah'||t==='yep'){chatMed={};chatState='NAME';await botSay('What is the name of the next medicine?');}
    else await botSay('Great! When you are ready, tap "Next: Make my schedule" below. 😊');
    return;
  }
}

async function nextQuestion(){
  if(!chatMed.dose){
    await botSay(`Got it — ${chatMed.name}! 👍 What is the dose? For example: 500mg, 10mg, 5ml`);
    chatState='DOSE';
  } else if(!chatMed.freq){
    await botSay(`${chatMed.name} ${chatMed.dose}. How often do you take it? For example: once a day, twice a day, as needed`);
    chatState='FREQ';
  } else if(!chatMed.meals){
    await botSay(`${freqLbl(chatMed.freq)}. Do you take it with food? For example: before meal, with meal, after meal, or it doesn't matter`);
    chatState='MEAL';
  } else {
    await botSay('Any other notes? For example: take with water. Or say "no" to skip.');
    chatState='NOTES';
  }
}

async function showConfirm(){
  const m=chatMed;
  const ml=m.meals&&m.meals.length?`🍽️ Take ${m.meals[0]} meal\n`:'';
  const nt=m.notes?`📝 ${m.notes}\n`:'';
  const dur=m.duration&&m.duration!=='ongoing'?`📅 ${m.duration} days`:'📅 Ongoing';
  await botSay(`Here is what I have:\n💊 ${m.name}\n💉 ${m.dose}\n🕐 ${freqLbl(m.freq)}\n${ml}${nt}${dur}\n\nIs that right? Say yes to add it, or no to start again.`);
  chatState='CONFIRM';
}

/* ═══ Voice input ═══ */
function toggleMic(){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){alert('Voice input is not supported in your browser. Please try Chrome or Edge.');return;}
  const btn=document.getElementById('micBtn');
  if(recog&&recog._on){recog.stop();recog._on=false;btn.classList.remove('rec');btn.textContent='🎤';return;}
  recog=new SR();
  recog.lang='en-GB';recog.interimResults=false;recog._on=true;
  btn.classList.add('rec');btn.textContent='⏹';
  recog.onresult=e=>{
    const tr=e.results[0][0].transcript;
    document.getElementById('chatIn').value=tr;
    recog._on=false;btn.classList.remove('rec');btn.textContent='🎤';
    sendChat();
  };
  recog.onerror=recog.onend=()=>{recog._on=false;btn.classList.remove('rec');btn.textContent='🎤';};
  recog.start();
}

/* ═══ Boot ═══ */
showMethod('chat');
