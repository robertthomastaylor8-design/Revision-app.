/* Revision Hub: local-first Year 13 revision manager. */
(() => {
  'use strict';
  const SUBJECTS=['Biology','Chemistry','Maths'];
  const TYPES=['Anki','Exam questions','Homework','Revision'];
  const STATES=['Not started','Learning','Needs practice','Confident'];
  const WEEK_TARGETS={homework:270,exam:60,anki:360}; // minutes: weekly homework/exam targets; Anki Mon-Sat = 360 min
  const KEY='revisionHubDB_v2';
  const state={route:'home',data:null,plannerDay:null};

  const uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2);
  const iso=d=>new Date(d).toISOString().slice(0,10);
  const dateObj=s=>{const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
  const today=()=>iso(new Date());
  const addDays=(s,n)=>{const d=dateObj(s);d.setDate(d.getDate()+n);return iso(d)};
  const startOfWeek=s=>{const d=dateObj(s);const day=d.getDay();const diff=(day+6)%7;d.setDate(d.getDate()-diff);return iso(d)};
  const fmtDate=s=>dateObj(s).toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'});
  const fmtLong=s=>dateObj(s).toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'long'});
  const esc=x=>String(x??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));

  const DEFAULT_TOPICS={
    Biology:[
      'Biological molecules','Cells and microscopy','Cell membranes and transport','Cell division','Exchange surfaces','Transport in animals','Transport in plants','DNA, genes and genomes','Genetic variation and inheritance','Gene expression and protein synthesis','Mutation and evolution','Biodiversity and classification','Ecology and populations','Photosynthesis','Respiration','Energy transfers','Infectious disease','Immunity and response','Homeostasis','Nervous coordination','Hormonal coordination','Reproduction','Control of gene expression','Gene technologies','Practical skills and data analysis'
    ],
    Chemistry:[
      'Atomic structure','Amount of substance and moles','Bonding and structure','Energetics','Kinetics and rate equations','Chemical equilibrium','Acids and bases','Redox and oxidation states','Periodicity','Group 2','The halogens','Qualitative analysis','Organic nomenclature and formulae','Alkanes','Alkenes','Haloalkanes','Alcohols','Aldehydes and ketones','Carboxylic acids and derivatives','Aromatic chemistry','Amines and amino acids','Polymers','Organic synthesis','Chromatography and spectroscopy','Electrochemistry','Practical skills and data analysis'
    ],
    Maths:[
      'Proof','Algebra and functions','Coordinate geometry','Sequences and series','Binomial expansion','Trigonometry','Exponentials and logarithms','Differentiation','Integration','Numerical methods','Vectors','Statistical sampling','Data presentation and interpretation','Probability','Statistical distributions','Hypothesis testing','Kinematics','Forces and Newton’s laws','Variable acceleration','Moments','Projectiles','Mechanics modelling','Mixed problem solving'
    ]
  };
  function defaultTopics(subject){return (DEFAULT_TOPICS[subject]||[]).map(name=>({id:uid(),name,state:'Not started'}));}
  function blank(){
    return {version:3,tasks:[],weeks:{},topics:{Biology:defaultTopics('Biology'),Chemistry:defaultTopics('Chemistry'),Maths:defaultTopics('Maths')},exams:[],settings:{collegeTravelMinutes:30},ankiLogs:[],lastGenerated:{}};
  }
  function load(){
    try{const raw=localStorage.getItem(KEY); if(raw){const d=JSON.parse(raw); return normalize(d)}}catch(e){console.warn(e)}
    return blank();
  }
  function normalize(d){
    const b=blank(); Object.assign(b,d||{}); b.tasks=Array.isArray(b.tasks)?b.tasks:[]; b.exams=Array.isArray(b.exams)?b.exams:[]; b.ankiLogs=Array.isArray(b.ankiLogs)?b.ankiLogs:[]; b.weeks=b.weeks||{}; b.lastGenerated=b.lastGenerated||{}; b.settings={...b.settings,...(d?.settings||{})};
    for(const s of SUBJECTS){
      b.topics[s]=Array.isArray(b.topics[s])?b.topics[s]:[];
      if(!b.topics[s].length)b.topics[s]=defaultTopics(s);
      b.topics[s]=b.topics[s].filter(x=>x&&typeof x.name==='string').map(x=>({id:x.id||uid(),name:String(x.name).trim(),state:STATES.includes(x.state)?x.state:'Not started'}));
    }
    b.version=Math.max(3,Number(b.version)||3);
    return b;
  }
  function save(){ const keys=new Set([currentWeek(),...Object.keys(state.data.weeks),...state.data.tasks.map(t=>startOfWeek(t.date))]); for(const wk of keys) updateWeekSnapshot(wk); localStorage.setItem(KEY,JSON.stringify(state.data)); }
  function ensureWeek(date=today()){
    const wk=startOfWeek(date); if(!state.data.weeks[wk]) state.data.weeks[wk]={homework:{Biology:0,Chemistry:0,Maths:0},exam:{Biology:0,Chemistry:0,Maths:0},anki:{Biology:0,Chemistry:0},tasksCompleted:0,studyMinutes:0}; return wk;
  }
  function weekTasks(wk){return state.data.tasks.filter(t=>startOfWeek(t.date)===wk)}
  function weekActual(wk){
    const out={homework:{Biology:0,Chemistry:0,Maths:0},exam:{Biology:0,Chemistry:0,Maths:0},anki:{Biology:0,Chemistry:0}};
    for(const t of weekTasks(wk)) if(t.completed && (t.type==='Homework'||t.type==='Exam questions'||t.type==='Anki')){
      const k=t.type==='Homework'?'homework':t.type==='Exam questions'?'exam':'anki'; if(out[k][t.subject]!=null)out[k][t.subject]+=Number(t.duration)||0;
    }
    return out;
  }
  function updateWeekSnapshot(wk){
    const a=weekActual(wk), wt=weekTasks(wk), w=state.data.weeks[wk]||{};
    state.data.weeks[wk]={homework:a.homework,exam:a.exam,anki:a.anki,tasksCompleted:wt.filter(t=>t.completed).length,studyMinutes:wt.filter(t=>t.completed).reduce((n,t)=>n+(Number(t.duration)||0),0)};
  }
  function priorityRank(p){return ({High:3,Medium:2,Low:1}[p]||1)}
  function currentWeek(){return startOfWeek(today())}
  function effectiveTaskMinutes(t){return Number(t.duration)||0}
  function deadlineBoost(subject, date){
    const days=state.data.exams.filter(e=>e.subject===subject).map(e=>Math.round((dateObj(e.date)-dateObj(date))/86400000)).filter(n=>n>=0);
    if(!days.length)return 0; const d=Math.min(...days); return d<=3?4:d<=7?3:d<=14?2:1;
  }
  function subjectDeficits(wk){
    const a=weekActual(wk); const todayIso=today(); const d={};
    for(const s of SUBJECTS){
      const futurePlanned=state.data.tasks.filter(t=>t.date>=todayIso&&startOfWeek(t.date)===wk&&!t.completed&&t.subject===s);
      const plannedHomework=futurePlanned.filter(t=>t.type==='Homework').reduce((n,t)=>n+(Number(t.duration)||0),0);
      const plannedExam=futurePlanned.filter(t=>t.type==='Exam questions').reduce((n,t)=>n+(Number(t.duration)||0),0);
      d[s]={homework:Math.max(0,WEEK_TARGETS.homework-a.homework[s]-plannedHomework),exam:Math.max(0,WEEK_TARGETS.exam-a.exam[s]-plannedExam),deadline:deadlineBoost(s,today())};
    }
    return d;
  }
  function weakTopic(s,date=today(),type='Revision'){
    const arr=state.data.topics[s]||[]; if(!arr.length)return null;
    const ranked=arr.map((x,i)=>{
      const stateScore=({"Needs practice":40,"Learning":30,"Not started":20,"Confident":5}[x.state]||10);
      const used=state.data.tasks.filter(t=>t.subject===s&&t.topicId===x.id&&t.type!=='Anki').length;
      const recent=state.data.tasks.filter(t=>t.date>=addDays(date,-14)&&t.date<=date&&t.topicId===x.id&&t.completed).length;
      return {x,score:stateScore-used*3-recent*5-i/1000};
    }).sort((a,b)=>b.score-a.score);
    return ranked[0]?.x||null;
  }
  function existsSimilar(date,subject,type){return state.data.tasks.some(t=>t.date===date&&t.subject===subject&&t.type===type&&!t.completed)}
  function round5(n){return Math.max(5,Math.ceil(Math.max(0,n)/5)*5)}
  function remainingStudyDays(date){
    const out=[]; const wk=startOfWeek(date); let cur=date;
    for(let i=0;i<7;i++){
      if(startOfWeek(cur)!==wk)break;
      out.push(cur);
      cur=addDays(cur,1);
    }
    return out;
  }
  function addTaskRaw({date,subject,type,duration,priority='Medium',notes='',topicId=null,auto=false,completed=false}){
    const cleanSubject=SUBJECTS.includes(subject)?subject:'Biology';
    const cleanType=TYPES.includes(type)?type:'Revision';
    const cleanDuration=Number.isFinite(Number(duration))?Number(duration):30;
    const t={id:uid(),date,subject:cleanSubject,type:cleanType,duration:Math.max(5,Math.round(cleanDuration/5)*5),priority:['High','Medium','Low'].includes(priority)?priority:'Medium',notes:String(notes||''),topicId:topicId||null,completed:Boolean(completed),createdAt:new Date().toISOString(),auto:Boolean(auto)};
    state.data.tasks.push(t); return t;
  }
  function plannedMinutes(wk,subject,type,fromDate=today()){
    return state.data.tasks.filter(t=>t.date>=fromDate&&startOfWeek(t.date)===wk&&!t.completed&&t.subject===subject&&t.type===type).reduce((n,t)=>n+(Number(t.duration)||0),0);
  }
  function generateFor(date=today(), force=false){
    const wk=startOfWeek(date); ensureWeek(date); const key=date;
    if(!force && state.data.lastGenerated[key])return 0;
    const dow=dateObj(date).getDay(); let added=0;
    const a=weekActual(wk);
    const anchor=today();
    const daysLeft=remainingStudyDays(date).length;

    // Anki: approximately 60 minutes total per day Monday-Saturday. Sunday has no Anki.
    if(dow!==0){
      const dailyDone={Biology:0,Chemistry:0};
      for(const t of state.data.tasks) if(t.date===date&&t.completed&&t.type==='Anki'&&dailyDone[t.subject]!=null) dailyDone[t.subject]+=Number(t.duration)||0;
      const dailyPlanned={Biology:0,Chemistry:0};
      for(const t of state.data.tasks) if(t.date===date&&!t.completed&&t.type==='Anki'&&dailyPlanned[t.subject]!=null) dailyPlanned[t.subject]+=Number(t.duration)||0;
      const dailyRemaining=Math.max(0,60-dailyDone.Biology-dailyDone.Chemistry-dailyPlanned.Biology-dailyPlanned.Chemistry);
      if(dailyRemaining>0){
        const weeklyNeed={
          Biology:Math.max(0,180-a.anki.Biology-plannedMinutes(wk,'Biology','Anki',anchor)+dailyPlanned.Biology),
          Chemistry:Math.max(0,180-a.anki.Chemistry-plannedMinutes(wk,'Chemistry','Anki',anchor)+dailyPlanned.Chemistry)
        };
        const active=['Biology','Chemistry'].filter(s=>weeklyNeed[s]>0);
        if(active.length===2){
          const b=Math.min(30,dailyRemaining,weeklyNeed.Biology), c=Math.min(30,Math.max(0,dailyRemaining-b),weeklyNeed.Chemistry);
          if(b&&!existsSimilar(date,'Biology','Anki')){addTaskRaw({date,subject:'Biology',type:'Anki',duration:b,priority:'High',notes:'Part of your 1-hour Anki target for today.',auto:true});added++;}
          if(c&&!existsSimilar(date,'Chemistry','Anki')){addTaskRaw({date,subject:'Chemistry',type:'Anki',duration:c,priority:'High',notes:'Part of your 1-hour Anki target for today.',auto:true});added++;}
        } else if(active.length===1){
          const s=active[0], mins=Math.min(60,dailyRemaining,weeklyNeed[s]);
          if(mins&&!existsSimilar(date,s,'Anki')){addTaskRaw({date,subject:s,type:'Anki',duration:mins,priority:'High',notes:'Part of your 1-hour Anki target for today.',auto:true});added++;}
        }
      }
    }

    // Allocate each weekly requirement across the remaining weekdays. Missed work therefore
    // increases the remaining daily allocation instead of creating duplicate past tasks.
    for(const {kind,target,type,base} of [
      {kind:'exam',target:60,type:'Exam questions',base:30},
      {kind:'homework',target:270,type:'Homework',base:60}
    ]){
      for(const s of SUBJECTS){
        const actual=a[kind][s];
        const planned=plannedMinutes(wk,s,type,anchor);
        const need=Math.max(0,target-actual-planned);
        if(need<=0||existsSimilar(date,s,type))continue;
        const dailyCap=type==='Homework'?90:60;
        const dailyMinimum=type==='Homework'?30:20;
        const allocation=Math.min(need,dailyCap,Math.max(dailyMinimum,round5(need/Math.max(1,daysLeft))));
        const topic=weakTopic(s,date,type);
        addTaskRaw({date,subject:s,type,duration:allocation,priority:deadlineBoost(s,date)>=3?'High':'Medium',topicId:topic?.id||null,notes:topic?`What to revise: ${topic.name}`:'Generated to keep your weekly target on track.',auto:true});
        added++;
      }
    }

    // Add a weak-topic task only if the generated workload is otherwise light.
    const incomplete=state.data.tasks.filter(t=>t.date===date&&!t.completed).reduce((n,t)=>n+t.duration,0);
    if(incomplete<90){
      const s=SUBJECTS.slice().sort((a,b)=>{
        const da= Math.max(0,WEEK_TARGETS.exam-weekActual(wk).exam[b])+Math.max(0,WEEK_TARGETS.homework-weekActual(wk).homework[b])+deadlineBoost(b,date)*10;
        const db= Math.max(0,WEEK_TARGETS.exam-weekActual(wk).exam[a])+Math.max(0,WEEK_TARGETS.homework-weekActual(wk).homework[a])+deadlineBoost(a,date)*10;
        return db-da;
      })[0];
      const topic=weakTopic(s,date,'Revision');
      if(topic&&!existsSimilar(date,s,'Revision')){addTaskRaw({date,subject:s,type:'Revision',duration:30,priority:'Medium',topicId:topic.id,notes:`What to revise: ${topic.name}`,auto:true});added++;}
    }
    state.data.lastGenerated[key]=new Date().toISOString(); save(); return added;
  }
  function rollover(){
    const wk=currentWeek(); ensureWeek(wk); const prev=addDays(wk,-7); if(state.data.weeks[prev])updateWeekSnapshot(prev); updateWeekSnapshot(wk); save();
  }
  function pct(a,b){return b?clamp(Math.round(a/b*100),0,100):0}
  function taskCounts(date=today()){const ts=state.data.tasks.filter(t=>t.date===date);return {total:ts.length,done:ts.filter(t=>t.completed).length,minutes:ts.reduce((n,t)=>n+effectiveTaskMinutes(t),0),doneMinutes:ts.filter(t=>t.completed).reduce((n,t)=>n+effectiveTaskMinutes(t),0)} }
  function subjectProgress(s,wk){const a=weekActual(wk); const h=pct(a.homework[s],WEEK_TARGETS.homework),e=pct(a.exam[s],WEEK_TARGETS.exam); return {homework:a.homework[s],exam:a.exam[s],h,e,overall:Math.round((h+e)/2)} }

  function render(){
    const main=document.getElementById('main'); document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.route===state.route));
    if(state.route==='home')main.innerHTML=renderHome();
    else if(state.route==='planner')main.innerHTML=renderPlanner();
    else if(state.route==='progress')main.innerHTML=renderProgress();
    else if(state.route==='topics')main.innerHTML=renderTopics();
    else main.innerHTML=renderMore();
    bind();
  }
  function renderHome(){
    const c=taskCounts(), ts=state.data.tasks.filter(t=>t.date===today()).sort((a,b)=>Number(b.completed)-Number(a.completed)||priorityRank(b.priority)-priorityRank(a.priority));
    const p=c.total?pct(c.done,c.total):0; const wk=currentWeek(); const a=weekActual(wk);
    return `<div class="hero-card"><h2>Today</h2><p>${fmtLong(today())}</p><div class="metric-row"><div class="metric"><strong>${c.total-c.done}</strong><span>remaining</span></div><div class="metric"><strong>${c.done}</strong><span>completed</span></div><div class="metric"><strong>${c.minutes}m</strong><span>suggested</span></div></div><div style="margin-top:16px"><div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px"><span>Today's progress</span><b>${p}%</b></div><div class="progress"><span style="width:${p}%"></span></div></div></div>
    <div class="section-title"><h2>Today's tasks</h2><button data-action="generate">Refresh plan</button></div>
    ${ts.length?ts.map(taskHTML).join(''):`<div class="panel empty">No tasks yet. Refresh the plan and your checklist will be generated automatically.</div>`}
    <div class="section-title"><h2>Topics to focus on</h2><button data-route="topics">Manage topics</button></div>
    <div class="focus-topic-grid">${SUBJECTS.map(s=>{const t=weakTopic(s,today(),'Revision');return `<div class="focus-topic"><span>${esc(s)}</span><b>${t?esc(t.name):'No topic selected'}</b><small>${t?esc(t.state):''}</small></div>`}).join('')}</div>
    <div class="section-title"><h2>This week</h2><button data-route="progress">See progress</button></div>
    <div class="subject-grid">${SUBJECTS.map(s=>{const x=subjectProgress(s,wk);return `<div class="subject-card"><h3>${s}</h3><div class="big">${x.overall}%</div><div class="progress" style="margin:8px 0 9px"><span style="width:${x.overall}%"></span></div><div class="small-note">Homework ${x.homework}/${WEEK_TARGETS.homework}m<br>Exam questions ${x.exam}/${WEEK_TARGETS.exam}m<br>Anki ${s==='Maths'?'—':a.anki[s]+'/180m'}</div></div>`}).join('')}</div>`;
  }
  function taskTopic(t){return t.topicId?(state.data.topics[t.subject]||[]).find(x=>x.id===t.topicId)||null:null;}
  function taskHTML(t){const topic=taskTopic(t);return `<article class="task-card" data-task="${t.id}"><input class="check" type="checkbox" ${t.completed?'checked':''} data-action="toggle" data-id="${t.id}" aria-label="Complete task"><div><div class="task-title" style="${t.completed?'text-decoration:line-through;color:#98a2b3':''}">${esc(t.subject)} — ${esc(t.type)}</div><div class="task-meta"><span class="pill accent">${t.duration} min</span><span class="pill ${t.priority==='High'?'danger':t.priority==='Low'?'':'warn'}">${esc(t.priority)}</span>${t.auto?'<span class="pill">Auto</span>':''}</div>${topic?`<div class="task-topic"><b>Revise:</b> ${esc(topic.name)}</div>`:''}${t.notes?`<div class="small-note" style="margin-top:7px">${esc(t.notes)}</div>`:''}</div><div class="task-actions"><button class="mini-btn" data-action="edit" data-id="${t.id}">✎</button><button class="mini-btn" data-action="move" data-id="${t.id}">↔</button></div></article>`}
  function renderPlanner(){const days=[today(),addDays(today(),1),...Array.from({length:5},(_,i)=>addDays(startOfWeek(today()),i))];const unique=[...new Set(days)].sort(); const focus=state.plannerDay||today(); const ts=state.data.tasks.filter(t=>t.date===focus&&!t.completed).sort((a,b)=>priorityRank(b.priority)-priorityRank(a.priority)); return `<div class="section-title"><h2>Planner</h2><button data-action="generate-week">Generate week</button></div><div class="panel"><div class="segmented">${unique.slice(0,7).map(d=>`<button class="${d===focus?'active':''}" data-action="pick-day" data-date="${d}">${d===today()?'Today':fmtDate(d)}</button>`).join('')}</div></div><div class="section-title"><h2>${focus===today()?'Today':fmtLong(focus)}</h2><button data-action="add" data-date="${focus}">＋ Add</button></div>${ts.length?ts.map(taskHTML).join(''):`<div class="panel empty">Nothing planned for this day.</div>`}<div class="section-title"><h2>Completed</h2></div>${state.data.tasks.filter(t=>t.completed&&t.date===focus).length?state.data.tasks.filter(t=>t.completed&&t.date===focus).map(taskHTML).join(''):`<div class="panel empty">Completed tasks will appear here.</div>`}`}
  function renderProgress(){const wk=currentWeek(), a=weekActual(wk);return `<div class="section-title"><h2>Weekly progress</h2><span class="pill accent">${fmtDate(wk)} → ${fmtDate(addDays(wk,6))}</span></div><div class="subject-grid">${SUBJECTS.map(s=>{const x=subjectProgress(s,wk);return `<div class="subject-card"><h3>${s}</h3><div style="font-size:25px;font-weight:800">${x.overall}%</div><div class="progress" style="margin:8px 0 12px"><span style="width:${x.overall}%"></span></div><div class="small-note">Homework: <b>${x.homework} / ${WEEK_TARGETS.homework} min</b><br>Exam questions: <b>${x.exam} / ${WEEK_TARGETS.exam} min</b><br>${s==='Maths'?'Anki: not applicable':`Anki: <b>${a.anki[s]} / 180 min</b>`}</div></div>`}).join('')}</div><div class="panel"><h3 style="margin-top:0">Anki</h3><p class="small-note">Target: about 60 minutes per day Monday–Saturday, with Biology + Chemistry together capped at about 1 hour per day. Direct Anki card syncing is not available in a normal web app, so the app records Anki sessions as completed tasks instead.</p><div class="two-col"><button class="btn primary" data-action="log-anki">Log Anki session</button><button class="btn secondary" data-action="anki-info">How Anki tracking works</button></div></div><div class="section-title"><h2>Previous weeks</h2></div><div class="panel">${historyHTML()}</div>`}
  function historyHTML(){const keys=Object.keys(state.data.weeks).sort().reverse().filter(k=>k<currentWeek()); if(!keys.length)return '<div class="empty">Previous weeks will appear after your first week is completed.</div>';return keys.map(w=>{const x=state.data.weeks[w];return `<div class="history-week"><strong>${fmtDate(w)} → ${fmtDate(addDays(w,6))}</strong><div class="small-note" style="margin-top:6px">Biology: ${x.homework?.Biology||0}m homework · ${x.exam?.Biology||0}m exam questions · ${x.anki?.Biology||0}m Anki<br>Chemistry: ${x.homework?.Chemistry||0}m homework · ${x.exam?.Chemistry||0}m exam questions · ${x.anki?.Chemistry||0}m Anki<br>Maths: ${x.homework?.Maths||0}m homework · ${x.exam?.Maths||0}m exam questions</div></div>`}).join('')}
  function renderTopics(){
    const sections=SUBJECTS.map(s=>{
      const arr=state.data.topics[s]||[];
      const body=arr.length?arr.map(t=>`<div class="topic-card"><div style="display:flex;justify-content:space-between;gap:10px"><div><b>${esc(t.name)}</b><div class="small-note">${t.state}</div></div><button class="mini-btn" data-action="delete-topic" data-id="${t.id}" data-subject="${s}">×</button></div><div class="topic-state">${STATES.map(st=>`<button class="${t.state===st?'active':''}" data-action="topic-state" data-id="${t.id}" data-subject="${s}" data-state="${st}">${st}</button>`).join('')}</div></div>`).join(''):'<div class="panel empty">No topics added yet.</div>';
      return `<div class="section-title"><h2>${s}</h2></div>${body}`;
    }).join('');
    return `<div class="section-title"><h2>Topics</h2><button data-action="add-topic">＋ Add topic</button></div><p class="small-note">The app starts with a broad A-level topic bank. Add, remove or update topics to match your exact exam board. Marking a topic as Needs practice or Learning makes it more likely to be selected for your daily checklist.</p>${sections}`;
  }
  function renderMore(){return `<div class="section-title"><h2>More</h2></div><div class="panel"><div class="list-row"><div><b>Exams & deadlines</b><div class="small-note">Add dates that influence task priority.</div></div><button class="btn secondary" data-action="exams">Open</button></div><div class="list-row"><div><b>Missed & incomplete</b><div class="small-note">Tasks before today that are still incomplete.</div></div><button class="btn secondary" data-action="missed">Open</button></div><div class="list-row"><div><b>College travel buffer</b><div class="small-note">${state.data.settings.collegeTravelMinutes} minutes reserved after college weekdays. This app never assigns fixed times.</div></div><button class="btn secondary" data-action="settings">Edit</button></div><div class="list-row"><div><b>Data backup</b><div class="small-note">Export your data or restore a previous Revision Hub backup.</div></div><div style="display:flex;gap:6px"><button class="btn secondary" data-action="backup">Backup</button><button class="btn secondary" data-action="restore">Restore</button></div></div><div class="list-row"><div><b>Install on iPhone</b><div class="small-note">When hosted over HTTPS, use Safari → Share → Add to Home Screen.</div></div><button class="btn secondary" data-action="install-info">Info</button></div></div>`}

  function openModal(title,body){document.getElementById('modalRoot').innerHTML=`<div class="modal-backdrop" data-action="close-modal"><div class="modal" onclick="event.stopPropagation()"><div class="modal-head"><h2>${title}</h2><button class="close" data-action="close-modal">×</button></div>${body}</div></div>`;bindModal();}
  function closeModal(){document.getElementById('modalRoot').innerHTML=''}
  function taskForm(t=null, date=t?.date||today()){
    const isEdit=!!t; openModal(isEdit?'Edit task':'Add task',`<form id="taskForm" class="form-grid"><div class="two-col"><div class="field"><label>Date</label><input name="date" type="date" value="${date}" required></div><div class="field"><label>Subject</label><select name="subject">${SUBJECTS.map(s=>`<option ${t?.subject===s?'selected':''}>${s}</option>`).join('')}</select></div></div><div class="two-col"><div class="field"><label>Task type</label><select name="type">${TYPES.map(x=>`<option ${t?.type===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Duration (minutes)</label><input name="duration" type="number" min="5" step="5" value="${t?.duration||30}" required></div></div><div class="two-col"><div class="field"><label>Priority</label><select name="priority">${['High','Medium','Low'].map(x=>`<option ${t?.priority===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Topic (optional)</label><select name="topic"><option value="">None</option>${(state.data.topics[t?.subject||'Biology']||[]).map(x=>`<option value="${x.id}" ${t?.topicId===x.id?'selected':''}>${esc(x.name)}</option>`).join('')}</select></div></div><div class="field"><label>Notes</label><textarea name="notes" placeholder="Anything you want to remember">${esc(t?.notes||'')}</textarea></div><button class="btn primary full" type="submit">${isEdit?'Save changes':'Add task'}</button>${isEdit?`<button class="btn danger full" type="button" data-action="delete-task" data-id="${t.id}">Delete task</button>`:''}</form>`);
    const subjectSelect=document.querySelector('#taskForm select[name=subject]'); const topicSelect=document.querySelector('#taskForm select[name=topic]');
    subjectSelect.onchange=()=>{const current=topicSelect.value;topicSelect.innerHTML='<option value="">None</option>'+(state.data.topics[subjectSelect.value]||[]).map(x=>`<option value="${x.id}">${esc(x.name)}</option>`).join('');if((state.data.topics[subjectSelect.value]||[]).some(x=>x.id===current))topicSelect.value=current};
    document.getElementById('taskForm').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target);const obj=Object.fromEntries(fd.entries());const validTopic=(state.data.topics[obj.subject]||[]).some(x=>x.id===obj.topic);if(isEdit){Object.assign(t,{date:obj.date,subject:obj.subject,type:obj.type,duration:Number(obj.duration),priority:obj.priority,topicId:validTopic?(obj.topic||null):null,notes:obj.notes})}else addTaskRaw({...obj,duration:Number(obj.duration),topicId:validTopic?(obj.topic||null):null});save();closeModal();render();toast(isEdit?'Task updated':'Task added')};
  }
  function logAnkiModal(){
    openModal('Log Anki session',`<form id="ankiForm" class="form-grid"><div class="field"><label>Date</label><input name="date" type="date" value="${today()}"></div><div class="two-col"><div class="field"><label>Subject</label><select name="subject"><option>Biology</option><option>Chemistry</option></select></div><div class="field"><label>Minutes</label><input name="minutes" type="number" min="5" max="60" step="5" value="30" required></div></div><div class="field"><label>Cards reviewed (optional)</label><input name="cards" type="number" min="0" step="1" placeholder="e.g. 120"></div><p class="small-note">The app keeps total Anki activity at about 60 minutes per day. If generated Anki tasks already exist for that date, this session replaces as much of that planned time as necessary rather than double-counting it.</p><button class="btn primary full">Save session</button></form>`);
    document.getElementById('ankiForm').onsubmit=e=>{
      e.preventDefault();
      const o=Object.fromEntries(new FormData(e.target).entries());
      const mins=Math.min(60,Math.max(5,Math.round(Number(o.minutes)/5)*5));
      const date=o.date;
      const used=state.data.tasks.filter(t=>t.date===date&&t.type==='Anki'&&t.completed).reduce((n,t)=>n+(Number(t.duration)||0),0);
      const pending=state.data.tasks.filter(t=>t.date===date&&t.type==='Anki'&&!t.completed).reduce((n,t)=>n+(Number(t.duration)||0),0);
      const remaining=Math.max(0,60-used);
      if(mins>remaining){toast(`Only ${remaining} Anki minutes remain for that day`);return;}
      let toReplace=mins;
      const planned=state.data.tasks.filter(t=>t.date===date&&t.type==='Anki'&&!t.completed&&t.auto).sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
      for(const t of planned){
        if(toReplace<=0)break;
        const take=Math.min(toReplace,Number(t.duration)||0);
        if(take>=(Number(t.duration)||0)){state.data.tasks=state.data.tasks.filter(x=>x.id!==t.id)}
        else t.duration=(Number(t.duration)||0)-take;
        toReplace-=take;
      }
      const cards=Number(o.cards)||0;
      addTaskRaw({date,subject:o.subject,type:'Anki',duration:mins,priority:'High',notes:`Manual Anki session${cards?` · ${cards} cards`:''}`,auto:false,completed:true});
      save();closeModal();render();toast('Anki session logged');
    };
  }
  function examsModal(){const list=state.data.exams.map(e=>`<div class="list-row"><div><b>${esc(e.subject)} — ${esc(e.topic||'Exam')}</b><div class="small-note">${fmtLong(e.date)} · ${esc(e.board||'No board')} · ${esc(e.importance)}</div></div><button class="mini-btn" data-action="delete-exam" data-id="${e.id}">×</button></div>`).join('');openModal('Exams & deadlines',`<div class="panel">${list||'<div class="empty">No exams added.</div>'}</div><button class="btn primary full" data-action="add-exam">＋ Add exam</button>`)}
  function addExamModal(){openModal('Add exam',`<form id="examForm" class="form-grid"><div class="two-col"><div class="field"><label>Date</label><input name="date" type="date" min="${today()}" required></div><div class="field"><label>Subject</label><select name="subject">${SUBJECTS.map(s=>`<option>${s}</option>`).join('')}</select></div></div><div class="field"><label>Topic</label><input name="topic" placeholder="e.g. Organic chemistry"></div><div class="two-col"><div class="field"><label>Exam board</label><input name="board" placeholder="AQA / OCR / Edexcel"></div><div class="field"><label>Importance</label><select name="importance"><option>High</option><option>Medium</option><option>Low</option></select></div></div><button class="btn primary full">Save exam</button></form>`);document.getElementById('examForm').onsubmit=e=>{e.preventDefault();state.data.exams.push({id:uid(),...Object.fromEntries(new FormData(e.target).entries())});save();closeModal();examsModal();render();}}
  function missedModal(){const ts=state.data.tasks.filter(t=>t.date<today()&&!t.completed).sort((a,b)=>a.date.localeCompare(b.date));openModal('Missed & incomplete',ts.length?ts.map(taskHTML).join(''):'<div class="empty">Nothing missed. Nice.</div>');bindModal()}
  function settingsModal(){openModal('Settings',`<form id="settingsForm" class="form-grid"><div class="field"><label>College-to-home travel buffer (minutes)</label><input name="travel" type="number" min="0" max="180" value="${state.data.settings.collegeTravelMinutes}"></div><p class="small-note">The app does not create fixed-time revision slots, so this value is stored as a planning constraint rather than a scheduled block.</p><button class="btn primary full">Save settings</button></form>`);document.getElementById('settingsForm').onsubmit=e=>{e.preventDefault();state.data.settings.collegeTravelMinutes=Number(new FormData(e.target).get('travel'))||0;save();closeModal();render();toast('Settings saved')}}
  function addTopicModal(){openModal('Add topic',`<form id="topicForm" class="form-grid"><div class="field"><label>Subject</label><select name="subject">${SUBJECTS.map(s=>`<option>${s}</option>`).join('')}</select></div><div class="field"><label>Topic name</label><input name="name" required placeholder="e.g. Cell membranes"></div><div class="field"><label>Starting status</label><select name="state">${STATES.map(s=>`<option>${s}</option>`).join('')}</select></div><button class="btn primary full">Add topic</button></form>`);document.getElementById('topicForm').onsubmit=e=>{e.preventDefault();const o=Object.fromEntries(new FormData(e.target).entries());state.data.topics[o.subject].push({id:uid(),name:o.name,state:o.state});save();closeModal();render();toast('Topic added')}}
  function backup(){const blob=new Blob([JSON.stringify(state.data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`revision-hub-backup-${today()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  function restoreBackup(){openModal('Restore backup',`<div class="form-grid"><p class="small-note">Choose a Revision Hub JSON backup. Restoring replaces the current local data, so only use a trusted backup.</p><input id="restoreFile" type="file" accept="application/json,.json"><button id="restoreBtn" class="btn primary full" type="button">Restore backup</button></div>`);document.getElementById('restoreBtn').onclick=async()=>{const f=document.getElementById('restoreFile').files[0];if(!f){toast('Choose a backup first');return}try{const parsed=normalize(JSON.parse(await f.text()));if(!parsed.version||!Array.isArray(parsed.tasks)||!parsed.topics){throw new Error('Invalid backup')}state.data=parsed;save();closeModal();render();toast('Backup restored')}catch(e){toast('Invalid backup file')}}}
  function moveModal(t){openModal('Move task',`<form id="moveForm" class="form-grid"><div class="field"><label>Move “${esc(t.subject)} — ${esc(t.type)}” to</label><input name="date" type="date" value="${t.date}"></div><button class="btn primary full">Move task</button></form>`);document.getElementById('moveForm').onsubmit=e=>{e.preventDefault();t.date=new FormData(e.target).get('date');save();closeModal();render();toast('Task moved')}}
  function toast(msg){const el=document.getElementById('toast');el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)}
  function bind(){document.querySelectorAll('[data-route]').forEach(b=>b.onclick=()=>{state.route=b.dataset.route; if(state.route==='planner')state.plannerDay=today(); render()});document.querySelectorAll('[data-action]').forEach(b=>b.onclick=action);}
  function bindModal(){document.querySelectorAll('#modalRoot [data-action]').forEach(b=>b.onclick=action)}
  function action(e){const b=e.currentTarget,a=b.dataset.action,id=b.dataset.id,t=state.data.tasks.find(x=>x.id===id); if(a==='add')taskForm(null,b.dataset.date||today()); else if(a==='generate'){const n=generateFor(today(),true);render();toast(n?`Added ${n} task${n===1?'':'s'}`:'No new tasks needed')}
    else if(a==='toggle'){if(!t)return;t.completed=b.checked;save();updateWeekSnapshot(currentWeek());save();render();toast(t.completed?'Task completed':'Task reopened')}
    else if(a==='edit')taskForm(t);
    else if(a==='delete-task'){state.data.tasks=state.data.tasks.filter(x=>x.id!==id);save();closeModal();render();toast('Task deleted')}
    else if(a==='move')moveModal(t);
    else if(a==='pick-day'){state.plannerDay=b.dataset.date;render()}
    else if(a==='generate-week'){let n=0;const wk=startOfWeek(today());for(let i=0;i<7;i++){const d=addDays(today(),i);if(startOfWeek(d)!==wk)break;n+=generateFor(d,false)}render();toast(`Plan refreshed · ${n} task${n===1?'':'s'} added`)}
    else if(a==='log-anki')logAnkiModal();
    else if(a==='anki-info')openModal('Anki tracking',`<p>There is no supported browser API that lets a normal website read your existing Anki deck/review state directly. This app therefore never pretends it has live Anki sync.</p><p>You can either complete the generated Anki tasks or use <b>Log Anki session</b>. Manual logging creates a completed Anki task, so the same activity is not stored in a second progress counter.</p>`);
    else if(a==='add-topic')addTopicModal();
    else if(a==='topic-state'){const arr=state.data.topics[b.dataset.subject];const x=arr.find(q=>q.id===id);if(x){x.state=b.dataset.state;save();render()}}
    else if(a==='delete-topic'){state.data.topics[b.dataset.subject]=state.data.topics[b.dataset.subject].filter(x=>x.id!==id);save();render();toast('Topic deleted')}
    else if(a==='exams')examsModal(); else if(a==='add-exam')addExamModal(); else if(a==='delete-exam'){state.data.exams=state.data.exams.filter(x=>x.id!==id);save();examsModal()}
    else if(a==='missed')missedModal(); else if(a==='settings')settingsModal(); else if(a==='backup')backup(); else if(a==='restore')restoreBackup(); else if(a==='install-info')openModal('Add to iPhone Home Screen',`<p>For the PWA install experience, the app must be hosted over HTTPS (or localhost during development). On iPhone, open the hosted app in Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>.</p><p>The app includes a manifest, standalone display settings and a service worker for offline caching when served from HTTPS.</p>`); else if(a==='close-modal')closeModal();
  }
  function init(){state.data=load(); rollover(); generateFor(today()); if('serviceWorker' in navigator && location.protocol!=='file:')navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('SW',e)); render();}
  window.RevisionHub={state,generateFor,weekActual,addTaskRaw,save,render,reset:()=>{localStorage.removeItem(KEY);location.reload()},_action:action,_taskForm:taskForm,_logAnki:logAnkiModal,_ensureWeek:ensureWeek,_startOfWeek:startOfWeek};
  document.addEventListener('click',e=>{if(e.target.classList.contains('modal-backdrop'))closeModal()}); document.getElementById('quickAddBtn').onclick=()=>taskForm(); init();
})();
