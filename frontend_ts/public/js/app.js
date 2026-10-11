
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const THEME_KEY='artemPlanner.theme.v1';
const systemThemeMedia=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
function loadThemePreference(){try{const value=localStorage.getItem(THEME_KEY);return ['system','dark','light','beige'].includes(value)?value:'system'}catch{return 'system'}}
let themePreference=loadThemePreference();
function applyTheme(){
  const resolved=themePreference==='system'?(systemThemeMedia?.matches?'dark':'light'):themePreference;
  document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved==='dark'?'dark':'light';
  const meta=$('#themeColorMeta');if(meta)meta.setAttribute('content',resolved==='dark'?'#0f1012':resolved==='beige'?'#f3ecdf':'#f7f7f8');
  $$('[data-theme-choice]').forEach(button=>{const selected=button.dataset.themeChoice===themePreference;button.classList.toggle('selected',selected);button.setAttribute('aria-pressed',String(selected))});
}
function setThemePreference(value){
  if(!['system','dark','light','beige'].includes(value))return false;
  themePreference=value;try{localStorage.setItem(THEME_KEY,value)}catch{}applyTheme();return true;
}
$$('[data-theme-choice]').forEach(button=>button.addEventListener('click',()=>{if(!button.disabled)setThemePreference(button.dataset.themeChoice)}));
const onSystemThemeChange=()=>{if(themePreference==='system')applyTheme()};
if(systemThemeMedia?.addEventListener)systemThemeMedia.addEventListener('change',onSystemThemeChange);else systemThemeMedia?.addListener?.(onSystemThemeChange);
window.addEventListener('storage',event=>{if(event.key===THEME_KEY){themePreference=loadThemePreference();applyTheme()}});
applyTheme();

const moneyFormatter = new Intl.NumberFormat('ru-RU',{maximumFractionDigits:2});
const fmt = n => moneyFormatter.format(n||0) + ' ₽';
const iso = d => {
  const z = new Date(d.getTime() - d.getTimezoneOffset()*60000);
  return z.toISOString().slice(0,10);
};
let todayISO = iso(new Date());
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+Math.random().toString(36).slice(2));
const startOfWeek = d => {
  const x=new Date(d); const day=(x.getDay()+6)%7; x.setHours(0,0,0,0); x.setDate(x.getDate()-day); return x;
};
const monthKey = d => d.slice(0,7);

const CALENDAR_CATEGORY_DEFS=[
  {key:'work',label:'Работа',emoji:'💼',color:'#a1a1aa'},
  {key:'project',label:'Свои проекты',emoji:'🧠',color:'#6366f1'},
  {key:'study',label:'Обучение',emoji:'📚',color:'#14b8a6'},
  {key:'commute',label:'Дорога',emoji:'🚇',color:'#60a5fa'},
  {key:'food',label:'Еда',emoji:'🍽',color:'#4ade80'},
  {key:'sport',label:'Спорт',emoji:'🏃',color:'#10b981'},
  {key:'personal',label:'Личное / быт',emoji:'👤',color:'#fb923c'},
  {key:'together',label:'Вместе',emoji:'♥',color:'#f472b6'},
  {key:'rest',label:'Отдых',emoji:'☕',color:'#facc15'},
  {key:'other',label:'Другое',emoji:'•',color:'#71717a'}
];
const DEFAULT_CALENDAR_CATEGORY_COLORS=Object.fromEntries(CALENDAR_CATEGORY_DEFS.map(x=>[x.key,x.color]));
const calendarCategoryLabels=Object.fromEntries(CALENDAR_CATEGORY_DEFS.map(x=>[x.key,x.label]));
const calendarCategoryEmoji=Object.fromEntries(CALENDAR_CATEGORY_DEFS.map(x=>[x.key,x.emoji]));
function normalizeCalendarCategory(key){
  if(key==='learning')return 'study';
  if(key==='freelance')return 'work';
  if(key==='home')return 'personal';
  return CALENDAR_CATEGORY_DEFS.some(x=>x.key===key)?key:'other';
}
function calendarCategoryColor(key){
  const normalized=normalizeCalendarCategory(key);
  const value=db?.categoryColors?.[normalized];return /^#[0-9a-f]{6}$/i.test(value||'')?value:DEFAULT_CALENDAR_CATEGORY_COLORS[normalized]||'#71717a';
}
function calendarEventInlineStyle(key){
  const color=calendarCategoryColor(key);
  return `--event-color:${color};background:color-mix(in srgb,${color} 18%,var(--surface));border-color:${color}`;
}

const defaults = {
  money: [],
  food: [],
  subscriptions: [],
  recurringIncome: [],
  calories: [],
  workouts: [],
  weights: [],
  trainingSettings:{weeklyGoal:4,heightCm:0},
  financeSettings:{openingBalance:0,openingDate:''},
  foodWeekDecisions:{},
  goals:[],
  budgets:{day:1000,week:7000,month:30000},
  legacyTaskArchive:[],
  projects:[],
  portfolioWorks:[],
  portfolioCollections:[],
  learningSkills:[],
  calendar:[],
  timer:{activeTaskId:'',running:false,startedAt:null,sessionAccumulatedMs:0},
  timeEntries:[],
  weekTemplate:[],
  customCalendarPresets:[],
  hiddenCalendarPresets:[],
  categoryColors:{...DEFAULT_CALENDAR_CATEGORY_COLORS},
  meta:{schema:23,updatedAt:null,domainUpdatedAt:{}}
};

let plannerScope='guest',plannerEpoch=0,plannerStorageBlocked=false,plannerLoadError='';
let plannerRevision=0,plannerSyncBase=null,plannerRemoteVersion=null;
const suspendedPlannerNotes=new Map();
function scopedPlannerKey(key,scope=plannerScope){return key+'.scope.'+encodeURIComponent(scope)}
function plannerDataKey(scope=plannerScope){return scopedPlannerKey('artemPlanner.v01',scope)}
function validatePlannerState(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Файл должен содержать объект данных Planner.');
 if(value.meta?.schema!=null&&(!Number.isInteger(value.meta.schema)||value.meta.schema>23||value.meta.schema<0))throw Error('Эта версия формата данных пока не поддерживается.');
 let count=0;function walk(x,depth=0){if(depth>35||++count>200000)throw Error('Слишком сложный файл данных.');if(!x||typeof x!=='object')return;for(const [k,v] of Object.entries(x)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Недопустимое поле данных.');walk(v,depth+1)}}walk(value);
 const lists=['money','food','subscriptions','recurringIncome','calories','workouts','weights','legacyTaskArchive','projects','portfolioWorks','portfolioCollections','learningSkills','calendar','timeEntries','customCalendarPresets','goals'];
 for(const key of lists){if(value[key]==null)continue;if(!Array.isArray(value[key]))throw Error('Поле «'+key+'» должно быть списком.');const ids=new Set();for(const item of value[key]){if(!item||typeof item!=='object'||Array.isArray(item)||typeof item.id!=='string'||!item.id||item.id.length>200||!/^[a-zA-Z0-9_:.@\/-]+$/.test(item.id)||['__proto__','constructor','prototype'].includes(item.id))throw Error('Некорректная запись в «'+key+'».');if(ids.has(item.id))throw Error('Повторяющийся ID в «'+key+'».');ids.add(item.id);for(const field of ['title','name','description','note','projectId','calendarEventId','taskId','goalId','movedFromId','movedToEventId'])if(item[field]!=null&&typeof item[field]!=='string')throw Error('Некорректный текст в «'+key+'».');if(['calendar','workouts'].includes(key)&&item.status!=null&&!['planned','done','moved','missed'].includes(item.status))throw Error('Некорректный статус в «'+key+'».');for(const field of ['date','openingDate'])if(item[field]!=null&&item[field]!==''&&(typeof item[field]!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(item[field])||new Date(item[field]+'T12:00:00Z').toISOString().slice(0,10)!==item[field]))throw Error('Некорректная дата в «'+key+'».');for(const field of ['start','end'])if(item[field]!=null&&item[field]!==''&&(typeof item[field]!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(item[field])))throw Error('Некорректное время в «'+key+'».');for(const field of ['amount','ms','duration','value','calories'])if(item[field]!=null&&(!Number.isFinite(Number(item[field]))))throw Error('Некорректное число в «'+key+'».')}}
 for(const key of ['budgets','financeSettings','trainingSettings','timer','meta','categoryColors','foodWeekDecisions'])if(value[key]!=null&&(!value[key]||typeof value[key]!=='object'||Array.isArray(value[key])))throw Error('Некорректное поле «'+key+'».');
 if(value.weekTemplate!=null){
  if(!Array.isArray(value.weekTemplate))throw Error('Некорректный шаблон недели.');
  for(const item of value.weekTemplate){
   if(!item||typeof item!=='object'||Array.isArray(item)||!Number.isInteger(item.dayIndex)||item.dayIndex<0||item.dayIndex>6)throw Error('Некорректный день в шаблоне недели.');
   for(const field of ['title','note','category','projectId'])if(item[field]!=null&&typeof item[field]!=='string')throw Error('Некорректный текст в шаблоне недели.');
   for(const field of ['start','end'])if(typeof item[field]!=='string'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(item[field]))throw Error('Некорректное время в шаблоне недели.');
  }
 }
 if(value.hiddenCalendarPresets!=null&&(!Array.isArray(value.hiddenCalendarPresets)||value.hiddenCalendarPresets.some(x=>typeof x!=='string')))throw Error('Некорректные быстрые блоки.');
 return value;
}
function readScopedPlannerValue(key){const value=localStorage.getItem(scopedPlannerKey(key));return value!==null?value:plannerScope==='guest'?localStorage.getItem(key):null}
function readPlannerSource(scope=plannerScope){
 const scoped=localStorage.getItem(plannerDataKey(scope));
 if(scoped!==null)return scoped;
 return scope==='guest'?localStorage.getItem('artemPlanner.v01'):null;
}
function load(){
 try{const raw=readPlannerSource();if(!raw)return structuredClone(defaults);return {...structuredClone(defaults),...validatePlannerState(JSON.parse(raw))}}
 catch(err){plannerStorageBlocked=true;plannerLoadError=err.message||'Не удалось прочитать данные.';return structuredClone(defaults)}
}
let db=load();
const legacyIncomingTasks=Array.isArray(db['tasks'])?db['tasks']:[];
delete db['tasks'];
db.learningSkills=Array.isArray(db.learningSkills)?db.learningSkills:[];
db.portfolioWorks=Array.isArray(db.portfolioWorks)?db.portfolioWorks:[];db.portfolioCollections=Array.isArray(db.portfolioCollections)?db.portfolioCollections:[];
db.calendar ??= []; db.legacyTaskArchive ??= []; db.projects ??= []; db.money ??= []; db.food ??= []; db.subscriptions ??= []; db.recurringIncome ??= []; db.calories ??=[]; db.workouts ??=[]; db.weights ??=[]; db.trainingSettings ??= structuredClone(defaults.trainingSettings); db.financeSettings ??= structuredClone(defaults.financeSettings); db.foodWeekDecisions ??= {}; db.goals ??= []; db.budgets ??= structuredClone(defaults.budgets); db.meta ??= {}; db.timeEntries ??=[]; db.weekTemplate ??=[]; db.customCalendarPresets ??=[]; db.hiddenCalendarPresets=Array.isArray(db.hiddenCalendarPresets)?db.hiddenCalendarPresets:[]; db.categoryColors={...DEFAULT_CALENDAR_CATEGORY_COLORS,...(db.categoryColors||{})};
// v0.3: удаляем только старые демонстрационные быстрые задачи из прототипа.
if((db.meta.schema||0)<3){
  db.meta.schema=3;
}
if((db.meta.schema||0)<4){
  db.projects=db.projects.map(p=>({...p,archived:!!p.archived}));
  db.calendar=db.calendar.map(e=>({...e,taskId:e.taskId||'',projectId:e.projectId||''}));
  db.money=db.money.map(m=>({...m,projectId:m.projectId||''}));
  db.timer={activeTaskId:'',running:false,startedAt:null};
  db.timeEntries=db.timeEntries||[]; db.weekTemplate=db.weekTemplate||[]; db.meta.schema=4;
}
if((db.meta.schema||0)<5){
  db.meta.updatedAt=db.meta.updatedAt||null;
  db.meta.schema=5;
}
if((db.meta.schema||0)<6){
  db.foodWeekDecisions=db.foodWeekDecisions||{};
  db.budgets={...structuredClone(defaults.budgets),...(db.budgets||{})};
  db.budgets.week=(Number(db.budgets.day)||1000)*7;
  db.meta.schema=6;
}
if((db.meta.schema||0)<7){
  db.goals=Array.isArray(db.goals)?db.goals:[];
  db.money=db.money.map(x=>({...x,goalId:x.goalId||''}));
  db.meta.schema=7;
}
if((db.meta.schema||0)<8){
  db.money=db.money.map(x=>({...x,seriesId:x.seriesId||''}));
  db.meta.schema=8;
}
if((db.meta.schema||0)<9){
  db.timer={...structuredClone(defaults.timer),...(db.timer||{}),sessionAccumulatedMs:Number(db.timer?.sessionAccumulatedMs||0)};
  db.timeEntries=db.timeEntries.map(x=>({...x,taskTitle:x.taskTitle||'',projectName:x.projectName||''}));
  db.meta.schema=9;
}
if((db.meta.schema||0)<10){
  db.money=db.money.map(x=>{
    if(x.source==='food' && String(x.category||'').startsWith('Еда · ')){
      return {...x,category:'Траты · '+String(x.category).slice(6)};
    }
    return x;
  });
  db.meta.schema=10;
}
if((db.meta.schema||0)<11){
  db.calories=Array.isArray(db.calories)?db.calories:[];
  db.workouts=Array.isArray(db.workouts)?db.workouts:[];
  db.weights=Array.isArray(db.weights)?db.weights:[];
  db.trainingSettings={...structuredClone(defaults.trainingSettings),...(db.trainingSettings||{})};
  db.meta.schema=11;
}
if((db.meta.schema||0)<12){
  db.trainingSettings={...structuredClone(defaults.trainingSettings),...(db.trainingSettings||{})};
  db.weights=(Array.isArray(db.weights)?db.weights:[]).map(x=>({...x,zone:['green','yellow','red'].includes(x.zone)?x.zone:'green'}));
  db.meta.schema=12;
}
if((db.meta.schema||0)<13){
  db.customCalendarPresets=Array.isArray(db.customCalendarPresets)?db.customCalendarPresets:[];
  db.meta.schema=13;
}
if((db.meta.schema||0)<14){
  db.food=(Array.isArray(db.food)?db.food:[]).map(x=>({...x,excludeFromLimit:!!x.excludeFromLimit}));
  db.meta.schema=14;
}
if((db.meta.schema||0)<15){
  db.subscriptions=Array.isArray(db.subscriptions)?db.subscriptions:[];
  db.meta.schema=15;
}
if((db.meta.schema||0)<16){
  db.recurringIncome=Array.isArray(db.recurringIncome)?db.recurringIncome:[];
  db.meta.schema=16;
}
if((db.meta.schema||0)<17){
  db.money=(Array.isArray(db.money)?db.money:[]).map(x=>({...x,external:!!x.external}));
  db.meta.schema=17;
}
if((db.meta.schema||0)<18){
  db.financeSettings={...structuredClone(defaults.financeSettings),...(db.financeSettings||{})};
  db.calendar=(Array.isArray(db.calendar)?db.calendar:[]).map(e=>({...e,autoFromTask:false}));
  db.meta.schema=18;
}
if((db.meta.schema||0)<19){
  db.calendar=(Array.isArray(db.calendar)?db.calendar:[]).map(e=>({
    ...e,
    status:e.status||(e.done?'done':'planned'),
    done:(e.status?e.status==='done':!!e.done),
    movedFromId:e.movedFromId||'',
    movedToEventId:e.movedToEventId||''
  }));
  db.workouts=(Array.isArray(db.workouts)?db.workouts:[]).map(w=>({
    ...w,
    calendarEventId:w.calendarEventId||'',
    start:w.start||'19:00'
  }));
  db.meta.schema=19;
}
if((db.meta.schema||0)<20){
  const oldTasks=legacyIncomingTasks;
  const archived=[...(Array.isArray(db.legacyTaskArchive)?db.legacyTaskArchive:[]),...oldTasks];
  const seen=new Set();
  db.legacyTaskArchive=archived.filter(t=>t&&t.id&&!seen.has(t.id)&&seen.add(t.id));
  const taskById=new Map(oldTasks.map(t=>[t.id,t]));
  db.timeEntries=(Array.isArray(db.timeEntries)?db.timeEntries:[]).map(x=>{
    const t=taskById.get(x.taskId),p=t?.projectId?db.projects.find(v=>v.id===t.projectId):null;
    return {...x,taskTitle:x.taskTitle||t?.title||'',projectId:x.projectId||t?.projectId||'',projectName:x.projectName||p?.name||''};
  });
  db.calendar=(Array.isArray(db.calendar)?db.calendar:[]).map(e=>({...e,taskId:'',autoFromTask:false}));
  if(oldTasks.some(t=>t.id===db.timer?.activeTaskId)){
    db.timer={...structuredClone(defaults.timer)};
  }
  delete db['tasks'];
  db.meta.domainUpdatedAt=(db.meta.domainUpdatedAt&&typeof db.meta.domainUpdatedAt==='object')?db.meta.domainUpdatedAt:{};
  const stamp=db.meta.updatedAt||new Date().toISOString();
  for(const domain of ['planning','finance','health','focus']) db.meta.domainUpdatedAt[domain]??=stamp;
  db.meta.schema=20;
}
if((db.meta.schema||0)<21){
  db.meta.domainUpdatedAt=(db.meta.domainUpdatedAt&&typeof db.meta.domainUpdatedAt==='object')?db.meta.domainUpdatedAt:{};
  db.meta.schema=21;
}
if((db.meta.schema||0)<22){
  db.categoryColors={...DEFAULT_CALENDAR_CATEGORY_COLORS,...(db.categoryColors||{})};
  db.calendar=(Array.isArray(db.calendar)?db.calendar:[]).map(e=>({...e,category:normalizeCalendarCategory(e.category)}));
  db.weekTemplate=(Array.isArray(db.weekTemplate)?db.weekTemplate:[]).map(e=>({...e,category:normalizeCalendarCategory(e.category)}));
  db.customCalendarPresets=(Array.isArray(db.customCalendarPresets)?db.customCalendarPresets:[]).map(e=>({...e,category:normalizeCalendarCategory(e.category)}));
  db.meta.schema=22;
}
if((db.meta.schema||0)<23){
  db.hiddenCalendarPresets=Array.isArray(db.hiddenCalendarPresets)?db.hiddenCalendarPresets:[];
  db.meta.schema=23;
}
db.calendar=db.calendar.map(e=>({...e,category:normalizeCalendarCategory(e.category)}));
function persistLocal(touch=true){
  if(plannerStorageBlocked)throw Error("Данные не прочитаны. Сначала восстанови резерв или импортируй исправный файл в настройках.");
  db.meta??={};
  db.meta.schema=23;
  db.meta.domainUpdatedAt=(db.meta.domainUpdatedAt&&typeof db.meta.domainUpdatedAt==='object')?db.meta.domainUpdatedAt:{};
  delete db['tasks'];
  if(touch) db.meta.updatedAt=new Date().toISOString();
  localStorage.setItem(plannerDataKey(),JSON.stringify(db));
}

const UNDO_HISTORY_KEY='planner.undoHistory.v2';
const REDO_HISTORY_KEY='planner.redoHistory.v2';
const LEGACY_UNDO_HISTORY_KEY='planner.undoHistory.v1';
const LEGACY_REDO_HISTORY_KEY='planner.redoHistory.v1';
const HISTORY_LIMIT=12;
const HISTORY_BYTES_LIMIT=1400000;
const RECOVERY_KEY='planner.recovery.v1';
const RECOVERY_INTERVAL_MS=6*60*60*1000;
let undoToastTimer=null;

const HISTORY_FIELDS=[
  'money','food','subscriptions','recurringIncome','calories','workouts','weights',
  'trainingSettings','financeSettings','foodWeekDecisions','goals','budgets',
  'projects','portfolioWorks','portfolioCollections','learningSkills','calendar','timer','timeEntries','weekTemplate','customCalendarPresets','hiddenCalendarPresets','categoryColors'
];

function historyState(value=db){
  try{
    const source=typeof value==='string'?JSON.parse(value):(value?.v===2&&value.state?value.state:value);
    const normalized=normalizeCloudData(source||{});
    const state={};
    HISTORY_FIELDS.forEach(k=>state[k]=structuredClone(normalized[k]));
    return state;
  }catch{return null}
}
function makeHistorySnapshot(value=db){
  const state=historyState(value);
  return state?{v:2,at:new Date().toISOString(),state}:null;
}
function restoreHistorySnapshot(entry){
  if(typeof entry==='string'){
    return normalizeCloudData(JSON.parse(entry));
  }
  if(entry?.v===2&&entry.state){
    const restored={...structuredClone(db),...structuredClone(entry.state)};
    restored.legacyTaskArchive=structuredClone(db.legacyTaskArchive||[]);
    restored.meta={...structuredClone(db.meta||{}),schema:23};
    return normalizeCloudData(restored);
  }
  return normalizeCloudData(entry||{});
}
function historyComparable(value){
  const state=historyState(value);
  if(!state)return '';
  return JSON.stringify(stableCloudValue(state));
}
function readStateHistory(key){
  try{
    let rows=JSON.parse(readScopedPlannerValue(key)||'[]');
    if(!Array.isArray(rows))rows=[];
    // One-time bridge from the old full-state history.
    if(!rows.length&&key===UNDO_HISTORY_KEY){
      const legacy=JSON.parse(readScopedPlannerValue(LEGACY_UNDO_HISTORY_KEY)||'[]');
      if(Array.isArray(legacy)&&legacy.length)rows=legacy.slice(-5).map(makeHistorySnapshot).filter(Boolean);
    }
    if(!rows.length&&key===REDO_HISTORY_KEY){
      const legacy=JSON.parse(readScopedPlannerValue(LEGACY_REDO_HISTORY_KEY)||'[]');
      if(Array.isArray(legacy)&&legacy.length)rows=legacy.slice(-5).map(makeHistorySnapshot).filter(Boolean);
    }
    return rows;
  }catch{return []}
}
function writeStateHistory(key,rows){
  let list=rows.filter(Boolean).slice(-HISTORY_LIMIT);
  while(list.length>1&&JSON.stringify(list).length>HISTORY_BYTES_LIMIT)list.shift();
  try{
    localStorage.setItem(scopedPlannerKey(key),JSON.stringify(list));
    if(key===UNDO_HISTORY_KEY)localStorage.removeItem(scopedPlannerKey(LEGACY_UNDO_HISTORY_KEY));
    if(key===REDO_HISTORY_KEY)localStorage.removeItem(scopedPlannerKey(LEGACY_REDO_HISTORY_KEY));
  }catch{
    while(list.length>2){
      list.shift();
      try{localStorage.setItem(scopedPlannerKey(key),JSON.stringify(list));return}catch{}
    }
  }
}
function captureUndoSnapshot(previousRaw=localStorage.getItem(plannerDataKey())){
  if(!previousRaw)return false;
  if(historyComparable(previousRaw)===historyComparable(db))return false;
  const snap=makeHistorySnapshot(previousRaw);if(!snap)return false;
  const undo=readStateHistory(UNDO_HISTORY_KEY);
  if(!undo.length||historyComparable(undo[undo.length-1])!==historyComparable(snap)){
    undo.push(snap);writeStateHistory(UNDO_HISTORY_KEY,undo);
  }
  writeStateHistory(REDO_HISTORY_KEY,[]);
  return true;
}
function historyAvailable(){return readStateHistory(UNDO_HISTORY_KEY).length>0}
function redoAvailable(){return readStateHistory(REDO_HISTORY_KEY).length>0}
function pushCurrentStateToUndo(){
  const snap=makeHistorySnapshot(db);if(!snap)return;
  const undo=readStateHistory(UNDO_HISTORY_KEY);
  if(!undo.length||historyComparable(undo[undo.length-1])!==historyComparable(snap)){
    undo.push(snap);writeStateHistory(UNDO_HISTORY_KEY,undo);
  }
  writeStateHistory(REDO_HISTORY_KEY,[]);
}
function showUndoToast(label='Изменение сохранено'){
  const toast=$('#undoToast'),text=$('#undoToastText'),undo=$('#undoAction'),redo=$('#redoAction');
  if(!toast)return;
  text.textContent=label;
  undo.style.display=historyAvailable()?'inline-flex':'none';
  redo.style.display=redoAvailable()?'inline-flex':'none';
  toast.classList.add('show');
  clearTimeout(undoToastTimer);
  undoToastTimer=setTimeout(()=>toast.classList.remove('show'),8000);
}
function refreshAfterHistoryRestore(){
  setSyncPending(true);
  cloudDirty=true;
  scheduleCloudPush();
  updateCloudUI();
  renderToday();renderMoney();renderProjects();renderCalendar();renderPortfolio();
  renderWorkouts();renderArchive();renderFocusPage();renderLearning();
  drawTimer();fillProjectSelect();renderRecoveryStatus();
}
function undoLastAction(){
  return restorePlannerHistory(UNDO_HISTORY_KEY,REDO_HISTORY_KEY,'Нечего отменять','Действие отменено');
}
function redoLastAction(){
  return restorePlannerHistory(REDO_HISTORY_KEY,UNDO_HISTORY_KEY,'Нечего повторить','Действие повторено');
}
function restorePlannerHistory(sourceKey,targetKey,emptyLabel,successLabel){
  const source=readStateHistory(sourceKey);
  if(!source.length){showUndoToast(emptyLabel);return false}
  const previous=db,beforeRaw=JSON.stringify(db),current=makeHistorySnapshot(db);
  if(!current){showUndoToast('Не удалось подготовить историю');return false}
  try{
    db=restoreHistorySnapshot(source[source.length-1]);
    markChangedDomains(beforeRaw);
    db.meta.updatedAt=new Date().toISOString();
    persistLocal(false);
  }catch(err){
    db=previous;
    console.error('history restore',err);showUndoToast('Не удалось сохранить действие. История не изменена.');return false;
  }
  // A pending cloud push must detect undo/redo as a new local revision.
  plannerRevision++;
  writeStateHistory(sourceKey,source.slice(0,-1));
  const target=readStateHistory(targetKey);target.push(current);writeStateHistory(targetKey,target);
  refreshAfterHistoryRestore();showUndoToast(successLabel);return true;
}
function writeRecoveryBackup(reason='Автоматический резерв',force=false){
  if(plannerStorageBlocked)return false;
  try{
    const current=JSON.parse(readScopedPlannerValue(RECOVERY_KEY)||'null');
    const last=Date.parse(current?.at||'')||0;
    if(!force&&Date.now()-last<RECOVERY_INTERVAL_MS)return false;
    const snap=makeHistorySnapshot(db);if(!snap)return false;
    localStorage.setItem(scopedPlannerKey(RECOVERY_KEY),JSON.stringify({at:new Date().toISOString(),reason,snapshot:snap}));
    renderRecoveryStatus();return true;
  }catch(err){console.warn('recovery backup',err);return false}
}
function readRecoveryBackup(){
  try{
    const value=JSON.parse(readScopedPlannerValue(RECOVERY_KEY)||'null');
    return value?.snapshot?value:null;
  }catch{return null}
}
function renderRecoveryStatus(){
  const row=readRecoveryBackup(),status=$('#recoveryStatus'),btn=$('#restoreRecovery');
  if(status){
    status.textContent=row?`${row.reason} · ${new Intl.DateTimeFormat('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(row.at))}`:'Пока не создан';
  }
  if(btn)btn.disabled=!row;
}
$('#restoreRecovery')?.addEventListener('click',()=>{
 const row=readRecoveryBackup();if(!row)return;if(!confirm('Восстановить резервную копию этого аккаунта?'))return;
 const old=structuredClone(db),blocked=plannerStorageBlocked;
 try{const incoming=restoreHistorySnapshot(row.snapshot);if(!blocked){pushCurrentStateToUndo();writeRecoveryBackup('Перед восстановлением',true)}db=incoming;plannerStorageBlocked=false;persistLocal(true);plannerRevision++;setSyncPending(true);cloudDirty=true;scheduleCloudPush();renderAfterRemote();showUndoToast('Резервная копия восстановлена')}
 catch(err){db=old;plannerStorageBlocked=blocked;alert('Не удалось восстановить резерв: '+err.message)}
});

function maybeWriteAutomaticRecovery(){writeRecoveryBackup('Автоматический резерв',false)}

const SYNC_DOMAINS={
  planning:['projects','calendar','weekTemplate','customCalendarPresets','hiddenCalendarPresets','categoryColors'],
  portfolio:['portfolioWorks','portfolioCollections'],
  learning:['learningSkills'],
  finance:['money','food','subscriptions','recurringIncome','goals','budgets','financeSettings','foodWeekDecisions'],
  health:['calories','workouts','weights','trainingSettings'],
  focus:['timeEntries','timer']
};
function comparableDomain(state,domain){
  const keys=SYNC_DOMAINS[domain]||[];
  const out={};
  keys.forEach(k=>out[k]=state?.[k]);
  return JSON.stringify(stableCloudValue(out));
}
function markChangedDomains(previousRaw){
  let previous=null;
  try{previous=previousRaw?normalizeCloudData(JSON.parse(previousRaw)):null}catch{}
  db.meta??={};db.meta.domainUpdatedAt=(db.meta.domainUpdatedAt&&typeof db.meta.domainUpdatedAt==='object')?db.meta.domainUpdatedAt:{};
  const now=new Date().toISOString();
  for(const domain of Object.keys(SYNC_DOMAINS)){
    if(!previous||comparableDomain(previous,domain)!==comparableDomain(db,domain))db.meta.domainUpdatedAt[domain]=now;
    else db.meta.domainUpdatedAt[domain]??=previous.meta?.domainUpdatedAt?.[domain]||previous.meta?.updatedAt||now;
  }
}
function mergeCloudDomains(localState,remoteState,baseState=plannerSyncBase){
 const local=normalizeCloudData(localState),remote=normalizeCloudData(remoteState),base=baseState?normalizeCloudData(baseState):null,merged=structuredClone(local);
 const equal=(a,b)=>JSON.stringify(stableCloudValue(a))===JSON.stringify(stableCloudValue(b));
 if(!base&&cloudComparable(local)!==cloudComparable(remote))throw Error('Неизвестна общая версия данных. Нужен выбор источника.');
 function choice(l,r,b,label){if(equal(l,r))return l;if(base&&equal(l,b))return r;if(base&&equal(r,b))return l;throw Error('Конфликт: '+label)}
 for(const [domain,keys] of Object.entries(SYNC_DOMAINS))for(const key of keys){
  const l=local[key],r=remote[key],b=base?.[key];
  if(Array.isArray(l)&&Array.isArray(r)&&key!=='weekTemplate'&&key!=='hiddenCalendarPresets'){
   const lm=new Map(l.map(x=>[x.id,x])),rm=new Map(r.map(x=>[x.id,x])),bm=new Map((b||[]).map(x=>[x.id,x]));
   const ids=new Set([...lm.keys(),...rm.keys(),...bm.keys()]);const rows=[];
   for(const id of ids){const lv=lm.get(id),rv=rm.get(id),bv=bm.get(id);let value;
    if(!base){if(lv&&rv)value=choice(lv,rv,undefined,key);else value=lv||rv}
    else value=choice(lv,rv,bv,key);if(value!==undefined)rows.push(structuredClone(value));
   }merged[key]=rows;
  }else merged[key]=structuredClone(choice(l,r,b,key));
 }
 merged.meta.updatedAt=new Date().toISOString();merged.meta.schema=23;return normalizeCloudData(merged);
}

function save(label='Изменение сохранено'){
 let previousRaw=null;
 try{previousRaw=localStorage.getItem(plannerDataKey());markChangedDomains(previousRaw);persistLocal(true)}
 catch(err){if(previousRaw){try{db=normalizeCloudData(JSON.parse(previousRaw))}catch{}}const error=new Error('Не удалось сохранить изменение на устройстве. Освободи место или экспортируй данные; затем попробуй ещё раз.');error.name='PlannerSaveError';throw error}
 plannerRevision++;const changed=captureUndoSnapshot(previousRaw);
 cloudDirty=true;setSyncPending(true);maybeWriteAutomaticRecovery();scheduleCloudPush();updateCloudUI();if(changed)showUndoToast(label);
}
try{if(!plannerStorageBlocked)persistLocal(false)}catch(err){plannerStorageBlocked=true;plannerLoadError=err.message}

// --- Supabase sync: local-first, one JSONB state row per user. ---
const CLOUD_CONFIG_KEY='artemPlanner.supabase.v1';
const DEVICE_KEY='artemPlanner.deviceId.v1';
const SYNC_PENDING_KEY='planner.syncPending.v1';
function setSyncPending(value){try{localStorage.setItem(scopedPlannerKey(SYNC_PENDING_KEY),value?'1':'0')}catch{}}
function readSyncPending(){try{return localStorage.getItem(scopedPlannerKey(SYNC_PENDING_KEY))==='1'}catch{return false}}
let cloudClient=null,cloudUser=null,cloudRealtime=null,cloudAuthSubscription=null;
let cloudPullQueued=false,cloudRealtimeScope=null;
let cloudInitializePromise=null,cloudClientConfig='',cloudLibraryPromise=null;
let cloudMode='local',cloudDirty=readSyncPending(),cloudBusy=false,cloudPushTimer=null,cloudLastSync=null,cloudLastRemote=null;
function getDeviceId(){let id=localStorage.getItem(DEVICE_KEY);if(!id){id=uid();localStorage.setItem(DEVICE_KEY,id)}return id}
const DEVICE_ID=(()=>{try{return getDeviceId()}catch{return uid()}})();
const DEFAULT_SUPABASE_CONFIG={url:'https://znemcttpdzngstcdwgeg.supabase.co',key:'sb_publishable_-Z2DCXTcYOxQZE9UPjIWgA_SaDzxfj9'};
function loadCloudConfig(){
  try{
    const saved=JSON.parse(localStorage.getItem(CLOUD_CONFIG_KEY)||'{}');
    return {url:saved.url||DEFAULT_SUPABASE_CONFIG.url,key:saved.key||DEFAULT_SUPABASE_CONFIG.key,email:saved.email||''};
  }catch{return {...DEFAULT_SUPABASE_CONFIG,email:''}}
}
function storeCloudConfig(){
  const cfg={url:($('#supabaseUrl')?.value||'').trim().replace(/\/$/,''),key:($('#supabaseKey')?.value||'').trim(),email:($('#supabaseEmail')?.value||'').trim()};
  localStorage.setItem(CLOUD_CONFIG_KEY,JSON.stringify(cfg)); return cfg;
}
function cloudConfigValid(cfg=loadCloudConfig()){return /^https:\/\/.+/.test(cfg.url||'')&&String(cfg.key||'').length>20}
function dataHasContent(x){const listCount=(x?.projects?.length||0)+(x?.calendar?.length||0)+(x?.money?.length||0)+(x?.food?.length||0)+(x?.subscriptions?.length||0)+(x?.recurringIncome?.length||0)+(x?.calories?.length||0)+(x?.workouts?.length||0)+(x?.weights?.length||0)+(x?.timeEntries?.length||0)+(x?.weekTemplate?.length||0)+(x?.customCalendarPresets?.length||0)+(x?.goals?.length||0)+(x?.portfolioWorks?.length||0)+(x?.portfolioCollections?.length||0)+(x?.learningSkills?.length||0);const decisions=Object.keys(x?.foodWeekDecisions||{}).length,b=x?.budgets||{},customBudget=Number(b.day??1000)!==1000||Number(b.month??30000)!==30000,fs=x?.financeSettings||{},customOpening=Number(fs.openingBalance||0)!==0||!!fs.openingDate,customCategoryColors=JSON.stringify({...DEFAULT_CALENDAR_CATEGORY_COLORS,...(x?.categoryColors||{})})!==JSON.stringify(DEFAULT_CALENDAR_CATEGORY_COLORS),hiddenPresets=Array.isArray(x?.hiddenCalendarPresets)&&x.hiddenCalendarPresets.length>0;return !!(listCount+decisions)||customBudget||customOpening||customCategoryColors||hiddenPresets}
function normalizeCloudData(raw){
  if(raw!=null)validatePlannerState(raw);
  const source=(raw&&typeof raw==='object')?raw:{};
  const next={...structuredClone(defaults),...source};
  for(const k of ['money','food','subscriptions','recurringIncome','calories','workouts','weights','legacyTaskArchive','projects','portfolioWorks','portfolioCollections','learningSkills','calendar','timeEntries','weekTemplate','customCalendarPresets','goals']) if(!Array.isArray(next[k])) next[k]=[];
  const incomingTasks=Array.isArray(source.tasks)?source.tasks:[];
  if(incomingTasks.length){
    const seen=new Set(next.legacyTaskArchive.map(t=>t?.id).filter(Boolean));
    incomingTasks.forEach(t=>{if(t?.id&&!seen.has(t.id)){next.legacyTaskArchive.push(t);seen.add(t.id)}});
    const taskById=new Map(incomingTasks.map(t=>[t.id,t]));
    next.timeEntries=next.timeEntries.map(x=>{
      const t=taskById.get(x.taskId),p=t?.projectId?next.projects.find(v=>v.id===t.projectId):null;
      return {...x,taskTitle:x.taskTitle||t?.title||'',projectId:x.projectId||t?.projectId||'',projectName:x.projectName||p?.name||''};
    });
    next.calendar=next.calendar.map(e=>({...e,taskId:'',autoFromTask:false}));
    if(incomingTasks.some(t=>t.id===next.timer?.activeTaskId))next.timer={...structuredClone(defaults.timer)};
  }
  delete next.tasks;
  next.budgets={...defaults.budgets,...(next.budgets||{})}; next.financeSettings={...defaults.financeSettings,...(next.financeSettings||{})}; next.categoryColors={...DEFAULT_CALENDAR_CATEGORY_COLORS,...(next.categoryColors||{})}; next.hiddenCalendarPresets=Array.isArray(next.hiddenCalendarPresets)?next.hiddenCalendarPresets:[]; next.calendar=next.calendar.map(e=>({...e,category:normalizeCalendarCategory(e.category),status:['planned','done','moved','missed'].includes(e.status)?e.status:(e.done?'done':'planned'),done:(e.status?e.status==='done':!!e.done),movedFromId:e.movedFromId||'',movedToEventId:e.movedToEventId||''})); next.weekTemplate=next.weekTemplate.map(e=>({...e,category:normalizeCalendarCategory(e.category)})); next.customCalendarPresets=next.customCalendarPresets.map(e=>({...e,category:normalizeCalendarCategory(e.category)})); next.workouts=next.workouts.map(w=>({...w,calendarEventId:w.calendarEventId||'',start:w.start||'19:00'})); next.budgets.week=(Number(next.budgets.day)||1000)*7; next.foodWeekDecisions=(next.foodWeekDecisions&&typeof next.foodWeekDecisions==='object')?next.foodWeekDecisions:{}; next.timer={...defaults.timer,...(next.timer||{})}; next.trainingSettings={...defaults.trainingSettings,...(next.trainingSettings||{})}; next.weights=next.weights.map(x=>({...x,zone:['green','yellow','red'].includes(x.zone)?x.zone:'green'})); next.food=next.food.map(x=>({...x,excludeFromLimit:!!x.excludeFromLimit})); next.meta={...defaults.meta,...(next.meta||{}),schema:23}; next.meta.domainUpdatedAt=(next.meta.domainUpdatedAt&&typeof next.meta.domainUpdatedAt==='object')?next.meta.domainUpdatedAt:{}; const domainStamp=next.meta.updatedAt||new Date().toISOString(); for(const domain of ['planning','finance','health','focus']) next.meta.domainUpdatedAt[domain]??=domainStamp; next.meta.domainUpdatedAt.portfolio??=(source.portfolioWorks||source.portfolioCollections)?domainStamp:'1970-01-01T00:00:00.000Z'; next.meta.domainUpdatedAt.learning??=Array.isArray(source.learningSkills)?domainStamp:'1970-01-01T00:00:00.000Z'; next.timer={...defaults.timer,...(next.timer||{}),sessionAccumulatedMs:Number(next.timer?.sessionAccumulatedMs||0)}; next.timeEntries=next.timeEntries.map(x=>({...x,taskTitle:x.taskTitle||'',projectName:x.projectName||''})); next.money=next.money.map(x=>({...x,goalId:x.goalId||'',seriesId:x.seriesId||'',external:!!x.external})); return next;
}
function plannerSessionMatches(userId,epoch){return plannerEpoch===epoch&&plannerScope===userId&&cloudUser?.id===userId}
function readSyncBase(){try{const raw=localStorage.getItem(scopedPlannerKey('planner.syncBase.v1'));return raw?normalizeCloudData(JSON.parse(raw)):null}catch{return null}}
function rememberSyncBase(state,version){plannerSyncBase=structuredClone(state);plannerRemoteVersion=version;try{localStorage.setItem(scopedPlannerKey('planner.syncBase.v1'),JSON.stringify(state))}catch{}}
function closePlannerDialogsForSwitch(){
 if(activeProjectNoteId){suspendedPlannerNotes.set(plannerScope,{id:activeProjectNoteId,draft:activeProjectDraft?structuredClone(activeProjectDraft):null,title:$('#projectNoteTitle').value,note:$('#projectNoteBody').value});try{if(flushProjectNote())suspendedPlannerNotes.delete(plannerScope)}catch{}}
 clearTimeout(projectNoteSaveTimer);projectNoteDirty=false;activeProjectNoteId='';activeProjectDraft=null;
 if(typeof portfolioDraft!=='undefined'){portfolioDraft=null;portfolioOriginal=null;portfolioUploadToken++}
 $$('dialog').forEach(d=>{if(d.open)d.close()});
}
function switchPlannerAccount(user){
 const next=user?.id||'guest';if(next===plannerScope){cloudUser=user;return false}
 closePlannerDialogsForSwitch();clearTimeout(cloudPushTimer);stopCloudRealtime();
 cloudPullQueued=false;plannerEpoch++;plannerScope=next;cloudUser=user;cloudBusy=false;cloudLastRemote=null;cloudLastSync=null;plannerRevision=0;
 plannerStorageBlocked=false;plannerLoadError='';db=normalizeCloudData(load());cloudDirty=readSyncPending();plannerSyncBase=readSyncBase();plannerRemoteVersion=null;
 selectedProjectId='';learningSkillId='';portfolioCollectionId='';showCompletedSubtasks=false;
 try{if(!plannerStorageBlocked)persistLocal(false)}catch(err){plannerStorageBlocked=true;plannerLoadError=err.message}
 renderAfterRemote();updateCloudUI();
 const pending=suspendedPlannerNotes.get(next);if(pending){if(pending.draft){activeProjectDraft=pending.draft;activeProjectNoteId=pending.id;fillProjectNoteEditor(activeProjectDraft.event,true)}else openProjectNote(pending.id);if(activeProjectNoteId){$('#projectNoteTitle').value=pending.title;$('#projectNoteBody').value=pending.note;queueProjectNoteSave()}suspendedPlannerNotes.delete(next)}
 return true;
}
function setCloudConflict(row,message='Есть разные изменения одной записи. Обе версии сохранены. Скачай копии перед выбором.'){
 cloudLastRemote=row;cloudMode='conflict';cloudDirty=true;setSyncPending(true);
 try{localStorage.setItem(scopedPlannerKey('planner.conflict.v1'),JSON.stringify({at:new Date().toISOString(),local:db,remote:row}))}catch{}
 const text=$('#cloudConflict');if(text)text.textContent=message;updateCloudUI();
}
function dotClass(mode){return mode==='ready'?'ok':mode==='syncing'?'busy':mode==='conflict'?'warn':mode==='error'?'err':''}
function cloudStatusCopy(){
  if(cloudMode==='syncing')return 'Синхронизация…';
  if(cloudMode==='ready')return cloudDirty?'Есть несохранённые изменения':'Синхронизировано';
  if(cloudMode==='conflict')return 'Нужен выбор источника';
  if(cloudMode==='connecting')return 'Восстанавливаем подключение…';
  if(navigator.onLine===false)return 'Офлайн · данные сохранены на устройстве';
  if(cloudMode==='error')return 'Подключение недоступно · повторим автоматически';
  if(cloudUser)return 'Подключено';
  if(cloudConfigValid())return 'Нужно войти';
  return 'Только локально';
}
const PROFILE_KEY='planner.profile.v1';
let profileOverviewReady=false;
let profileLoadedKey='',profileDraftDirty=false,profileEmailDirty=false,profileDraftPhoto='',profileBusy=false;
function profileStorageKey(user=cloudUser){return PROFILE_KEY+'.'+(user?.id||'guest')}
const PROFILE_PLANS={free:'Free',premium:'Premium'};
const PREMIUM_OWNER_EMAIL='artkovalenko37@mail.ru';
function profileSubscriptionPlan(user=cloudUser){
  if(String(user?.email||'').trim().toLowerCase()===PREMIUM_OWNER_EMAIL)return 'premium';
  return user?.app_metadata?.subscription_plan==='premium'?'premium':'free';
}
function renderProfileSubscription(){
  const plan=profileSubscriptionPlan(),label=PROFILE_PLANS[plan];
  for(const id of ['sidebarAccountMeta','moreAccountPlan','accountSubscriptionPlan']){
    const el=$('#'+id);if(el){el.textContent=label;el.classList.toggle('is-premium',plan==='premium')}
  }
}
function safeProfilePhoto(value){return typeof value==='string'&&value.length<=65536&&/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(value)?value:''}
function readLocalProfile(user=cloudUser){try{return JSON.parse(localStorage.getItem(profileStorageKey(user))||'{}')||{}}catch{return {}}}
function currentProfile(){
  const local=readLocalProfile(),meta=cloudUser?.user_metadata||{};
  const name=String(meta.display_name??meta.full_name??meta.name??local.name??'').trim().slice(0,80);
  const photo=safeProfilePhoto(meta.avatar_data??local.photo??'');
  return {name,photo};
}
function profileDisplayName(profile=currentProfile()){return profile.name||(cloudUser?.email?cloudUser.email.split('@')[0]:'Гость')}
function profileInitials(name){return String(name||'Гость').trim().split(/\s+/).slice(0,2).map(x=>Array.from(x)[0]||'').join('').toLocaleUpperCase('ru')}
function showProfileAvatar(imageId,initialsId,photo,name){
  const image=$('#'+imageId),initials=$('#'+initialsId);if(!image||!initials)return;
  initials.textContent=profileInitials(name);initials.hidden=!!photo;image.hidden=!photo;
  image.onerror=()=>{image.hidden=true;initials.hidden=false};
  if(photo){if(image.getAttribute('src')!==photo)image.src=photo}else image.removeAttribute('src');
}
function profileMessage(text,error=false){const el=$('#profileMessage');if(el){el.textContent=text;el.classList.toggle('is-error',error)}const settings=$('#settingsAccountMessage');if(settings){settings.textContent=text;settings.classList.toggle('is-error',error)}}
function renderAccountProfile(){
  const profile=currentProfile(),name=profileDisplayName(profile),key=profileStorageKey(),changed=profileLoadedKey!==key,signed=!!cloudUser;
  $('#accountPageTitle').textContent='Профиль';$('#sidebarAccountName').textContent=name;$('#moreAccountName').textContent=name;renderProfileSubscription();
  showProfileAvatar('sidebarProfilePhoto','sidebarProfileInitials',profile.photo,name);
  showProfileAvatar('accountProfilePhoto','accountProfileInitials',profile.photo,name);
  $('#accountProfileName').textContent=name;$('#accountProfileStatus').textContent=signed?'Личный аккаунт':'Локальный профиль';
  if(profileOverviewReady){if(changed)profileWeekOffset=0;if($('#page-account')?.classList.contains('active'))renderProfileOverview()}
  if(changed){profileWeekOffset=0;profileLoadedKey=key;profileDraftDirty=false;profileEmailDirty=false;$('#supabasePassword').value='';profileMessage('')}
  if(!profileDraftDirty){$('#profileName').value=profile.name;profileDraftPhoto=profile.photo}
  showProfileAvatar('profilePhoto','profileInitials',profileDraftPhoto,$('#profileName').value||name);
  if(changed||(!profileEmailDirty&&signed))$('#supabaseEmail').value=cloudUser?.email||loadCloudConfig().email||'';
  $('#profileRemovePhoto').hidden=!profileDraftPhoto;
  $('#profileEmailUpdate').hidden=!signed;$('#profilePasswordUpdate').hidden=!signed;
  $('#profilePasswordLabel').textContent=signed?'Пароль · новое значение':'Пароль';
  $('#supabasePassword').placeholder=signed?'Введите новый пароль':'Введите пароль';
  $('#supabasePassword').autocomplete=signed?'new-password':'current-password';
}
function profileOverviewMetrics(now=Date.now()){
 const projects=db.projects.filter(p=>!p.archived);const ids=new Set(projects.flatMap(p=>taskAreaEvents(p.id)).map(e=>e.id));
 const tasks=db.calendar.filter(e=>ids.has(e.id)),done=tasks.filter(e=>calendarEventStatus(e)==='done').length;
 const skills=learningSkills(),learning=skills.reduce((sum,skill)=>{const p=learningProgress(skill);sum.total+=p.total;sum.done+=p.done;return sum},{total:0,done:0});
 const focus=analyticsFocusMs(()=>true,startOfWeek(new Date(now)).getTime(),now,now);
 return {tasks:{total:tasks.length,done,percent:tasks.length?Math.round(done/tasks.length*100):0},learning:{...learning,percent:learning.total?Math.round(learning.done/learning.total*100):0},focusMinutes:Math.round(focus/60000)};
}
let profileWeekOffset=0;
function profileResultMetrics(now=Date.now(),offset=profileWeekOffset){
 const start=startOfWeek(new Date(now));start.setDate(start.getDate()+offset*7);const end=new Date(start);end.setDate(end.getDate()+7);
 const completed=db.projects.filter(p=>['goal','project'].includes(taskAreaType(p))&&(()=>{const c=projectCompletion(p.id);return c.total>0&&c.done===c.total})());
 const skills=learningSkills(),verified=skills.reduce((n,s)=>n+learningProgress(s).done,0),works=portfolioWorks().filter(w=>w.status==='ready');
 const done=db.calendar.filter(e=>calendarEventStatus(e)==='done'&&Date.parse(e.completedAt||'')>=start.getTime()&&Date.parse(e.completedAt||'')<end.getTime()&&Date.parse(e.completedAt||'')<=now);
 const days=Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(d.getDate()+i);const next=new Date(d);next.setDate(next.getDate()+1);return {date:iso(d),active:done.some(e=>Date.parse(e.completedAt)>=d.getTime()&&Date.parse(e.completedAt)<next.getTime())||analyticsFocusMs(()=>true,d.getTime(),next.getTime(),now)>0}});
 const focus=skills.find(s=>learningProgress(s).percent<100)||null,project=db.projects.find(p=>!p.archived&&projectCompletion(p.id).percent<100)||null;
 const recent=[];
 for(const w of works){const date=w.updatedAt||w.createdAt;if(Number.isFinite(Date.parse(date)))recent.push({title:w.title||'Работа в портфолио',detail:'Обновлена готовая работа',date})}
 for(const skill of skills)for(const stage of learningStages(skill)){if(!learningStageVerified(skill,stage))continue;const attempt=learningAttempts(skill,stage.id).at(-1),date=attempt?.date||attempt?.updatedAt||attempt?.createdAt;if(Number.isFinite(Date.parse(date)))recent.push({title:stage.title||skill.title,detail:'Этап освоен',date})}
 recent.sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));
 return {completed:completed.length,verified,works:works.length,done:done.length,minutes:Math.round(analyticsFocusMs(()=>true,start.getTime(),end.getTime(),now)/60000),days,start,end,focus,project,recent:recent.slice(0,3)};
}
function renderProfileOverview(){
 const m=profileResultMetrics();$('#profileWeekTitle').textContent=profileWeekOffset===0?'Эта неделя':'Неделя';$('#profileCompletedProjects').textContent=m.completed;$('#profileVerifiedStages').textContent=m.verified;$('#profileReadyWorks').textContent=m.works;
 const skill=m.focus,project=m.project;$('#profileFocusName').textContent=skill?.title||project?.name||'Твой следующий шаг';$('#profileFocusDetail').textContent=skill?`Обучение · ${learningProgress(skill).percent}%`:project?`${TASK_AREA_TYPES[taskAreaType(project)].label} · ${projectCompletion(project.id).percent}%`:'Добавь навык или проект';
 $('#profileFocusLink').onclick=()=>{if(skill){learningSkillId=skill.id;showPage('learning')}else if(project)showPage('projects',{projectId:project.id});else showPage('learning')};
 const last=new Date(m.end);last.setDate(last.getDate()-1);const fmt=d=>d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'});$('#profileWeekRange').textContent=fmt(m.start)+' — '+fmt(last);$('#profileWeekSummary').textContent=`${m.done} выполнено · ${minutesText(m.minutes)}`;$('#profileWeekNext').disabled=profileWeekOffset>=0;
 $('#profileActivityDays').innerHTML=m.days.map((d,i)=>`<span class="${d.active?'active':''}" title="${escapeHTML(d.date)}: ${d.active?'есть активность':'нет записей'}"><i aria-hidden="true"></i>${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'][i]}</span>`).join('');
 $('#profileRecentList').innerHTML=m.recent.length?m.recent.map(r=>`<div class="profile-recent-row"><strong>${escapeHTML(r.title)}</strong><small>${escapeHTML(r.detail)} · ${escapeHTML(new Date(r.date).toLocaleDateString('ru-RU',{day:'numeric',month:'long'}))}</small></div>`).join(''):'<p class="profile-recent-empty">Здесь появятся освоенные этапы и готовые работы.</p>';
}
$('#profileWeekPrev').onclick=()=>{profileWeekOffset--;renderProfileOverview()};$('#profileWeekNext').onclick=()=>{profileWeekOffset=Math.min(0,profileWeekOffset+1);renderProfileOverview()};
function setProfileBusy(value){profileBusy=value;for(const id of ['profileSave','profileEmailUpdate','profilePasswordUpdate','profileChangePhoto','profileRemovePhoto'])$('#'+id).disabled=value}
async function saveAccountProfile(){
  if(profileBusy)return;
  const name=$('#profileName').value.trim();if(!name){profileMessage('Укажи имя.',true);$('#profileName').focus();return}
  const profile={name:name.slice(0,80),photo:safeProfilePhoto(profileDraftPhoto)},userId=cloudUser?.id||'';
  setProfileBusy(true);profileMessage('Сохранение…');
  try{
    if(userId){
      if(!cloudClient)throw new Error('Подключение недоступно. Попробуй ещё раз.');
      const {data,error}=await cloudClient.auth.updateUser({data:{...(cloudUser.user_metadata||{}),display_name:profile.name,avatar_data:profile.photo}});
      if(error)throw error;if(cloudUser?.id!==userId)throw new Error('Аккаунт изменился. Открой профиль заново.');
      if(!data?.user)throw new Error('Сервис не подтвердил сохранение профиля.');switchPlannerAccount(data.user);
    }
    let localSaved=true;try{localStorage.setItem(profileStorageKey(),JSON.stringify(profile))}catch{localSaved=false}
    if(!userId&&!localSaved)throw new Error('Не удалось сохранить профиль на устройстве.');
    profileDraftDirty=false;updateCloudUI();profileMessage(userId?'Профиль сохранён.':'Профиль сохранён на этом устройстве.');
  }catch(err){profileMessage(err.message||'Не удалось сохранить профиль.',true)}finally{setProfileBusy(false)}
}
async function resizeProfilePhoto(file){
  if(!file.type.startsWith('image/'))throw new Error('Выбери изображение.');
  if(file.size>10*1024*1024)throw new Error('Выбери фото размером до 10 МБ.');
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();img.src=url;await img.decode();
    const canvas=document.createElement('canvas');canvas.width=192;canvas.height=192;
    const context=canvas.getContext('2d');if(!context)throw new Error('Не удалось обработать фото.');
    const side=Math.min(img.naturalWidth,img.naturalHeight);if(!side)throw new Error('Изображение пустое.');
    context.fillStyle='#ffffff';context.fillRect(0,0,192,192);context.drawImage(img,(img.naturalWidth-side)/2,(img.naturalHeight-side)/2,side,side,0,0,192,192);
    let photo=canvas.toDataURL('image/jpeg',.78);if(photo.length>60000)photo=canvas.toDataURL('image/jpeg',.5);
    if(!safeProfilePhoto(photo))throw new Error('Не удалось подготовить фото. Попробуй JPEG или PNG.');return photo;
  }catch(err){throw new Error(err.message||'Не удалось открыть фото. Попробуй JPEG или PNG.')}finally{URL.revokeObjectURL(url)}
}
$('#profileName').addEventListener('input',()=>{profileDraftDirty=true;showProfileAvatar('profilePhoto','profileInitials',profileDraftPhoto,$('#profileName').value);profileMessage('Нажми «Сохранить профиль», чтобы применить изменения.')});
$('#supabaseEmail').addEventListener('input',()=>{profileEmailDirty=true});
$('#profileChangePhoto').onclick=()=>$('#profilePhotoFile').click();
$('#profilePhotoFile').addEventListener('change',async e=>{const file=e.target.files?.[0];if(file)await openAvatarCrop(file);e.target.value=''});
$('#profileSave').onclick=saveAccountProfile;
async function updateAccountCredential(kind){
  if(profileBusy||!cloudUser||!cloudClient)return;
  const userId=cloudUser.id,value=$('#'+(kind==='email'?'supabaseEmail':'supabasePassword')).value;
  if(kind==='email'&&!$('#supabaseEmail').checkValidity()){profileMessage('Укажи корректный email.',true);return}
  if(kind==='email'&&(!value.trim()||value.trim()===cloudUser.email)){profileMessage('Укажи новый email.',true);return}
  if(kind==='password'&&value.length<6){profileMessage('Новый пароль должен содержать минимум 6 символов.',true);return}
  setProfileBusy(true);profileMessage('Сохранение…');
  try{
    const {data,error}=await cloudClient.auth.updateUser({[kind]:kind==='email'?value.trim():value});if(error)throw error;
    if(cloudUser?.id!==userId)throw new Error('Аккаунт изменился. Открой профиль заново.');
    if(data?.user)switchPlannerAccount(data.user);
    if(kind==='password'){$('#supabasePassword').value='';profileMessage('Пароль изменён.')}
    else{profileEmailDirty=false;updateCloudUI();profileMessage(cloudUser.email===value.trim()?'Email изменён.':'Подтверди изменение email по письмам сервиса. До подтверждения действует прежний адрес.')}
  }catch(err){profileMessage(err.message||'Не удалось применить изменение.',true)}finally{setProfileBusy(false)}
}
$('#profileEmailUpdate').onclick=()=>updateAccountCredential('email');
$('#profilePasswordUpdate').onclick=()=>updateAccountCredential('password');

function updateCloudUI(message=''){
  const transfer=$('#transferGuestData');if(transfer)transfer.hidden=!cloudUser;
  renderAccountProfile();
  if(plannerStorageBlocked)message='Не удалось прочитать локальные данные. Восстанови резерв или импортируй файл в настройках.';
  const text=message||cloudStatusCopy(),cls=dotClass(cloudMode);
  for(const id of ['sidebarSyncDot','cloudSyncDot','accountIdentityDot']){const el=$('#'+id);if(el)el.className='sync-dot'+(cls?' '+cls:'')}
  const st=$('#cloudStatus');if(st)st.textContent=text; const side=$('#sidebarSyncText');if(side)side.textContent=text;

  const accountTitle=$('#accountIdentityTitle'),accountText=$('#accountIdentityText'),accountState=$('#accountIdentityState');
  if(accountTitle)accountTitle.textContent=cloudUser?profileDisplayName():'Вход и синхронизация';
  if(accountText)accountText.textContent=cloudUser?'Данные этого аккаунта синхронизируются между устройствами.':'Войди или создай аккаунт, чтобы синхронизировать Planner между устройствами.';
  if(accountState)accountState.textContent=text;
  const signed=!!cloudUser; const out=$('#supabaseSignOut'),inn=$('#supabaseSignIn'),up=$('#supabaseSignUp'),sync=$('#syncNow');
  if(out)out.style.display=signed?'inline-flex':'none'; if(inn)inn.style.display=signed?'none':'inline-flex'; if(up)up.style.display=signed?'none':'inline-flex'; if(sync)sync.disabled=!signed||cloudMode==='conflict'||cloudBusy;
  const conflict=cloudMode==='conflict'; $('#cloudConflict')?.classList.toggle('show',conflict); if($('#cloudConflictActions'))$('#cloudConflictActions').style.display=conflict?'flex':'none';
  const meta=$('#cloudMeta'); if(meta){const email=cloudUser?.email||loadCloudConfig().email||'';const stamp=cloudLastSync?new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(cloudLastSync):'—';meta.textContent=signed?`Аккаунт: ${email||cloudUser.id} · устройство ${DEVICE_ID.slice(0,8)} · последняя синхронизация ${stamp}`:(cloudConfigValid()?'Синхронизация готова. Войди в аккаунт, чтобы включить её.':'Техническое подключение не настроено.')}
}
function renderAfterRemote(){
  try{if(!plannerStorageBlocked)persistLocal(false)}catch(err){console.error('local storage',err)}
  try{renderToday();renderMoney();renderProjects();renderCalendar();renderWorkouts();renderArchive();renderPortfolio();renderLearning();renderFocusPage();drawTimer();fillProjectSelect();renderRecoveryStatus();renderCategorySettings();}catch(err){console.error('renderAfterRemote',err)}
  if($('#budgetDay'))$('#budgetDay').value=db.budgets.day;if($('#budgetWeek'))$('#budgetWeek').value=(Number(db.budgets.day)||1000)*7;if($('#budgetMonth'))$('#budgetMonth').value=db.budgets.month;
}
function applyCloudState(row){
 const incoming=normalizeCloudData(row?.data);writeRecoveryBackup('Перед загрузкой из облака',true);const previous=db;db=incoming;
 try{persistLocal(false)}catch(err){db=previous;throw err}plannerRevision++;rememberSyncBase(incoming,row?.version);cloudDirty=false;setSyncPending(false);cloudLastSync=new Date();cloudMode='ready';renderAfterRemote();updateCloudUI();
}
async function runCloudRequest(request,timeoutMs=15000){
 const controller=typeof AbortController!=='undefined'?new AbortController():null;
 if(controller&&typeof request.abortSignal==='function')request=request.abortSignal(controller.signal);
 let timer;try{return await Promise.race([Promise.resolve(request),new Promise((_,reject)=>{
  timer=setTimeout(()=>{controller?.abort();reject(new Error('Облачный запрос превысил время ожидания'))},timeoutMs);
 })])}finally{clearTimeout(timer)}
}
function drainCloudPull(){
 if(!cloudPullQueued||cloudBusy||cloudMode==='conflict'||!cloudUser)return;
 cloudPullQueued=false;const userId=cloudUser.id,epoch=plannerEpoch;
 setTimeout(()=>{if(plannerSessionMatches(userId,epoch))reconcileCloud()},0);
}
async function fetchCloudRow(userId=cloudUser?.id){
 if(!cloudClient||!userId)return null;const {data,error}=await runCloudRequest(cloudClient.from('planner_state').select('data,updated_at,device_id,version').eq('user_id',userId).maybeSingle());if(error)throw error;return data||null;
}
async function pushCloudState(force=false,replaceRemote=false){
 const userId=cloudUser?.id,epoch=plannerEpoch;if(!userId||plannerScope!==userId||plannerStorageBlocked||!cloudClient||cloudBusy||cloudMode==='conflict'&&!replaceRemote)return false;
 if(!force&&!cloudDirty)return true;cloudBusy=true;cloudMode='syncing';updateCloudUI();let success=false;
 try{
  const remote=await fetchCloudRow(userId);if(!plannerSessionMatches(userId,epoch))return false;
  let snapshot=structuredClone(db);
  if(remote&&!replaceRemote){try{snapshot=mergeCloudDomains(snapshot,remote.data,plannerSyncBase)}catch(err){setCloudConflict(remote);return false}}
  const revision=plannerRevision,version=Number(remote?.version||0)+1;
  const payload={user_id:userId,data:snapshot,updated_at:snapshot.meta.updatedAt||new Date().toISOString(),device_id:DEVICE_ID,version};
  let result;if(remote){let query=cloudClient.from('planner_state').update(payload).eq('user_id',userId);query=remote.version==null?query.is('version',null):query.eq('version',remote.version);result=await runCloudRequest(query.select('version').maybeSingle())}
  else result=await runCloudRequest(cloudClient.from('planner_state').insert(payload).select('version').maybeSingle());
  if(!plannerSessionMatches(userId,epoch))return false;
  if(result.error){if(result.error.code==='23505'){cloudDirty=true;cloudMode='ready';return false}throw result.error}
  if(!result.data){cloudDirty=true;cloudMode='ready';return false}
  rememberSyncBase(snapshot,version);cloudLastRemote={...payload};cloudLastSync=new Date();
  if(plannerRevision===revision){const previous=db,changed=cloudComparable(previous)!==cloudComparable(snapshot);db=normalizeCloudData(snapshot);try{persistLocal(false)}catch(err){db=previous;throw err}cloudDirty=false;setSyncPending(false);if(changed)renderAfterRemote()}
  else{cloudDirty=true;setSyncPending(true)}cloudMode='ready';success=true;return true;
 }catch(err){if(plannerSessionMatches(userId,epoch)){console.error(err);cloudDirty=true;setSyncPending(true);cloudMode=navigator.onLine?'error':'local';updateCloudUI(navigator.onLine?'Не удалось синхронизировать. Изменения остаются на устройстве.':'Офлайн · данные сохранены локально')}return false}
 finally{if(plannerSessionMatches(userId,epoch)){cloudBusy=false;updateCloudUI();if(cloudDirty&&cloudMode==='ready')scheduleCloudPush();drainCloudPull()}}
}
function scheduleCloudPush(){
  clearTimeout(cloudPushTimer); if(!cloudClient||!cloudUser||cloudMode==='conflict')return;
  cloudPushTimer=setTimeout(()=>pushCloudState(false),700);
}
function stableCloudValue(value){
  if(Array.isArray(value))return value.map(stableCloudValue);
  if(value&&typeof value==='object'){
    return Object.keys(value).sort().reduce((out,key)=>{
      out[key]=stableCloudValue(value[key]);
      return out;
    },{});
  }
  return value;
}
function cloudComparable(value){
  const x=normalizeCloudData(value);
  const copy=structuredClone(x);
  copy.meta={...(copy.meta||{}),updatedAt:null,domainUpdatedAt:{}};
  return JSON.stringify(stableCloudValue(copy));
}
async function reconcileCloud(){
 const userId=cloudUser?.id,epoch=plannerEpoch;if(!userId||plannerScope!==userId||plannerStorageBlocked||!cloudClient||cloudMode==='conflict')return;
 if(cloudBusy){cloudPullQueued=true;return}
 cloudBusy=true;cloudMode='syncing';updateCloudUI();let needsPush=false;
 try{const row=await fetchCloudRow(userId);if(!plannerSessionMatches(userId,epoch))return;cloudLastRemote=row;
  if(!row){needsPush=dataHasContent(db)||cloudDirty;cloudMode='ready';if(!needsPush){cloudLastSync=new Date();setSyncPending(false)}return}
  const remote=normalizeCloudData(row.data);let next;
  if(cloudComparable(db)===cloudComparable(remote))next=db;
  else if(!dataHasContent(db)&&!cloudDirty&&!plannerSyncBase)next=remote;
  else{try{next=mergeCloudDomains(db,remote,plannerSyncBase)}catch(err){setCloudConflict(row);return}}
  const previous=db,changed=cloudComparable(previous)!==cloudComparable(next);if(changed){db=normalizeCloudData(next);try{persistLocal(false)}catch(err){db=previous;throw err}}
  rememberSyncBase(remote,row.version);needsPush=cloudComparable(db)!==cloudComparable(remote);cloudDirty=needsPush;setSyncPending(needsPush);cloudMode='ready';cloudLastSync=new Date();if(changed)renderAfterRemote();
 }catch(err){if(plannerSessionMatches(userId,epoch)){console.error(err);cloudMode='error';updateCloudUI('Не удалось прочитать облачные данные. Локальная версия сохранена.')}}
 finally{if(plannerSessionMatches(userId,epoch)){cloudBusy=false;updateCloudUI();if(needsPush)scheduleCloudPush();drainCloudPull()}}
}
function stopCloudRealtime(){if(cloudRealtime&&cloudClient){cloudClient.removeChannel(cloudRealtime).catch(()=>{})}cloudRealtime=null;cloudRealtimeScope=null}
function startCloudRealtime(){
 const userId=cloudUser?.id,epoch=plannerEpoch;if(!cloudClient||!userId||plannerScope!==userId)return;
 const scope=userId+":"+epoch;if(cloudRealtime&&cloudRealtimeScope===scope)return;stopCloudRealtime();cloudRealtimeScope=scope;
 cloudRealtime=cloudClient.channel('planner-state-'+userId).on('postgres_changes',{event:'*',schema:'public',table:'planner_state',filter:`user_id=eq.${userId}`},payload=>{
  if(!plannerSessionMatches(userId,epoch)||payload.new?.device_id===DEVICE_ID)return;
  if(cloudMode!=='conflict')reconcileCloud();
 }).subscribe();
}
async function beginCloudSession(){if(!cloudUser)return;startCloudRealtime();await reconcileCloud()}
function ensureCloudLibrary(){
  if(window.supabase?.createClient)return Promise.resolve();
  if(cloudLibraryPromise)return cloudLibraryPromise;
  if(navigator.onLine===false)return Promise.reject(new Error('offline'));
  const pending=new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1';script.async=true;
    const timeout=setTimeout(()=>finish(new Error('library timeout')),12000);
    function finish(error){clearTimeout(timeout);script.onload=null;script.onerror=null;script.remove();if(error)reject(error);else resolve()}
    script.onload=()=>finish(window.supabase?.createClient?null:new Error('library unavailable'));
    script.onerror=()=>finish(new Error('library unavailable'));document.head.append(script);
  });
  cloudLibraryPromise=pending.finally(()=>{cloudLibraryPromise=null});return cloudLibraryPromise;
}
function initializeCloudClient(){
  if(cloudInitializePromise)return cloudInitializePromise;
  cloudInitializePromise=restoreCloudConnection().finally(()=>{cloudInitializePromise=null});
  return cloudInitializePromise;
}
async function restoreCloudConnection(){
  const cfg=loadCloudConfig();
  if($('#supabaseUrl'))$('#supabaseUrl').value=cfg.url||'';
  if($('#supabaseKey'))$('#supabaseKey').value=cfg.key||'';
  // Reconnecting must not overwrite a login form the user is filling in.
  if($('#supabaseEmail')&&!$('#supabaseEmail').value)$('#supabaseEmail').value=cfg.email||'';
  if(!cloudConfigValid(cfg)){cloudMode='local';updateCloudUI();return}
  if(navigator.onLine===false){cloudMode='local';updateCloudUI();return}
  cloudMode='connecting';updateCloudUI();
  try{
    await ensureCloudLibrary();
    const configId=cfg.url+'|'+cfg.key;
    if(!cloudClient||cloudClientConfig!==configId){
      cloudAuthSubscription?.unsubscribe?.();cloudAuthSubscription=null;stopCloudRealtime();
      if(cloudClient){cloudClient.auth.stopAutoRefresh?.();cloudClient.realtime?.disconnect?.()}
      cloudClient=window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
      cloudClientConfig=configId;
    }
    // Subscribe before reading the session: even a failed refresh must not
    // leave this page unable to receive subsequent sign-in/token events.
    if(!cloudAuthSubscription){
      const {data:listener}=cloudClient.auth.onAuthStateChange((_event,session)=>{
        switchPlannerAccount(session?.user||null);
        if(!cloudUser){stopCloudRealtime();cloudMode='local'}
        updateCloudUI();
        setTimeout(()=>{if(cloudUser&&!cloudInitializePromise)beginCloudSession()},0);
      });cloudAuthSubscription=listener?.subscription||null;
    }
    const {data,error}=await runCloudRequest(cloudClient.auth.getSession());if(error)throw error;
    switchPlannerAccount(data.session?.user||null);
    if(cloudUser)await beginCloudSession();else{stopCloudRealtime();cloudMode='local';updateCloudUI()}
  }catch(err){console.error('restoreCloudConnection',err);cloudMode='error';updateCloudUI()}
}
function resumeCloudConnection(){
  if(navigator.onLine===false){updateCloudUI();return Promise.resolve()}
  return initializeCloudClient();
}
$('#saveSupabaseConfig')?.addEventListener('click',async()=>{storeCloudConfig();switchPlannerAccount(null);cloudMode='local';updateCloudUI('Подключение сохранено');await initializeCloudClient()});
$('#supabaseSignUp')?.addEventListener('click',async()=>{storeCloudConfig();if(!cloudClient)await initializeCloudClient();const email=($('#supabaseEmail')?.value||'').trim(),password=$('#supabasePassword')?.value||'';if(!email||password.length<6){alert('Укажи email и пароль минимум из 6 символов.');return}if(!cloudClient){alert('Облачное подключение Planner сейчас недоступно.');return}const {data,error}=await cloudClient.auth.signUp({email,password,options:{data:{display_name:($('#profileName').value||'').trim().slice(0,80),avatar_data:safeProfilePhoto(profileDraftPhoto)}}});if(error){alert(error.message);return}if(!data.session)alert('Аккаунт создан. Если сервис запросит подтверждение почты, подтверди её и затем нажми «Войти».');else{switchPlannerAccount(data.user);$('#supabasePassword').value='';updateCloudUI();await beginCloudSession()}});
$('#supabaseSignIn')?.addEventListener('click',async()=>{storeCloudConfig();if(!cloudClient)await initializeCloudClient();const email=($('#supabaseEmail')?.value||'').trim(),password=$('#supabasePassword')?.value||'';if(!email||!password){alert('Укажи email и пароль.');return}if(!cloudClient){alert('Облачное подключение Planner сейчас недоступно.');return}const {data,error}=await cloudClient.auth.signInWithPassword({email,password});if(error){alert(error.message);return}$('#supabasePassword').value='';switchPlannerAccount(data.user);updateCloudUI();await beginCloudSession()});
$('#supabaseSignOut')?.addEventListener('click',async()=>{if(activeProjectNoteId&&!closeProjectNote())return;if(cloudClient){const {error}=await cloudClient.auth.signOut();if(error){alert('Не удалось выйти. Попробуй ещё раз.');return}}switchPlannerAccount(null);cloudMode='local';updateCloudUI()});
$('#syncNow')?.addEventListener('click',resumeCloudConnection);
$('#uploadLocalCloud')?.addEventListener('click',async()=>{if(!confirm('Заменить облачную версию данными этого устройства? Сначала можно скачать обе версии.'))return;cloudMode='ready';cloudDirty=true;setSyncPending(true);await pushCloudState(true,true)});
$('#downloadCloudLocal')?.addEventListener('click',async()=>{if(!confirm('Использовать облачную версию? Локальная версия сохранится в резерве.'))return;const userId=cloudUser?.id,epoch=plannerEpoch;try{const row=await fetchCloudRow(userId);if(row&&plannerSessionMatches(userId,epoch)){pushCurrentStateToUndo();applyCloudState(row)}}catch(err){alert('Не удалось загрузить данные из облака.')}});
function downloadPlannerJSON(value,name){const blob=new Blob([JSON.stringify(value,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#exportConflictCopies').onclick=()=>{downloadPlannerJSON({local:db,remote:cloudLastRemote?.data,at:new Date().toISOString()},'planner-conflict-copies.json')};
$('#transferGuestData').onclick=()=>{
 if(!cloudUser||plannerScope!==cloudUser.id)return;
 try{const raw=readPlannerSource('guest');if(!raw){alert('Нет локальных данных для переноса.');return}const guest=normalizeCloudData(JSON.parse(raw));if(!confirm('Добавить локальные данные в текущий аккаунт? Оригинал останется на устройстве.'))return;
 const before=structuredClone(db);try{db=mergeCloudDomains(db,guest,normalizeCloudData({}));save('Локальные данные перенесены');renderAfterRemote()}catch(err){db=before;throw err}
 }catch(err){alert('Не удалось перенести: '+err.message+'. Можно экспортировать локальную версию и импортировать её в аккаунт.')}
};
window.addEventListener('online',resumeCloudConnection);
window.addEventListener('offline',()=>updateCloudUI());
window.addEventListener('pageshow',event=>{if(event.persisted)resumeCloudConnection()});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')resumeCloudConnection()});
setInterval(()=>{if(document.visibilityState==='hidden'||!navigator.onLine||cloudMode==='conflict')return;
 if(cloudClient&&cloudUser&&cloudMode!=='error'){startCloudRealtime();reconcileCloud()}else resumeCloudConnection()
},30000);
updateCloudUI();
setTimeout(initializeCloudClient,0);

function showPage(name,options={}){
  if(name==='projects'){selectedProjectId=options.projectId||'';const search=$('#projectSearch');if(search)search.value=''}
  if(name==='food')name='money';
  if(name==='focus'||name==='tasks'||name==='analytics')name='today';
  $$('.page').forEach(p=>p.classList.toggle('active',p.id==='page-'+name));
  const secondaryMobilePages=new Set(['learning','portfolio','projects','archive','account','settings','more']);
  $$('[data-page]').forEach(b=>{
    const mobileMore=b.closest('#mobileNav')&&b.dataset.page==='more'&&secondaryMobilePages.has(name);
    b.classList.toggle('active',b.dataset.page===name||mobileMore);
  });
  if((window.innerWidth<=820||window.matchMedia?.('(pointer: coarse)').matches))window.scrollTo(0,0);
  if(name==='money')renderMoney();
  if(name==='today') renderToday();
  if(name==='calendar') renderCalendar();
  if(name==='projects') renderProjects();
  if(name==='workouts') renderWorkouts();
  if(name==='portfolio')renderPortfolio();
  if(name==='learning')renderLearning();
  if(name==='archive') renderArchive();
  if(name==='account')updateCloudUI();
  if(name==='settings'){renderBodyParameters();updateCloudUI();renderFinanceSettings();renderCategorySettings();}
}
$$('[data-page]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.page)));
$('#todayAddCalendarBlock')?.addEventListener('click',()=>openEventDialog({date:todayISO,start:'19:00',end:'20:00',category:'project'}));
$$('[data-open]').forEach(b=>b.addEventListener('click',()=>{
  const t=b.dataset.open;
  if(t==='money'){ openMoneyDialog(); }
  if(t==='food'){ const current=startOfWeek(new Date()); openFoodDialog(iso(foodWeekStart.getTime()===current.getTime()?new Date():foodWeekStart)); }
}));

function calendarEventStatus(event){
  return ['planned','done','moved','missed'].includes(event?.status)?event.status:(event?.done?'done':'planned');
}
function calendarEventStatusLabel(status){
  return {planned:'Запланировано',done:'Выполнено',moved:'Перенесено',missed:'Не сделано'}[status]||'Запланировано';
}
function syncWorkoutStatusFromCalendar(event){
  if(!event)return;
  const linked=db.workouts.filter(w=>w.calendarEventId===event.id);
  if(event.category!=='sport'){
    db.workouts=db.workouts.filter(w=>{
      if(w.calendarEventId!==event.id)return true;
      if(w.status==='planned')return false;
      w.calendarEventId='';
      return true;
    });
    return;
  }
  const status=calendarEventStatus(event);
  linked.forEach(w=>{
    w.date=event.date;
    w.title=event.title;
    w.note=event.note||w.note||'';
    w.start=event.start||w.start||'19:00';
    if(w.status==='planned')w.duration=Math.max(0,eventEndMins(event)-mins(event.start));
    if(status==='done'||status==='missed')w.status=status;
    else if(status==='planned'&&w.status!=='done'&&w.status!=='missed')w.status='planned';
  });
}
function setCalendarEventStatus(eventId,status,{saveNow=true,message=true}={}){
  const event=db.calendar.find(e=>e.id===eventId);if(!event)return false;
  if(!['planned','done','moved','missed'].includes(status))status='planned';
  const focusId=calendarFocusId(eventId);
  if(status!=='planned'&&db.timer.activeTaskId===focusId){
    if(db.timer.running)stopActiveTimer('calendar_status');
    db.timer.activeTaskId='';db.timer.sessionAccumulatedMs=0;db.timer.startedAt=null;db.timer.running=false;
  }
  event.completedAt=calendarCompletionStamp(event,status);
  event.status=status;
  event.done=status==='done';
  syncWorkoutStatusFromCalendar(event);
  if(saveNow)save(message?`«${event.title}» · ${calendarEventStatusLabel(status)}`:undefined);
  return true;
}
function setCalendarEventDone(eventId,done){
  return setCalendarEventStatus(eventId,done?'done':'planned');
}
function nextISODate(date,days=1){
  const d=new Date(date+'T12:00:00');d.setDate(d.getDate()+days);return iso(d);
}
function moveCalendarEventToNextDay(eventId){
  const event=db.calendar.find(e=>e.id===eventId);if(!event)return false;
  if(!event.date||!['planned','missed'].includes(calendarEventStatus(event))||event.movedToEventId)return false;
  if(db.timer.activeTaskId===calendarFocusId(event.id)){if(db.timer.running)stopActiveTimer('calendar_move');db.timer.activeTaskId='';db.timer.running=false;db.timer.startedAt=null;db.timer.sessionAccumulatedMs=0}
  const targetDate=nextISODate(event.date,1);
  const clone={
    ...event,id:uid(),date:targetDate,status:'planned',done:false,completedAt:'',
    movedFromId:event.id,movedToEventId:'',seriesId:'',autoFromTask:false
  };
  event.status='moved';event.done=false;event.movedToEventId=clone.id;
  db.calendar.push(clone);
  const linked=db.workouts.filter(w=>w.calendarEventId===event.id);
  linked.forEach(w=>{
    if(w.status==='planned'){
      w.calendarEventId=clone.id;w.date=clone.date;w.start=clone.start;w.title=clone.title;w.note=clone.note||w.note||'';
      w.duration=Math.max(0,eventEndMins(clone)-mins(clone.start));
    }else{
      w.calendarEventId='';
    }
  });
  save(`«${event.title}» перенесено на ${targetDate}`);
  return clone;
}
function detachWorkoutFromCalendarEvent(eventId){
  db.workouts=db.workouts.filter(w=>{
    if(w.calendarEventId!==eventId)return true;
    if(w.status==='planned')return false;
    w.calendarEventId='';
    return true;
  });
}
function renderToday(){
  $('#todayDate').textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  const events=todayAttentionEvents(),pending=events.filter(e=>calendarEventStatus(e)==='planned'),finished=events.filter(e=>calendarEventStatus(e)!=='planned');
  const doneCount=events.filter(e=>calendarEventStatus(e)==='done').length;
  const totalMinutes=events.filter(e=>!['moved','missed'].includes(calendarEventStatus(e))).reduce((sum,e)=>sum+Math.max(0,eventEndMins(e)-mins(e.start)),0);
  const progress=events.length?Math.round(doneCount/events.length*100):0;
  $('#todayTasksCount').textContent=events.length;$('#todayTasksCaption').textContent=`${pending.length} осталось`;
  $('#todayPlanned').textContent=minutesText(totalMinutes);$('#todayTracked').textContent=msHoursText(entryMsOnDate(todayISO));
  $('#todayProgressPercent').textContent=`${progress}%`;$('#todayProgressBar').style.width=`${progress}%`;$('#todayProgressCaption').textContent=`${doneCount} из ${events.length} выполнено`;
  if($('#todayRemainingCount'))$('#todayRemainingCount').textContent=pending.length?`${pending.length} осталось`:'На сегодня всё разобрано';
  const box=$('#quickTasks');
  const noteOpen=new Set($$('[data-today-note]',box).filter(d=>d.open).map(d=>d.dataset.todayNote));
  const finishedOpen=box.querySelector?.('.today-finished')?.open||false;
  function row(e){
    const status=calendarEventStatus(e),project=db.projects.find(p=>p.id===e.projectId),m=eventPlanActual(e),running=m.running;
    return `<div class="today-task-row today-calendar-task status-${status} ${status==='done'?'is-done':''}">
      <input type="checkbox" aria-label="Выполнено: ${escapeHTML(e.title)}" data-calendar-done="${escapeHTML(e.id)}" ${status==='done'?'checked':''} ${status==='moved'||status==='missed'?'disabled':''}>
      <div class="today-task-main">
        <button type="button" class="today-task-title" data-today-event-edit="${escapeHTML(e.id)}">${escapeHTML(e.title)}</button>
        <div class="today-task-meta"><span class="today-meta-time">${e.start}–${e.end}</span><span class="today-meta-separator">·</span><span>${escapeHTML(project?.name||categoryLabels[e.category]||'Другое')}</span>${m.actual?`<span class="today-meta-separator">·</span><span title="${escapeHTML(eventPlanActualLabel(m))}">факт ${minutesText(Math.round(m.actual/60000))}</span>`:''}${status!=='planned'?`<span class="today-meta-separator">·</span><span>${calendarEventStatusLabel(status)}</span>`:''}</div>
        ${e.note?`<details class="today-note-details" data-today-note="${escapeHTML(e.id)}" ${noteOpen.has(e.id)?'open':''}><summary>Заметка <span class="today-note-preview">${escapeHTML(projectNotePreview(e.note).slice(0,90))}</span></summary><div class="today-note-body">${escapeHTML(e.note)}</div><button type="button" class="tiny-btn today-note-open" data-today-event-edit="${escapeHTML(e.id)}">Открыть и редактировать ↗</button></details>`:''}
      </div>
      <div class="today-task-actions">
        ${status==='planned'?`<button type="button" class="play ${running?'is-running':''}" data-calendar-focus="${escapeHTML(e.id)}" aria-label="${running?'Открыть таймер':'Начать фокус'}: ${escapeHTML(e.title)}" title="${running?'Открыть таймер':'Начать фокус'}">${running?'◷':'▶'}</button>`:''}
        <details class="today-more"><summary aria-label="Действия: ${escapeHTML(e.title)}">⋯</summary><div class="today-menu"><button type="button" data-today-event-edit="${escapeHTML(e.id)}">Открыть задачу</button>${['planned','missed'].includes(status)?`<button type="button" data-calendar-move="${escapeHTML(e.id)}">Перенести на завтра</button><button type="button" data-calendar-status="${escapeHTML(e.id)}" data-status="missed">Не сделано</button>`:`<button type="button" data-calendar-status="${escapeHTML(e.id)}" data-status="planned">Вернуть в план</button>`}</div></details>
      </div>
    </div>`;
  }
  box.innerHTML=(pending.length?'<div class="today-task-list">'+pending.map(row).join('')+'</div>':`<div class="today-calm-empty">${events.length?'Оставшихся задач на сегодня нет.':'На сегодня задач пока нет. Добавь блок работы, проекта или обучения в календарь.'}</div>`)+
    (finished.length?`<details class="today-finished" ${finishedOpen?'open':''}><summary>Разобрано · ${finished.length} <span class="small">(${doneCount} выполнено${finished.length-doneCount?', остальные перенесены или не сделаны':''})</span></summary><div class="today-task-list">${finished.map(row).join('')}</div></details>`:'');
  $$('[data-calendar-done]',box).forEach(c=>c.onchange=()=>{if(setCalendarEventDone(c.dataset.calendarDone,c.checked)){renderToday();renderCalendar();renderProjects();renderFocusPage();renderWorkouts()}});
  $$('[data-calendar-status]',box).forEach(b=>b.onclick=()=>{if(setCalendarEventStatus(b.dataset.calendarStatus,b.dataset.status)){renderToday();renderCalendar();renderProjects();renderFocusPage();renderWorkouts()}});
  $$('[data-calendar-move]',box).forEach(b=>b.onclick=()=>{if(moveCalendarEventToNextDay(b.dataset.calendarMove)){renderToday();renderCalendar();renderProjects();renderFocusPage();renderWorkouts()}});
  $$('[data-calendar-focus]',box).forEach(b=>b.onclick=()=>{if(!b.disabled){const id=calendarFocusId(b.dataset.calendarFocus);if(db.timer.running&&db.timer.activeTaskId===id){const panel=$('#todayFocusDetails');if(panel)panel.open=true;panel?.scrollIntoView?.({block:'nearest',behavior:'smooth'})}else startTaskTimer(id)}});
  $$('[data-today-event-edit]',box).forEach(b=>b.onclick=()=>openEventDialog({id:b.dataset.todayEventEdit}));
  const panel=$('#todayFocusDetails');if(panel&&db.timer.running)panel.open=true;
  if($('#todayTimerCompact'))$('#todayTimerCompact').textContent=db.timer.running?'Таймер идёт':db.timer.activeTaskId?'На паузе':'Остановлен';
  renderTodaySchedule();renderFocusPage();
}function projectOptions(selected='',includeArchived=false){
  return '<option value="">Без задачи</option>'+db.projects.filter(p=>includeArchived||!p.archived||p.id===selected).map(p=>`<option value="${escapeHTML(p.id)}" ${p.id===selected?'selected':''}>${escapeHTML(p.name)}${p.archived?' · архив':''}</option>`).join('');
}
function fillProjectSelect(selected=''){
  const money=$('#moneyProjectSelect'); if(money) money.innerHTML=projectOptions(money.value||'');
  const event=$('#eventProjectSelect'); if(event) event.innerHTML=projectOptions(event.value||'');
}function trackedTaskMs(taskId){return db.timeEntries.filter(x=>x.taskId===taskId).reduce((a,b)=>a+Number(b.ms||0),0)+(db.timer.running&&db.timer.activeTaskId===taskId&&db.timer.startedAt?Date.now()-db.timer.startedAt:0)}
function trackedProjectMs(projectId){
  let ms=db.timeEntries.filter(x=>x.projectId===projectId).reduce((a,x)=>a+Number(x.ms||0),0);
  if(db.timer.running&&db.timer.startedAt&&focusProjectForTask(db.timer.activeTaskId)?.id===projectId)ms+=Date.now()-db.timer.startedAt;
  return ms;
}
function minutesText(min){const h=Math.floor(min/60),m=Math.round(min%60);return h?`${h} ч${m?' '+m+' м':''}`:`${m} мин`}
function msHoursText(ms){const h=ms/3600000;return `${h.toLocaleString('ru-RU',{maximumFractionDigits:1})} ч`}
function kcalText(n){return `${new Intl.NumberFormat('ru-RU',{maximumFractionDigits:0}).format(Number(n)||0)} ккал`}
function kgText(n){return `${Number(n||0).toLocaleString('ru-RU',{minimumFractionDigits:1,maximumFractionDigits:1})} кг`}
function workoutTypeLabel(type){return type==='gym'?'Спортзал':type==='outdoor'?'Улица':'Дом'}
function workoutStatusLabel(status){return status==='done'?'Выполнена':status==='missed'?'Пропущена':status==='moved'?'Перенесена':'Запланирована'}
function workoutFromCalendarEvent(e){
  const status=calendarEventStatus(e);
  return {
    id:`cal:${e.id}`,calendarEventId:e.id,_calendarDerived:true,date:e.date,title:e.title,
    type:e.workoutType||'home',status,duration:Math.max(0,eventEndMins(e)-mins(e.start)),
    caloriesBurned:0,note:e.note||'',start:e.start||'19:00'
  };
}
function workoutsForDate(date){
  const stored=db.workouts.filter(x=>x.date===date);
  const linked=new Set(stored.map(x=>x.calendarEventId).filter(Boolean));
  const calendar=db.calendar.filter(e=>e.date===date&&e.category==='sport'&&!linked.has(e.id)).map(workoutFromCalendarEvent);
  return [...stored,...calendar].sort((a,b)=>String(a.status).localeCompare(String(b.status))||String(a.title||'').localeCompare(String(b.title||'')));
}
function allWorkoutsInRange(startDate,endDateInclusive){
  const dates=[];
  for(let d=new Date(startDate+'T12:00:00'),end=new Date(endDateInclusive+'T12:00:00');d<=end;d.setDate(d.getDate()+1))dates.push(iso(d));
  return dates.flatMap(workoutsForDate);
}
function workoutByUIId(id){
  if(String(id).startsWith('cal:')){
    const event=db.calendar.find(e=>e.id===String(id).slice(4));
    return event?workoutFromCalendarEvent(event):null;
  }
  return db.workouts.find(x=>x.id===id)||null;
}
function ensureStoredWorkout(id){
  const existing=workoutByUIId(id);if(!existing)return null;
  if(!existing._calendarDerived)return existing;
  const item={...existing,id:uid(),_calendarDerived:false};
  delete item._calendarDerived;
  db.workouts.push(item);
  return item;
}
function syncWorkoutToCalendar(item){
  if(!item)return null;
  let event=item.calendarEventId?db.calendar.find(e=>e.id===item.calendarEventId):null;
  const duration=Math.max(30,Number(item.duration||60)),start=item.start||'19:00',end=hhmm(mins(start)+duration);
  const status=['done','missed'].includes(item.status)?item.status:'planned';
  if(!event){
    event={id:uid(),title:item.title,date:item.date,category:'sport',projectId:'',taskId:'',start,end,note:item.note||'',status,done:status==='done',workoutType:item.type||'home',autoFromTask:false};
    db.calendar.push(event);item.calendarEventId=event.id;
  }else{
    event.title=item.title;event.date=item.date;event.category='sport';event.start=start;event.end=end;event.note=item.note||'';event.workoutType=item.type||'home';
    event.status=status;event.done=status==='done';
  }
  return event;
}
function setWorkoutStatus(id,status){
  const item=ensureStoredWorkout(id);if(!item)return false;
  item.status=status;
  const event=syncWorkoutToCalendar(item);
  if(event){event.status=status==='done'?'done':status==='missed'?'missed':'planned';event.done=event.status==='done'}
  save(`«${item.title}» · ${workoutStatusLabel(status)}`);
  return true;
}
function caloriesForDate(date){return db.calories.filter(x=>x.date===date).sort((a,b)=>String(a.title||'').localeCompare(String(b.title||'')))}
function caloriesTotal(date){return caloriesForDate(date).reduce((a,b)=>a+Number(b.calories||0),0)}
function latestWeightEntry(){return [...db.weights].sort((a,b)=>String(b.date).localeCompare(String(a.date))||b.id.localeCompare(a.id))[0]||null}
function weightOnDate(date){return [...db.weights].filter(x=>x.date===date).sort((a,b)=>b.id.localeCompare(a.id))[0]||null}
function weekRangeText(startDate){const end=new Date(startDate);end.setDate(end.getDate()+6);const f=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'});return `${f.format(startDate)} — ${f.format(end)}`}
function sameViewedWorkoutWeek(date){const start=iso(workoutWeekStart);const end=new Date(workoutWeekStart);end.setDate(end.getDate()+6);return date>=start && date<=iso(end)}
let moneyPeriod='month';
let moneyCursor=new Date();

function renderCategorySettings(){
  const box=$('#calendarCategoryColors');if(!box)return;
  box.innerHTML=CALENDAR_CATEGORY_DEFS.map(x=>`
    <label class="category-color-row">
      <span class="category-color-name"><i style="background:${calendarCategoryColor(x.key)}"></i>${escapeHTML(x.label)}</span>
      <input type="color" data-category-color="${x.key}" value="${calendarCategoryColor(x.key)}" aria-label="Цвет категории ${escapeHTML(x.label)}">
    </label>`).join('');
  $$('[data-category-color]',box).forEach(input=>input.addEventListener('input',()=>{
    const dot=input.closest('.category-color-row')?.querySelector('.category-color-name i');
    if(dot)dot.style.background=input.value;
  }));
}
$('#saveCategoryColors')?.addEventListener('click',()=>{
  const next={...DEFAULT_CALENDAR_CATEGORY_COLORS};
  $$('[data-category-color]').forEach(input=>next[input.dataset.categoryColor]=input.value);
  db.categoryColors=next;
  save('Цвета категорий сохранены');
  renderCategorySettings();renderCalendar();renderToday();
});
$('#resetCategoryColors')?.addEventListener('click',()=>{
  db.categoryColors={...DEFAULT_CALENDAR_CATEGORY_COLORS};
  save('Цвета категорий сброшены');
  renderCategorySettings();renderCalendar();renderToday();
});

function renderFinanceSettings(){
  const fs=db.financeSettings||defaults.financeSettings;
  if($('#financeOpeningDate'))$('#financeOpeningDate').value=fs.openingDate||'';
  if($('#financeOpeningBalance'))$('#financeOpeningBalance').value=Number(fs.openingBalance||0)||'';
}
$('#saveFinanceSettings')?.addEventListener('click',()=>{
  const openingDate=$('#financeOpeningDate')?.value||'';
  const raw=String($('#financeOpeningBalance')?.value??'').trim();
  const openingBalance=raw===''?0:Number(raw);
  if(!Number.isFinite(openingBalance)){alert('Проверь начальный баланс.');return}
  if(!openingDate&&openingBalance!==0){alert('Укажи дату начала учёта.');return}
  db.financeSettings={openingDate,openingBalance};
  save('Начальный баланс сохранён');
  renderMoney();renderFinanceSettings();
});

function moneyBounds(period=moneyPeriod,cursor=moneyCursor){
  const now=new Date(cursor); now.setHours(0,0,0,0); let start,end,label;
  if(period==='day'){
    start=new Date(now); end=new Date(now); end.setDate(end.getDate()+1);
    label=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long'}).format(start);
  }else if(period==='week'){
    start=startOfWeek(now); end=new Date(start); end.setDate(end.getDate()+7);
    const f=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}); label=`${f.format(start)} — ${f.format(new Date(end.getTime()-86400000))}`;
  }else if(period==='year'){
    start=new Date(now.getFullYear(),0,1); end=new Date(now.getFullYear()+1,0,1); label=String(now.getFullYear());
  }else{
    start=new Date(now.getFullYear(),now.getMonth(),1); end=new Date(now.getFullYear(),now.getMonth()+1,1);
    label=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(start);
  }
  return {start:iso(start),end:iso(end),label,startDate:start,endDate:end};
}
function previousMoneyBounds(){const b=moneyBounds(),d=new Date(b.startDate);if(moneyPeriod==='day')d.setDate(d.getDate()-1);else if(moneyPeriod==='week')d.setDate(d.getDate()-7);else if(moneyPeriod==='month')d.setMonth(d.getMonth()-1);else d.setFullYear(d.getFullYear()-1);return moneyBounds(moneyPeriod,d)}
function shiftMoneyCursor(dir){
  if(moneyPeriod==='day')moneyCursor.setDate(moneyCursor.getDate()+dir);
  else if(moneyPeriod==='week')moneyCursor.setDate(moneyCursor.getDate()+7*dir);
  else if(moneyPeriod==='month')moneyCursor=new Date(moneyCursor.getFullYear(),moneyCursor.getMonth()+dir,1);
  else moneyCursor=new Date(moneyCursor.getFullYear()+dir,0,1);
  renderMoney();
}
function deltaText(current,prev,inverse=false){if(prev===0)return current===0?'<span class="delta-flat">0%</span>':'<span class="delta-up">новое</span>';const p=(current-prev)/Math.abs(prev)*100,good=((p>0)!==inverse),cls=Math.abs(p)<.5?'delta-flat':good?'delta-up':'delta-down';return `<span class="${cls}">${p>0?'+':''}${Math.round(p)}%</span>`}
function inDateBounds(date,b){return date>=b.start&&date<b.end}
function moneyNet(rows){
  return rows.reduce((sum,x)=>{
    const amount=Number(x.amount||0);
    if(x.type==='income') return sum+amount;
    if(x.type==='saving_return') return x.external?sum:sum+amount;
    if(x.type==='expense') return sum-amount;
    if(x.type==='saving') return x.external?sum:sum-amount;
    return sum;
  },0);
}
function moneyBalanceBase(dateExclusive,{includeOpeningAtBoundary=true}={}){
  const fs=db.financeSettings||{},openingDate=fs.openingDate||'',opening=Number(fs.openingBalance||0);
  if(!openingDate)return moneyNet(db.money.filter(x=>x.date<dateExclusive));
  if(dateExclusive<openingDate)return 0;
  if(dateExclusive===openingDate)return includeOpeningAtBoundary?opening:0;
  return opening+moneyNet(db.money.filter(x=>x.date>=openingDate&&x.date<dateExclusive));
}
function moneyBalanceBefore(date){return moneyBalanceBase(date,{includeOpeningAtBoundary:true})}
function moneyBalanceThrough(dateExclusive){return moneyBalanceBase(dateExclusive,{includeOpeningAtBoundary:false})}

function goalOptions(selected=''){
  return '<option value="">Не распределять</option>'+db.goals.map(g=>`<option value="${escapeHTML(g.id)}" ${g.id===selected?'selected':''}>${escapeHTML(g.title)}</option>`).join('');
}
function updateMoneyGoalVisibility(){
  const form=$('#moneyForm');if(!form)return;
  const saving=form.elements.type.value==='saving';
  $('#moneyGoalField').style.display=saving?'flex':'none';
  $('#moneyExternalField').style.display=saving?'flex':'none';
  $('#moneyCategoryField').style.display=saving?'none':'flex';
  form.elements.category.required=!saving;
  if(saving)form.elements.category.value='';
  if(!saving){form.elements.goalId.value='';form.elements.external.checked=false}
}
function openMoneyDialog(id=''){
  const form=$('#moneyForm'),item=id?db.money.find(x=>x.id===id):null;
  form.reset();fillProjectSelect();$('#moneyProjectSelect').innerHTML=projectOptions(item?.projectId||'');form.elements.id.value=item?.id||'';
  form.elements.date.value=item?.date||iso(moneyCursor);form.elements.type.value=item?.type||'expense';
  form.elements.category.value=item?.category||'';form.elements.amount.value=item?.amount??'';
  form.elements.projectId.value=item?.projectId||'';form.elements.note.value=item?.note||'';form.elements.external.checked=!!item?.external;form.elements.repeat.value='none';form.elements.repeatUntil.value='';form.elements.applySeries.checked=false;$('#moneyRepeatField').style.display=item?'none':'flex';$('#moneyRepeatUntilField').style.display=item?'none':'flex';$('#moneySeriesField').style.display=item?.seriesId?'flex':'none';
  $('#moneyGoalSelect').innerHTML=goalOptions(item?.goalId||'');form.elements.goalId.value=item?.goalId||'';
  $('#moneyDialogTitle').textContent=item?'Редактировать операцию':'Новая операция';
  $('#deleteMoney').style.display=item?'inline-flex':'none';$('#deleteMoneySeries').style.display=item?.seriesId?'inline-flex':'none';
  const linked=item?.source==='food'||item?.source==='food_week_saving';
  $('#moneySourceHint').style.display=linked?'block':'none';
  $('#moneySourceHint').textContent=item?.source==='food'?'Эта операция создана из раздела «Траты». Редактируй исходную запись — связанный расход обновится автоматически.':item?.source==='food_week_saving'?'Эта операция создана из решения по недельной экономии в разделе «Траты». Изменение суммы здесь обновит сохранённое решение.':'';
  updateMoneyGoalVisibility();$('#moneyDialog').showModal();setTimeout(()=>{const saving=form.elements.type.value==='saving';(saving?form.elements.amount:form.elements.category).focus()},0);
}
function deleteMoneyEntry(id){
  const item=db.money.find(x=>x.id===id);if(!item)return;const message=item.source==='food'?'Удалить расход и связанную запись еды?':item.source==='food_week_saving'?'Удалить отложенную сумму и сбросить решение по этой неделе?':'Удалить операцию?';if(!confirm(message))return;
  db.money=db.money.filter(x=>x.id!==id);
  if(item.source==='food')db.food=db.food.filter(x=>x.moneyId!==id);
  if(item.source==='food_week_saving'){
    for(const [key,d] of Object.entries(db.foodWeekDecisions||{}))if(d.moneyId===id)delete db.foodWeekDecisions[key];
  }
  save();renderMoney();renderToday();renderProjects();
}
function goalSavingBreakdown(goalId=''){
  const rows=db.money.filter(x=>x.goalId===goalId&&(x.type==='saving'||x.type==='saving_return'));
  const ownAdded=rows.filter(x=>x.type==='saving'&&!x.external).reduce((a,b)=>a+Number(b.amount||0),0);
  const externalAdded=rows.filter(x=>x.type==='saving'&&x.external).reduce((a,b)=>a+Number(b.amount||0),0);
  const ownReturned=rows.filter(x=>x.type==='saving_return'&&!x.external).reduce((a,b)=>a+Number(b.amount||0),0);
  const externalReturned=rows.filter(x=>x.type==='saving_return'&&x.external).reduce((a,b)=>a+Number(b.amount||0),0);
  const own=Math.max(0,ownAdded-ownReturned),external=Math.max(0,externalAdded-externalReturned);
  return {own,external,total:own+external,ownAdded,externalAdded,ownReturned,externalReturned};
}
function goalSaved(id){return goalSavingBreakdown(id).total}
function goalContributorRows(goalId=''){
  const split=goalSavingBreakdown(goalId);
  const rows=db.money.filter(x=>x.goalId===goalId&&(x.type==='saving'||x.type==='saving_return'));
  const externalMap=new Map();
  rows.forEach(x=>{
    if(!x.external)return;
    const label=(x.note||'').trim()||'Партнёр';
    const delta=(x.type==='saving'?1:-1)*Number(x.amount||0);
    externalMap.set(label,(externalMap.get(label)||0)+delta);
  });
  const result=[{key:'own',label:'Мои',amount:Math.max(0,split.own),icon:'◔',kind:'own'}];
  [...externalMap.entries()].sort((a,b)=>b[1]-a[1]).forEach(([label,amount],idx)=>{
    result.push({key:'external-'+idx,label,amount:Math.max(0,amount),icon:'◉',kind:'external'});
  });
  return result;
}
function goalContributorsHTML(goalId=''){
  const rows=goalContributorRows(goalId).filter(x=>x.amount>0||x.kind==='own');
  if(!rows.length)return '<span class="goal-contrib-empty">Пока без пополнений</span>';
  return rows.map(x=>`<span class="goal-contrib-chip ${x.kind}"><span class="icon">${x.icon}</span><span class="label">${escapeHTML(x.label)}</span><strong>${fmt(Math.max(0,x.amount))}</strong></span>`).join('');
}
function goalSourcesHTML(goalId=''){
  return `<div class="goal-contributors goal-dialog-sources">${goalContributorsHTML(goalId)}</div>`;
}
function goalPercentBadge(pct,color){
  const tint=hexToRgba(color||'#4f6cff',0.18);
  return `<span class="goal-percent-chip" style="background:${tint};color:${color||'#89a0ff'}">${pct}%</span>`;
}
function renderMoneyGoals(){
  const box=$('#moneyGoals');if(!box)return;
  box.innerHTML=db.goals.length?db.goals.map(g=>{
    const color=/^#[0-9a-f]{6}$/i.test(g.color||'')?g.color:'#3b82f6';
    const split=goalSavingBreakdown(g.id),saved=split.total,target=Math.max(1,Number(g.target||0)),pct=Math.min(100,Math.round(saved/target*100));
    return `<div class="goal-card">
      <div class="goal-card-head">
        <button class="goal-title-btn" data-goal-edit="${escapeHTML(g.id)}" title="Редактировать цель">
          <span class="goal-dot-large" style="background:${color};color:${color}"></span>
          <span class="goal-title-text"><span class="goal-title-main">${escapeHTML(g.title)}</span></span>
        </button>
        <div class="goal-card-side">
          <div class="goal-card-total">${fmt(saved)} <span>/ ${fmt(target)}</span></div>
          ${goalPercentBadge(pct,color)}
          <button class="goal-edit-btn" data-goal-edit="${escapeHTML(g.id)}" aria-label="Редактировать цель" title="Редактировать цель">⋮</button>
        </div>
      </div>
      <div class="goal-track"><span style="width:${pct}%;background:${color}"></span></div>
      <div class="goal-card-bottom">
        <div class="goal-contributors">${goalContributorsHTML(g.id)}</div>
        <div class="goal-actions">
          <button class="tiny-btn goal-add-btn" data-goal-add="${escapeHTML(g.id)}" title="Добавить деньги в накопление">＋ Пополнить</button>
          <button class="tiny-btn goal-return-btn" data-goal-return="${escapeHTML(g.id)}" ${saved<=0?'disabled':''}>↩ Вернуть</button>
        </div>
      </div>
    </div>`;
  }).join(''):'<div class="goal-empty">Целей пока нет. Создай первую цель и пополняй её прямо отсюда — свои деньги или вклад другого человека.</div>';
  $$('[data-goal-edit]',box).forEach(b=>b.onclick=()=>openGoalDialog(b.dataset.goalEdit));
  $$('[data-goal-add]',box).forEach(b=>b.onclick=()=>openGoalSavingDialog(b.dataset.goalAdd));
  $$('[data-goal-return]',box).forEach(b=>b.onclick=()=>openSavingsReturnDialog(b.dataset.goalReturn));

  const free=goalSavingBreakdown('');
  $('#unallocatedSavings').innerHTML=free.total>0?`<div class="goal-free-card">
    <div>
      <div class="goal-free-card-main">
        <div class="goal-free-icon">◌</div>
        <div class="goal-free-copy">
          <strong>Свободные накопления</strong>
          <span>Деньги, которые пока не распределены по целям.</span>
        </div>
      </div>
      <div class="goal-free-contrib">${goalContributorsHTML('')}</div>
    </div>
    <div class="goal-free-total">${fmt(free.total)}</div>
    <button class="tiny-btn goal-return-btn" id="returnFreeSavings">↩ Вернуть</button>
  </div>`:'';
  $('#returnFreeSavings')?.addEventListener('click',()=>openSavingsReturnDialog(''));
}
function openGoalSavingDialog(goalId){
  const goal=db.goals.find(g=>g.id===goalId);if(!goal)return;
  const split=goalSavingBreakdown(goalId),form=$('#goalSavingForm');
  form.reset();form.elements.goalId.value=goalId;form.elements.date.value=todayISO;syncGoalSavingNoteUI();
  $('#goalSavingGoal').innerHTML=`<strong>${escapeHTML(goal.title)}</strong><br><span class="muted">Сейчас ${fmt(split.total)}</span><div class="goal-sources" style="margin-top:7px">${goalSourcesHTML(goalId)}</div>`;
  $('#goalSavingDialog').showModal();
  setTimeout(()=>form.elements.amount.focus(),0);
}
const goalSavingNoteField=()=>$('#goalSavingForm').querySelector('input[name="note"]');
const goalSavingNoteLabel=()=>$('#goalSavingForm').querySelector('label[for]');
function syncGoalSavingNoteUI(){
  const form=$('#goalSavingForm');if(!form)return;
  const isExternal=!!form.elements.external.checked;
  const noteInput=form.elements.note;
  const labelEl=noteInput.closest('.field').querySelector('label');
  if(labelEl)labelEl.textContent=isExternal?'Имя или комментарий':'Комментарий';
  noteInput.placeholder=isExternal?'Например, Даша · необязательно':'Необязательно';
}
$('#goalSavingForm').elements.external.addEventListener('change',syncGoalSavingNoteUI);
$('#goalSavingForm').addEventListener('submit',e=>{
  e.preventDefault();
  const f=e.currentTarget,goalId=f.elements.goalId.value,goal=db.goals.find(g=>g.id===goalId);if(!goal)return;
  const amount=Number(f.elements.amount.value||0);if(!Number.isFinite(amount)||amount<=0)return;
  const external=!!f.elements.external.checked;
  db.money.push({id:uid(),date:f.elements.date.value||todayISO,type:'saving',category:'',projectId:'',goalId,amount,note:(f.elements.note.value||'').trim(),seriesId:'',external});
  save(`${external?(f.elements.note.value.trim()||'Вклад другого человека'):'Отложено'} · ${fmt(amount)} в «${goal.title}»`);
  $('#goalSavingDialog').close();
  renderMoney();renderToday();renderProjects();
});
function savingsOwnerAvailable(goalId,external,editingId=''){
  const split=goalSavingBreakdown(goalId);
  let available=external?split.external:split.own;
  if(editingId){
    const old=db.money.find(x=>x.id===editingId&&x.type==='saving_return');
    if(old&&old.goalId===goalId&&!!old.external===!!external)available+=Number(old.amount||0);
  }
  return Math.max(0,available);
}
function updateSavingsReturnAvailability(){
  const f=$('#savingsReturnForm');if(!f)return;
  const goalId=f.elements.goalId.value,external=f.elements.owner.value==='external',editingId=f.elements.id.value||'';
  const available=savingsOwnerAvailable(goalId,external,editingId);
  f.elements.amount.max=String(available);
  $('#savingsReturnAvailable').innerHTML=`Доступно ${external?'денег другого человека':'своих денег'}: <strong>${fmt(available)}</strong>`;
}
function openSavingsReturnDialog(goalId='',returnId=''){
  const goal=goalId?db.goals.find(g=>g.id===goalId):null;
  if(goalId&&!goal)return;
  const item=returnId?db.money.find(x=>x.id===returnId&&x.type==='saving_return'):null;
  if(returnId&&!item)return;
  const effectiveGoalId=item?.goalId??goalId;
  const effectiveGoal=effectiveGoalId?db.goals.find(g=>g.id===effectiveGoalId):null;
  const split=goalSavingBreakdown(effectiveGoalId),form=$('#savingsReturnForm');
  form.reset();
  form.elements.id.value=item?.id||'';
  form.elements.goalId.value=effectiveGoalId;
  form.elements.date.value=item?.date||todayISO;
  form.elements.amount.value=item?.amount??'';
  form.elements.note.value=item?.note||'';
  if(item)form.elements.owner.value=item.external?'external':'own';
  else if(split.own<=0&&split.external>0)form.elements.owner.value='external';
  else form.elements.owner.value='own';
  const label=effectiveGoal?.title||'Свободные накопления';
  $('#savingsReturnGoal').innerHTML=`<strong>${escapeHTML(label)}</strong><br><span class="muted">Всего ${fmt(split.total)}</span><div class="goal-sources" style="margin-top:7px">${goalSourcesHTML(effectiveGoalId)}</div>`;
  $('#deleteSavingsReturn').style.display=item?'inline-flex':'none';
  updateSavingsReturnAvailability();
  $('#savingsReturnDialog').showModal();
  setTimeout(()=>form.elements.amount.focus(),0);
}
$('#savingsReturnForm').elements.owner.addEventListener('change',updateSavingsReturnAvailability);
$('#savingsReturnForm').addEventListener('submit',e=>{
  e.preventDefault();
  const f=e.currentTarget,id=f.elements.id.value||'',goalId=f.elements.goalId.value||'',external=f.elements.owner.value==='external';
  if(goalId&&!db.goals.some(g=>g.id===goalId)){alert('Эта цель больше не существует.');return}
  const available=savingsOwnerAvailable(goalId,external,id),amount=Number(f.elements.amount.value||0);
  if(!Number.isFinite(amount)||amount<=0)return;
  if(amount>available){alert(`Доступно ${external?'денег другого человека':'своих денег'}: ${fmt(available)}.`);return}
  const obj={id:id||uid(),date:f.elements.date.value||todayISO,type:'saving_return',category:'',projectId:'',goalId,amount,note:(f.elements.note.value||'').trim(),seriesId:'',external};
  if(id){
    const i=db.money.findIndex(x=>x.id===id);if(i<0)return;db.money[i]={...db.money[i],...obj};
  }else db.money.push(obj);
  const label=goalId?(db.goals.find(g=>g.id===goalId)?.title||'цели'):'свободных накоплений';
  save(`${external?'Деньги другого человека':'Свои деньги'} ${id?'обновлены':'возвращены'} из «${label}»: ${fmt(amount)}`);
  $('#savingsReturnDialog').close();
  renderMoney();renderToday();renderProjects();
});
$('#deleteSavingsReturn')?.addEventListener('click',()=>{
  const f=$('#savingsReturnForm'),id=f.elements.id.value||'',item=db.money.find(x=>x.id===id&&x.type==='saving_return');
  if(!item||!confirm('Удалить эту операцию возврата? Деньги снова будут считаться накопленными.'))return;
  db.money=db.money.filter(x=>x.id!==id);
  save('Возврат из накоплений удалён');
  $('#savingsReturnDialog').close();renderMoney();renderToday();renderProjects();
});


function openGoalDialog(id=''){
  const form=$('#goalForm'),g=id?db.goals.find(x=>x.id===id):null;form.reset();
  form.elements.id.value=g?.id||'';form.elements.title.value=g?.title||'';form.elements.target.value=g?.target??'';form.elements.color.value=g?.color||'#3b82f6';
  $('#goalDialogTitle').textContent=g?'Редактировать цель':'Новая цель';$('#deleteGoal').style.display=g?'inline-flex':'none';$('#goalDialog').showModal();setTimeout(()=>form.elements.title.focus(),0);
}
$('#goalForm').addEventListener('submit',e=>{
  e.preventDefault();const f=e.currentTarget,id=f.elements.id.value,title=f.elements.title.value.trim(),target=Number(f.elements.target.value);if(!title||!target||target<=0)return;
  const obj={id:id||uid(),title,target,color:f.elements.color.value||'#3b82f6',createdAt:id?(db.goals.find(g=>g.id===id)?.createdAt||Date.now()):Date.now()};
  if(id){const i=db.goals.findIndex(g=>g.id===id);if(i>=0)db.goals[i]=obj}else db.goals.push(obj);
  save();$('#goalDialog').close();renderMoney();
});
$('#deleteGoal').onclick=()=>{const id=$('#goalForm').elements.id.value;if(!id||!confirm('Удалить цель? Остаток автоматически перейдёт в «Свободные накопления» и не пропадёт.'))return;db.goals=db.goals.filter(g=>g.id!==id);db.money.forEach(x=>{if(x.goalId===id)x.goalId=''});save('Цель удалена · остаток перенесён в свободные накопления');$('#goalDialog').close();renderMoney()};
$('#newGoal').onclick=()=>openGoalDialog();

function addMoneySeries(base,repeat,until){
  const seriesId=repeat!=='none'&&until?uid():'';db.money.push({...base,seriesId});
  if(repeat==='none'||!until)return;
  const limit=new Date(until+'T12:00:00'),first=new Date(base.date+'T12:00:00'),originalDay=first.getDate();let d=new Date(first),guard=0;
  while(guard++<500){
    if(repeat==='weekly')d.setDate(d.getDate()+7);else{d=new Date(d.getFullYear(),d.getMonth()+1,1,12);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(originalDay,last));}
    if(d>limit)break;db.money.push({...base,id:uid(),date:iso(d),seriesId});
  }
}
function deleteMoneySeriesById(seriesId){if(!seriesId||!confirm('Удалить всю серию повторяющихся операций?'))return;const ids=new Set(db.money.filter(x=>x.seriesId===seriesId).map(x=>x.id));db.money=db.money.filter(x=>x.seriesId!==seriesId);db.food=db.food.filter(x=>!ids.has(x.moneyId));save();$('#moneyDialog').close();renderMoney();renderToday();}

function openMoneyEntryEditor(id){
  const item=db.money.find(x=>x.id===id);if(!item)return;
  if(item.source==='food'){
    const food=db.food.find(x=>x.moneyId===id);
    if(food){openFoodDialog(food.date,food.id);return}
  }
  if(item.type==='saving_return'){openSavingsReturnDialog(item.goalId||'',item.id);return}
  openMoneyDialog(id);
}
function hexToRgba(hex,alpha=.18){
  const safe=String(hex||'').replace('#','').trim();
  if(!/^[0-9a-fA-F]{6}$/.test(safe))return `rgba(79,108,255,${alpha})`;
  const n=parseInt(safe,16),r=(n>>16)&255,g=(n>>8)&255,b=n&255;
  return `rgba(${r},${g},${b},${alpha})`;
}
function moneyTypeLabel(type){
  return type==='income'?'Доход':type==='expense'?'Расход':type==='saving'?'Отложено':type==='saving_return'?'Возврат':'Операция';
}
function renderMoneyLedger(){
  const box=$('#moneyLedgerList');if(!box)return;
  const q=($('#moneyLedgerSearch')?.value||'').trim().toLowerCase(),type=$('#moneyLedgerType')?.value||'';
  const rows=[...db.money].filter(x=>{
    if(type&&x.type!==type)return false;
    const p=x.projectId?db.projects.find(v=>v.id===x.projectId):null,g=x.goalId?db.goals.find(v=>v.id===x.goalId):null;
    const hay=[x.date,x.category,x.note,p?.name,g?.title,moneyTypeLabel(x.type),x.amount].join(' ').toLowerCase();
    return !q||hay.includes(q);
  }).sort((a,b)=>(b.date+String(b.createdAt||'')+b.id).localeCompare(a.date+String(a.createdAt||'')+a.id));
  box.innerHTML=rows.length?rows.map(x=>{
    const p=x.projectId?db.projects.find(v=>v.id===x.projectId):null,g=x.goalId?db.goals.find(v=>v.id===x.goalId):null;
    const title=x.category||x.note||g?.title||moneyTypeLabel(x.type);
    const meta=[moneyTypeLabel(x.type),p?.name,g?.title,x.external?(x.note||'Вклад другого человека'):'',(!x.external&&x.note&&x.note!==title)?x.note:''].filter(Boolean).join(' · ');
    const sign=(x.external&&(x.type==='saving'||x.type==='saving_return'))?'':(x.type==='income'||x.type==='saving_return'?'+':x.type==='expense'||x.type==='saving'?'−':'');
    return `<div class="money-ledger-row">
      <span class="small">${escapeHTML(x.date||'—')}</span>
      <div class="money-ledger-copy"><strong>${escapeHTML(title||'Без названия')}</strong><span>${escapeHTML(meta)}</span></div>
      <span class="money-ledger-amount">${sign}${fmt(x.amount)}</span>
      <button class="tiny-btn" data-ledger-edit="${escapeHTML(x.id)}">Изм.</button>
    </div>`;
  }).join(''):'<div class="empty">Операций по этому фильтру нет.</div>';
  $$('[data-ledger-edit]',box).forEach(b=>b.onclick=()=>{
    $('#moneyLedgerDialog').close();openMoneyEntryEditor(b.dataset.ledgerEdit);
  });
}
$('#openMoneyLedger')?.addEventListener('click',()=>{renderMoneyLedger();$('#moneyLedgerDialog').showModal()});
$('#moneyLedgerSearch')?.addEventListener('input',renderMoneyLedger);
$('#moneyLedgerType')?.addEventListener('change',renderMoneyLedger);

function renderMoney(){
  const bounds=moneyBounds(), rows=db.money.filter(x=>inDateBounds(x.date,bounds)).sort((a,b)=>(b.date+b.id).localeCompare(a.date+a.id));
  const income=rows.filter(x=>x.type==='income').reduce((a,b)=>a+Number(b.amount||0),0);
  const expense=rows.filter(x=>x.type==='expense').reduce((a,b)=>a+Number(b.amount||0),0);
  const ownSaved=rows.filter(x=>x.type==='saving'&&!x.external).reduce((a,b)=>a+Number(b.amount||0),0);
  const ownReturned=rows.filter(x=>x.type==='saving_return'&&!x.external).reduce((a,b)=>a+Number(b.amount||0),0);
  const saved=ownSaved-ownReturned;
  const openingBalance=moneyBalanceBefore(bounds.start);
  const periodNet=income-expense-saved;
  const closingBalance=openingBalance+periodNet;
  $('#moneyIncome').textContent=fmt(income);
  $('#moneyExpense').textContent=fmt(expense);
  $('#moneySaved').textContent=fmt(saved);
  $('#moneyBalance').textContent=fmt(closingBalance);
  $('#moneyBalanceHint').textContent=`На начало ${fmt(openingBalance)} · за период ${periodNet>=0?'+':'−'}${fmt(Math.abs(periodNet))}`;
  $('#incomeHint').textContent=`${new Set(rows.filter(x=>x.type==='income').map(x=>x.category)).size} источников дохода`;
  $('#expenseHint').textContent=`Расходы · ${bounds.label}`;
  $('#savedHint').textContent=`Накопления · ${bounds.label}`;
  const prevB=previousMoneyBounds(),
        prevRows=db.money.filter(x=>inDateBounds(x.date,prevB)),
        prevIncome=prevRows.filter(x=>x.type==='income').reduce((a,b)=>a+Number(b.amount||0),0),
        prevExpense=prevRows.filter(x=>x.type==='expense').reduce((a,b)=>a+Number(b.amount||0),0),
        prevClosingBalance=moneyBalanceThrough(prevB.end);
  $('#moneyCompareLabel').textContent=`с ${prevB.label}`;
  $('#moneyIncomeDelta').innerHTML=deltaText(income,prevIncome,false);
  $('#moneyExpenseDelta').innerHTML=deltaText(expense,prevExpense,true);
  $('#moneyBalanceDelta').innerHTML=deltaText(closingBalance,prevClosingBalance,false);
  $$('[data-money-period]').forEach(b=>b.classList.toggle('active',b.dataset.moneyPeriod===moneyPeriod));
  const cats=Object.create(null); rows.filter(x=>x.type==='expense').forEach(x=>cats[x.category]=(cats[x.category]||0)+Number(x.amount||0));
  const top=Object.entries(cats).sort((a,b)=>b[1]-a[1]);
  const projectTotals=Object.create(null);rows.forEach(x=>{if(x.projectId){projectTotals[x.projectId]??={income:0,expense:0};if(x.type==='income')projectTotals[x.projectId].income+=Number(x.amount||0);if(x.type==='expense')projectTotals[x.projectId].expense+=Number(x.amount||0)}});$('#moneyProjects').innerHTML=Object.keys(projectTotals).length?Object.entries(projectTotals).map(([id,v])=>{const p=db.projects.find(p=>p.id===id);return `<div class="mini-item"><div class="left"><i class="dot" style="background:${escapeHTML(/^#[0-9a-f]{6}$/i.test(p?.color||'')?p.color:'#6366f1')}"></i><span>${escapeHTML(p?.name||'Проект')}</span></div><strong>${fmt(v.income-v.expense)}</strong></div>`}).join(''):'<div class="empty">Нет операций, связанных с проектами.</div>';
  $('#moneyCategories').innerHTML = top.length ? top.map(([k,v])=>`<div class="bar-row"><div class="bar-head"><span>${escapeHTML(k)}</span><span>${fmt(v)}</span></div><div class="bar"><span style="width:${expense?Math.min(100,v/expense*100):0}%;background:#f59e0b"></span></div></div>`).join('') : '<div class="empty">Нет расходов за выбранный период.</div>';
  renderMoneyGoals();
  renderFood();
}
$$('[data-money-period]').forEach(b=>b.onclick=()=>{moneyPeriod=b.dataset.moneyPeriod;renderMoney()});$('#moneyPrevPeriod').onclick=()=>shiftMoneyCursor(-1);$('#moneyNextPeriod').onclick=()=>shiftMoneyCursor(1);$('#moneyCurrentPeriod').onclick=()=>{moneyCursor=new Date();renderMoney()};
$('#moneyForm').elements.type.addEventListener('change',updateMoneyGoalVisibility);
$('#moneyForm').addEventListener('submit',e=>{
  e.preventDefault(); const f=e.currentTarget,amount=Number(f.elements.amount.value),id=f.elements.id.value;if(!Number.isFinite(amount)||amount<0)return;
  const repeat=f.elements.repeat.value||'none',until=f.elements.repeatUntil.value||'';
  if(!id&&repeat!=='none'&&!until){alert('Для повторяющейся операции укажи дату «Повторять до».');return}
  const old=id?db.money.find(x=>x.id===id):null;
  const type=f.elements.type.value;
  const obj={...(old||{}),id:id||uid(),date:f.elements.date.value,type,category:type==='saving'?'':(f.elements.category.value||'Другое').trim(),projectId:f.elements.projectId.value||'',goalId:type==='saving'?(f.elements.goalId.value||''):'',amount,note:(f.elements.note.value||'').trim(),external:type==='saving'?!!f.elements.external.checked:false};
  if(id){
    const i=db.money.findIndex(x=>x.id===id);if(i>=0)db.money[i]=obj;
    if(old?.seriesId&&f.elements.applySeries.checked){db.money=db.money.map(x=>x.seriesId===old.seriesId?{...x,type:obj.type,category:obj.category,projectId:obj.projectId,goalId:obj.goalId,amount:obj.amount,note:obj.note,external:obj.external}:x)}
    if(old?.source==='food_week_saving'){for(const decision of Object.values(db.foodWeekDecisions||{}))if(decision.moneyId===id)decision.amount=amount}
  }else addMoneySeries(obj,repeat,until);
  save(); $('#moneyDialog').close(); f.reset(); renderMoney(); renderToday();renderProjects();
});
$('#deleteMoney').onclick=()=>{const id=$('#moneyForm').elements.id.value;if(id)deleteMoneyEntry(id)};$('#deleteMoneySeries').onclick=()=>{const id=$('#moneyForm').elements.id.value,item=db.money.find(x=>x.id===id);if(item?.seriesId)deleteMoneySeriesById(item.seriesId)};

let foodWeekStart = startOfWeek(new Date());

function legacyMealName(v){return {breakfast:'Завтрак',lunch:'Обед',dinner:'Ужин',snack:'Перекус'}[v]||v||'Еда'}
function foodTitle(x){return (x?.title||legacyMealName(x?.meal)||'Еда').trim()}
function foodTone(category=''){
  const c=String(category).toLowerCase();
  if(c.includes('продукт'))return 'breakfast';
  if(c.includes('достав'))return 'lunch';
  if(c.includes('каф'))return 'dinner';
  return 'snack';
}
function foodCountsTowardLimit(x){return !x?.excludeFromLimit}
function foodSpendSummary(entries){
  const total=entries.reduce((a,b)=>a+Number(b.amount||0),0);
  const limited=entries.filter(foodCountsTowardLimit).reduce((a,b)=>a+Number(b.amount||0),0);
  return {total,limited,outside:Math.max(0,total-limited)};
}
function openSubscriptionDialog(id=''){
  const f=$('#subscriptionForm'),item=id?db.subscriptions.find(x=>x.id===id):null;
  f.reset();
  f.elements.id.value=item?.id||'';
  f.elements.title.value=item?.title||'';
  f.elements.amount.value=item?.amount??'';
  f.elements.billingDay.value=item?.billingDay??'';
  f.elements.note.value=item?.note||'';
  $('#subscriptionDialogTitle').textContent=item?'Редактировать регулярную трату':'Добавить регулярную трату';
  $('#deleteSubscription').style.display=item?'inline-flex':'none';
  $('#subscriptionDialog').showModal();
  setTimeout(()=>f.elements.title.focus(),0);
}
function renderSubscriptions(){
  const list=$('#subscriptionsList');if(!list)return;
  const rows=[...db.subscriptions].sort((a,b)=>{
    const ad=Number(a.billingDay||99),bd=Number(b.billingDay||99);
    return ad-bd||String(a.title).localeCompare(String(b.title),'ru');
  });
  const total=rows.reduce((a,b)=>a+Number(b.amount||0),0);
  $('#subscriptionsMonthlyTotal').textContent=fmt(total);
  $('#subscriptionsCount').textContent=rows.length;
  $('#subscriptionsYearlyTotal').textContent=fmt(total*12);
  list.innerHTML=rows.length?rows.map(x=>{
    const meta=[x.billingDay?`списание примерно ${x.billingDay}-го числа`:'ежемесячно',x.note||''].filter(Boolean).join(' · ');
    return `<div class="recurring-row">
      <div class="recurring-copy"><strong>${escapeHTML(x.title)}</strong><span>${escapeHTML(meta)}</span></div>
      <div class="recurring-amounts"><strong>${fmt(x.amount)} / мес.</strong><span>${fmt(Number(x.amount||0)*12)} / год</span></div>
      <div class="recurring-actions"><button class="tiny-btn" data-subscription-edit="${escapeHTML(x.id)}">Изм.</button><button class="tiny-btn danger" data-subscription-del="${escapeHTML(x.id)}">×</button></div>
    </div>`;
  }).join(''):'<div class="empty">Пока ничего нет. Добавь подписки, связь, интернет или другие регулярные ежемесячные траты.</div>';
  $$('[data-subscription-edit]',list).forEach(b=>b.onclick=()=>openSubscriptionDialog(b.dataset.subscriptionEdit));
  $$('[data-subscription-del]',list).forEach(b=>b.onclick=()=>{
    const x=db.subscriptions.find(v=>v.id===b.dataset.subscriptionDel);
    if(!x||!confirm(`Удалить «${x.title}» из справочного списка?`))return;
    db.subscriptions=db.subscriptions.filter(v=>v.id!==x.id);
    save(`«${x.title}» удалено из регулярных трат`);
    renderSubscriptions();
  });
}

function openRecurringIncomeDialog(id=''){
  const f=$('#recurringIncomeForm'),item=id?db.recurringIncome.find(x=>x.id===id):null;
  f.reset();
  f.elements.id.value=item?.id||'';
  f.elements.title.value=item?.title||'';
  f.elements.amount.value=item?.amount??'';
  f.elements.billingDay.value=item?.billingDay??'';
  f.elements.note.value=item?.note||'';
  $('#recurringIncomeDialogTitle').textContent=item?'Редактировать регулярный доход':'Добавить регулярный доход';
  $('#deleteRecurringIncome').style.display=item?'inline-flex':'none';
  $('#recurringIncomeDialog').showModal();
  setTimeout(()=>f.elements.title.focus(),0);
}
function renderRecurringIncome(){
  const list=$('#recurringIncomeList');if(!list)return;
  const rows=[...db.recurringIncome].sort((a,b)=>{
    const ad=Number(a.billingDay||99),bd=Number(b.billingDay||99);
    return ad-bd||String(a.title).localeCompare(String(b.title),'ru');
  });
  const total=rows.reduce((a,b)=>a+Number(b.amount||0),0);
  $('#recurringIncomeMonthlyTotal').textContent=fmt(total);
  $('#recurringIncomeCount').textContent=rows.length;
  $('#recurringIncomeYearlyTotal').textContent=fmt(total*12);
  list.innerHTML=rows.length?rows.map(x=>{
    const meta=[x.billingDay?`поступление примерно ${x.billingDay}-го числа`:'ежемесячно',x.note||''].filter(Boolean).join(' · ');
    return `<div class="recurring-row">
      <div class="recurring-copy"><strong>${escapeHTML(x.title)}</strong><span>${escapeHTML(meta)}</span></div>
      <div class="recurring-amounts"><strong>${fmt(x.amount)} / мес.</strong><span>${fmt(Number(x.amount||0)*12)} / год</span></div>
      <div class="recurring-actions"><button class="tiny-btn" data-recurring-income-edit="${escapeHTML(x.id)}">Изм.</button><button class="tiny-btn danger" data-recurring-income-del="${escapeHTML(x.id)}">×</button></div>
    </div>`;
  }).join(''):'<div class="empty">Пока ничего нет. Добавь зарплату, постоянного клиента или другой регулярный доход.</div>';
  $$('[data-recurring-income-edit]',list).forEach(b=>b.onclick=()=>openRecurringIncomeDialog(b.dataset.recurringIncomeEdit));
  $$('[data-recurring-income-del]',list).forEach(b=>b.onclick=()=>{
    const x=db.recurringIncome.find(v=>v.id===b.dataset.recurringIncomeDel);
    if(!x||!confirm(`Удалить «${x.title}» из справочного списка?`))return;
    db.recurringIncome=db.recurringIncome.filter(v=>v.id!==x.id);
    save(`«${x.title}» удалено из регулярного дохода`);
    renderRecurringIncome();
  });
}

function openFoodDialog(date=todayISO,id=''){
  const form=$('#foodForm'),item=id?db.food.find(x=>x.id===id):null;form.reset();
  form.elements.id.value=item?.id||'';form.elements.date.value=item?.date||date;form.elements.title.value=item?foodTitle(item):'';form.elements.category.value=item?.category||'Продукты';form.elements.amount.value=item?.amount??'';form.elements.note.value=item?.note||'';form.elements.excludeFromLimit.checked=!!item?.excludeFromLimit;
  $('#foodDialogTitle').textContent=item?'Редактировать трату':'Добавить трату';$('#deleteFood').style.display=item?'inline-flex':'none';$('#foodDialog').showModal();
  setTimeout(()=>form.elements.title?.focus(),0);
}
function foodLimitState(spent,limit){
  const pct=limit?Math.round(spent/limit*100):0,remain=limit-spent;
  return {pct,clamped:Math.min(100,Math.max(0,pct)),tone:pct>100?'over':pct>=75?'warn':'ok',copy:remain>=0?`Осталось ${fmt(remain)}`:`Перерасход ${fmt(Math.abs(remain))}`};
}
function weekRangeLabel(start,endExclusive){
  const end=new Date(endExclusive);end.setDate(end.getDate()-1);
  const f=d=>new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}).format(d);
  return `${f(start)} — ${f(end)}`;
}
function previousCompletedWeek(now=new Date()){
  const end=startOfWeek(now),start=new Date(end);start.setDate(start.getDate()-7);return {start,end,key:iso(start)};
}
function renderFoodWeekReview(start,end){
  const box=$('#foodWeekReview'); if(!box)return;
  const currentStart=startOfWeek(new Date());
  const key=iso(start);
  const entries=db.food.filter(x=>{const d=new Date(x.date+'T12:00:00');return d>=start&&d<end});
  const summary=foodSpendSummary(entries);
  const limit=(Number(db.budgets.day)||1000)*7,spent=summary.limited,totalSpent=summary.total,outsideSpent=summary.outside;

  if(start>=currentStart){
    const left=Math.max(0,limit-spent);
    box.innerHTML=`<div class="card"><div class="section-title"><h2>Итоги недели</h2><span class="small">${weekRangeLabel(start,end)}</span></div><div class="food-review-kpis"><div class="food-review-kpi"><span>Ориентир</span><strong>${fmt(limit)}</strong></div><div class="food-review-kpi"><span>Повседневные</span><strong>${fmt(spent)}</strong></div><div class="food-review-kpi"><span>Осталось</span><strong>${fmt(left)}</strong></div></div>${outsideSpent?`<div class="food-review-note">Всего расходов: <strong>${fmt(totalSpent)}</strong> · вне повседневного ориентира: <strong>${fmt(outsideSpent)}</strong>.</div>`:''}<div class="food-review-note">${start.getTime()===currentStart.getTime()?'Неделя ещё идёт. После её завершения здесь появится итог и предложение, сколько отправить в копилку.':'Это будущая неделя. Итог появится после её завершения.'}</div></div>`;
    return;
  }

  if(!entries.length){
    box.innerHTML=`<div class="card"><div class="section-title"><h2>Итоги завершённой недели</h2><span class="small">${weekRangeLabel(start,end)}</span></div><div class="empty">На этой неделе записей о еде не было.</div></div>`;
    return;
  }

  const saved=Math.max(0,limit-spent),over=Math.max(0,spent-limit),suggested=Math.round(saved*.5*100)/100;
  const decision=db.foodWeekDecisions?.[key];
  let action='';
  if(over>0){
    action=`<div class="food-review-suggestion over-limit">Лимит превышен на <strong>${fmt(over)}</strong>. На этой неделе ничего в копилку не предлагаем.</div>`;
  }else if(decision){
    const stale=(Number.isFinite(Number(decision.spentAtDecision))&&Math.abs(Number(decision.spentAtDecision)-spent)>.009)||Number(decision.amount||0)>saved;
    action=`<div class="food-review-suggestion ${stale?'stale':''}">${stale?'Расходы этой недели изменились после сохранённого решения. ':'Решение сохранено: '}<strong>${decision.amount>0?fmt(decision.amount)+' отправлено в копилку':'ничего не откладывать'}</strong>${stale?' · пересчитай решение, чтобы деньги снова совпадали с фактической экономией.':'.'}</div><div class="food-review-actions"><button class="btn" data-food-review-reset="${key}">${stale?'Пересчитать':'Изменить решение'}</button></div>`;
  }else{
    action=`<div class="food-review-suggestion">Ты сэкономил <strong>${fmt(saved)}</strong>. Предлагаю отправить <strong>50% = ${fmt(suggested)}</strong> в копилку, а оставшиеся ${fmt(saved-suggested)} оставить свободными.</div><div class="food-review-actions"><button class="btn primary" data-food-save-half="${key}">Отложить 50%</button><input id="foodSavingsCustom" type="number" min="0" max="${saved}" step="1" placeholder="Своя сумма"><button class="btn" data-food-save-custom="${key}">Отложить свою</button><button class="btn" data-food-save-none="${key}">Не откладывать</button></div>`;
  }
  box.innerHTML=`<div class="food-review"><div class="food-review-main"><div class="section-title"><h2>Итоги завершённой недели</h2><span class="small">${weekRangeLabel(start,end)}</span></div><div class="food-review-kpis"><div class="food-review-kpi"><span>Ориентир</span><strong>${fmt(limit)}</strong></div><div class="food-review-kpi"><span>Повседневные</span><strong>${fmt(spent)}</strong></div><div class="food-review-kpi"><span>${over?'Перерасход':'Сэкономлено'}</span><strong style="color:${over?'var(--danger)':'var(--success)'}">${fmt(over||saved)}</strong></div></div>${outsideSpent?`<div class="food-review-note" style="margin-bottom:10px">Всего расходов: <strong>${fmt(totalSpent)}</strong> · вне ориентира: <strong>${fmt(outsideSpent)}</strong>.</div>`:''}${action}</div></div>`;
  $$('[data-food-save-half]',box).forEach(b=>b.onclick=()=>applyFoodWeekDecision(key,suggested,start,end));
  $$('[data-food-save-custom]',box).forEach(b=>b.onclick=()=>{const value=Number($('#foodSavingsCustom')?.value);if(!Number.isFinite(value)||value<0||value>saved){alert(`Введи сумму от 0 до ${fmt(saved)}`);return}applyFoodWeekDecision(key,value,start,end)});
  $$('[data-food-save-none]',box).forEach(b=>b.onclick=()=>applyFoodWeekDecision(key,0,start,end));
  $$('[data-food-review-reset]',box).forEach(b=>b.onclick=()=>resetFoodWeekDecision(key));
}
function applyFoodWeekDecision(key,amount,start,end){
  db.foodWeekDecisions??={};
  const old=db.foodWeekDecisions[key];if(old?.moneyId)db.money=db.money.filter(x=>x.id!==old.moneyId);
  let moneyId='';
  if(amount>0){moneyId=uid();db.money.push({id:moneyId,date:iso(new Date(end.getTime()-86400000)),type:'saving',category:'Экономия на еде',projectId:'',amount:Number(amount),note:`Экономия за ${weekRangeLabel(start,end)}`,source:'food_week_saving',sourceId:key});}
  db.foodWeekDecisions[key]={amount:Number(amount)||0,moneyId,spentAtDecision:db.food.filter(x=>{const d=new Date(x.date+'T12:00:00');return d>=start&&d<end&&foodCountsTowardLimit(x)}).reduce((a,b)=>a+Number(b.amount||0),0),decidedAt:new Date().toISOString()};save();renderMoney();renderToday();
}
function resetFoodWeekDecision(key){
  const d=db.foodWeekDecisions?.[key];if(d?.moneyId)db.money=db.money.filter(x=>x.id!==d.moneyId);if(db.foodWeekDecisions)delete db.foodWeekDecisions[key];save();renderMoney();renderToday();
}
function deleteFoodEntry(id){
  const x=db.food.find(v=>v.id===id);if(!x||!confirm(`Удалить «${foodTitle(x)}»?`))return;if(x.moneyId)db.money=db.money.filter(m=>m.id!==x.moneyId);db.food=db.food.filter(v=>v.id!==id);save();renderMoney();renderToday();
}

function renderFood(){
  const now=new Date(); const weekStart=new Date(foodWeekStart); const weekEnd=new Date(weekStart); weekEnd.setDate(weekEnd.getDate()+7);
  const monthAnchor=new Date(weekStart);monthAnchor.setDate(monthAnchor.getDate()+3);
  const month=monthKey(iso(monthAnchor)),dayLimit=Number(db.budgets.day)||1000,weekLimit=dayLimit*7; db.budgets.week=weekLimit;

  const todayEntries=db.food.filter(x=>x.date===todayISO),todaySummary=foodSpendSummary(todayEntries);
  const weekEntries=db.food.filter(x=>{const d=new Date(x.date+'T12:00:00'); return d>=weekStart&&d<weekEnd}),weekSummary=foodSpendSummary(weekEntries);
  const monthEntries=db.food.filter(x=>monthKey(x.date)===month),monthSummary=foodSpendSummary(monthEntries);

  const todaySum=todaySummary.limited,weekSum=weekSummary.limited,monthSum=monthSummary.limited;
  const days=new Set(monthEntries.filter(foodCountsTowardLimit).map(x=>x.date)).size, todayState=foodLimitState(todaySum,dayLimit),weekState=foodLimitState(weekSum,weekLimit);

  $('#foodToday').textContent=fmt(todaySum); $('#foodWeek').textContent=fmt(weekSum); $('#foodMonth').textContent=fmt(monthSum); $('#foodAvg').textContent=fmt(days?monthSum/days:0);
  $('#foodTodayHint').textContent=todaySummary.outside?`ориентир ${fmt(dayLimit)} · всего ${fmt(todaySummary.total)}`:`ориентир ${fmt(dayLimit)}`;
  $('#foodWeekHint').textContent=weekSummary.outside?`ориентир ${fmt(weekLimit)} · всего ${fmt(weekSummary.total)}`:`ориентир ${fmt(weekLimit)}`;
  $('#foodMonthHint').textContent=monthSummary.outside?`ориентир ${fmt(db.budgets.month)} · всего ${fmt(monthSummary.total)}`:`ориентир ${fmt(db.budgets.month)}`;
  $('#foodTodayBar').style.width=todayState.clamped+'%';$('#foodTodayBar').style.background=todayState.tone==='over'?'var(--danger)':todayState.tone==='warn'?'var(--warning)':'var(--success)';$('#foodTodayState').textContent=todayState.copy+(todaySummary.outside?` · вне ориентира ${fmt(todaySummary.outside)}`:'');$('#foodTodayPct').textContent=todayState.pct+'%';
  $('#foodWeekBar').style.width=weekState.clamped+'%';$('#foodWeekBar').style.background=weekState.tone==='over'?'var(--danger)':weekState.tone==='warn'?'var(--warning)':'var(--success)';$('#foodWeekState').textContent=weekState.copy.replace('Осталось','Резерв')+(weekSummary.outside?` · вне ориентира ${fmt(weekSummary.outside)}`:'');$('#foodWeekPct').textContent=weekState.pct+'%';
  $('#foodWeekRange').textContent=weekRangeLabel(weekStart,weekEnd);$('#foodNavRange').textContent=weekRangeLabel(weekStart,weekEnd);$('#foodWeekBudgetLabel').textContent=`Ориентир ${fmt(weekLimit)} · ${fmt(dayLimit)} в день`;
  const selectedMonthDate=new Date(monthAnchor.getFullYear(),monthAnchor.getMonth(),1);
  const currentMonthDate=new Date(now.getFullYear(),now.getMonth(),1);
  const selectedMonthLabel=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(selectedMonthDate);$('#foodMonthLabel').textContent=selectedMonthLabel;$('#foodCategoriesPeriod').textContent=selectedMonthLabel;
  if(selectedMonthDate.getTime()===currentMonthDate.getTime()){
    const dayOfMonth=now.getDate(),daysInMonth=new Date(now.getFullYear(),now.getMonth()+1,0).getDate(),forecast=dayOfMonth?monthSum/dayOfMonth*daysInMonth:0;
    $('#foodForecast').textContent=`Прогноз повседневных: ${fmt(forecast)}${db.budgets.month?` · ${forecast<=db.budgets.month?'в пределах ориентира':'выше ориентира'}`:''}${monthSummary.outside?` · вне ориентира уже ${fmt(monthSummary.outside)}`:''}`;
  }else{
    $('#foodForecast').textContent=`Повседневные: ${fmt(monthSum)}${monthSummary.outside?` · вне ориентира ${fmt(monthSummary.outside)} · всего ${fmt(monthSummary.total)}`:''}`;
  }

  const dayNames=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],cols=[];
  for(let i=0;i<7;i++){
    const d=new Date(weekStart); d.setDate(d.getDate()+i); const key=iso(d),entries=weekEntries.filter(x=>x.date===key),summary=foodSpendSummary(entries),sum=summary.limited,state=foodLimitState(sum,dayLimit);
    const list=entries.length?entries.map(x=>`<div class="meal ${foodTone(x.category)} food-entry ${x.excludeFromLimit?'outside-limit':''}"><div class="food-entry-actions"><button class="food-entry-action" data-food-edit="${escapeHTML(x.id)}" title="Изменить">✎</button><button class="food-entry-action" data-food-del="${escapeHTML(x.id)}" title="Удалить">×</button></div><div class="meal-title">${escapeHTML(foodTitle(x))}</div><div class="meal-line"><span class="meal-note">${escapeHTML(x.note||x.category||'Траты')}</span><strong>${fmt(x.amount)}</strong></div>${x.excludeFromLimit?'<span class="food-outside-badge">вне ориентира</span>':''}</div>`).join(''):'<div class="meal"><div class="meal-title">Пока пусто</div><div class="meal-line"><span class="muted">Добавь первую запись</span></div></div>';
    cols.push(`<div class="day-col"><div class="day-head"><div><strong>${dayNames[i]}</strong><br><span>${d.getDate()} ${new Intl.DateTimeFormat('ru-RU',{month:'short'}).format(d)}</span></div><strong>${fmt(sum)}</strong></div><div class="food-day-progress ${state.tone}"><span style="width:${state.clamped}%"></span></div><div class="food-day-state"><span>${state.copy}${summary.outside?` · вне ${fmt(summary.outside)}`:''}</span><span>${state.pct}%</span></div>${list}<button class="food-add-day" data-food-add="${key}">＋ Добавить</button></div>`);
  }
  $('#foodWeekBoard').innerHTML=cols.join('');
  $$('[data-food-add]').forEach(b=>b.onclick=()=>openFoodDialog(b.dataset.foodAdd));$$('[data-food-edit]').forEach(b=>b.onclick=()=>openFoodDialog(todayISO,b.dataset.foodEdit));$$('[data-food-del]').forEach(b=>b.onclick=()=>deleteFoodEntry(b.dataset.foodDel));

  const recent=[...db.food].sort((a,b)=>(b.date+b.id).localeCompare(a.date+a.id)).slice(0,8);
  $('#foodRecent').innerHTML=recent.length?recent.map(x=>`<div class="mini-item"><div class="left"><span>🍽</span><div><strong>${escapeHTML(foodTitle(x))}</strong><div class="meta">${x.date} · ${escapeHTML(x.category||'Еда')}${x.note?' · '+escapeHTML(x.note):''}</div></div></div><div><strong>${fmt(x.amount)}</strong> <button class="tiny-btn" data-food-recent-edit="${escapeHTML(x.id)}">Изм.</button> <button class="delete-row" data-food-recent-del="${escapeHTML(x.id)}">×</button></div></div>`).join(''):'<div class="empty">Добавь первую трату.</div>';
  $$('[data-food-recent-edit]').forEach(b=>b.onclick=()=>openFoodDialog(todayISO,b.dataset.foodRecentEdit));$$('[data-food-recent-del]').forEach(b=>b.onclick=()=>deleteFoodEntry(b.dataset.foodRecentDel));
  const cats=Object.create(null); monthEntries.forEach(x=>cats[x.category||'Другое']=(cats[x.category||'Другое']||0)+Number(x.amount||0));
  $('#foodCategories').innerHTML=Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="bar-row"><div class="bar-head"><span>${escapeHTML(k)}</span><span>${fmt(v)}</span></div><div class="bar"><span style="width:${monthSummary.total?Math.min(100,v/monthSummary.total*100):0}%;background:#22c55e"></span></div></div>`).join('')||'<div class="empty">Нет данных.</div>';
  renderFoodWeekReview(weekStart,weekEnd);
  renderSubscriptions();
  renderRecurringIncome();
}


$('#addSubscription')?.addEventListener('click',()=>openSubscriptionDialog());
$('#subscriptionForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const f=e.currentTarget,id=f.elements.id.value,title=f.elements.title.value.trim(),amount=Number(f.elements.amount.value||0);
  if(!title||amount<0)return;
  const item={id:id||uid(),title,amount,billingDay:f.elements.billingDay.value?Math.max(1,Math.min(31,Number(f.elements.billingDay.value))):null,note:f.elements.note.value.trim()};
  if(id){
    const i=db.subscriptions.findIndex(x=>x.id===id);
    if(i>=0)db.subscriptions[i]=item;
  }else db.subscriptions.push(item);
  save(`Регулярная трата «${title}» сохранена`);
  $('#subscriptionDialog').close();
  renderSubscriptions();
});
$('#deleteSubscription')?.addEventListener('click',()=>{
  const id=$('#subscriptionForm').elements.id.value,x=db.subscriptions.find(v=>v.id===id);
  if(!x||!confirm(`Удалить «${x.title}» из справочного списка?`))return;
  db.subscriptions=db.subscriptions.filter(v=>v.id!==id);
  save(`«${x.title}» удалено из регулярных трат`);
  $('#subscriptionDialog').close();
  renderSubscriptions();
});

$('#addRecurringIncome')?.addEventListener('click',()=>openRecurringIncomeDialog());
$('#recurringIncomeForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const f=e.currentTarget,id=f.elements.id.value,title=f.elements.title.value.trim(),amount=Number(f.elements.amount.value||0);
  if(!title||amount<0)return;
  const item={id:id||uid(),title,amount,billingDay:f.elements.billingDay.value?Math.max(1,Math.min(31,Number(f.elements.billingDay.value))):null,note:f.elements.note.value.trim()};
  if(id){
    const i=db.recurringIncome.findIndex(x=>x.id===id);
    if(i>=0)db.recurringIncome[i]=item;
  }else db.recurringIncome.push(item);
  save(`Регулярный доход «${title}» сохранён`);
  $('#recurringIncomeDialog').close();
  renderRecurringIncome();
});
$('#deleteRecurringIncome')?.addEventListener('click',()=>{
  const id=$('#recurringIncomeForm').elements.id.value,x=db.recurringIncome.find(v=>v.id===id);
  if(!x||!confirm(`Удалить «${x.title}» из справочного списка?`))return;
  db.recurringIncome=db.recurringIncome.filter(v=>v.id!==id);
  save(`«${x.title}» удалено из регулярного дохода`);
  $('#recurringIncomeDialog').close();
  renderRecurringIncome();
});

$('#foodPrevWeek').onclick=()=>{foodWeekStart=new Date(foodWeekStart);foodWeekStart.setDate(foodWeekStart.getDate()-7);renderFood()};
$('#foodNextWeek').onclick=()=>{foodWeekStart=new Date(foodWeekStart);foodWeekStart.setDate(foodWeekStart.getDate()+7);renderFood()};
$('#foodCurrentWeek').onclick=()=>{foodWeekStart=startOfWeek(new Date());renderFood()};


$('#foodForm').addEventListener('submit',e=>{
  e.preventDefault();const f=e.currentTarget,amount=Number(f.elements.amount.value),title=String(f.elements.title.value||'').trim(),id=f.elements.id.value;if(!amount||amount<0||!title)return;
  const old=id?db.food.find(x=>x.id===id):null;
  const item={...(old||{}),id:id||uid(),date:f.elements.date.value,title,category:f.elements.category.value||'Другое',amount,note:String(f.elements.note.value||'').trim(),excludeFromLimit:!!f.elements.excludeFromLimit.checked};
  let moneyId=old?.moneyId||'';
  if(!moneyId){moneyId=uid();item.moneyId=moneyId;db.money.push({id:moneyId,date:item.date,type:'expense',category:'Траты · '+item.category,projectId:'',goalId:'',amount:item.amount,note:item.title+(item.note?' · '+item.note:''),source:'food',sourceId:item.id})}
  else{
    const mi=db.money.findIndex(x=>x.id===moneyId);
    const m={id:moneyId,date:item.date,type:'expense',category:'Траты · '+item.category,projectId:'',goalId:'',amount:item.amount,note:item.title+(item.note?' · '+item.note:''),source:'food',sourceId:item.id};
    if(mi>=0)db.money[mi]={...db.money[mi],...m};else db.money.push(m);
  }
  if(id){const i=db.food.findIndex(x=>x.id===id);if(i>=0)db.food[i]=item}else db.food.push(item);
  save();$('#foodDialog').close();f.reset();renderMoney();renderToday();
});

$('#deleteFood').onclick=()=>{const id=$('#foodForm').elements.id.value;if(id)deleteFoodEntry(id)};

function escapeHTML(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}


function openWorkoutDialog(date=workoutSelectedDate,id=''){
  const f=$('#workoutForm');
  const item=id?workoutByUIId(id):null;
  $('#workoutDialogTitle').textContent=item?'Редактировать тренировку':'Новая тренировка';
  f.reset();
  f.elements.id.value=item?._calendarDerived?'':(item?.id||'');
  f.elements.calendarEventId.value=item?.calendarEventId||'';
  f.elements.date.value=item?.date||date||todayISO;
  f.elements.start.value=item?.start||'19:00';
  f.elements.title.value=item?.title||'';
  f.elements.type.value=item?.type||'home';
  f.elements.status.value=['done','missed'].includes(item?.status)?item.status:'planned';
  f.elements.duration.value=item?.duration??60;
  f.elements.caloriesBurned.value=item?.caloriesBurned??'';
  f.elements.note.value=item?.note||'';
  $('#deleteWorkout').style.display=(item&&!item._calendarDerived)?'inline-flex':'none';
  $('#workoutDialog').showModal();
}function openCalorieDialog(date=workoutSelectedDate,id=''){
  const f=$('#calorieForm');
  const item=id?db.calories.find(x=>x.id===id):null;
  $('#calorieDialogTitle').textContent=item?'Редактировать калории':'Добавить калории';
  f.elements.id.value=item?.id||'';
  f.elements.date.value=item?.date||date||todayISO;
  f.elements.title.value=item?.title||'';
  f.elements.calories.value=item?.calories??'';
  f.elements.note.value=item?.note||'';
  $('#deleteCalorie').style.display=item?'inline-flex':'none';
  $('#calorieDialog').showModal();
}
function openWeightDialog(date=workoutSelectedDate,id=''){
  const f=$('#weightForm');
  const item=id?db.weights.find(x=>x.id===id):null;
  $('#weightDialogTitle').textContent=item?'Редактировать вес':'Добавить вес';
  f.elements.id.value=item?.id||'';
  f.elements.date.value=item?.date||date||todayISO;
  f.elements.value.value=item?.value??'';
  f.elements.zone.value=item?.zone||'green';
  f.elements.note.value=item?.note||'';
  $('#deleteWeight').style.display=item?'inline-flex':'none';
  $('#weightDialog').showModal();
}
function renderWorkouts(){
  if(!$('#page-workouts')) return;
  const start=new Date(workoutWeekStart);
  const days=[...Array(7)].map((_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d});
  if(!sameViewedWorkoutWeek(workoutSelectedDate)) workoutSelectedDate=iso(days[0]);
  const weekStartIso=iso(days[0]), weekEndIso=iso(days[6]);
  const weekWorkouts=allWorkoutsInRange(weekStartIso,weekEndIso);
  const plannedWeek=weekWorkouts.filter(x=>x.status!=='missed').length;
  const doneWeek=weekWorkouts.filter(x=>x.status==='done').length;
  const weeklyGoal=Math.max(1,Number(db.trainingSettings?.weeklyGoal||4));
  const caloriesTodayRows=caloriesForDate(todayISO);
  $('#workoutCaloriesToday').textContent=kcalText(caloriesTodayRows.reduce((a,b)=>a+Number(b.calories||0),0));
  $('#workoutCaloriesHint').textContent=`${caloriesTodayRows.length} ${caloriesTodayRows.length===1?'запись':'записей'} за день`;
  $('#workoutDoneWeek').textContent=`${doneWeek} / ${weeklyGoal}`;
  $('#workoutDoneWeekHint').textContent=`${Math.min(100,Math.round(doneWeek/weeklyGoal*100))}% выполнено`;
  const latest=latestWeightEntry();
  $('#workoutCurrentWeight').textContent=latest?kgText(latest.value):'—';
  $('#workoutWeightHint').textContent=latest?latest.date:'Замеров пока нет';
  $('#workoutRailWeight').textContent=latest?kgText(latest.value):'—';
  $('#workoutRailWeightDate').textContent=latest?`Последний замер · ${latest.date}`:'Добавь первый замер';
  $('#workoutWeekMinutes').textContent=minutesText(weekWorkouts.filter(x=>x.status==='done').reduce((n,x)=>n+Number(x.duration||0),0));
  const goalPct=Math.min(100,Math.round(doneWeek/weeklyGoal*100));
  $('#workoutGoalInline').textContent=`${doneWeek} из ${weeklyGoal} · ${goalPct}%`;
  $('#workoutRange').textContent=weekRangeText(start);
  $('#trainingWeeklyGoal').value=weeklyGoal;
  $('#workoutGoalBar').style.width=goalPct+'%';

  const board=$('#workoutWeekBoard');
  board.innerHTML=days.map(d=>{
    const date=iso(d),rows=workoutsForDate(date),done=rows.some(x=>x.status==='done'),planned=rows.some(x=>x.status==='planned');
    return `<button type="button" class="training-day ${date===workoutSelectedDate?'active':''} ${date===todayISO?'today':''}" data-workout-day="${date}" aria-pressed="${date===workoutSelectedDate}" aria-label="${date}: ${rows.length} тренировок"><span>${new Intl.DateTimeFormat('ru-RU',{weekday:'short'}).format(d)}</span><strong>${d.getDate()}</strong><i class="${done?'done':planned?'planned':'rest'}"></i></button>`;
  }).join('');
  $$('[data-workout-day]',board).forEach(el=>el.onclick=()=>{workoutSelectedDate=el.dataset.workoutDay;renderWorkouts()});
  $('#workoutRhythm').innerHTML=days.map(d=>{const rows=workoutsForDate(iso(d)),done=rows.some(x=>x.status==='done'),planned=rows.some(x=>x.status==='planned');return `<span title="${iso(d)}" class="${done?'done':planned?'planned':'rest'}">${new Intl.DateTimeFormat('ru-RU',{weekday:'short'}).format(d)}</span>`}).join('');
  $('#workoutRhythmHint').textContent=`${doneWeek} выполнено · ${weekWorkouts.filter(x=>x.status==='planned').length} в плане · ${weekWorkouts.filter(x=>x.status==='missed').length} пропущено`;
  $('#workoutWeekCount').textContent=`${weekWorkouts.length} занятий`;
  const weekRows=[...weekWorkouts].sort((a,b)=>(a.date+(a.start||'')).localeCompare(b.date+(b.start||'')));
  const rowsHTML=rows=>rows.map(x=>`<button type="button" class="training-week-row" data-workout-week-edit="${escapeHTML(x.id)}"><span class="training-row-icon ${escapeHTML(x.status)}">${x.status==='done'?'✓':x.status==='missed'?'—':'◷'}</span><span><strong>${escapeHTML(x.title)}</strong><small>${x.date} · ${escapeHTML(x.start||'—')} · ${minutesText(Number(x.duration||0))}</small></span><span class="training-row-status">${workoutStatusLabel(x.status)}</span></button>`).join('');
  $('#workoutWeekList').innerHTML=rowsHTML(weekRows)||'<div class="empty">Неделя свободна. Запланируй первое занятие кнопкой «＋ Тренировка».</div>';
  $('#workoutHistoryList').innerHTML=rowsHTML(weekRows.filter(x=>x.status==='done'||x.status==='missed'))||'<div class="empty">За эту неделю результатов пока нет.</div>';
  $$('[data-workout-week-edit]').forEach(b=>b.onclick=()=>{const x=workoutByUIId(b.dataset.workoutWeekEdit);if(x)openWorkoutDialog(x.date,x.id)});

  const selectedDate=new Date(workoutSelectedDate+'T12:00:00');
  $('#workoutSelectedDayTitle').textContent=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(selectedDate);
  $('#workoutSelectedDaySubtitle').textContent=workoutSelectedDate===todayISO?'сегодня':'выбранная дата';
  const selectedWorkouts=workoutsForDate(workoutSelectedDate);
  const selectedCalories=caloriesForDate(workoutSelectedDate);
  $('#selectedCaloriesTotal').textContent=kcalText(selectedCalories.reduce((a,b)=>a+Number(b.calories||0),0));

  $('#workoutListHint').textContent=selectedWorkouts.length?`${selectedWorkouts.filter(x=>x.status==='done').length} выполнено · ${selectedWorkouts.filter(x=>x.status==='planned').length} в плане`:'запланированные, выполненные и пропущенные';
  const workoutList=$('#workoutList');
  workoutList.innerHTML=selectedWorkouts.length?selectedWorkouts.map(x=>`<div class="workout-row ${x.calendarEventId?'is-calendar-derived':''}"><div class="workout-row-main"><strong>${escapeHTML(x.title)} ${x.calendarEventId?'<span class="workout-calendar-badge">из календаря</span>':''}</strong><div class="workout-row-meta"><span>${workoutTypeLabel(x.type)}</span><span>${workoutStatusLabel(x.status)}</span><span>${x.start||'—'}</span><span>${minutesText(Number(x.duration||0))}</span>${Number(x.caloriesBurned||0)?`<span>${kcalText(x.caloriesBurned)} сожжено</span>`:''}${x.note?`<details class="training-note"><summary>Заметка</summary><p>${escapeHTML(x.note)}</p></details>`:''}</div></div><details class="training-row-menu"><summary aria-label="Действия с тренировкой">⋯</summary><div class="row-actions"><button class="tiny-chip ${x.status==='planned'?'active':''}" data-workout-mark="planned" data-workout-id="${escapeHTML(x.id)}">План</button><button class="tiny-chip ${x.status==='done'?'active':''}" data-workout-mark="done" data-workout-id="${escapeHTML(x.id)}">Готово</button><button class="tiny-chip ${x.status==='missed'?'active':''}" data-workout-mark="missed" data-workout-id="${escapeHTML(x.id)}">Пропуск</button><button class="btn" data-workout-edit="${escapeHTML(x.id)}">Изм.</button>${x._calendarDerived?'':`<button class="btn danger" data-workout-del="${escapeHTML(x.id)}">×</button>`}</div></details></div>`).join(''):'<div class="empty training-rest"><strong>Свободный день</strong><span>Отдых или новая тренировка — выбирай свой ритм.</span></div>';
  $$('[data-workout-mark]').forEach(b=>b.onclick=()=>{if(setWorkoutStatus(b.dataset.workoutId,b.dataset.workoutMark)){renderWorkouts();renderCalendar();renderToday()}});
  $$('[data-workout-edit]').forEach(b=>b.onclick=()=>openWorkoutDialog(workoutSelectedDate,b.dataset.workoutEdit));
  $$('[data-workout-del]').forEach(b=>b.onclick=()=>{const item=db.workouts.find(x=>x.id===b.dataset.workoutDel); if(!item||!confirm(`Удалить запись результата «${item.title}»? Календарный план останется.`))return; db.workouts=db.workouts.filter(x=>x.id!==item.id); save(); renderWorkouts();renderCalendar()});

  const calorieList=$('#calorieList');
  calorieList.innerHTML=selectedCalories.length?selectedCalories.map(x=>`<div class="calorie-row"><div class="calorie-row-main"><strong>${escapeHTML(x.title)}</strong><div class="calorie-row-meta"><span>${kcalText(x.calories)}</span>${x.note?`<span>${escapeHTML(x.note)}</span>`:''}</div></div><div class="row-actions"><span class="calorie-total-pill">${kcalText(x.calories)}</span><button class="btn" data-calorie-edit="${escapeHTML(x.id)}">Изм.</button><button class="btn danger" data-calorie-del="${escapeHTML(x.id)}">×</button></div></div>`).join(''):'<div class="empty">На этот день калории ещё не записаны.</div>';
  $$('[data-calorie-edit]').forEach(b=>b.onclick=()=>openCalorieDialog(workoutSelectedDate,b.dataset.calorieEdit));
  $$('[data-calorie-del]').forEach(b=>b.onclick=()=>{const item=db.calories.find(x=>x.id===b.dataset.calorieDel); if(!item||!confirm(`Удалить запись «${item.title}»?`))return; db.calories=db.calories.filter(x=>x.id!==item.id); save(); renderWorkouts()});

  const latestWeights=[...db.weights].sort((a,b)=>String(b.date).localeCompare(String(a.date))||b.id.localeCompare(a.id)).slice(0,10);
  $('#weightBigValue').textContent=latest?kgText(latest.value):'—';
  $('#weightBigHint').textContent=latest?`последняя запись · ${latest.date}${latest.note?` · ${latest.note}`:''}`:'Добавь первую запись веса';
  const weightList=$('#weightList');
  weightList.innerHTML=latestWeights.length?latestWeights.map(x=>`<div class="weight-row"><div class="weight-row-main"><strong class="weight-zone-${x.zone||'green'}">${kgText(x.value)}</strong><div class="weight-row-meta"><span>${x.date}</span><span>${x.zone==='red'?'красная':x.zone==='yellow'?'жёлтая':'зелёная'} зона</span>${x.note?`<span>${escapeHTML(x.note)}</span>`:''}</div></div><div class="row-actions"><button class="btn" data-weight-edit="${escapeHTML(x.id)}">Изм.</button><button class="btn danger" data-weight-del="${escapeHTML(x.id)}">×</button></div></div>`).join(''):'<div class="empty">История веса пока пустая.</div>';
  $$('[data-weight-edit]').forEach(b=>b.onclick=()=>openWeightDialog(workoutSelectedDate,b.dataset.weightEdit));
  $$('[data-weight-del]').forEach(b=>b.onclick=()=>{const item=db.weights.find(x=>x.id===b.dataset.weightDel); if(!item||!confirm(`Удалить запись веса ${kgText(item.value)}?`))return; db.weights=db.weights.filter(x=>x.id!==item.id); save(); renderWorkouts()});

  const types=['home','outdoor','gym'];
  const typeBox=$('#workoutTypesStats');
  typeBox.innerHTML=types.map(type=>{const rows=weekWorkouts.filter(x=>x.type===type),done=rows.filter(x=>x.status==='done'),mins=done.reduce((a,b)=>a+Number(b.duration||0),0);return `<div class="workout-type-row"><div class="left"><span class="type-dot type-${type}"></span><div><strong>${workoutTypeLabel(type)}</strong><div class="small">${done.length} выполнено · ${rows.length} всего</div></div></div><strong>${minutesText(mins)}</strong></div>`}).join('');

}
$('#workoutPrevWeek')?.addEventListener('click',()=>{workoutWeekStart=new Date(workoutWeekStart);workoutWeekStart.setDate(workoutWeekStart.getDate()-7); if(!sameViewedWorkoutWeek(workoutSelectedDate)) workoutSelectedDate=iso(workoutWeekStart); renderWorkouts()});
$('#workoutNextWeek')?.addEventListener('click',()=>{workoutWeekStart=new Date(workoutWeekStart);workoutWeekStart.setDate(workoutWeekStart.getDate()+7); if(!sameViewedWorkoutWeek(workoutSelectedDate)) workoutSelectedDate=iso(workoutWeekStart); renderWorkouts()});
$('#workoutCurrentWeek')?.addEventListener('click',()=>{workoutWeekStart=startOfWeek(new Date()); workoutSelectedDate=todayISO; renderWorkouts()});
$('#addWorkoutGlobal')?.addEventListener('click',()=>openWorkoutDialog(workoutSelectedDate));
$('#addCaloriesGlobal')?.addEventListener('click',()=>openCalorieDialog(workoutSelectedDate));
$('#addWeightGlobal')?.addEventListener('click',()=>openWeightDialog(workoutSelectedDate));
$('#addWorkoutSelected')?.addEventListener('click',()=>openWorkoutDialog(workoutSelectedDate));
$('#addCaloriesSelected')?.addEventListener('click',()=>openCalorieDialog(workoutSelectedDate));
$('#addWeightSelected')?.addEventListener('click',()=>openWeightDialog(workoutSelectedDate));
$('#editHeightTop')?.addEventListener('click',()=>{showPage('workouts');setTimeout(()=>{$('#trainingHeightCm')?.scrollIntoView({behavior:'smooth',block:'center'});$('#trainingHeightCm')?.focus()},0)});
$('#editWeightTop')?.addEventListener('click',()=>{const latest=latestWeightEntry();openWeightDialog(latest?.date||todayISO,latest?.id||'')});
function renderBodyParameters(){
  $('#trainingHeightCm').value=Number(db.trainingSettings?.heightCm||0)||'';
  $('#profileHeightStatus').textContent=db.trainingSettings?.heightCm?'Рост сохранён в профиле':'';
}
function saveWeeklyTrainingGoal(){
  const goal=Number($('#trainingWeeklyGoal').value);
  if(!Number.isInteger(goal)||goal<1||goal>14){alert('Укажи от 1 до 14 тренировок в неделю.');return false}
  db.trainingSettings={...db.trainingSettings,weeklyGoal:goal};save();renderWorkouts();return true;
}
function saveProfileHeight(){
  const height=Number($('#trainingHeightCm').value);
  if(!Number.isInteger(height)||height<100||height>250){$('#profileHeightStatus').textContent='Укажи рост от 100 до 250 см.';return false}
  db.trainingSettings={...db.trainingSettings,heightCm:height};save();$('#profileHeightStatus').textContent='Рост сохранён в профиле';return true;
}
$('#saveTrainingSettings')?.addEventListener('click',saveWeeklyTrainingGoal);
$('#saveProfileHeight')?.addEventListener('click',saveProfileHeight);
$('#workoutParameters')?.addEventListener('click',()=>{showPage('settings');$('#profileBodyParameters').scrollIntoView({behavior:'smooth',block:'center'})});
function setWorkoutPanel(history){
  $('#workoutPlanPanel').hidden=history;$('#workoutHistoryPanel').hidden=!history;
  $('#workoutPlanTab').classList.toggle('active',!history);$('#workoutHistoryTab').classList.toggle('active',history);
  $('#workoutPlanTab').setAttribute('aria-selected',String(!history));$('#workoutHistoryTab').setAttribute('aria-selected',String(history));
}
$('#workoutPlanTab').addEventListener('click',()=>setWorkoutPanel(false));
$('#workoutHistoryTab').addEventListener('click',()=>setWorkoutPanel(true));
$('#workoutForm')?.addEventListener('submit',e=>{
  e.preventDefault();
  const f=e.target;
  const item={
    id:f.elements.id.value||uid(),calendarEventId:f.elements.calendarEventId.value||'',
    date:f.elements.date.value,start:f.elements.start.value||'19:00',title:f.elements.title.value.trim(),
    type:f.elements.type.value,status:f.elements.status.value,duration:Math.max(30,Number(f.elements.duration.value||60)),
    caloriesBurned:Number(f.elements.caloriesBurned.value||0),note:f.elements.note.value.trim()
  };
  if(!item.title){alert('Укажи название тренировки.');return}
  db.workouts=db.workouts.filter(x=>x.id!==item.id);
  db.workouts.push(item);
  syncWorkoutToCalendar(item);
  workoutSelectedDate=item.date;
  if(!sameViewedWorkoutWeek(item.date))workoutWeekStart=startOfWeek(new Date(item.date+'T12:00:00'));
  save('Тренировка и календарь обновлены');
  $('#workoutDialog').close();renderWorkouts();renderCalendar();renderToday();
});
$('#deleteWorkout')?.addEventListener('click',()=>{
  const id=$('#workoutForm').elements.id.value,item=db.workouts.find(x=>x.id===id);
  if(!item||!confirm(`Удалить результат тренировки «${item.title}»? Календарный блок останется.`))return;
  db.workouts=db.workouts.filter(x=>x.id!==id);
  save();$('#workoutDialog').close();renderWorkouts();renderCalendar();
});
$('#calorieForm')?.addEventListener('submit',e=>{e.preventDefault(); const f=e.target; const item={id:f.elements.id.value||uid(),date:f.elements.date.value,title:f.elements.title.value.trim(),calories:Number(f.elements.calories.value||0),note:f.elements.note.value.trim()}; if(!item.title||!item.calories){alert('Заполни запись и калории.'); return} db.calories=db.calories.filter(x=>x.id!==item.id); db.calories.push(item); workoutSelectedDate=item.date; if(!sameViewedWorkoutWeek(item.date)) workoutWeekStart=startOfWeek(new Date(item.date+'T12:00:00')); save(); $('#calorieDialog').close(); renderWorkouts()});
$('#deleteCalorie')?.addEventListener('click',()=>{const id=$('#calorieForm').elements.id.value; const item=db.calories.find(x=>x.id===id); if(!item||!confirm(`Удалить запись «${item.title}»?`))return; db.calories=db.calories.filter(x=>x.id!==id); save(); $('#calorieDialog').close(); renderWorkouts()});
$('#weightForm')?.addEventListener('submit',e=>{e.preventDefault(); const f=e.target; const item={id:f.elements.id.value||uid(),date:f.elements.date.value,value:Number(f.elements.value.value||0),zone:f.elements.zone.value||'green',note:f.elements.note.value.trim()}; if(!item.value){alert('Укажи вес.'); return} db.weights=db.weights.filter(x=>x.id!==item.id); db.weights.push(item); workoutSelectedDate=item.date; if(!sameViewedWorkoutWeek(item.date)) workoutWeekStart=startOfWeek(new Date(item.date+'T12:00:00')); save(); $('#weightDialog').close(); renderWorkouts()});
$('#deleteWeight')?.addEventListener('click',()=>{const id=$('#weightForm').elements.id.value; const item=db.weights.find(x=>x.id===id); if(!item||!confirm(`Удалить запись веса ${kgText(item.value)}?`))return; db.weights=db.weights.filter(x=>x.id!==id); save(); $('#weightDialog').close(); renderWorkouts()});

// Analytics never writes to db or invents completion/time records.
function analyticsEventId(entry){
  if(entry.calendarEventId)return entry.calendarEventId;
  const prefix='__calendar_focus__:',task=String(entry.taskId||'');
  return task.startsWith(prefix)?task.slice(prefix.length):'';
}
function analyticsEntryProject(entry){
  return entry.projectId||db.calendar.find(e=>e.id===analyticsEventId(entry))?.projectId||'';
}
function analyticsFocusMs(predicate=()=>true,start=-Infinity,end=Infinity,now=Date.now()){
  const intervals=[];let legacy=0;
  function add(entry){
    if(!predicate(entry))return;
    const a=Number(entry.startedAt),duration=Math.max(0,Number(entry.ms)||0),explicitEnd=Number(entry.endedAt);
    const z=explicitEnd>a?explicitEnd:a+duration;
    if(entry.startedAt!==null&&entry.startedAt!==undefined&&entry.startedAt!==''&&Number.isFinite(a)&&a>0&&Number.isFinite(z)&&z>a){
      const low=Math.max(start,a),high=Math.min(end,z,now);if(high>low)intervals.push([low,high]);
    }else if(entry.date){
      const day=new Date(entry.date+'T00:00:00').getTime();
      // Legacy duration-only records have no reliable time of day.
      if(Number.isFinite(day)&&day>=start&&day<end&&day<=now)legacy+=duration;
    }
  }
  for(const entry of db.timeEntries||[])add(entry);
  if(db.timer?.running&&db.timer.startedAt){
    const event=db.calendar.find(e=>e.id===analyticsEventId({taskId:db.timer.activeTaskId}));
    add({taskId:db.timer.activeTaskId,calendarEventId:event?.id||'',projectId:event?.projectId||'',startedAt:db.timer.startedAt,endedAt:now,ms:Math.max(0,now-db.timer.startedAt)});
  }
  intervals.sort((a,b)=>a[0]-b[0]);let total=legacy,low=null,high=null;
  for(const [a,z] of intervals){if(low===null){low=a;high=z}else if(a<=high)high=Math.max(high,z);else{total+=high-low;low=a;high=z}}
  if(low!==null)total+=high-low;return total;
}
function analyticsMoney(rows){
  let income=0,expense=0;
  for(const row of rows){const amount=Number(row.amount)||0;if(row.type==='income')income+=amount;else if(row.type==='expense')expense+=amount}
  return {income,expense,net:income-expense};
}
function weeklyAnalyticsRange(startDate,now=new Date()){
  const start=startOfWeek(startDate),fullEnd=new Date(start);fullEnd.setDate(fullEnd.getDate()+7);
  const isCurrent=now>=start&&now<fullEnd,isFuture=now<start;
  const days=isCurrent?(now.getDay()+6)%7+1:7,end=new Date(start);end.setDate(end.getDate()+days);
  const previousStart=new Date(start);previousStart.setDate(previousStart.getDate()-7);
  const previousEnd=new Date(previousStart);previousEnd.setDate(previousEnd.getDate()+days);
  return {start,end,previousStart,previousEnd,days,isCurrent,isFuture};
}
function weeklyAnalytics(start,end,now=Date.now()){
  const startMs=start.getTime(),endMs=end.getTime(),startISO=iso(start),endISO=iso(end);
  let tasks=0,legacyCompletions=0;
  for(const e of db.calendar){
    if(!e.projectId||!db.projects.some(p=>p.id===e.projectId)||calendarEventStatus(e)!=='done')continue;
    const completed=Date.parse(e.completedAt||'');
    if(Number.isFinite(completed)){if(completed>=startMs&&completed<endMs&&completed<=now)tasks++}
    else if(e.date>=startISO&&e.date<endISO&&new Date(e.date+'T00:00:00').getTime()<=now){tasks++;legacyCompletions++}
  }
  const money=analyticsMoney(db.money.filter(x=>x.date>=startISO&&x.date<endISO&&new Date(x.date+'T00:00:00').getTime()<=now));
  const last=new Date(end);last.setDate(last.getDate()-1);
  const workouts=allWorkoutsInRange(startISO,iso(last)).filter(x=>x.status==='done'&&new Date(x.date+'T00:00:00').getTime()<=now).length;
  return {tasks,legacyCompletions,focus:analyticsFocusMs(()=>true,startMs,endMs,now),...money,workouts};
}
function analyticsDifference(current,previous,format){
  const delta=current-previous;
  if(Math.abs(delta)<.0001)return 'Без изменений';
  return `${delta>0?'+':'−'}${format(Math.abs(delta))} к прошлой неделе`;
}
function analyticsMetric(label,value,hint=''){
  return `<div class="analytics-metric"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong>${hint?`<small>${escapeHTML(hint)}</small>`:''}</div>`;
}
function renderWeeklySummary(){
  const box=$('#weeklySummary');if(!box)return;
  const now=new Date(),range=weeklyAnalyticsRange(historyWeekStart,now),current=weeklyAnalytics(range.start,range.end,now.getTime()),previous=weeklyAnalytics(range.previousStart,range.previousEnd,now.getTime());
  const entries=[['Выполнено подзадач','tasks',n=>String(n)],['Фактическое время','focus',n=>minutesText(Math.round(n/60000))],['Поступило','income',fmt],['Потрачено','expense',fmt],['Доходы − расходы','net',fmt],['Выполнено тренировок','workouts',n=>String(n)]];
  const dateFormat=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'}),last=new Date(range.previousEnd);last.setDate(last.getDate()-1);
  const compareLabel=`${dateFormat.format(range.previousStart)} — ${dateFormat.format(last)}`;
  box.innerHTML='<div class="analytics-grid">'+entries.map(([label,key,format])=>analyticsMetric(label,format(current[key]),range.isFuture?'Неделя ещё не началась':analyticsDifference(current[key],previous[key],format))).join('')+'</div>'+
    `<p class="analytics-caption">${range.isFuture?'Фактические показатели появятся после начала недели.':`${range.isCurrent?'Итог с понедельника по сегодня. Сравниваем одинаковые дни недели':'Итог за полную неделю. Сравнение с предыдущей неделей'}: ${compareLabel}.`} Учитываются записанное время и операции; переводы в накопления исключены.${current.legacyCompletions||previous.legacyCompletions?' Для старых выполненных подзадач без даты выполнения используется дата в календаре.':''}</p>`;
}
function projectAnalytics(projectId,now=Date.now()){
  const focus=analyticsFocusMs(x=>analyticsEntryProject(x)===projectId,-Infinity,Infinity,now);
  const money=analyticsMoney(db.money.filter(x=>x.projectId===projectId&&new Date(x.date+'T00:00:00').getTime()<=now));
  return {...money,focus,rate:focus>0?money.income/(focus/3600000):null,progress:projectCompletion(projectId)};
}
function renderProjectAnalytics(projectId){
  const card=$('#projectAnalyticsCard'),box=$('#projectAnalytics');if(!card||!box)return;
  const project=db.projects.find(x=>x.id===projectId);card.hidden=!project;if(!project)return;
  const m=projectAnalytics(projectId),p=m.progress;
  box.innerHTML='<div class="analytics-grid">'+
    analyticsMetric('Готовность',p.percent+'%',`${p.done} из ${p.total} подзадач`)+
    analyticsMetric('Записанное время',m.focus>0?minutesText(Math.round(m.focus/60000)):'—')+
    analyticsMetric('Поступило',fmt(m.income))+analyticsMetric('Расходы задачи',fmt(m.expense))+
    analyticsMetric('Доходы − расходы',fmt(m.net))+
    analyticsMetric('Поступления на час',m.rate===null?'—':fmt(m.rate)+'/ч')+'</div>'+
    '<p class="analytics-caption">За всё время: таймер и ручные записи, операции с привязкой к этой задаче. Будущие операции и переводы в накопления исключены. Поступления на час — отношение полученных денег к записанному времени.</p>';
}
function eventPlanActual(event,now=Date.now()){
  const planned=event.date&&event.start&&event.end?Math.max(0,eventEndMins(event)-mins(event.start))*60000:0;
  const actual=analyticsFocusMs(x=>analyticsEventId(x)===event.id,-Infinity,Infinity,now);
  const running=!!(db.timer?.running&&analyticsEventId({taskId:db.timer.activeTaskId})===event.id);
  return {planned,actual,delta:actual-planned,running};
}
function eventDeviationCopy(m){
  if(!m.actual)return '—';
  if(Math.abs(m.delta)<60000)return 'По плану';
  const time=minutesText(Math.round(Math.abs(m.delta)/60000));
  return m.delta>0?`+${time} к плану`:m.running?`До плана ${time}`:`−${time} от плана`;
}
function eventPlanActualLabel(m){return `План ${minutesText(Math.round(m.planned/60000))} · Факт ${m.actual?minutesText(Math.round(m.actual/60000)):'не записан'}${m.actual?' · '+eventDeviationCopy(m):''}`}
function renderEventPlanActual(event,box){
  if(!box)return;box.hidden=!event?.id||!event.date;if(box.hidden)return;
  const m=eventPlanActual(event);
  box.innerHTML=`<div class="plan-actual-grid"><div><span>План</span><strong>${minutesText(Math.round(m.planned/60000))}</strong></div><div><span>Факт${m.running?' · таймер идёт':''}</span><strong>${m.actual?minutesText(Math.round(m.actual/60000)):'—'}</strong></div><div><span>Отклонение</span><strong>${eventDeviationCopy(m)}</strong></div></div><div class="plan-actual-foot"><span>Таймер и ручные записи этого события</span><button type="button" class="tiny-btn" data-record-event-time="${escapeHTML(event.id)}">＋ Записать время</button></div>`;
  $$('[data-record-event-time]',box).forEach(b=>b.onclick=()=>openEventTimeEntry(b.dataset.recordEventTime));
}
function openEventTimeEntry(eventId){
  const event=db.calendar.find(e=>e.id===eventId);if(!event)return;
  const f=$('#focusManualForm');f.reset();f.elements.date.value=event.date;f.elements.startTime.value=event.start;
  const taskId=calendarFocusId(event.id);$('#focusManualTask').innerHTML=`<option value="${escapeHTML(taskId)}">${escapeHTML(event.title)}</option>`;$('#focusManualTask').value=taskId;
  $('#focusManualDialog').showModal();
}
function refreshAnalyticsViews(){
  if($('#page-archive')?.classList.contains('active'))renderWeeklySummary();
  if($('#page-projects')?.classList.contains('active'))renderProjectAnalytics(selectedProjectId);
  if($('#projectNoteDialog')?.open)renderEventPlanActual(db.calendar.find(e=>e.id===activeProjectNoteId),$('#projectNotePlanActual'));
  if($('#eventDialog')?.open){const event=db.calendar.find(e=>e.id===activeEventId),f=$('#eventForm');if(event)renderEventPlanActual({...event,start:f.elements.start.value||event.start,end:f.elements.end.value||event.end},$('#eventPlanActual'))}
}

function renderArchive(){
  renderWeeklySummary();
  const start=new Date(historyWeekStart),end=new Date(start);end.setDate(end.getDate()+7);
  const startISO=iso(start),endISO=iso(end),currentStart=startOfWeek(new Date());
  const important=db.calendar
    .filter(e=>e.date>=startISO&&e.date<endISO&&TODAY_ATTENTION_CATEGORIES.has(e.category))
    .sort((a,b)=>(a.date+a.start).localeCompare(b.date+b.start));
  const done=important.filter(e=>calendarEventStatus(e)==='done').length;
  const plannedMinutes=important.reduce((sum,e)=>sum+Math.max(0,eventEndMins(e)-mins(e.start)),0);
  const focusMs=totalFocusMs(startISO,endISO);

  const spendRows=db.food.filter(x=>x.date>=startISO&&x.date<endISO),spend=foodSpendSummary(spendRows);
  const workoutEndDate=nextISODate(endISO,-1);const workoutRows=allWorkoutsInRange(startISO,workoutEndDate);
  const workoutDone=workoutRows.filter(x=>x.status==='done').length,weeklyGoal=Math.max(1,Number(db.trainingSettings?.weeklyGoal||4));
  const weights=db.weights.filter(x=>x.date>=startISO&&x.date<endISO).sort((a,b)=>a.date.localeCompare(b.date));
  const weightCopy=weights.length===0?'—':weights.length===1?kgText(weights[0].value):`${kgText(weights[0].value)} → ${kgText(weights.at(-1).value)}`;

  const f=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'});
  $('#historyWeekLabel').textContent=`${f.format(start)} — ${f.format(new Date(end.getTime()-86400000))}`;
  $('#historyWeekState').textContent=start.getTime()===currentStart.getTime()?'текущая неделя':(start<currentStart?'завершённая неделя':'будущая неделя');
  $('#historyWorkBlocks').textContent=`${done} / ${important.length}`;
  $('#historyPlannedWork').textContent=minutesText(plannedMinutes);
  $('#historyFocus').textContent=msHoursText(focusMs);
  $('#historyEverydaySpend').textContent=fmt(spend.limited);
  $('#historyOutsideSpend').textContent=`вне повседневной рамки ${fmt(spend.outside)}`;
  $('#historyWorkouts').textContent=String(workoutDone);
  $('#historyWorkoutGoal').textContent=`цель недели ${weeklyGoal}`;
  $('#historyWeight').textContent=weightCopy;

  const groups=Object.create(null);
  db.timeEntries.filter(x=>x.date>=startISO&&x.date<endISO).forEach(x=>{
    const p=x.projectId?db.projects.find(p=>p.id===x.projectId):null,key=p?.id||'__none__';
    groups[key]??={name:p?.name||x.projectName||'Без задачи',color:p?.color||'#71717a',ms:0};
    groups[key].ms+=Number(x.ms||0);
  });
  const projectRows=Object.values(groups).filter(x=>x.ms>0).sort((a,b)=>b.ms-a.ms);
  $('#historyProjectBreakdown').innerHTML=projectRows.length
    ?projectRows.slice(0,8).map(x=>`<span class="history-project-chip"><i class="dot" style="background:${escapeHTML(/^#[0-9a-f]{6}$/i.test(x.color||'')?x.color:'#71717a')}"></i>${escapeHTML(x.name)} · <strong>${msHoursText(x.ms)}</strong></span>`).join('')
    :'<span class="small">За неделю ещё нет записанного фокус-времени по проектам.</span>';

  $('#historyBlockCount').textContent=`${important.length} блоков`;
  $('#historyBlocks').innerHTML=important.length?important.map(e=>{
    const p=e.projectId?db.projects.find(x=>x.id===e.projectId):null;
    return `<div class="history-row">
      <i class="history-row-status ${calendarEventStatus(e)==='done'?'done':'open'}"></i>
      <div class="history-row-copy"><strong>${escapeHTML(e.title)}</strong><span>${e.date} · ${e.start}–${e.end} · ${escapeHTML(categoryLabels[e.category]||'Другое')}${p?' · '+escapeHTML(p.name):''}</span></div>
      <span class="history-row-value">${calendarEventStatusLabel(calendarEventStatus(e))}</span>
    </div>`;
  }).join(''):'<div class="empty">На этой неделе нет рабочих блоков.</div>';

  const sessions=db.timeEntries.filter(x=>x.date>=startISO&&x.date<endISO).sort((a,b)=>Number(b.startedAt||0)-Number(a.startedAt||0)).slice(0,50);
  $('#historySessionCount').textContent=`${sessions.length} сессий`;
  $('#historySessions').innerHTML=sessions.length?sessions.map(x=>{
    const p=x.projectId?db.projects.find(p=>p.id===x.projectId):null;
    const time=x.startedAt?new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date(Number(x.startedAt))):'—';
    return `<div class="history-row">
      <i class="history-row-status done"></i>
      <div class="history-row-copy"><strong>${escapeHTML(x.taskTitle||'Свободный фокус')}</strong><span>${x.date} · ${time}${(p?.name||x.projectName)?' · '+escapeHTML(p?.name||x.projectName):''}</span></div>
      <span class="history-row-value">${clock(x.ms)}</span>
    </div>`;
  }).join(''):'<div class="empty">За эту неделю нет фокус-сессий.</div>';

  const projects=db.projects.filter(p=>p.archived);
  $('#archiveProjectCount').textContent=projects.length;
  $('#archiveProjects').innerHTML=projects.length?projects.map(p=>`<div class="archive-row"><div><strong><i class="dot" style="background:${escapeHTML(/^#[0-9a-f]{6}$/i.test(p.color||'')?p.color:'#6366f1')};display:inline-block;margin-right:6px"></i>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.description||'Без описания')}</small></div><button class="tiny-btn" data-restore-project="${escapeHTML(p.id)}">Вернуть</button><button class="tiny-btn danger" data-archive-delete-project="${escapeHTML(p.id)}">Удалить</button></div>`).join(''):'<div class="empty">Архивных задач нет.</div>';
  $$('[data-restore-project]').forEach(b=>b.onclick=()=>{const p=db.projects.find(x=>x.id===b.dataset.restoreProject);if(p){p.archived=false;save();renderArchive();renderProjects();renderSidebarProjects()}});
  $$('[data-archive-delete-project]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.archiveDeleteProject,p=db.projects.find(x=>x.id===id);
    if(!p||!confirm(`Удалить задачу «${p.name}» окончательно? Связанные записи останутся без привязки.`))return;
    const removed=db.projects.find(x=>x.id===id);
    db.projects=db.projects.filter(x=>x.id!==id);
    db.calendar.forEach(e=>{if(e.projectId===id)e.projectId=''});
    db.money.forEach(m=>{if(m.projectId===id)m.projectId=''});
  (db.portfolioWorks||[]).forEach(w=>{if(w.projectId===id)w.projectId=''});
    (db.learningSkills||[]).forEach(w=>{if(w.projectId===id)w.projectId=''});
    db.timeEntries.forEach(x=>{if(x.projectId===id){x.projectName=x.projectName||removed?.name||'';x.projectId=''}});
    if(selectedProjectId===id)selectedProjectId='';
    save();renderArchive();renderProjects();renderSidebarProjects();
  });
}$('#historyPrevWeek')?.addEventListener('click',()=>{historyWeekStart=new Date(historyWeekStart);historyWeekStart.setDate(historyWeekStart.getDate()-7);renderArchive()});
$('#historyNextWeek')?.addEventListener('click',()=>{historyWeekStart=new Date(historyWeekStart);historyWeekStart.setDate(historyWeekStart.getDate()+7);renderArchive()});
$('#historyCurrentWeek')?.addEventListener('click',()=>{historyWeekStart=startOfWeek(new Date());renderArchive()});
$$('[data-more-page]').forEach(b=>b.onclick=()=>showPage(b.dataset.morePage));

document.addEventListener('keydown',e=>{
  const editable=e.target?.matches?.('input,textarea,select,[contenteditable="true"]');
  const mod=e.metaKey||e.ctrlKey;
  if(!mod||editable)return;
  const key=String(e.key||'').toLowerCase();

  if(key==='z'){
    e.preventDefault();
    if(e.shiftKey)redoLastAction(); else undoLastAction();
    return;
  }

  if(key==='n'){
    e.preventDefault();openEventDialog({date:todayISO,start:'19:00',end:'20:00',category:'project'});return;
  }
  if(key==='p'){
    e.preventDefault();showPage('today');setTimeout(()=>$('#focusTaskSelect')?.focus(),0);return;
  }
  if(key==='c'){
    e.preventDefault();showPage('calendar');return;
  }
});

$('#undoAction')?.addEventListener('click',undoLastAction);
$('#redoAction')?.addEventListener('click',redoLastAction);

let calendarWeekStart = startOfWeek(new Date());
const categoryLabels=calendarCategoryLabels;
const CALENDAR_PRESETS={
  lunch:{title:'Обед',category:'food',duration:60,defaultStart:'14:00',defaultEnd:'15:00'},
  'to-work':{title:'Путь до работы',category:'commute',duration:60,defaultStart:'08:00',defaultEnd:'09:00'},
  'to-home':{title:'Путь до дома',category:'commute',duration:60,defaultStart:'18:00',defaultEnd:'19:00'},
  training:{title:'Тренировка',category:'sport',duration:90,defaultStart:'19:00',defaultEnd:'20:30'},
  work:{title:'Работа',category:'work',duration:60,defaultStart:'09:00',defaultEnd:'10:00'},
  sleep:{title:'Сон',category:'rest',duration:480,defaultStart:'23:00',defaultEnd:'07:00',allowOvernight:true},
  project:{title:'Проект',category:'project',duration:60,defaultStart:'19:00',defaultEnd:'20:00'}
};
const CALENDAR_CATEGORY_COLORS=DEFAULT_CALENDAR_CATEGORY_COLORS;
function getCalendarPreset(presetId){
  return CALENDAR_PRESETS[presetId]||db.customCalendarPresets.find(x=>x.id===presetId)||null;
}
function renderCalendarPresetTray(){
  const tray=$('#calendarPresetTray');if(!tray)return;
  const hidden=new Set(db.hiddenCalendarPresets||[]);
  const base=Object.entries(CALENDAR_PRESETS).filter(([id])=>!hidden.has(id)).map(([id,p])=>`
    <button type="button" draggable="true" class="calendar-preset" data-calendar-preset="${id}">
      <i style="background:${calendarCategoryColor(p.category)}"></i>
      <span>${escapeHTML(p.title)}</span><small>${p.defaultStart}–${p.defaultEnd}</small>
    </button>`).join('');
  const custom=db.customCalendarPresets.map(p=>`
    <button type="button" draggable="true" class="calendar-preset custom" data-calendar-preset="${escapeHTML(p.id)}">
      <i style="background:${calendarCategoryColor(p.category)}"></i>
      <span>${escapeHTML(p.title)}</span><small>${minutesText(Number(p.duration||60))}</small>
    </button>`).join('');
  tray.innerHTML=base+custom+`<button type="button" class="calendar-preset calendar-preset-add" id="addCalendarPreset">＋ Свой блок</button>`;
}
function calendarPresetFallbackDate(){
  if(calendarView==='day')return iso(calendarDay);
  if(calendarView==='month'){
    const now=new Date();
    return (calendarMonth.getFullYear()===now.getFullYear()&&calendarMonth.getMonth()===now.getMonth())?todayISO:iso(new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1));
  }
  return inViewedWeek(todayISO)?todayISO:iso(calendarWeekStart);
}
function createCalendarPresetAt(presetId,date,start,openEditor=false){
  const preset=getCalendarPreset(presetId);
  if(!preset)return false;
  const st=mins(start||preset.defaultStart);
  const dow=new Date(date+'T12:00:00').getDay();
  const close=[0,6].includes(dow)?1440:1380;
  const endMinute=st+Number(preset.duration||60);
  if(!preset.allowOvernight && endMinute>close){
    alert(`Блок «${preset.title}» не помещается до конца доступного времени этого дня.`);
    return false;
  }
  const event={
    id:uid(),
    title:preset.title,
    category:normalizeCalendarCategory(preset.category),
    date,
    start:hhmm(st),
    end:hhmm(endMinute),
    note:'',
    projectId:'',
    taskId:'',
    presetId
  };
  db.calendar.push(event);
  save(`Добавлен блок «${preset.title}»`);
  renderCalendar();
  renderToday();
  if(openEditor)setTimeout(()=>openEventDialog({id:event.id}),0);
  return true;
}
function projectName(id){return db.projects.find(p=>p.id===id)?.name||'Без задачи'}
function renderSidebarProjects(){
  const box=$('#sidebarProjects'); if(!box)return;
  const active=db.projects.filter(p=>!p.archived); box.innerHTML=active.length?active.slice(0,8).map(p=>`<button class="project-chip" data-sidebar-project="${escapeHTML(p.id)}" style="border:0;background:transparent;width:100%;text-align:left"><span class="dot" style="background:${escapeHTML(/^#[0-9a-f]{6}$/i.test(p.color||'')?p.color:'#6366f1')}"></span>${escapeHTML(p.name)}</button>`).join(''):'<div class="project-chip muted">Проектов пока нет</div>';
  $$('[data-sidebar-project]',box).forEach(b=>b.onclick=()=>{showPage('projects',{projectId:b.dataset.sidebarProject});setTimeout(()=>document.querySelector(`[data-project-card="${b.dataset.sidebarProject}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),0)});
}
let showArchivedProjects=false;let selectedProjectId='';
function projectNotePreview(note){return String(note||'').replace(/\s+/g,' ').trim().slice(0,160)}
const TASK_AREA_TYPES={
  goal:{label:'Цель',finite:true,category:'project',help:'Конкретный результат. Готовность считается по выполненным подзадачам.'},
  project:{label:'Проект',finite:true,category:'project',help:'Проект с результатом и подзадачами. Готовность считается по их выполнению.'},
  work:{label:'Работа',finite:true,category:'work',help:'Рабочие задачи: готовность считается по выполненным подзадачам.'},
  learning:{label:'Обучение',finite:true,category:'study',help:'Курсы и навыки: разбей обучение на подзадачи и отслеживай готовность.'},
  health:{label:'Здоровье',finite:true,retired:true,category:'personal',help:'Забота о себе и регулярные полезные действия.'},
  creativity:{label:'Творчество',finite:true,category:'project',help:'Творческая задача: готовность считается по выполненным подзадачам.'},
  personal:{label:'Личное',finite:true,retired:true,category:'personal',help:'Личные дела, быт и повседневные заботы.'},
  finance:{label:'Финансы',finite:true,retired:true,category:'personal',help:'Регулярные действия для порядка в финансах.'}
};
function taskAreaType(area){return Object.hasOwn(TASK_AREA_TYPES,area?.directionType)?area.directionType:'project'}
function taskAreaEvents(areaId){
  const events=db.calendar.filter(e=>e.projectId===areaId),ids=new Set(events.map(e=>e.id));
  return events.filter(e=>!(calendarEventStatus(e)==='moved'&&e.movedToEventId&&ids.has(e.movedToEventId)));
}
function calendarCompletionStamp(existing,status){
  if(status!=='done')return '';
  return existing&&calendarEventStatus(existing)==='done'?(existing.completedAt||''):new Date().toISOString();
}
function updateTaskAreaTypeHelp(){const type=$('#taskAreaType')?.value||'project',config=TASK_AREA_TYPES[type]||TASK_AREA_TYPES.project;$('#taskAreaTypeHelp').textContent=config.retired?'Старый тип сохранён для этой записи. Можно выбрать один из пяти актуальных типов.':config.help}
$('#taskAreaType').addEventListener('change',updateTaskAreaTypeHelp);
function projectCompletion(projectId){
  const tasks=taskAreaEvents(projectId);
  const total=tasks.length,done=tasks.filter(e=>calendarEventStatus(e)==='done').length;
  return {total,done,active:total-done,percent:total?Math.round(done/total*100):0};
}
function projectCardIcon(name){
  const label=String(name||'').toLowerCase();
  let paths='<path d="M3 7h7l2 2h9v11H3z"/><path d="M3 7V4h7l2 3"/>';
  if(label.includes('youtube'))paths='<rect x="2" y="5" width="20" height="14" rx="4"/><path d="m10 9 5 3-5 3z"/>';
  else if(label.includes('tutor')||label.includes('учеб'))paths='<path d="m2 9 10-6 10 6-10 6z"/><path d="M6 12v6c4 3 8 3 12 0v-6M22 9v8"/>';
  else if(label.includes('фриланс')||label.includes('freelance'))paths='<rect x="3" y="7" width="18" height="14" rx="3"/><path d="M8 7V4h8v3M3 12c6 4 12 4 18 0M12 12v4"/>';
  else if(label.includes('planner')||label.includes('планер'))paths='<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 11h18M8 15h1M15 15h1M8 18h1"/>';
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}
let showCompletedSubtasks=false;
$('#toggleCompletedSubtasks').onclick=()=>{showCompletedSubtasks=!showCompletedSubtasks;renderProjects()};
function projectSubtaskScheduleLabel(event){return event.date?`${event.date} · ${event.start}–${event.end}`:'Без расписания'}
function renderProjects(){
  renderSidebarProjects();
  const grid=$('#projectsGrid'),list=$('#projectTasksList');if(!grid||!list)return;
  if(selectedProjectId&&!db.projects.some(p=>p.id===selectedProjectId&&(showArchivedProjects||!p.archived)))selectedProjectId='';
  const selected=db.projects.find(p=>p.id===selectedProjectId);
  $('#toggleCompletedSubtasks').textContent=showCompletedSubtasks?'Скрыть выполненные':'Показать выполненные';$('#toggleCompletedSubtasks').setAttribute('aria-pressed',String(showCompletedSubtasks));
  renderProjectAnalytics(selected?.id||'');
  const query=($('#projectSearch').value||'').trim().toLocaleLowerCase('ru');
  const matches=value=>String(value||'').toLocaleLowerCase('ru').includes(query);
  $('#projectsTitle').textContent=selected?selected.name:'Задачи';
  $('#projectsSubtitle').textContent=selected?(selected.description||'Подзадачи и заметки · связь с календарём'):'Цели, проекты и задачи — с понятным прогрессом';
  $('#projectsBack').hidden=!selected;
  $('#editSelectedProject').hidden=!selected;
  $('#newProjectBlock').hidden=!selected;
  $('#newProjectBlock').textContent=selected&&readProjectNoteDraft(selected.id)?'Продолжить черновик':'＋ Подзадача';
  grid.hidden=!!selected;
  const projects=db.projects.filter(p=>(showArchivedProjects||!p.archived)&&(!query||matches(p.name)||matches(p.description)||db.calendar.some(e=>e.projectId===p.id&&(matches(e.title)||matches(e.note)))));
  grid.innerHTML=projects.length?projects.map(p=>{
    const progress=projectCompletion(p.id),type=TASK_AREA_TYPES[taskAreaType(p)],color=/^#[0-9a-f]{6}$/i.test(p.color||'')?p.color:'#6366f1';
    return `<article class="project-overview-card" style="--project-color:${color}">
      <button class="project-overview-open" data-project-card="${escapeHTML(p.id)}" aria-label="Открыть задачу ${escapeHTML(p.name)}">
        <span class="project-overview-head"><span class="project-overview-icon" aria-hidden="true">${projectCardIcon(p.name)}</span><span class="project-overview-copy"><span class="task-area-type-label">${type.label}</span><strong>${escapeHTML(p.name)}</strong><span>${escapeHTML(p.description||'Задачи и заметки')}${p.archived?' · архив':''}</span></span></span>
        <span class="project-overview-body"><span class="project-active-count"><strong>${progress.active}</strong><span>Активные подзадачи</span></span>
          ${`          <span class="project-readiness"><span class="project-progress-ring" role="progressbar" aria-label="Готовность" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress.percent}" aria-valuetext="Выполнено ${progress.done} из ${progress.total} задач">
            <svg viewBox="0 0 120 120" aria-hidden="true"><circle class="project-ring-track" cx="60" cy="60" r="50"/><circle class="project-ring-value" cx="60" cy="60" r="50" pathLength="100" stroke-dasharray="${progress.percent} 100" style="opacity:${progress.percent?1:0}"/></svg><strong>${progress.percent}%</strong></span><span>Готовность</span></span>`}
        </span>
        <span class="project-completion-detail">${progress.total?`Выполнено ${progress.done} из ${progress.total} подзадач`:'Добавь первую подзадачу'}</span>
      </button>
      <button class="project-overview-menu" data-edit-project="${escapeHTML(p.id)}" aria-label="Настройки задачи ${escapeHTML(p.name)}">•••</button>
    </article>`;
  }).join(''):'<div class="empty">'+(query?'Ничего не найдено.':'Создай первую задачу.')+'</div>';
  const areaEventIds=new Set(db.projects.flatMap(area=>taskAreaEvents(area.id)).map(event=>event.id));
  const rows=db.calendar.filter(e=>areaEventIds.has(e.id)&&(showCompletedSubtasks||calendarEventStatus(e)!=='done')&&db.projects.some(p=>p.id===e.projectId&&(showArchivedProjects||!p.archived))&&(!selected||e.projectId===selected.id)&&(!query||matches(e.title)||matches(e.note))).sort((a,b)=>{
    const ad=calendarEventStatus(a)==='done',bd=calendarEventStatus(b)==='done';if(ad!==bd)return ad?1:-1;
    return (a.date+(a.start||'')).localeCompare(b.date+(b.start||''));
  });
  $('#projectNotesCard').hidden=!selected;
  $('#projectTaskScope').textContent=selected?`${rows.filter(e=>calendarEventStatus(e)!=='done').length} активных подзадач · готовность ${projectCompletion(selected.id).percent}%`:`Найдено подзадач: ${rows.length}`;
  list.innerHTML=rows.length?rows.map(e=>`<div class="project-note-row ${calendarEventStatus(e)==='done'?'is-done':''}"><input type="checkbox" aria-label="Выполнено: ${escapeHTML(e.title)}" data-project-block-done="${escapeHTML(e.id)}" ${calendarEventStatus(e)==='done'?'checked':''}><button class="project-note-open" data-project-note="${escapeHTML(e.id)}"><strong>${escapeHTML(e.title)}</strong><small>${escapeHTML(projectSubtaskScheduleLabel(e))}${selected?'':' · '+escapeHTML(projectName(e.projectId))}</small><small>${escapeHTML(projectNotePreview(e.note)||'Нет дополнительного текста')}</small></button><span class="muted" aria-hidden="true">›</span></div>`).join(''):'<div class="empty">'+(query?'Задачи не найдены.':'Пока нет подзадач. Нажми «＋ Подзадача».')+'</div>';
  $$('[data-project-card]',grid).forEach(b=>b.onclick=()=>{selectedProjectId=b.dataset.projectCard;$('#projectSearch').value='';renderProjects()});
  $$('[data-edit-project]',grid).forEach(b=>b.onclick=()=>openProjectDialog(b.dataset.editProject));
  $$('[data-project-note]',list).forEach(b=>b.onclick=()=>openProjectNote(b.dataset.projectNote));
  $$('[data-project-block-done]',list).forEach(c=>c.onchange=()=>{if(setCalendarEventDone(c.dataset.projectBlockDone,c.checked)){renderProjects();renderToday();renderCalendar();renderFocusPage()}});
}
let activeProjectNoteId='',projectNoteSaveTimer=null,projectNoteDirty=false,activeProjectDraft=null;
let projectNoteOwner='';
function projectNoteDraftKey(projectId,accountKey=profileStorageKey()){
  return 'artemPlanner.projectNoteDraft.v1:'+accountKey+':'+projectId;
}
function readProjectNoteDraft(projectId){
  try{
    const draft=JSON.parse(localStorage.getItem(projectNoteDraftKey(projectId))||'null');
    if(!draft||draft.accountKey!==profileStorageKey()||draft.event?.projectId!==projectId||typeof draft.event.id!=='string'||db.calendar.some(e=>e.id===draft.event.id))return null;
    return draft;
  }catch{return null}
}
function projectNoteEvent(){
  return activeProjectDraft?.event||db.calendar.find(e=>e.id===activeProjectNoteId);
}
function fillProjectNoteEditor(event,creating){
  projectNoteOwner=plannerScope;
  $('#projectNoteCommit').textContent=creating?'Создать':'Готово';
  $('#projectNoteClose').textContent=creating?'‹ Отложить':'‹ Назад';
  $('#projectNoteCalendar').hidden=creating||!event.date;
  $('#projectNoteSchedule').textContent=event.date?'Изменить расписание':'Добавить в календарь';
  $('#projectNoteNextDay').hidden=creating||!event.date||!['planned','missed'].includes(calendarEventStatus(event));
  $('#projectNoteDelete').hidden=creating;
  $('#projectNoteDiscard').hidden=!creating;
  $('#projectNoteTitle').value=event.title||'';$('#projectNoteBody').value=event.note||'';
  $('#projectNoteDone').checked=calendarEventStatus(event)==='done';
  $('#projectNoteInfo').textContent=creating?`${projectName(event.projectId)} · новая подзадача`:`${projectName(event.projectId)} · ${projectSubtaskScheduleLabel(event)}`;
  $('#projectNoteSaveStatus').textContent=creating?'Черновик · нажми «Создать», чтобы добавить задачу':'Сохранено на устройстве';
  renderEventPlanActual(creating?null:event,$('#projectNotePlanActual'));
  if(!$('#projectNoteDialog').open)$('#projectNoteDialog').showModal();
}
function openProjectNote(id){
  if(activeProjectNoteId&&!flushProjectNote())return false;
  const event=db.calendar.find(e=>e.id===id);if(!event)return false;
  activeProjectDraft=null;activeProjectNoteId=id;projectNoteDirty=false;
  fillProjectNoteEditor(event,false);return true;
}
function beginProjectNote(){
  const project=db.projects.find(p=>p.id===selectedProjectId);if(!project)return false;
  if(activeProjectNoteId&&!flushProjectNote())return false;
  activeProjectDraft=readProjectNoteDraft(project.id)||{accountKey:profileStorageKey(),event:{id:uid(),title:'',date:'',start:'',end:'',unscheduled:true,category:TASK_AREA_TYPES[taskAreaType(project)].category,projectId:project.id,taskId:'',note:'',status:'planned',done:false}};
  Object.assign(activeProjectDraft.event,{date:'',start:'',end:'',unscheduled:true});
  activeProjectNoteId=activeProjectDraft.event.id;projectNoteDirty=false;
  fillProjectNoteEditor(activeProjectDraft.event,true);$('#projectNoteTitle').focus();return true;
}
function flushProjectNote(){
  clearTimeout(projectNoteSaveTimer);
  if(!activeProjectNoteId||!projectNoteDirty)return true;
  if(projectNoteOwner!==plannerScope){$('#projectNoteSaveStatus').textContent='Аккаунт изменился. Открой подзадачу заново.';return false}
  const event=projectNoteEvent();
  if(!event){$('#projectNoteSaveStatus').textContent='Задача удалена. Скопируй текст заметки.';return false}
  const title=$('#projectNoteTitle').value.trim(),note=$('#projectNoteBody').value;
  if(activeProjectDraft){
    event.title=title;event.note=note;
    event.done=$('#projectNoteDone').checked;event.status=event.done?'done':'planned';
    try{localStorage.setItem(projectNoteDraftKey(event.projectId,activeProjectDraft.accountKey),JSON.stringify(activeProjectDraft))}
    catch(err){console.error(err);$('#projectNoteSaveStatus').textContent='Не удалось сохранить черновик. Оставь окно открытым или скопируй текст.';return false}
    projectNoteDirty=false;$('#projectNoteSaveStatus').textContent='Черновик сохранён · нажми «Создать»';return true;
  }
  const changed=event.title!==(title||'Новая подзадача')||event.note!==note;
  event.title=title||'Новая подзадача';event.note=note;
  try{save('Заметка сохранена')}catch(err){console.error(err);$('#projectNoteSaveStatus').textContent='Не удалось сохранить. Скопируй текст.';return false}
  projectNoteDirty=false;$('#projectNoteSaveStatus').textContent='Сохранено на устройстве';
  if(changed){renderProjects();renderCalendar();renderToday();renderFocusPage()}
  return true;
}
function queueProjectNoteSave(){projectNoteDirty=true;$('#projectNoteSaveStatus').textContent='Сохранение…';clearTimeout(projectNoteSaveTimer);projectNoteSaveTimer=setTimeout(flushProjectNote,450)}
function closeProjectNote(){
  if(!flushProjectNote())return false;
  $('#projectNoteDialog').close();activeProjectNoteId='';activeProjectDraft=null;renderProjects();return true;
}
function commitProjectNote(){
  if(!activeProjectDraft)return closeProjectNote();
  projectNoteDirty=true;if(!flushProjectNote())return false;
  const draft=activeProjectDraft,event=draft.event;
  if(draft.accountKey!==profileStorageKey()||!db.projects.some(p=>p.id===event.projectId)){
    $('#projectNoteSaveStatus').textContent='Профиль или папка изменились. Вернись к исходной папке; черновик сохранён.';return false;
  }
  if(!event.title){$('#projectNoteSaveStatus').textContent='Укажи название подзадачи.';$('#projectNoteTitle').focus();return false}
  if(db.calendar.some(e=>e.id===event.id)){ $('#projectNoteSaveStatus').textContent='Подзадача уже создана. Открой её из списка.';return false }
  const created={...event};if(created.done)created.completedAt=new Date().toISOString();
  const previousMeta=structuredClone(db.meta);db.calendar.push(created);
  try{save('Подзадача создана')}
  catch(err){
    console.error(err);let persisted=false;
    try{persisted=JSON.parse(localStorage.getItem(plannerDataKey())||'null')?.calendar?.some(e=>e.id===created.id)}catch{}
    if(!persisted){db.calendar=db.calendar.filter(e=>e!==created);db.meta=previousMeta;$('#projectNoteSaveStatus').textContent='Не удалось создать подзадачу. Черновик сохранён, попробуй ещё раз.';return false}
  }
  try{localStorage.removeItem(projectNoteDraftKey(event.projectId,draft.accountKey))}catch{}
  projectNoteDirty=false;activeProjectDraft=null;
  closeProjectNote();renderCalendar();renderToday();renderFocusPage();return true;
}
$('#projectNoteTitle').addEventListener('input',queueProjectNoteSave);
$('#projectNoteBody').addEventListener('input',queueProjectNoteSave);

$('#projectNoteClose').onclick=closeProjectNote;
$('#projectNoteCommit').onclick=commitProjectNote;
$('#projectNoteDiscard').onclick=()=>{
  if(!activeProjectDraft)return;
  if(($('#projectNoteTitle').value.trim()||$('#projectNoteBody').value)&&!confirm('Удалить этот черновик?'))return;
  try{localStorage.removeItem(projectNoteDraftKey(activeProjectDraft.event.projectId,activeProjectDraft.accountKey))}
  catch{$('#projectNoteSaveStatus').textContent='Не удалось удалить черновик. Попробуй ещё раз.';return}
  clearTimeout(projectNoteSaveTimer);projectNoteDirty=false;activeProjectDraft=null;activeProjectNoteId='';$('#projectNoteDialog').close();renderProjects();
};
$('#projectNoteDialog').addEventListener('cancel',e=>{e.preventDefault();closeProjectNote()});
$('#projectNoteDialog').addEventListener('close',()=>{if(!flushProjectNote()){if(activeProjectNoteId)$('#projectNoteDialog').showModal();return}activeProjectNoteId='';activeProjectDraft=null});
window.addEventListener('pagehide',flushProjectNote);
document.addEventListener('visibilitychange',()=>{if(document.hidden)flushProjectNote()});
$('#projectNoteSchedule').onclick=()=>{
  const id=activeProjectNoteId;if(!id)return;
  if(activeProjectDraft){if(!commitProjectNote())return}else if(!closeProjectNote())return;
  openEventDialog({id,scheduleOnly:true});
};
function refreshSubtaskViews(){renderProjects();renderCalendar();renderToday();renderFocusPage();renderWorkouts()}
$('#projectNoteNextDay').onclick=()=>{
 const id=activeProjectNoteId;if(!closeProjectNote())return;
 const moved=moveCalendarEventToNextDay(id);if(moved){refreshSubtaskViews();openProjectNote(moved.id)}
};
$('#eventNextDay').onclick=()=>{
 const event=db.calendar.find(e=>e.id===activeEventId);if(!event)return;
 if(!confirm('Перенести сохранённый блок на следующий день с тем же временем?'))return;
 const moved=moveCalendarEventToNextDay(event.id);if(moved){$('#eventDialog').close();refreshSubtaskViews()}
};
function deleteProjectSubtask(id){
 const event=db.calendar.find(e=>e.id===id);if(!event)return false;
 if(!confirm('Удалить подзадачу вместе с заметкой и её переносами в календаре? Записанное время сохранится в истории.'))return false;
 const ids=new Set([id]);let changed=true;
 while(changed){changed=false;for(const e of db.calendar){if(ids.has(e.id)||ids.has(e.movedFromId)||ids.has(e.movedToEventId)){for(const link of [e.id,e.movedFromId,e.movedToEventId])if(link&&!ids.has(link)){ids.add(link);changed=true}}}}
 const previous=structuredClone({calendar:db.calendar,workouts:db.workouts,timer:db.timer,timeEntries:db.timeEntries,meta:db.meta});
 if(ids.has(String(db.timer.activeTaskId||'').replace(CAL_FOCUS_PREFIX,''))){if(db.timer.running)stopActiveTimer('subtask_delete');db.timer.activeTaskId='';db.timer.running=false;db.timer.startedAt=null;db.timer.sessionAccumulatedMs=0}
 for(const key of ids)detachWorkoutFromCalendarEvent(key);
 db.calendar=db.calendar.filter(e=>!ids.has(e.id));
 try{save('Подзадача удалена')}catch(err){Object.assign(db,previous);$('#projectNoteSaveStatus').textContent='Не удалось удалить подзадачу. Попробуй ещё раз.';return false}return true;
}
$('#projectNoteDelete').onclick=()=>{
 if(!flushProjectNote()||!deleteProjectSubtask(activeProjectNoteId))return;
 clearTimeout(projectNoteSaveTimer);projectNoteDirty=false;activeProjectNoteId='';activeProjectDraft=null;$('#projectNoteDialog').close();refreshSubtaskViews();
};
$('#projectNoteCalendar').onclick=()=>{if(activeProjectDraft)return;const event=projectNoteEvent();if(!event||!closeProjectNote())return;calendarView='day';calendarDay=new Date(event.date+'T12:00:00');showPage('calendar');renderCalendar()};
$('#projectNoteDone').onchange=()=>{
  if(activeProjectDraft){queueProjectNoteSave();return}
  if(!flushProjectNote())return;setCalendarEventDone(activeProjectNoteId,$('#projectNoteDone').checked);renderProjects();renderCalendar();renderToday();renderFocusPage();
};
function insertProjectNoteLine(prefix){const field=$('#projectNoteBody'),pos=field.selectionStart;field.setRangeText((pos&&field.value[pos-1]!=='\n'?'\n':'')+prefix,pos,field.selectionEnd,'end');field.focus();queueProjectNoteSave()}
$('#projectNoteBullet').onclick=()=>insertProjectNoteLine('• ');
$('#projectNoteChecklist').onclick=()=>insertProjectNoteLine('☐ ');
$('#projectSearch').addEventListener('input',renderProjects);
$('#editSelectedProject').onclick=()=>{if(selectedProjectId)openProjectDialog(selectedProjectId)};
$('#projectsBack').onclick=()=>{selectedProjectId='';$('#projectSearch').value='';renderProjects()};
function openProjectDialog(id=''){
  const f=$('#projectForm'); f.reset(); const p=id?db.projects.find(x=>x.id===id):null;
  const select=f.elements.directionType;
  select.querySelectorAll('[data-legacy-type]').forEach(option=>option.remove());
  const type=taskAreaType(p);
  if(p&&TASK_AREA_TYPES[type].retired){const option=document.createElement('option');option.value=type;option.textContent=TASK_AREA_TYPES[type].label+' (старый тип)';option.disabled=true;option.dataset.legacyType='1';select.append(option)}
  select.value=type;updateTaskAreaTypeHelp();
  f.elements.id.value=p?.id||''; f.elements.name.value=p?.name||''; f.elements.color.value=p?.color||'#6366f1'; f.elements.description.value=p?.description||''; f.elements.archived.checked=!!p?.archived;
  $('#projectDialogTitle').textContent=p?'Редактировать задачу':'Новая задача'; $('#deleteProject').style.display=p?'inline-flex':'none'; $('#projectDialog').showModal(); setTimeout(()=>f.elements.name.focus(),0);
}
$('#projectForm').addEventListener('submit',e=>{
  e.preventDefault(); const f=e.currentTarget,id=f.elements.id.value,name=f.elements.name.value.trim(); if(!name)return;
  const obj={...(db.projects.find(p=>p.id===id)||{}),id:id||uid(),name,directionType:Object.hasOwn(TASK_AREA_TYPES,f.elements.directionType.value)&&(!TASK_AREA_TYPES[f.elements.directionType.value].retired||db.projects.find(p=>p.id===id)?.directionType===f.elements.directionType.value)?f.elements.directionType.value:'project',color:f.elements.color.value||'#6366f1',description:f.elements.description.value.trim(),archived:f.elements.archived.checked,createdAt:id?(db.projects.find(p=>p.id===id)?.createdAt||Date.now()):Date.now()};
  if(id){const i=db.projects.findIndex(p=>p.id===id);if(i>=0)db.projects[i]=obj}else db.projects.push(obj);
  save(); selectedProjectId=obj.archived?'':obj.id;$('#projectSearch').value='';$('#projectDialog').close(); renderProjects(); fillProjectSelect();
});
$('#deleteProject').onclick=()=>{
  const id=$('#projectForm').elements.id.value;if(!id)return;if(!confirm('Удалить задачу? Связанные записи останутся без привязки.'))return;
  const removed=db.projects.find(p=>p.id===id);db.projects=db.projects.filter(p=>p.id!==id);
  db.calendar.forEach(e=>{if(e.projectId===id)e.projectId=''});
  db.money.forEach(m=>{if(m.projectId===id)m.projectId=''});
  (db.portfolioWorks||[]).forEach(w=>{if(w.projectId===id)w.projectId=''});
  (db.learningSkills||[]).forEach(w=>{if(w.projectId===id)w.projectId=''});
  db.timeEntries.forEach(x=>{if(x.projectId===id){x.projectName=x.projectName||removed?.name||'';x.projectId=''}});
  if(selectedProjectId===id)selectedProjectId='';
  save();$('#projectDialog').close();renderProjects();renderToday();renderCalendar();renderMoney();renderFocusPage();fillProjectSelect();
};
$('#newProject').onclick=()=>openProjectDialog();
$('#newProjectBlock').onclick=beginProjectNote;
$('#toggleArchivedProjects').onclick=()=>{showArchivedProjects=!showArchivedProjects;$('#toggleArchivedProjects').textContent=showArchivedProjects?'Скрыть архив':'Архив';renderProjects()};

const categoryEmoji=calendarCategoryEmoji;
function mins(v){const [h,m]=String(v).split(':').map(Number);return h*60+m}
function eventEndMins(e){let end=mins(e.end);const start=mins(e.start);if(end<=start)end+=1440;return end}
function hhmm(m){m=(m+1440)%1440;return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0')}
function eventHours(e){return Math.max(0,(eventEndMins(e)-mins(e.start))/60)}
function taskCalendarTargetDate(task){
  if(task?.due && task.due>todayISO)return task.due;
  return todayISO;
}
function dayOpenClose(date){
  const dow=new Date(date+'T12:00:00').getDay();
  return [0,6].includes(dow)?{open:480,close:1440}:{open:420,close:1380};
}
function roundedNow30(){
  const n=new Date(),m=n.getHours()*60+n.getMinutes();
  return Math.ceil(m);
}
function findTaskCalendarSlot(date,duration,ignoreEventId=''){
  const {open,close}=dayOpenClose(date);
  const minStart=date===todayISO?Math.max(open,roundedNow30()):open;
  const occupied=db.calendar
    .filter(e=>e.date===date && e.id!==ignoreEventId)
    .map(e=>[mins(e.start),eventEndMins(e)])
    .sort((a,b)=>a[0]-b[0]);

  let cursor=minStart;
  for(const [s,e] of occupied){
    if(e<=cursor)continue;
    if(s-cursor>=duration)return {start:cursor,end:cursor+duration};
    cursor=Math.max(cursor,e);
    cursor=Math.ceil(cursor);
  }
  if(close-cursor>=duration)return {start:cursor,end:cursor+duration};
  return null;
}

function occupiedHours(events){
  const byDate={};events.forEach(e=>{const s=mins(e.start),en=eventEndMins(e);(byDate[e.date]??=[]).push([s,en])});let total=0;
  Object.values(byDate).forEach(rows=>{rows.sort((a,b)=>a[0]-b[0]);let a=null,b=null;for(const [s,e] of rows){if(a===null){a=s;b=e}else if(s<=b)b=Math.max(b,e);else{total+=Math.max(0,b-a);a=s;b=e}}if(a!==null)total+=Math.max(0,b-a)});return total/60;
}
function weekDates(){return Array.from({length:7},(_,i)=>{const d=new Date(calendarWeekStart);d.setDate(d.getDate()+i);return d})}
let calendarView=(window.innerWidth<=820||window.matchMedia?.('(pointer: coarse)').matches)?'day':'week';let calendarDay=new Date();let calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);
function inViewedWeek(date){const a=iso(calendarWeekStart), end=new Date(calendarWeekStart);end.setDate(end.getDate()+7);return date>=a&&date<iso(end)}
function calendarRangeText(){const dates=weekDates();const f=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'short'});return `${f.format(dates[0])} — ${f.format(dates[6])}`}
let activeEventId='',activeEventPresetId='';
function openEventDialog(pref={}){
  const noteEvent=pref.id?db.calendar.find(e=>e.id===pref.id):null;
  if(noteEvent?.projectId&&!pref.scheduleOnly&&db.projects.some(p=>p.id===noteEvent.projectId)){openProjectNote(noteEvent.id);return}
  const form=$('#eventForm'); form.reset();
  const existing=pref.id ? db.calendar.find(x=>x.id===pref.id) : null;
  const data=existing||pref;
  activeEventId=existing?.id||'';
  activeEventPresetId=!existing&&pref.presetId?String(pref.presetId):'';
  form.elements.namedItem('id').value=activeEventId;
  form.elements.title.value=data.title||'';
  form.elements.date.value=data.date||(existing?.projectId?todayISO:iso(calendarWeekStart));
  form.elements.category.value=normalizeCalendarCategory(data.category||'project');
  form.elements.status.value=calendarEventStatus(data);
  fillProjectSelect(); $('#eventProjectSelect').innerHTML=projectOptions(data.projectId||'');$('#eventProjectSelect').value=data.projectId||'';
  form.elements.repeat.value='none'; form.elements.repeatUntil.value=''; form.elements.applySeries.checked=false;
  form.elements.start.value=data.start||'19:00';
  form.elements.end.value=data.end||'20:00';
  form.elements.note.value=data.note||'';
  const isSeries=!!existing?.seriesId;
  $('#eventRepeatField').style.display=existing?'none':'flex';
  $('#eventRepeatUntilField').style.display=existing?'none':'flex';
  $('#eventSeriesField').style.display=isSeries?'flex':'none';
  $('#deleteEventSeries').style.display=isSeries?'inline-flex':'none';
  $('#eventDialogTitle').textContent=existing?(isSeries?'Редактировать событие серии':'Редактировать событие'):'Новое событие';
  $('#eventNextDay').hidden=!existing?.date||!['planned','missed'].includes(calendarEventStatus(existing));
  $('#deleteEvent').style.display=existing?'inline-flex':'none';
  $('#deleteEventPreset').style.display=activeEventPresetId?'inline-flex':'none';
  renderEventPlanActual(existing,$('#eventPlanActual'));
  if(typeof renderLearningEventLink==='function')renderLearningEventLink(existing);
  $('#eventDialog').showModal();
  setTimeout(()=>form.elements.title.focus(),0);
}
function calendarVisibleBounds(){
  if(calendarView==='day'){const d=new Date(calendarDay);d.setHours(0,0,0,0);const e=new Date(d);e.setDate(e.getDate()+1);return {start:iso(d),end:iso(e)}}
  if(calendarView==='month'){const d=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1);const e=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);return {start:iso(d),end:iso(e)}}
  const e=new Date(calendarWeekStart);e.setDate(e.getDate()+7);return {start:iso(calendarWeekStart),end:iso(e)};
}
let mobileCalendarAutoKey='';
function mobileCalendarAutoScroll(){
  if((window.innerWidth>820&&!window.matchMedia?.('(pointer: coarse)').matches)||calendarView==='month'||!$('#page-calendar')?.classList.contains('active'))return;
  const wrap=$('.week-scroll'),grid=$('#weekGrid');if(!wrap||!grid)return;
  const key=calendarView+':'+calendarRangeText();if(mobileCalendarAutoKey===key)return;
  mobileCalendarAutoKey=key;
  requestAnimationFrame(()=>{
    if(calendarView==='week'){
      const idx=weekDates().findIndex(d=>iso(d)===todayISO);wrap.scrollLeft=idx>=0?Math.max(0,idx*116-24):0;
    }else wrap.scrollLeft=0;
    const date=calendarView==='day'?iso(calendarDay):todayISO,now=new Date(),nowMins=now.getHours()*60+now.getMinutes();
    const first=db.calendar.filter(e=>e.date===date&&eventEndMins(e)>420&&mins(e.start)<1440).sort((a,b)=>mins(a.start)-mins(b.start))[0];
    const minute=date===todayISO&&nowMins>=420&&nowMins<1440?nowMins:Math.max(420,first?mins(first.start):420);
    wrap.scrollTop=Math.max(0,minute-420-35);
  });
}
function renderMobileCalendarAgenda(){
  const box=$('#mobileCalendarAgenda');if(!box)return;
  box.hidden=(window.innerWidth>820&&!window.matchMedia?.('(pointer: coarse)').matches)||calendarView!=='day';if(box.hidden)return;
  const date=iso(calendarDay),events=db.calendar.filter(e=>e.date===date).sort((a,b)=>mins(a.start)-mins(b.start));
  $('#mobileCalendarAgendaTitle').textContent=`События дня · ${events.length}`;
  $('#mobileCalendarAgendaList').innerHTML=events.length?events.map(e=>`<button type="button" class="mobile-agenda-event" data-mobile-event="${escapeHTML(e.id)}"><span>${escapeHTML(e.start)}–${escapeHTML(e.end)}</span><strong>${escapeHTML(e.title)}</strong><i aria-hidden="true">›</i></button>`).join(''):'<p class="small">На этот день событий пока нет.</p>';
  $$('[data-mobile-event]',box).forEach(b=>b.onclick=()=>openEventDialog({id:b.dataset.mobileEvent}));
}
function calendarTimelineIcon(category,status){
  const paths={
    work:'<rect x="4" y="6" width="16" height="14" rx="3"/><path d="M9 6V4h6v2M4 12h16M10 12v2h4v-2"/>',
    project:'<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
    study:'<path d="M12 5v15M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Z"/>',
    commute:'<rect x="5" y="3" width="14" height="15" rx="4"/><path d="M5 10h14M8 21l2-3m6 3-2-3M8 14h1m6 0h1"/>',
    food:'<path d="M5 3v7m3-7v7m-6 0h6m-3 0v11M18 3c-4 3-4 8 0 9v9m0-18v9"/>',
    sport:'<circle cx="14" cy="4" r="2"/><path d="m8 10 4-3 4 4h4M12 7l-2 7 5 2v5m-5-7-4 7M8 10l-2 4"/>',
    personal:'<circle cx="12" cy="7" r="4"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/>',
    together:'<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 5 1 9 8 15 7-6 12-10 8-15Z"/>',
    rest:'<path d="M4 7h13v7a6 6 0 0 1-12 0V7m12 1h2a3 3 0 0 1 0 6h-2M3 21h16M8 3v1m5-1v1"/>',
    other:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'
  };
  const statusPaths={done:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',moved:'<path d="M4 12h16m-6-6 6 6-6 6"/>',missed:'<circle cx="12" cy="12" r="9"/><path d="m8 8 8 8m0-8-8 8"/>'};
  return `<svg class="calendar-event-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${statusPaths[status]||paths[normalizeCalendarCategory(category)]||paths.other}</svg>`;
}
function renderCalendarDayStrip(){
  const strip=$('#calendarDayStrip');if(!strip)return;
  strip.hidden=calendarView!=='day';if(strip.hidden)return;
  const start=startOfWeek(calendarDay),names=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  strip.innerHTML=Array.from({length:7},(_,i)=>{
    const d=new Date(start);d.setDate(d.getDate()+i);const date=iso(d),selected=date===iso(calendarDay);
    const label=new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(d);
    return `<button type="button" class="calendar-day-chip ${selected?'active':''} ${date===todayISO?'today':''}" data-calendar-pick-day="${date}" aria-label="${escapeHTML(label)}" aria-pressed="${selected}"><span>${names[i]}</span><strong>${d.getDate()}</strong></button>`;
  }).join('');
  $$('[data-calendar-pick-day]',strip).forEach(b=>b.onclick=()=>{calendarDay=new Date(b.dataset.calendarPickDay+'T12:00:00');calendarWeekStart=startOfWeek(calendarDay);renderCalendar()});
}
function renderCalendar(){
  renderCalendarPresetTray();
  const grid=$('#weekGrid');if(!grid)return;
  const page=$('#page-calendar');if(page){page.classList.toggle('day-mode',calendarView==='day');page.classList.toggle('timeline-mode',calendarView!=='month')}
  renderCalendarDayStrip();
  $$('[data-calendar-view]').forEach(b=>b.classList.toggle('active',b.dataset.calendarView===calendarView));
  const right=$('.calendar-toolbar .right');if(right)right.style.display=calendarView==='week'?'flex':'none';
  if(calendarView==='month'){renderMobileCalendarAgenda();renderCalendarMonth();bindCalendarPresets();renderCalendarSide();return}

  const desktop=(window.innerWidth>820&&!window.matchMedia?.('(pointer: coarse)').matches);
  const dates=calendarView==='day'?[new Date(calendarDay)]:weekDates(),
        dayNames=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'],
        minuteTrack=desktop?(calendarView==='day'?'1.35px':'1.2px'):'1px';

  $('#calendarWeekLabel').textContent=calendarView==='day'
    ? new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(dates[0])
    : calendarRangeText();

  grid.className=calendarView==='day'?'day-grid':'week-grid';
  grid.style.gridTemplateColumns=calendarView==='day'?'72px minmax(720px,1fr)':'';
  grid.style.gridTemplateRows=`${calendarView==='day'?58:54}px repeat(1020,${minuteTrack})`;

  let html=`<div class="week-head" style="grid-column:1;grid-row:1">${desktop?'Время':''}</div>`;

  dates.forEach((d,i)=>{
    const isToday=iso(d)===todayISO,di=(d.getDay()+6)%7,weekend=[0,6].includes(d.getDay());
    if(desktop)html+=`<button type="button" class="week-head ${isToday?'today':''} ${weekend?'weekend':''}" data-calendar-open-day="${iso(d)}" aria-label="Открыть ${escapeHTML(new Intl.DateTimeFormat('ru-RU',{weekday:'long',day:'numeric',month:'long'}).format(d))}" style="grid-column:${i+2};grid-row:1"><strong>${dayNames[di]}</strong><span>${d.getDate()} <small>${new Intl.DateTimeFormat('ru-RU',{month:'short'}).format(d)}</small></span></button>`;
    else html+=`<div class="week-head ${isToday?'today':''} ${weekend?'weekend':''}" style="grid-column:${i+2};grid-row:1"><strong>${dayNames[di]}</strong><span>${d.getDate()} ${new Intl.DateTimeFormat('ru-RU',{month:'short'}).format(d)}${weekend?' · выходной':''}</span></div>`;
  });

  // Шкала календаря теперь непрерывная по минутам.
  // Слоты для клика/drag-and-drop остаются удобными — по 10 минут,
  // но вручную событие можно поставить на любую минуту.
  for(let minute=420;minute<1440;minute+=10){
    const offset=minute-420,row=2+offset;

    if(minute%60===0){
      html+=`<div class="time-cell" style="grid-column:1;grid-row:${row}/span 60">${hhmm(minute)}</div>`;
    }

    dates.forEach((d,day)=>{
      const weekend=[0,6].includes(d.getDay()),
            open=weekend?minute>=480&&minute<1440:minute>=420&&minute<1380,
            boundary=(minute+10)%60===0?'hour':((minute+10)%30===0?'half':'minor');
      html+=`<button type="button" class="calendar-slot ${weekend?'weekend':''} ${open?'':'closed'} ${boundary}" ${open?'':'disabled'} data-slot-date="${iso(d)}" data-slot-time="${hhmm(minute)}" aria-label="Добавить событие: ${iso(d)}, ${hhmm(minute)}" style="grid-column:${day+2};grid-row:${row}/span 10"></button>`;
    });
  }

  const bounds=calendarVisibleBounds(),
        events=db.calendar.filter(e=>e.date>=bounds.start&&e.date<bounds.end);

  events.forEach(e=>{
    const day=dates.findIndex(d=>iso(d)===e.date);
    if(day<0)return;

    if(eventEndMins(e)<=420||mins(e.start)>=1440)return;
    const sm=Math.max(420,mins(e.start)),
          em=Math.min(1440,eventEndMins(e)),
          duration=Math.max(1,em-sm),
          row=2+(sm-420),
          density=duration<15?'micro':duration<30?'compact':duration<45?'short':'',
          status=calendarEventStatus(e),
          comparison=eventPlanActual(e),
          label=`${e.title} · ${e.start}–${e.end} · ${eventPlanActualLabel(comparison)}${e.note?' · '+e.note:''}`;

    const text=`<strong>${escapeHTML(e.title)}</strong><span>${e.start}–${e.end}${comparison.actual?' · Факт '+minutesText(Math.round(comparison.actual/60000)):''}${e.note?' · '+escapeHTML(projectNotePreview(e.note)):''}</span>`;
    const content=desktop?`<div class="calendar-event-body">${text}</div>${calendarTimelineIcon(e.category,status)}`:text;
    html+=`<button type="button" draggable="true" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}" class="calendar-event ${density} ${e.category||'other'} status-${status} ${status==='done'?'is-done':''}" data-calendar-event="${escapeHTML(e.id)}" data-duration-minutes="${duration}" style="grid-column:${day+2};grid-row:${row}/span ${duration};${calendarEventInlineStyle(e.category)}">${content}</button>`;
  });

  const now=new Date(),
        ti=dates.findIndex(d=>iso(d)===iso(now)),
        nm=now.getHours()*60+now.getMinutes();

  if(ti>=0&&nm>=420&&nm<=1440){
    const row=2+(nm-420);
    html+=`<div class="calendar-now-line" style="grid-column:${ti+2};grid-row:${row}"></div><div class="calendar-now-label" style="grid-column:1;grid-row:${row}">${hhmm(nm)}</div>`;
  }

  grid.innerHTML=html;
  $$('[data-calendar-open-day]',grid).forEach(b=>b.onclick=()=>{calendarDay=new Date(b.dataset.calendarOpenDay+'T12:00:00');calendarWeekStart=startOfWeek(calendarDay);calendarView='day';renderCalendar()});
  bindCalendarGrid(grid);
  bindCalendarPresets();
  renderCalendarSide();
  renderMobileCalendarAgenda();
  mobileCalendarAutoScroll();
}
let activeTimePickerInput=null,timePickerHour=0,timePickerMinute=0;
function renderExactTimePicker(){
  const h=$('#timePickerHours'),m=$('#timePickerMinutes');if(!h||!m)return;
  h.innerHTML=Array.from({length:24},(_,i)=>`<button type="button" class="time-picker-option ${i===timePickerHour?'active':''}" data-time-hour="${i}">${String(i).padStart(2,'0')}</button>`).join('');
  m.innerHTML=Array.from({length:60},(_,i)=>`<button type="button" class="time-picker-option ${i===timePickerMinute?'active':''}" data-time-minute="${i}">${String(i).padStart(2,'0')}</button>`).join('');
  $('#timePickerPreview').textContent=`${String(timePickerHour).padStart(2,'0')}:${String(timePickerMinute).padStart(2,'0')}`;
  $$('[data-time-hour]',h).forEach(b=>b.onclick=()=>{timePickerHour=Number(b.dataset.timeHour);renderExactTimePickerSelection()});
  $$('[data-time-minute]',m).forEach(b=>b.onclick=()=>{timePickerMinute=Number(b.dataset.timeMinute);renderExactTimePickerSelection()});
  requestAnimationFrame(()=>{
    h.querySelector('.active')?.scrollIntoView({block:'center'});
    m.querySelector('.active')?.scrollIntoView({block:'center'});
  });
}
function renderExactTimePickerSelection(){
  const dialog=$('#timePickerDialog');if(!dialog)return;
  $$('[data-time-hour]',dialog).forEach(b=>b.classList.toggle('active',Number(b.dataset.timeHour)===timePickerHour));
  $$('[data-time-minute]',dialog).forEach(b=>b.classList.toggle('active',Number(b.dataset.timeMinute)===timePickerMinute));
  $('#timePickerPreview').textContent=`${String(timePickerHour).padStart(2,'0')}:${String(timePickerMinute).padStart(2,'0')}`;
}
function openExactTimePicker(input){
  if(!input||input.disabled||input.readOnly)return;
  activeTimePickerInput=input;
  const current=input.value||'00:00',[h,m]=current.split(':').map(Number);
  timePickerHour=Number.isFinite(h)?Math.max(0,Math.min(23,h)):0;
  timePickerMinute=Number.isFinite(m)?Math.max(0,Math.min(59,m)):0;
  const label=input.closest('.field')?.querySelector('label')?.textContent?.trim();
  $('#timePickerTitle').textContent=label?`Выбрать: ${label}`:'Выбрать время';
  renderExactTimePicker();
  $('#timePickerDialog').showModal();
}
function applyExactTimePicker(){
  if(!activeTimePickerInput)return;
  activeTimePickerInput.value=`${String(timePickerHour).padStart(2,'0')}:${String(timePickerMinute).padStart(2,'0')}`;
  activeTimePickerInput.dispatchEvent(new Event('input',{bubbles:true}));
  activeTimePickerInput.dispatchEvent(new Event('change',{bubbles:true}));
  $('#timePickerDialog').close();
}
function enhanceNativeDateTimeInputs(){
  const canShow=typeof HTMLInputElement!=='undefined' && 'showPicker' in HTMLInputElement.prototype;
  document.addEventListener('pointerdown',e=>{
    const time=e.target.closest('input[type="time"]');
    if(time&&!time.disabled&&!time.readOnly){
      e.preventDefault();
      openExactTimePicker(time);
      return;
    }
    const date=e.target.closest('input[type="date"]');
    if(date&&canShow&&!date.disabled&&!date.readOnly){
      try{date.showPicker()}catch(_){ }
    }
  },true);
  document.addEventListener('keydown',e=>{
    const input=e.target;
    if(!input?.matches?.('input[type="time"]'))return;
    if(e.key==='Enter'||e.key===' '){e.preventDefault();openExactTimePicker(input)}
  });
  $('#timePickerDone')?.addEventListener('click',applyExactTimePicker);
  $('#timePickerClose')?.addEventListener('click',()=>$('#timePickerDialog').close());
  $('#timePickerNow')?.addEventListener('click',()=>{
    const now=new Date();timePickerHour=now.getHours();timePickerMinute=now.getMinutes();renderExactTimePickerSelection();
  });
  $('#timePickerDialog')?.addEventListener('close',()=>{activeTimePickerInput=null});
}

let mobileSelectedPresetId='';
function cancelMobileCalendarPreset(){mobileSelectedPresetId='';updateMobileCalendarPreset()}
function updateMobileCalendarPreset(){
  if((window.innerWidth>820&&!window.matchMedia?.('(pointer: coarse)').matches)||calendarView==='month')mobileSelectedPresetId='';
  const preset=getCalendarPreset(mobileSelectedPresetId),box=$('#mobilePresetSelection');
  if(box)box.hidden=!preset||(window.innerWidth>820&&!window.matchMedia?.('(pointer: coarse)').matches);
  if(preset&&$('#mobilePresetSelectionText'))$('#mobilePresetSelectionText').textContent=`${preset.title} · выбери время ниже`;
  $$('[data-calendar-preset]').forEach(b=>{const selected=b.dataset.calendarPreset===mobileSelectedPresetId;b.classList.toggle('mobile-selected',selected);b.setAttribute('aria-pressed',String(selected))});
}
function chooseMobileCalendarPreset(id){
  if(!getCalendarPreset(id))return false;
  mobileSelectedPresetId=id;updateMobileCalendarPreset();return true;
}
function openMobileCalendarSlot(date,time){
  const preset=getCalendarPreset(mobileSelectedPresetId);if(!preset)return false;
  const start=mins(time),close=dayOpenClose(date).close;
  if(!preset.allowOvernight&&start+Number(preset.duration||60)>close){alert('Этот блок не помещается до конца дня. Выбери другое время.');return true}
  const id=mobileSelectedPresetId;cancelMobileCalendarPreset();
  openEventDialog({date,start:time,end:hhmm(start+Number(preset.duration||60)),title:preset.title,category:preset.category,presetId:id,note:'',projectId:'',taskId:''});return true;
}
$('#cancelMobilePreset')?.addEventListener('click',cancelMobileCalendarPreset);
function bindCalendarPresets(){
  updateMobileCalendarPreset();
  $$('[data-calendar-preset]').forEach(chip=>{
    if(chip.dataset.boundPreset==='1')return;
    chip.dataset.boundPreset='1';chip.draggable=(window.innerWidth>820&&!window.matchMedia?.('(pointer: coarse)').matches);
    chip.ondragstart=e=>{
      chip.classList.add('dragging');
      e.dataTransfer.setData('text/calendar-preset',chip.dataset.calendarPreset);
      e.dataTransfer.effectAllowed='copy';
    };
    chip.ondragend=()=>chip.classList.remove('dragging');
    chip.onclick=()=>{
      const preset=getCalendarPreset(chip.dataset.calendarPreset);
      if(!preset)return;
      if((window.innerWidth<=820||window.matchMedia?.('(pointer: coarse)').matches)&&calendarView!=='month'){chooseMobileCalendarPreset(chip.dataset.calendarPreset);return}
      const date=calendarPresetFallbackDate();
      openEventDialog({
        presetId:chip.dataset.calendarPreset,
        title:preset.title,
        category:preset.category,
        date,
        start:preset.defaultStart,
        end:preset.defaultEnd,
        note:'',
        projectId:'',
        taskId:''
      });
    };
  });
  const addPresetButton=$('#addCalendarPreset');if(addPresetButton)addPresetButton.onclick=()=>{
    const form=$('#calendarPresetForm');form.reset();
    form.elements.duration.value='60';
    form.elements.defaultStart.value='19:00';
    $('#calendarPresetDialog').showModal();
    setTimeout(()=>form.elements.title.focus(),0);
  };
}
function bindCalendarGrid(grid){
  $$('[data-slot-date]',grid).forEach(b=>b.onclick=()=>{if((window.innerWidth<=820||window.matchMedia?.('(pointer: coarse)').matches)&&openMobileCalendarSlot(b.dataset.slotDate,b.dataset.slotTime))return;const sm=mins(b.dataset.slotTime),dow=new Date(b.dataset.slotDate+'T12:00:00').getDay(),close=[0,6].includes(dow)?1440:1380;openEventDialog({date:b.dataset.slotDate,start:b.dataset.slotTime,end:hhmm(Math.min(sm+60,close)),category:'project'})});
  $$('[data-calendar-event]',grid).forEach(b=>{b.draggable=(window.innerWidth>820&&!window.matchMedia?.('(pointer: coarse)').matches);b.onclick=e=>{e.stopPropagation();if((window.innerWidth<=820||window.matchMedia?.('(pointer: coarse)').matches))cancelMobileCalendarPreset();openEventDialog({id:b.dataset.calendarEvent})};b.ondragstart=e=>{b.classList.add('dragging');e.dataTransfer.setData('text/event-id',b.dataset.calendarEvent);e.dataTransfer.effectAllowed='move'};b.ondragend=()=>b.classList.remove('dragging')});
  $$('[data-slot-date]',grid).forEach(slot=>{
    slot.ondragover=e=>{if(slot.disabled)return;e.preventDefault();slot.classList.add('drop-active')};
    slot.ondragleave=()=>slot.classList.remove('drop-active');
    slot.ondrop=e=>{
      e.preventDefault();
      slot.classList.remove('drop-active');
      const eventId=e.dataTransfer.getData('text/event-id'),
            presetId=e.dataTransfer.getData('text/calendar-preset');
      if(eventId){
        const ev=db.calendar.find(x=>x.id===eventId);
        if(ev){
          const dur=eventEndMins(ev)-mins(ev.start),st=mins(slot.dataset.slotTime),dow=new Date(slot.dataset.slotDate+'T12:00:00').getDay(),close=[0,6].includes(dow)?1440:1380;
          const canCrossMidnight=ev.presetId==='sleep'||String(ev.end)<String(ev.start);
          if(st+dur<=close||canCrossMidnight){
            ev.date=slot.dataset.slotDate;
            ev.start=hhmm(st);
            ev.end=hhmm(st+dur);
            ev.autoFromTask=false;
            save(`Блок «${ev.title}» перенесён`);
            renderCalendar();
            renderToday();
          }else{
            alert('Блок не помещается до конца доступного времени этого дня.');
          }
        }
      }else if(presetId){
        createCalendarPresetAt(presetId,slot.dataset.slotDate,slot.dataset.slotTime,false);
      }
    };
  })
}
function renderCalendarMonth(){
  const grid=$('#weekGrid');
  grid.className='month-grid';
  grid.style.gridTemplateColumns='';
  grid.style.gridTemplateRows='';
  grid.style.gridAutoRows='';
  const names=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
  let html=names.map((x,i)=>`<div class="month-weekday ${i>=5?'weekend':''}">${x}</div>`).join('');
  const first=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth(),1),start=startOfWeek(first),end=new Date(start);
  end.setDate(end.getDate()+42);
  $('#calendarWeekLabel').textContent=new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(first);
  const eventsByDate=new Map();
  for(const event of db.calendar){
    if(!eventsByDate.has(event.date))eventsByDate.set(event.date,[]);
    eventsByDate.get(event.date).push(event);
  }
  for(let d=new Date(start);d<end;d.setDate(d.getDate()+1)){
    const key=iso(d),outside=d.getMonth()!==calendarMonth.getMonth(),today=key===todayISO,weekend=[0,6].includes(d.getDay());
    const events=eventsByDate.get(key)||[];
    const important=events.filter(e=>TODAY_ATTENTION_CATEGORIES.has(e.category));
    const workCount=important.length,level=Math.min(3,Math.max(1,workCount));
    const dayState=workCount?`work-day work-level-${level}`:(events.length?'routine-day':'empty-day');
    const title=workCount?`${workCount} важных блоков`:(events.length?'Только обычные дела':'Пустой день');
    html+=`<button class="month-day ${outside?'outside':''} ${today?'today':''} ${weekend?'weekend':''} ${dayState}" data-month-day="${key}" title="${title}">
      <div class="month-day-num">${d.getDate()}</div>
      ${today?`<span class="month-day-today-label">Сегодня</span>`:''}
      ${workCount?`<span class="month-day-count">${workCount} ${workCount===1?'важный блок':'важн. бл.'}</span>`:''}
    </button>`;
  }
  grid.innerHTML=html;
  $$('[data-month-day]',grid).forEach(b=>{
    b.onclick=()=>{
      calendarDay=new Date(b.dataset.monthDay+'T12:00:00');
      calendarWeekStart=startOfWeek(calendarDay);
      calendarView='day';
      renderCalendar();
    };
    b.ondragover=e=>{if(e.dataTransfer.types.includes('text/calendar-preset'))e.preventDefault()};
    b.ondrop=e=>{
      const presetId=e.dataTransfer.getData('text/calendar-preset');if(!presetId)return;
      e.preventDefault();e.stopPropagation();
      const preset=getCalendarPreset(presetId);
      if(preset)createCalendarPresetAt(presetId,b.dataset.monthDay,preset.defaultStart,false);
    };
  });
}

function renderCalendarSide(){
  const bounds=calendarVisibleBounds(),events=db.calendar.filter(e=>e.date>=bounds.start&&e.date<bounds.end),total=events.reduce((a,e)=>a+eventHours(e),0),occupied=occupiedHours(events);let available=calendarView==='day'?16:calendarView==='week'?112:0;if(calendarView==='month'){for(let d=new Date(bounds.start+'T12:00:00');iso(d)<bounds.end;d.setDate(d.getDate()+1))available+=16}
  $('#calendarSideTitle').textContent=calendarView==='day'?'Этот день':calendarView==='month'?'Этот месяц':'Эта неделя';$('#plannedHours').textContent=`${total.toLocaleString('ru-RU',{maximumFractionDigits:1})} ч`;$('#freeHours').textContent=`${Math.max(0,available-occupied).toLocaleString('ru-RU',{maximumFractionDigits:1})} ч`;
  const groups=CALENDAR_CATEGORY_DEFS.map(x=>[x.key,x.label,calendarCategoryColor(x.key)]);$('#calendarBalance').innerHTML=groups.map(([key,label,color])=>{const h=events.filter(e=>normalizeCalendarCategory(e.category)===key).reduce((a,e)=>a+eventHours(e),0);return `<div class="bar-row"><div class="bar-head"><span>${label}</span><span>${h.toLocaleString('ru-RU',{maximumFractionDigits:1})} ч</span></div><div class="bar"><span style="width:${Math.min(100,h/Math.max(1,total)*100)}%;background:${color}"></span></div></div>`}).join('');
}
function seedViewedWorkWeek(){
  if(!confirm('Добавить базовые будни в эту неделю? Текущие события не удалятся. После добавления действие можно отменить через ⌘Z.'))return;
  const templates=[['Дорога на работу','commute','08:00','09:00'],['Работа','work','09:00','14:00'],['Обед','food','14:00','15:00'],['Работа','work','15:00','18:00'],['Дорога домой','commute','18:00','19:00']];
  weekDates().slice(0,5).forEach(d=>templates.forEach(([title,category,start,end])=>{const date=iso(d);if(!db.calendar.some(e=>e.date===date&&e.start===start&&e.end===end&&e.title===title))db.calendar.push({id:uid(),title,category,date,start,end,note:''})}));
  save('Базовые будни добавлены');renderCalendar();renderToday();
}
function saveCurrentWeekTemplate(){const dates=weekDates();db.weekTemplate=db.calendar.filter(e=>inViewedWeek(e.date)).map(e=>({dayIndex:dates.findIndex(d=>iso(d)===e.date),title:e.title,category:e.category,start:e.start,end:e.end,note:e.note||'',projectId:e.projectId||''})).filter(x=>x.dayIndex>=0);save();renderTemplateStatus();alert('Шаблон недели сохранён.')}
function applyCurrentWeekTemplate(){if(!db.weekTemplate.length){alert('Сначала сохрани шаблон недели.');return}if(!confirm('Применить сохранённый шаблон к этой неделе? Существующие события останутся, действие можно отменить через ⌘Z.'))return;const dates=weekDates();db.weekTemplate.forEach(t=>{const date=iso(dates[t.dayIndex]);if(!db.calendar.some(e=>e.date===date&&e.start===t.start&&e.title===t.title))db.calendar.push({id:uid(),date,title:t.title,category:t.category,start:t.start,end:t.end,note:t.note||'',projectId:t.projectId||'',taskId:''})});save('Шаблон недели применён');renderCalendar();renderToday()}
function renderTemplateStatus(){const el=$('#templateStatus');if(el)el.textContent=db.weekTemplate.length?`Шаблон сохранён: ${db.weekTemplate.length} блоков`:'Шаблон недели ещё не сохранён.'}
function clearViewedWeek(){
  if(!confirm('Удалить все события этой недели?'))return;
  db.calendar=db.calendar.filter(e=>!inViewedWeek(e.date));save('Неделя очищена');renderCalendar();renderToday();
}
function renderTodaySchedule(){
  const box=$('#todaySchedule'); if(!box)return;
  const events=db.calendar.filter(e=>e.date===todayISO).sort((a,b)=>mins(a.start)-mins(b.start));
  box.innerHTML=events.length?events.map(e=>`<button class="mini-item" data-today-event="${escapeHTML(e.id)}" style="width:100%;text-align:left;${['moved','missed'].includes(calendarEventStatus(e))?'opacity:.58':''}"><div class="left"><span>${categoryEmoji[e.category]||'•'}</span><div><strong>${escapeHTML(e.title)}</strong><div class="meta">${e.start}–${e.end} · ${calendarEventStatusLabel(calendarEventStatus(e))}${e.note?' · '+escapeHTML(projectNotePreview(e.note)):''}</div></div></div><span class="muted">${eventHours(e).toLocaleString('ru-RU',{maximumFractionDigits:1})} ч</span></button>`).join(''):'<div class="empty">На сегодня ничего не запланировано. Открой календарь и распланируй день.</div>';
  $$('[data-today-event]',box).forEach(b=>b.onclick=()=>openEventDialog({id:b.dataset.todayEvent}));
}
function repeatDateAllowed(date,repeat){
  const dow=new Date(date+'T12:00:00').getDay();
  if(repeat==='weekdays')return dow>=1&&dow<=5;
  if(repeat==='weekends')return dow===0||dow===6;
  return true;
}

$('#eventForm').addEventListener('submit',e=>{
  e.preventDefault();
  const f=e.currentTarget,id=activeEventId||f.elements.namedItem('id')?.value||'';
  const title=f.elements.title.value.trim(),date=f.elements.date.value,category=normalizeCalendarCategory(f.elements.category.value),start=f.elements.start.value,end=f.elements.end.value,note=f.elements.note.value,status=f.elements.status.value||'planned';
  if(!title||!date||!start||!end){alert('Укажи название, дату, время начала и окончания.');return}
  if(start===end){alert('Начало и конец должны отличаться. Для ночного блока конец может быть утром следующего дня.');return}

  const dow=new Date(date+'T12:00:00').getDay(),weekend=dow===0||dow===6,open=weekend?480:420,close=weekend?1440:1380,startM=mins(start),endM=eventEndMins({start,end}),overnight=mins(end)<=startM;
  if(endM-startM<=0){alert('Проверь время окончания.');return}
  if(startM<open||(!overnight&&endM>close)||(overnight&&startM>close)){alert(weekend?'На выходных начало должно быть между 08:00 и 00:00.':'В будни начало должно быть между 07:00 и 23:00.');return}
  if(overnight&&endM-startM>720){alert('Ночной блок не может быть длиннее 12 часов.');return}

  const taskId='',projectId=f.elements.projectId.value||'',existing=id?db.calendar.find(x=>x.id===id):null;
  const repeatMode=f.elements.repeat.value;
  if(!existing&&repeatMode!=='none'&&!f.elements.repeatUntil.value){alert('Для повторяющегося события укажи дату «Повторять до».');return}
  if(!existing&&repeatMode!=='none'&&!repeatDateAllowed(date,repeatMode)){
    alert(repeatMode==='weekdays'?'Для повтора по будням выбери будний день.':'Для повтора по выходным выбери субботу или воскресенье.');
    return;
  }
  const base={title,date,category,start,end,note,taskId,projectId,unscheduled:false,status,done:status==='done',completedAt:calendarCompletionStamp(existing,status)};

  if(existing){
    const i=db.calendar.findIndex(x=>x.id===id);
    if(i>=0){
      db.calendar[i]={...existing,...base,id:existing.id,autoFromTask:false};
      syncWorkoutStatusFromCalendar(db.calendar[i]);
    }
    if(existing.seriesId&&f.elements.applySeries.checked){
      db.calendar=db.calendar.map(ev=>ev.seriesId===existing.seriesId?{...ev,title,category,start,end,note,taskId,projectId}:ev);
    }
  }else{
    const repeat=f.elements.repeat.value,until=f.elements.repeatUntil.value;
    const seriesId=repeat!=='none'&&until?uid():'';
    const first={id:uid(),...base,...(seriesId?{seriesId}:{})};
    db.calendar.push(first);
    if(seriesId){
      let d=new Date(date+'T12:00:00'),limit=new Date(until+'T12:00:00'),guard=0;
      while(guard++<800){
        d.setDate(d.getDate()+(repeat==='weekly'?7:1));
        if(d>limit)break;
        const nextDate=iso(d);
        if(repeatDateAllowed(nextDate,repeat))db.calendar.push({...first,id:uid(),date:nextDate,status:'planned',done:false,completedAt:''});
      }
    }
  }

  
  save();$('#eventDialog').close();renderCalendar();renderToday();renderProjects();renderWorkouts();
});
$('#deleteEventPreset').addEventListener('click',()=>{
  const presetId=activeEventPresetId;
  if(!presetId)return;
  const preset=getCalendarPreset(presetId);
  if(!preset)return;
  if(!confirm(`Удалить быстрый блок «${preset.title}»?\n\nЭто уберёт только плашку из «Быстрых блоков». Уже созданные события календаря останутся.`))return;

  if(presetId.startsWith('custom-')){
    db.customCalendarPresets=db.customCalendarPresets.filter(x=>x.id!==presetId);
  }else{
    db.hiddenCalendarPresets=Array.from(new Set([...(db.hiddenCalendarPresets||[]),presetId]));
  }

  activeEventPresetId='';
  save(`Быстрый блок «${preset.title}» удалён`);
  $('#eventDialog').close();
  renderCalendar();
});
$('#deleteEvent').addEventListener('click',()=>{
  const id=activeEventId||$('#eventForm').elements.namedItem('id')?.value||'';
  if(!id){alert('Не удалось определить событие для удаления. Закрой окно и открой событие ещё раз.');return}
  if(!confirm('Удалить это событие?'))return;
  const before=db.calendar.length;
  detachWorkoutFromCalendarEvent(id);
  db.calendar=db.calendar.filter(e=>String(e.id)!==String(id));
  if(db.calendar.length===before){alert('Событие не найдено. Обнови календарь и попробуй ещё раз.');return}
  activeEventId='';save();
  $('#eventDialog').close();renderCalendar();renderToday();renderProjects();renderWorkouts();
});
$('#deleteEventSeries').addEventListener('click',()=>{
  const id=activeEventId||$('#eventForm').elements.namedItem('id')?.value||'',item=db.calendar.find(e=>String(e.id)===String(id));
  if(!item?.seriesId)return;
  const count=db.calendar.filter(e=>e.seriesId===item.seriesId).length;
  if(!confirm(`Удалить всю серию (${count} событий)?`))return;
  db.calendar.filter(e=>e.seriesId===item.seriesId).forEach(e=>detachWorkoutFromCalendarEvent(e.id));
  db.calendar=db.calendar.filter(e=>e.seriesId!==item.seriesId);
  activeEventId='';save();
  $('#eventDialog').close();renderCalendar();renderToday();renderProjects();
});
$('#eventDialog').addEventListener('close',()=>{activeEventId='';activeEventPresetId='';});
$('#prevWeek').onclick=()=>{if(calendarView==='day')calendarDay.setDate(calendarDay.getDate()-1);else if(calendarView==='month')calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()-1,1);else calendarWeekStart.setDate(calendarWeekStart.getDate()-7);renderCalendar()};
$('#nextWeek').onclick=()=>{if(calendarView==='day')calendarDay.setDate(calendarDay.getDate()+1);else if(calendarView==='month')calendarMonth=new Date(calendarMonth.getFullYear(),calendarMonth.getMonth()+1,1);else calendarWeekStart.setDate(calendarWeekStart.getDate()+7);renderCalendar()};
$('#currentWeek').onclick=()=>{calendarWeekStart=startOfWeek(new Date());calendarDay=new Date();calendarMonth=new Date(new Date().getFullYear(),new Date().getMonth(),1);renderCalendar()};
$$('[data-calendar-view]').forEach(b=>b.onclick=()=>{calendarView=b.dataset.calendarView;renderCalendar()});

$('#calendarPresetForm').addEventListener('submit',e=>{
  e.preventDefault();
  const f=e.currentTarget;
  const title=f.elements.title.value.trim();
  const category=normalizeCalendarCategory(f.elements.category.value||'other');
  const duration=Math.max(1,Math.min(720,Math.round(Number(f.elements.duration.value||60))));
  const defaultStart=f.elements.defaultStart.value||'19:00';
  if(!title)return;
  const defaultEnd=hhmm(mins(defaultStart)+duration);
  const item={id:'custom-'+uid(),title,category,duration,defaultStart,defaultEnd,allowOvernight:mins(defaultStart)+duration>1440};
  db.customCalendarPresets.push(item);
  save(`Добавлен быстрый блок «${title}»`);
  $('#calendarPresetDialog').close();
  renderCalendar();
});
$('#clearWeek').onclick=clearViewedWeek;
$('#newCalendarEvent').onclick=()=>{cancelMobileCalendarPreset();let date=iso(calendarWeekStart);if(calendarView==='day')date=iso(calendarDay);if(calendarView==='month'){const now=new Date();date=(calendarMonth.getFullYear()===now.getFullYear()&&calendarMonth.getMonth()===now.getMonth())?todayISO:iso(calendarMonth)}openEventDialog({date,start:'19:00',end:'20:00',category:'project'})};
renderCalendar();renderTemplateStatus();
// Обновляем линию текущего времени без перезагрузки страницы.
setInterval(()=>{
  if($('#page-calendar')?.classList.contains('active') && !$('#eventDialog')?.open) renderCalendar();
},60000);

// Надёжное закрытие окон для Safari: крестик, «Отмена», клик по фону и Escape.
$$('[data-dialog-close]').forEach(b=>b.onclick=()=>document.getElementById(b.dataset.dialogClose)?.close());
$$('dialog').forEach(d=>{
  d.addEventListener('click',e=>{if(e.target===d){if(d.id==='projectNoteDialog')closeProjectNote();else if(d.id==='portfolioEditorDialog')closePortfolioEditor();else d.close()}});
  d.addEventListener('cancel',()=>{});
});

applyTheme();
$('#budgetDay').value=db.budgets.day; $('#budgetWeek').value=(Number(db.budgets.day)||1000)*7; $('#budgetMonth').value=db.budgets.month;
$('#saveBudgets').onclick=()=>{ db.budgets.day=Number($('#budgetDay').value)||1000; db.budgets.week=db.budgets.day*7; db.budgets.month=Number($('#budgetMonth').value)||30000; $('#budgetWeek').value=db.budgets.week; save(); renderFood(); alert('Ориентиры сохранены'); };
$('#exportData').onclick=()=>{
  const raw=plannerStorageBlocked?readPlannerSource():JSON.stringify(db,null,2);
  const blob=new Blob([raw||''],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='planner-backup.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
};
$('#importData').onclick=()=>$('#importFile').click();$('#importFile').onchange=async e=>{
 const file=e.target.files?.[0];if(!file)return;const scope=plannerScope,epoch=plannerEpoch;
 try{if(file.size>20*1024*1024)throw Error('Файл больше 20 МБ.');const parsed=validatePlannerState(JSON.parse(await file.text()));const incoming=normalizeCloudData(parsed);if(scope!==plannerScope||epoch!==plannerEpoch)throw Error('Аккаунт изменился. Повтори импорт.');if(!confirm('Импорт заменит текущие данные этого аккаунта. Продолжить?'))return;
 const old=structuredClone(db),blocked=plannerStorageBlocked;pushCurrentStateToUndo();if(!blocked)writeRecoveryBackup('Перед импортом',true);
 try{db=incoming;plannerStorageBlocked=false;save('Данные импортированы')}catch(err){db=old;plannerStorageBlocked=blocked;throw err}renderAfterRemote();
 }catch(err){alert('Импорт не выполнен: '+err.message)}finally{e.target.value=''}
};
$('#resetData').onclick=()=>{
  if(plannerStorageBlocked){alert('Сначала восстанови данные. Исходный файл сохранён.');return}
  const message=cloudUser?'Сбросить данные текущего аккаунта? Сброс будет синхронизирован с облаком и другими устройствами. Текущее состояние сохранится в истории отмены.':'Сбросить локальные данные гостя? Текущее состояние сохранится в истории отмены.';
  if(!confirm(message))return;
  writeRecoveryBackup('Перед сбросом',true);
  const previous=db;db=structuredClone(defaults);
  try{save('Данные сброшены')}catch(err){db=previous;alert(err.message);return}
  renderAfterRemote();
};

const FREE_FOCUS_ID='__free_focus__';
const CAL_FOCUS_PREFIX='__calendar_focus__:';
const TODAY_ATTENTION_CATEGORIES=new Set(['work','project','study']);
let focusStatsPeriod='week';
let workoutWeekStart=startOfWeek(new Date());
let workoutSelectedDate=todayISO;
let historyWeekStart=startOfWeek(new Date());
function calendarFocusId(eventId){return `${CAL_FOCUS_PREFIX}${eventId}`}
function focusCalendarEvent(taskId){if(!String(taskId||'').startsWith(CAL_FOCUS_PREFIX))return null;return db.calendar.find(e=>e.id===String(taskId).slice(CAL_FOCUS_PREFIX.length))||null}
function todayAttentionEvents(){return db.calendar.filter(e=>e.date===todayISO&&TODAY_ATTENTION_CATEGORIES.has(e.category)).sort((a,b)=>mins(a.start)-mins(b.start)||String(a.title).localeCompare(String(b.title),'ru'))}
function focusTaskLabel(taskId){
  if(taskId===FREE_FOCUS_ID)return 'Свободный фокус';
  const event=focusCalendarEvent(taskId);
  return event?.title||'Блок календаря';
}
function focusProjectForTask(taskId){
  if(taskId===FREE_FOCUS_ID)return null;
  const event=focusCalendarEvent(taskId);
  return event?db.projects.find(p=>p.id===event.projectId)||null:null;
}
function focusTaskOptions(selected=''){const events=todayAttentionEvents().filter(e=>calendarEventStatus(e)==='planned');return `<option value="">Выбери блок…</option>`+events.map(e=>`<option value="${escapeHTML(calendarFocusId(e.id))}" ${selected===calendarFocusId(e.id)?'selected':''}>${e.start}–${e.end} · ${escapeHTML(e.title)}</option>`).join('')+`<option value="${FREE_FOCUS_ID}" ${selected===FREE_FOCUS_ID?'selected':''}>Свободный фокус</option>`}

function dayRangeMs(date){const start=new Date(date+'T00:00:00').getTime(),end=new Date(date+'T00:00:00');end.setDate(end.getDate()+1);return [start,end.getTime()]}
function overlapMs(aStart,aEnd,bStart,bEnd){return Math.max(0,Math.min(aEnd,bEnd)-Math.max(aStart,bStart))}
function runningOverlapMs(startDate,endDate){
  if(!db.timer.running||!db.timer.startedAt)return 0;const a=db.timer.startedAt,z=Date.now(),bs=new Date(startDate+'T00:00:00').getTime(),be=new Date(endDate+'T00:00:00').getTime();return overlapMs(a,z,bs,be)
}
function runningMsOnDate(date){if(!db.timer.running||!db.timer.startedAt)return 0;const [s,e]=dayRangeMs(date);return overlapMs(db.timer.startedAt,Date.now(),s,e)}
function busyMsBetween(startMs,endMs){const intervals=[],unknown=[];db.timeEntries.forEach(x=>{const a=Number(x.startedAt),z=Number(x.endedAt)||a+Number(x.ms||0);if(Number.isFinite(a)&&Number.isFinite(z)&&z>a){const q=Math.max(startMs,a),w=Math.min(endMs,z);if(w>q)intervals.push([q,w])}else if(x.date){const [ds,de]=dayRangeMs(x.date);if(de>startMs&&ds<endMs)unknown.push(Number(x.ms||0))}});if(db.timer.running&&db.timer.startedAt){const a=Math.max(startMs,db.timer.startedAt),z=Math.min(endMs,Date.now());if(z>a)intervals.push([a,z])}intervals.sort((a,b)=>a[0]-b[0]);let total=0,s0=null,e0=null;for(const [a,z] of intervals){if(s0===null){s0=a;e0=z}else if(a<=e0)e0=Math.max(e0,z);else{total+=e0-s0;s0=a;e0=z}}if(s0!==null)total+=e0-s0;return total+unknown.reduce((a,x)=>a+x,0)}
function entryMsOnDate(date){const [s,e]=dayRangeMs(date);return busyMsBetween(s,e)}
function entryCountOnDate(date){return db.timeEntries.filter(x=>x.date===date).length+(runningMsOnDate(date)>0?1:0)}
function totalFocusMs(startDate=null,endDate=null){if(startDate&&endDate)return busyMsBetween(new Date(startDate+'T00:00:00').getTime(),new Date(endDate+'T00:00:00').getTime());const dates=new Set(db.timeEntries.map(x=>x.date).filter(Boolean));if(db.timer.running)dates.add(todayISO);return [...dates].reduce((a,d)=>a+entryMsOnDate(d),0)}
function appendTimeSession(taskId,startedAt,endedAt,reason='finish',note=''){
  let cursor=Number(startedAt),end=Number(endedAt);if(!Number.isFinite(cursor)||!Number.isFinite(end)||end<=cursor)return 0;
  const event=focusCalendarEvent(taskId),projectId=event?.projectId||'',project=projectId?db.projects.find(p=>p.id===projectId):null;let total=0,guard=0;
  while(cursor<end&&guard++<370){const d=iso(new Date(cursor)),[,dayEnd]=dayRangeMs(d),partEnd=Math.min(end,dayEnd),ms=Math.max(0,partEnd-cursor);if(ms>=1000){db.timeEntries.push({id:uid(),taskId,taskTitle:event?.title||(taskId===FREE_FOCUS_ID?'Свободный фокус':'Блок календаря'),calendarEventId:event?.id||'',projectId,projectName:project?.name||'',date:d,startedAt:cursor,endedAt:partEnd,ms,reason,note});total+=ms}cursor=partEnd}
  return total
}
function stopActiveTimer(reason='finish'){
  if(!db.timer.running||!db.timer.activeTaskId||!db.timer.startedAt)return 0;
  const end=Date.now(),ms=appendTimeSession(db.timer.activeTaskId,db.timer.startedAt,end,reason);
  db.timer.sessionAccumulatedMs=Number(db.timer.sessionAccumulatedMs||0)+ms;db.timer.running=false;db.timer.startedAt=null;save();return ms
}
function startTaskTimer(taskId){
  if(!taskId)return;
  const isFree=taskId===FREE_FOCUS_ID,event=focusCalendarEvent(taskId);
  if(!isFree&&!event)return;
  if(event&&calendarEventStatus(event)!=='planned')return;
  const samePaused=!db.timer.running&&db.timer.activeTaskId===taskId;
  if(db.timer.running){const same=db.timer.activeTaskId===taskId;stopActiveTimer(same?'restart':'switch')}
  if(!samePaused||db.timer.activeTaskId!==taskId)db.timer.sessionAccumulatedMs=0;
  db.timer.activeTaskId=taskId;db.timer.running=true;db.timer.startedAt=Date.now();
  save();drawTimer();renderProjects();renderToday();renderFocusPage();
}
function timerMs(){return Number(db.timer.sessionAccumulatedMs||0)+(db.timer.running&&db.timer.startedAt?Date.now()-db.timer.startedAt:0)}
function clock(ms){const s=Math.floor(Math.max(0,Number(ms)||0)/1000);return [Math.floor(s/3600),Math.floor(s/60)%60,s%60].map(v=>String(v).padStart(2,'0')).join(':')}
function currentSessionMs(){return timerMs()}

function focusPlanFactSummary(taskId){
  const event=focusCalendarEvent(taskId);
  return event?eventPlanActualLabel(eventPlanActual(event)):'';
}

function drawTimer(){
  const id=db.timer.activeTaskId,event=focusCalendarEvent(id);
  if(id&&id!==FREE_FOCUS_ID&&!event){
    db.timer.activeTaskId='';db.timer.running=false;db.timer.startedAt=null;db.timer.sessionAccumulatedMs=0;
  }
  const activeId=db.timer.activeTaskId,eventNow=focusCalendarEvent(activeId);
  const label=activeId===FREE_FOCUS_ID?'Свободный фокус':(eventNow?.title||'Фокус');
  $('#timerTitle').textContent=label;
  $('#timerTime').textContent=clock(timerMs());
  if($('#todayTimerCompact'))$('#todayTimerCompact').textContent=db.timer.running?clock(timerMs()):activeId?'На паузе':'Остановлен';
  $('#timerToggle').textContent=db.timer.running?'Ⅱ':'▶';
  $('#timerState').textContent=db.timer.running?'Сейчас занят':(activeId?'На паузе':'Таймер остановлен');
  $('#timerStop').disabled=!activeId;
  $('#timerDock').classList.toggle('running',!!db.timer.running);

  if($('#focusBigTime')){
    $('#focusBigTime').textContent=clock(db.timer.running?currentSessionMs():timerMs());
    $('#focusHeroState').textContent=db.timer.running?'Сейчас идёт фокус-сессия':(activeId?'Таймер на паузе':'Таймер остановлен');
    $('#focusCurrentTask').textContent=activeId?label:'Выбери блок и запускай таймер';
    const p=focusProjectForTask(activeId);
    $('#focusCurrentProject').textContent=p?`Проект · ${p.name}`:(activeId===FREE_FOCUS_ID?'Без задачи':'');
    $('#focusToggle').textContent=db.timer.running?'Ⅱ Пауза':(activeId?'▶ Продолжить':'▶ Начать');
    const finish=$('#focusFinish');
    finish.disabled=!activeId;
    finish.textContent=activeId===FREE_FOCUS_ID?'■ Завершить сессию':'✓ Завершить блок';
    const hint=$('#focusSessionHint');
    if(hint){
      hint.textContent=activeId&&activeId!==FREE_FOCUS_ID
        ? focusPlanFactSummary(activeId)
        : 'Можно выбрать «Свободный фокус», если работа не привязана к календарному блоку.';
    }
  }
}
function updateFocusSelects(){
  const main=$('#focusTaskSelect'),manual=$('#focusManualTask');
  if(main){
    const current=main.value||db.timer.activeTaskId||'';
    main.innerHTML=focusTaskOptions(current);
    main.value=db.timer.activeTaskId||current||'';
  }
  if(manual&&!$('#focusManualDialog')?.open){
    const v=manual.value||'';
    manual.innerHTML=todayAttentionEvents().filter(e=>calendarEventStatus(e)==='planned').map(e=>`<option value="${escapeHTML(calendarFocusId(e.id))}">${e.start}–${e.end} · ${escapeHTML(e.title)}</option>`).join('')+
      `<option value="${FREE_FOCUS_ID}">Свободный фокус</option>`;
    if(v&&[...manual.options].some(o=>o.value===v))manual.value=v;
  }
}
function focusPeriodBounds(){
  const now=new Date();
  if(focusStatsPeriod==='day'){
    const s=iso(now),e=new Date(now);e.setDate(e.getDate()+1);
    return {start:s,end:iso(e),label:'Сегодня'};
  }
  if(focusStatsPeriod==='month'){
    const s=new Date(now.getFullYear(),now.getMonth(),1),e=new Date(now.getFullYear(),now.getMonth()+1,1);
    return {start:iso(s),end:iso(e),label:new Intl.DateTimeFormat('ru-RU',{month:'long',year:'numeric'}).format(s)};
  }
  const s=startOfWeek(now),e=new Date(s);e.setDate(e.getDate()+7);
  return {start:iso(s),end:iso(e),label:'Эта неделя'};
}
function focusDaysForBounds(b){
  const out=[],d=new Date(b.start+'T12:00:00'),end=new Date(b.end+'T12:00:00');
  while(d<end&&out.length<35){out.push(iso(d));d.setDate(d.getDate()+1)}
  return out;
}
function updateFocusLiveStats(){
  if(!$('#focusToday'))return;
  const now=new Date(),weekStart=startOfWeek(now),weekEnd=new Date(weekStart);weekEnd.setDate(weekEnd.getDate()+7);
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1),monthEnd=new Date(now.getFullYear(),now.getMonth()+1,1);
  const todayMs=entryMsOnDate(todayISO),weekMs=totalFocusMs(iso(weekStart),iso(weekEnd)),monthMs=totalFocusMs(iso(monthStart),iso(monthEnd)),allMs=totalFocusMs();
  const weekDays=focusDaysForBounds({start:iso(weekStart),end:iso(weekEnd)}).filter(d=>entryMsOnDate(d)>0).length;
  const monthDays=focusDaysForBounds({start:iso(monthStart),end:iso(monthEnd)}).filter(d=>entryMsOnDate(d)>0).length;
  $('#focusToday').textContent=msHoursText(todayMs);
  $('#focusTodaySessions').textContent=`${entryCountOnDate(todayISO)} ${entryCountOnDate(todayISO)===1?'сессия':'сессий'}`;
  $('#focusWeek').textContent=msHoursText(weekMs);
  $('#focusWeekAvg').textContent=`${msHoursText(weekDays?weekMs/weekDays:0)} / активный день`;
  $('#focusMonth').textContent=msHoursText(monthMs);
  $('#focusMonthDays').textContent=`${monthDays} активных дней`;
  $('#focusAllTime').textContent=msHoursText(allMs);
  $('#focusAllSessions').textContent=`${db.timeEntries.length+(db.timer.running?1:0)} сессий`;
}
function renderFocusChart(b){
  const days=focusDaysForBounds(b),values=days.map(d=>entryMsOnDate(d)),max=Math.max(1,...values);
  const compact=days.length>10;
  $('#focusChart').innerHTML=days.map((d,i)=>{
    const dt=new Date(d+'T12:00:00'),val=values[i],pct=val/max*100;
    const label=compact?String(dt.getDate()):new Intl.DateTimeFormat('ru-RU',{weekday:'short'}).format(dt);
    return `<div class="focus-bar-col" title="${d} · ${msHoursText(val)}"><div class="focus-bar-value">${val?msHoursText(val).replace(' ч',''):''}</div><div class="focus-bar-track"><div class="focus-bar-fill" style="height:${pct}%"></div></div><div class="focus-bar-label">${escapeHTML(label)}</div></div>`;
  }).join('');
}
function renderFocusBreakdown(b){
  const rows=db.timeEntries.filter(x=>x.date>=b.start&&x.date<b.end);
  const groups=Object.create(null);
  rows.forEach(x=>{
    const p=x.projectId?db.projects.find(p=>p.id===x.projectId):null;
    const key=p?.id||(x.taskId===FREE_FOCUS_ID?'__free__':'__none__');
    groups[key]??={name:p?.name||x.projectName||(x.taskId===FREE_FOCUS_ID?'Свободный фокус':'Без задачи'),color:p?.color||'#71717a',ms:0};
    groups[key].ms+=Number(x.ms||0);
  });
  if(db.timer.running&&db.timer.startedAt){
    const d=iso(new Date(db.timer.startedAt));
    if(d>=b.start&&d<b.end){
      const p=focusProjectForTask(db.timer.activeTaskId),key=p?.id||(db.timer.activeTaskId===FREE_FOCUS_ID?'__free__':'__none__');
      groups[key]??={name:p?.name||(db.timer.activeTaskId===FREE_FOCUS_ID?'Свободный фокус':'Без задачи'),color:p?.color||'#71717a',ms:0};
      groups[key].ms+=runningOverlapMs(b.start,b.end);
    }
  }
  const list=Object.values(groups).sort((a,b)=>b.ms-a.ms),total=list.reduce((a,x)=>a+x.ms,0);
  $('#focusPeriodTotal').textContent=msHoursText(total);
  $('#focusBreakdown').innerHTML=list.length?list.map(x=>`<div class="focus-breakdown-row"><div class="focus-breakdown-head"><span><i class="dot" style="background:${escapeHTML(/^#[0-9a-f]{6}$/i.test(x.color||'')?x.color:'#71717a')};display:inline-block;margin-right:6px"></i>${escapeHTML(x.name)}</span><strong>${msHoursText(x.ms)}</strong></div><div class="bar"><span style="width:${total?Math.min(100,x.ms/total*100):0}%;background:${escapeHTML(/^#[0-9a-f]{6}$/i.test(x.color||'')?x.color:'#71717a')}"></span></div></div>`).join(''):'<div class="empty">За этот период ещё нет записанного времени.</div>';
}
function renderFocusSessions(b){
  const rows=db.timeEntries.filter(x=>x.date>=b.start&&x.date<b.end).sort((a,b)=>Number(b.startedAt||0)-Number(a.startedAt||0)).slice(0,60);
  $('#focusSessionCount').textContent=`${rows.length} сессий`;
  $('#focusSessionsList').innerHTML=rows.length?rows.map(x=>{
    const p=x.projectId?db.projects.find(p=>p.id===x.projectId):null,event=x.calendarEventId?db.calendar.find(e=>e.id===x.calendarEventId):null;
    const time=x.startedAt?new Intl.DateTimeFormat('ru-RU',{hour:'2-digit',minute:'2-digit'}).format(new Date(Number(x.startedAt))):'—';
    return `<div class="focus-session"><div class="focus-session-date">${x.date}<br>${time}</div><div><div class="focus-session-title">${escapeHTML(x.taskId===FREE_FOCUS_ID?'Свободный фокус':(event?.title||x.taskTitle||'Блок календаря'))}</div><div class="focus-session-meta">${(p?.name||x.projectName)?escapeHTML(p?.name||x.projectName)+' · ':''}${escapeHTML(x.note||sessionReasonLabel(x.reason))}</div></div><div class="focus-session-duration">${clock(x.ms)}</div><button class="delete-row" data-focus-page-del="${escapeHTML(x.id)}" title="Удалить">×</button></div>`;
  }).join(''):'<div class="empty">Сессий за этот период пока нет.</div>';
  $$('[data-focus-page-del]').forEach(btn=>btn.onclick=()=>{
    if(!confirm('Удалить эту запись времени?'))return;
    db.timeEntries=db.timeEntries.filter(x=>x.id!==btn.dataset.focusPageDel);save();renderFocusPage();renderProjects();
  });
}
function renderFocusPage(){
  updateFocusSelects();
  drawTimer();
  if($('.today-focus-statistics')?.open)updateFocusLiveStats();
}

$('#focusTaskSelect')?.addEventListener('change',e=>{
  const next=e.target.value;
  if(!next)return;
  if(db.timer.running&&db.timer.activeTaskId!==next){
    if(!confirm('Переключить таймер на другой блок? Текущая сессия сохранится.')){e.target.value=db.timer.activeTaskId||'';return}
    startTaskTimer(next);return;
  }
  if(db.timer.activeTaskId!==next)db.timer.sessionAccumulatedMs=0;db.timer.activeTaskId=next;save();drawTimer();renderFocusPage();
});
$('#focusToggle').onclick=()=>{
  if(db.timer.running)stopActiveTimer('pause');
  else{
    const id=$('#focusTaskSelect').value||db.timer.activeTaskId;
    if(!id){alert('Сначала выбери календарный блок или «Свободный фокус».');return}
    startTaskTimer(id);return;
  }
  drawTimer();renderFocusPage();renderProjects();renderToday();
};
$('#focusFinish').onclick=()=>{
  const id=db.timer.activeTaskId||$('#focusTaskSelect').value;if(!id)return;const event=focusCalendarEvent(id);
  if(db.timer.running)stopActiveTimer('finish');
  db.timer.activeTaskId='';db.timer.sessionAccumulatedMs=0;db.timer.startedAt=null;db.timer.running=false;
  if(event)setCalendarEventStatus(event.id,'done',{saveNow:false});
  save(event?`«${event.title}» выполнено`:'Фокус-сессия завершена');
  drawTimer();renderFocusPage();renderProjects();renderToday();renderCalendar();renderArchive();
};
$$('[data-focus-period]').forEach(b=>b.onclick=()=>{focusStatsPeriod=b.dataset.focusPeriod;renderFocusPage()});

$('#focusManualAdd').onclick=()=>{
  updateFocusSelects();const f=$('#focusManualForm');f.reset();f.elements.date.value=todayISO;f.elements.startTime.value='12:00';
  $('#focusManualTask').innerHTML=todayAttentionEvents().filter(ev=>calendarEventStatus(ev)==='planned').map(ev=>`<option value="${escapeHTML(calendarFocusId(ev.id))}">${ev.start}–${ev.end} · ${escapeHTML(ev.title)}</option>`).join('')+`<option value="${FREE_FOCUS_ID}">Свободный фокус</option>`;
  $('#focusManualDialog').showModal();
};
$('#focusManualForm').addEventListener('submit',e=>{
  e.preventDefault();const f=e.currentTarget,minutes=Math.round(Number(f.elements.minutes.value)),taskId=f.elements.taskId.value||FREE_FOCUS_ID;
  if(!minutes||minutes<1||minutes>1440)return;
  const date=f.elements.date.value||todayISO,startTime=f.elements.startTime.value||'12:00';
  const startedAt=new Date(`${date}T${startTime}:00`).getTime(),ms=minutes*60000;
  appendTimeSession(taskId,startedAt,startedAt+ms,'manual',(f.elements.note.value||'').trim());
  save();$('#focusManualDialog').close();renderFocusPage();renderProjects();renderToday();renderCalendar();refreshAnalyticsViews();
});

$('#timerToggle').onclick=()=>{
  if(db.timer.running)stopActiveTimer('pause');
  else if(db.timer.activeTaskId){startTaskTimer(db.timer.activeTaskId);return}
  else{showPage('today');setTimeout(()=>$('#focusTaskSelect')?.focus(),0);return}
  drawTimer();renderProjects();renderToday();renderFocusPage();
};
$('#timerStop').onclick=()=>{
  if(db.timer.running)stopActiveTimer('finish');
  db.timer.activeTaskId='';db.timer.sessionAccumulatedMs=0;save();drawTimer();renderProjects();renderToday();renderFocusPage();
};
$('#timerOpenFocus').onclick=()=>showPage('today');
$('#timerFocusLink').onclick=()=>showPage('today');

setInterval(()=>{ if(!document.hidden)drawTimer(); },1000);
setInterval(()=>{if(!document.hidden){refreshAnalyticsViews();if(db.timer.running&&$('#page-today')?.classList.contains('active')&&$('.today-focus-statistics')?.open)updateFocusLiveStats()}},15000);
$('.today-focus-statistics')?.addEventListener('toggle',()=>{if($('.today-focus-statistics').open)updateFocusLiveStats()});
$('#eventForm').elements.start.addEventListener('input',refreshAnalyticsViews);
$('#eventForm').elements.end.addEventListener('input',refreshAnalyticsViews);

function refreshCurrentDateIfNeeded(){
  const next=iso(new Date());
  if(next===todayISO)return;
  const old=todayISO,oldDate=new Date(old+'T12:00:00');
  const wasFoodCurrent=iso(foodWeekStart)===iso(startOfWeek(oldDate));
  const wasWorkoutCurrent=iso(workoutWeekStart)===iso(startOfWeek(oldDate));
  const wasCalendarCurrent=iso(calendarWeekStart)===iso(startOfWeek(oldDate));
  todayISO=next;
  if(wasFoodCurrent)foodWeekStart=startOfWeek(new Date());
  if(wasWorkoutCurrent){workoutWeekStart=startOfWeek(new Date());workoutSelectedDate=todayISO}
  if(wasCalendarCurrent)calendarWeekStart=startOfWeek(new Date());
  renderToday();renderCalendar();renderFood();renderWorkouts();renderProjects();renderFocusPage();drawTimer();
  if(typeof renderLearning==='function')renderLearning();if(profileOverviewReady)renderProfileOverview();
}
setInterval(refreshCurrentDateIfNeeded,60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshCurrentDateIfNeeded()});
window.addEventListener('error',event=>{if(event.error?.name==='PlannerSaveError'){event.preventDefault();alert(event.error.message)}});
setTimeout(()=>{if(plannerStorageBlocked){showPage('settings');updateCloudUI();alert('Данные не удалось прочитать. Исходная версия сохранена. Используй восстановление резерва или импорт JSON в настройках.')}},0);
drawTimer();

// Portfolio workspace: independent records, linked projects, explicit save.
let portfolioCollectionId='',portfolioDraft=null,portfolioOriginal=null,portfolioAccountKey='',portfolioUploadToken=0,portfolioUploading=false;
function portfolioCollections(){return (db.portfolioCollections||[]).filter(x=>x&&typeof x.id==='string')}
function portfolioWorks(){return (db.portfolioWorks||[]).filter(x=>x&&typeof x.id==='string')}
function portfolioDateLabel(value){const date=new Date(value);return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ru',{day:'numeric',month:'short'}).format(date):'недавно'}
function portfolioCollectionName(id){return portfolioCollections().find(c=>c.id===id)?.name||'Без коллекции'}
function safePortfolioImage(value){return typeof value==='string'&&value.length<=220000&&/^data:image\/(jpeg|png|webp);base64,[a-zA-Z0-9+/=]+$/.test(value)?value:''}
function portfolioImageList(work){return (Array.isArray(work?.images)?work.images:[]).filter(x=>x&&safePortfolioImage(x.data))}
function portfolioCover(work){const images=portfolioImageList(work);return images.find(x=>x.id===work.coverImageId)||images[0]||null}
function safePortfolioURL(value){
  if(!value)return '';try{const url=new URL(String(value).trim());return ['https:','http:'].includes(url.protocol)?url.href:''}catch{return ''}
}
function portfolioFilteredWorks(){
  const query=$('#portfolioSearch').value.trim().toLocaleLowerCase('ru');
  return portfolioWorks().filter(w=>(!portfolioCollectionId||w.collectionId===portfolioCollectionId)&&(!query||[w.title,w.description,portfolioCollectionName(w.collectionId)].some(t=>String(t||'').toLocaleLowerCase('ru').includes(query)))).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));
}
function renderPortfolio(){
  if(!$('#page-portfolio'))return;
  if(portfolioCollectionId&&!portfolioCollections().some(c=>c.id===portfolioCollectionId))portfolioCollectionId='';
  $('#portfolioCollections').innerHTML=`<button type="button" class="btn ${portfolioCollectionId?'':'primary'}" data-portfolio-collection="">Все работы</button>`+portfolioCollections().map(c=>`<button type="button" class="btn ${portfolioCollectionId===c.id?'primary':''}" data-portfolio-collection="${escapeHTML(c.id)}">${escapeHTML(c.name)}</button>`).join('');
  $$('[data-portfolio-collection]').forEach(b=>b.onclick=()=>{portfolioCollectionId=b.dataset.portfolioCollection;renderPortfolio()});
  $('#portfolioDeleteCollection').hidden=!portfolioCollectionId;
  const works=portfolioFilteredWorks();$('#portfolioCount').textContent=`${works.length} работ`;
  $('#portfolioGrid').innerHTML=works.length?works.map(w=>{const image=portfolioCover(w);return `<article class="portfolio-work ${portfolioDraft?.id===w.id?'selected':''}"><button type="button" class="portfolio-work-open" data-portfolio-open="${escapeHTML(w.id)}"><span class="portfolio-work-cover">${image?`<img src="${image.data}" alt="Обложка: ${escapeHTML(w.title)}" loading="lazy">`:`<span class="portfolio-no-cover">${studioIcon('image')}<span>Добавь обложку</span></span>`}</span><span class="portfolio-work-copy"><strong>${escapeHTML(w.title||'Без названия')}</strong><span class="portfolio-work-tags"><span>${escapeHTML(portfolioCollectionName(w.collectionId))}</span><span class="${w.status==='ready'?'portfolio-ready':''}">${w.status==='ready'?'Готово':'Черновик'}</span></span><small>${studioIcon('clock')}${w.updatedAt?`Обновлено ${escapeHTML(portfolioDateLabel(w.updatedAt))}`:'Работа в портфолио'}</small></span></button><button type="button" class="portfolio-work-delete" data-portfolio-delete="${escapeHTML(w.id)}" aria-label="Удалить работу ${escapeHTML(w.title)}">×</button></article>`}).join('')+`<button type="button" class="portfolio-add-card" data-portfolio-add="true">${studioIcon('plus')}Добавить работу</button>`:`<div class="portfolio-empty">${studioIcon('image')}<strong>${portfolioWorks().length?'Ничего не найдено':'Твои работы — здесь'}</strong><p>${portfolioWorks().length?'Измени поиск или коллекцию.':'Добавь первую работу: описание, изображения и ссылку на результат.'}</p></div>`;
  $$('[data-portfolio-add]').forEach(b=>b.onclick=()=>openPortfolioWork());
  $$('[data-portfolio-open]').forEach(b=>b.onclick=()=>openPortfolioWork(b.dataset.portfolioOpen));
  $$('[data-portfolio-delete]').forEach(b=>b.onclick=()=>deletePortfolioWork(b.dataset.portfolioDelete));
}
function portfolioFormValues(){
  if(!portfolioDraft)return null;
  return {...portfolioDraft,title:$('#portfolioTitle').value.trim(),description:$('#portfolioDescription').value,collectionId:$('#portfolioCollectionSelect').value,projectId:$('#portfolioProjectSelect').value,status:$('#portfolioStatus').value==='ready'?'ready':'draft',url:$('#portfolioURL').value.trim()};
}
function portfolioDirty(){return portfolioDraft&&JSON.stringify(portfolioFormValues())!==JSON.stringify(portfolioOriginal)}
function closePortfolioEditor(force=false){
  if(portfolioUploading&&!force){$('#portfolioSaveStatus').textContent='Подожди, изображения ещё загружаются.';return false}
  if(!force&&portfolioDirty()&&!confirm('Закрыть работу без сохранения изменений?'))return false;
  portfolioUploadToken++;portfolioDraft=null;portfolioOriginal=null;$('#portfolioEditorDialog').close();$('#portfolioLayout').classList.remove('has-editor');renderPortfolio();return true;
}
function openPortfolioWork(id=''){
  if(portfolioDraft&&!closePortfolioEditor())return false;
  const work=id?portfolioWorks().find(w=>w.id===id):null;if(id&&!work)return false;
  portfolioDraft=work?structuredClone(work):{id:uid(),title:'',description:'',collectionId:portfolioCollectionId,projectId:'',status:'draft',url:'',images:[],coverImageId:''};
  portfolioOriginal=structuredClone(portfolioDraft);portfolioAccountKey=profileStorageKey();
  $('#portfolioTitle').value=portfolioDraft.title||'';$('#portfolioDescription').value=portfolioDraft.description||'';$('#portfolioURL').value=portfolioDraft.url||'';$('#portfolioStatus').value=portfolioDraft.status==='ready'?'ready':'draft';
  $('#portfolioCollectionSelect').innerHTML='<option value="">Без коллекции</option>'+portfolioCollections().map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join('');$('#portfolioCollectionSelect').value=portfolioDraft.collectionId||'';
  $('#portfolioProjectSelect').innerHTML='<option value="">Без привязки</option>'+db.projects.map(p=>`<option value="${escapeHTML(p.id)}">${escapeHTML(p.name)}${p.archived?' · архив':''}</option>`).join('');$('#portfolioProjectSelect').value=portfolioDraft.projectId||'';$('#portfolioOpenProject').hidden=!$('#portfolioProjectSelect').value;
  $('#portfolioSaveStatus').textContent=work?'Изменения сохраняются кнопкой «Готово»':'Новая работа · нажми «Готово», чтобы сохранить';
  $('#portfolioEditorTitle').textContent=work?'Редактирование работы':'Новая работа';renderPortfolioImages();
  $('#portfolioLayout').classList.add('has-editor');const dialog=$('#portfolioEditorDialog');if((window.innerWidth<=820||window.matchMedia?.('(pointer: coarse)').matches))dialog.showModal();else dialog.show();
  renderPortfolio();$('#portfolioTitle').focus();return true;
}
function savePortfolioWork(){
  if(!portfolioDraft||portfolioUploading)return false;
  if(portfolioAccountKey!==profileStorageKey()){$('#portfolioSaveStatus').textContent='Аккаунт изменился. Вернись к исходному профилю.';return false}
  const work=portfolioFormValues();if(!work.title){$('#portfolioSaveStatus').textContent='Укажи название работы.';$('#portfolioTitle').focus();return false}
  if(work.url&&!safePortfolioURL(work.url)){$('#portfolioSaveStatus').textContent='Укажи ссылку с http:// или https://.';return false}
  const previous=portfolioWorks().find(w=>w.id===work.id);
  if(portfolioOriginal.updatedAt&&(!previous||previous.updatedAt!==portfolioOriginal.updatedAt)){$('#portfolioSaveStatus').textContent='Работа изменилась на другом устройстве. Скопируй текст и открой её снова.';return false}
  work.url=safePortfolioURL(work.url);work.collectionId=portfolioCollections().some(c=>c.id===work.collectionId)?work.collectionId:'';work.projectId=db.projects.some(p=>p.id===work.projectId)?work.projectId:'';
  const now=new Date().toISOString(),record={...previous,...work,createdAt:previous?.createdAt||now,updatedAt:now};
  const old=db.portfolioWorks,meta=structuredClone(db.meta);db.portfolioWorks=portfolioWorks().filter(w=>w.id!==record.id).concat(record);
  try{save('Работа портфолио сохранена')}
  catch(err){console.error(err);db.portfolioWorks=old;db.meta=meta;$('#portfolioSaveStatus').textContent='Не удалось сохранить. Редактор остаётся открытым — попробуй ещё раз.';return false}
  closePortfolioEditor(true);return true;
}
function deletePortfolioWork(id){
  const work=portfolioWorks().find(w=>w.id===id);if(!work||!confirm(`Удалить работу «${work.title}» из портфолио? Связанная задача останется.`))return false;
  const old=db.portfolioWorks,meta=structuredClone(db.meta);db.portfolioWorks=portfolioWorks().filter(w=>w.id!==id);
  try{save('Работа удалена из портфолио')}catch(err){db.portfolioWorks=old;db.meta=meta;alert('Не удалось сохранить удаление. Попробуй ещё раз.');return false}
  if(portfolioDraft?.id===id)closePortfolioEditor(true);renderPortfolio();return true;
}
function renderPortfolioImages(){
  if(!portfolioDraft)return;
  const images=portfolioImageList(portfolioDraft),cover=portfolioCover(portfolioDraft);
  $('#portfolioCoverPreview').innerHTML=cover?`<img src="${cover.data}" alt="Обложка работы">`:'<span aria-hidden="true">▧</span><strong>Добавить обложку</strong><small>JPG, PNG, WEBP · до 8 изображений</small>';
  $('#portfolioImageGallery').innerHTML=images.map(img=>`<div class="portfolio-image ${cover?.id===img.id?'is-cover':''}"><button type="button" data-portfolio-cover="${escapeHTML(img.id)}" aria-label="Выбрать обложкой"><img src="${img.data}" alt="${escapeHTML(img.name||'Изображение')}"></button><button type="button" data-portfolio-remove-image="${escapeHTML(img.id)}" aria-label="Удалить изображение">×</button></div>`).join('');
  $$('[data-portfolio-cover]').forEach(b=>b.onclick=()=>{portfolioDraft.coverImageId=b.dataset.portfolioCover;renderPortfolioImages();$('#portfolioSaveStatus').textContent='Обложка изменена · нажми «Готово»'});
  $$('[data-portfolio-remove-image]').forEach(b=>b.onclick=()=>{portfolioDraft.images=portfolioDraft.images.filter(x=>x.id!==b.dataset.portfolioRemoveImage);if(portfolioDraft.coverImageId===b.dataset.portfolioRemoveImage)portfolioDraft.coverImageId=portfolioDraft.images[0]?.id||'';renderPortfolioImages();$('#portfolioSaveStatus').textContent='Изображение удалено из черновика · нажми «Готово»'});
}
async function preparePortfolioImage(file){
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>10*1024*1024)throw Error('Выбери JPG, PNG или WEBP до 10 МБ.');
  const url=URL.createObjectURL(file);
  try{
    const image=new Image();image.src=url;await image.decode();if(!image.naturalWidth||!image.naturalHeight)throw Error('Не удалось прочитать изображение.');
    const scale=Math.min(1,1200/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
    const context=canvas.getContext('2d');if(!context)throw Error('Не удалось подготовить изображение.');context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
    let data='';for(const quality of [.78,.62,.46,.3]){data=canvas.toDataURL('image/jpeg',quality);if(data.length<=180000)break}
    if(!safePortfolioImage(data))throw Error('Изображение слишком сложное. Выбери файл меньшего размера.');return {id:uid(),name:file.name.slice(0,120),data};
  }finally{URL.revokeObjectURL(url)}
}
async function addPortfolioImages(files){
  if(!portfolioDraft||portfolioUploading)return false;
  const selected=Array.from(files||[]);if(!selected.length)return false;
  if((portfolioDraft.images?.length||0)+selected.length>8){$('#portfolioSaveStatus').textContent='Можно добавить до 8 изображений в одну работу.';return false}
  const token=++portfolioUploadToken;portfolioUploading=true;$('#portfolioCommit').disabled=true;$('#portfolioSaveStatus').textContent='Подготовка изображений…';
  try{
    const images=[];for(const file of selected)images.push(await preparePortfolioImage(file));
    if(token!==portfolioUploadToken||!portfolioDraft)return false;
    portfolioDraft.images=[...(portfolioDraft.images||[]),...images];portfolioDraft.coverImageId||=images[0]?.id||'';renderPortfolioImages();$('#portfolioSaveStatus').textContent='Изображения добавлены · нажми «Готово»';return true;
  }catch(err){if(token===portfolioUploadToken)$('#portfolioSaveStatus').textContent=err.message||'Не удалось добавить изображения.';return false}
  finally{portfolioUploading=false;$('#portfolioCommit').disabled=false;$('#portfolioFiles').value=''}
}
function addPortfolioCollection(name){
  name=String(name||'').trim().slice(0,50);if(!name)return false;
  if(portfolioCollections().some(c=>String(c.name||'').toLocaleLowerCase('ru')===name.toLocaleLowerCase('ru'))){$('#portfolioCollectionMessage').textContent='Коллекция с таким названием уже есть.';return false}
  const old=db.portfolioCollections,meta=structuredClone(db.meta),collection={id:uid(),name};db.portfolioCollections=[...portfolioCollections(),collection];
  try{save('Коллекция создана')}catch{db.portfolioCollections=old;db.meta=meta;$('#portfolioCollectionMessage').textContent='Не удалось сохранить коллекцию.';return false}
  portfolioCollectionId=collection.id;$('#portfolioCollectionDialog').close();renderPortfolio();return true;
}
function deletePortfolioCollection(){
  const collection=portfolioCollections().find(c=>c.id===portfolioCollectionId);if(!collection||!confirm(`Удалить коллекцию «${collection.name}»? Работы останутся в «Без коллекции».`))return false;
  const oldCollections=db.portfolioCollections,oldWorks=db.portfolioWorks,meta=structuredClone(db.meta);db.portfolioCollections=portfolioCollections().filter(c=>c.id!==collection.id);db.portfolioWorks=portfolioWorks().map(w=>w.collectionId===collection.id?{...w,collectionId:''}:w);
  try{save('Коллекция удалена')}catch{db.portfolioCollections=oldCollections;db.portfolioWorks=oldWorks;db.meta=meta;alert('Не удалось сохранить изменения.');return false}
  if(portfolioDraft?.collectionId===collection.id){portfolioDraft.collectionId='';$('#portfolioCollectionSelect').value=''}portfolioCollectionId='';renderPortfolio();return true;
}
function showPortfolioPreview(){
  const works=portfolioWorks().filter(w=>w.status==='ready');$('#portfolioPreviewName').textContent=profileDisplayName();
  $('#portfolioPreviewBody').innerHTML=works.length?works.map(w=>{const cover=portfolioCover(w),url=safePortfolioURL(w.url),images=portfolioImageList(w).filter(img=>img.id!==cover?.id);return `<article class="portfolio-preview-work">${cover?`<img src="${cover.data}" alt="${escapeHTML(w.title)}">`:''}<h2>${escapeHTML(w.title)}</h2><p class="portfolio-preview-description">${escapeHTML(w.description||'')}</p><div class="portfolio-preview-images">${images.map(img=>`<img src="${img.data}" alt="${escapeHTML(img.name||w.title)}" loading="lazy">`).join('')}</div>${url?`<a class="btn" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">Открыть проект ↗</a>`:''}</article>`}).join(''):'<div class="empty">Нет готовых работ. Измени статус работы на «Готово», чтобы увидеть её здесь.</div>';
  $('#portfolioPreviewDialog').showModal();
}
$('#portfolioAddWork').onclick=()=>openPortfolioWork();$('#portfolioSearch').addEventListener('input',renderPortfolio);$('#portfolioPreview').onclick=showPortfolioPreview;
$('#portfolioAddCollection').onclick=()=>{$('#portfolioCollectionForm').reset();$('#portfolioCollectionMessage').textContent='';$('#portfolioCollectionDialog').showModal()};
$('#portfolioCollectionForm').addEventListener('submit',e=>{e.preventDefault();addPortfolioCollection($('#portfolioCollectionName').value)});$('#portfolioDeleteCollection').onclick=deletePortfolioCollection;
$('#portfolioCloseEditor').onclick=()=>closePortfolioEditor();$('#portfolioEditorDialog').addEventListener('cancel',e=>{e.preventDefault();closePortfolioEditor()});$('#portfolioForm').addEventListener('submit',e=>{e.preventDefault();savePortfolioWork()});
['portfolioTitle','portfolioDescription','portfolioURL','portfolioStatus','portfolioCollectionSelect','portfolioProjectSelect'].forEach(id=>$('#'+id).addEventListener('input',()=>{$('#portfolioSaveStatus').textContent='Есть изменения · нажми «Готово»'}));
$('#portfolioOpenProject').onclick=()=>{const id=$('#portfolioProjectSelect').value;if(id&&closePortfolioEditor())showPage('projects',{projectId:id})};$('#portfolioProjectSelect').addEventListener('change',()=>{$('#portfolioOpenProject').hidden=!$('#portfolioProjectSelect').value});
$('#portfolioCoverPreview').onclick=()=>$('#portfolioFiles').click();$('#portfolioAddImages').onclick=()=>$('#portfolioFiles').click();$('#portfolioFiles').addEventListener('change',e=>addPortfolioImages(e.target.files));
// End portfolio workspace.

// Avatar cropper: fixed circular preview, bounded pan, zoom, explicit apply.
let avatarCrop=null,avatarCropToken=0;
function avatarCropGeometry(state){
  const width=state.image.naturalWidth,height=state.image.naturalHeight,scale=Math.max(300/width,300/height)*state.zoom;
  state.x=Math.max(-(width*scale-300)/2,Math.min((width*scale-300)/2,state.x));state.y=Math.max(-(height*scale-300)/2,Math.min((height*scale-300)/2,state.y));
  return {scale,sx:((width*scale-300)/2-state.x)/scale,sy:((height*scale-300)/2-state.y)/scale,side:300/scale};
}
function drawAvatarCrop(){
  if(!avatarCrop)return;const g=avatarCropGeometry(avatarCrop),canvas=$('#avatarCropCanvas'),c=canvas.getContext('2d');c.clearRect(0,0,600,600);c.fillStyle='#fff';c.fillRect(0,0,600,600);c.drawImage(avatarCrop.image,g.sx,g.sy,g.side,g.side,0,0,600,600);$('#avatarCropZoom').value=avatarCrop.zoom;$('#avatarCropZoomValue').textContent=Math.round(avatarCrop.zoom*100)+'%';
}
async function openAvatarCrop(file){
  const token=++avatarCropToken,key=profileStorageKey();setProfileBusy(true);
  let url='';
  try{
    if(!file.type.startsWith('image/')||file.type==='image/svg+xml')throw Error('Выбери фото JPEG, PNG или WEBP.');
    if(file.size>10*1024*1024)throw Error('Выбери фото до 10 МБ.');
    url=URL.createObjectURL(file);const img=new Image();img.src=url;await img.decode();
    if(token!==avatarCropToken||key!==profileStorageKey())return false;
    if(!img.naturalWidth||!img.naturalHeight)throw Error('Изображение пустое.');
    closeAvatarCrop();avatarCrop={image:img,url,key,zoom:1,x:0,y:0,pointers:new Map()};url='';drawAvatarCrop();$('#avatarCropMessage').textContent='';$('#avatarCropDialog').showModal();return true;
  }catch(err){if(token===avatarCropToken)closeAvatarCrop();if(key===profileStorageKey())profileMessage(err.message||'Не удалось открыть фото.',true);return false}
  finally{if(url)URL.revokeObjectURL(url);setProfileBusy(false)}
}
function closeAvatarCrop(){if(avatarCrop?.url)URL.revokeObjectURL(avatarCrop.url);avatarCrop=null;$('#avatarCropDialog').close()}
function applyAvatarCrop(){
  if(!avatarCrop)return false;if(avatarCrop.key!==profileStorageKey()){$('#avatarCropMessage').textContent='Профиль изменился. Выбери фото заново.';return false}
  try{
    const g=avatarCropGeometry(avatarCrop),canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;const c=canvas.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,512,512);c.drawImage(avatarCrop.image,g.sx,g.sy,g.side,g.side,0,0,512,512);
    let photo=canvas.toDataURL('image/jpeg',.82);for(const quality of [.65,.5,.35]){if(photo.length<=60000)break;photo=canvas.toDataURL('image/jpeg',quality)}if(photo.length>60000){canvas.width=192;canvas.height=192;c.fillStyle='#fff';c.fillRect(0,0,192,192);c.drawImage(avatarCrop.image,g.sx,g.sy,g.side,g.side,0,0,192,192);photo=canvas.toDataURL('image/jpeg',.7);}if(!safeProfilePhoto(photo))throw Error('Не удалось подготовить фото.');
    profileDraftPhoto=photo;profileDraftDirty=true;showProfileAvatar('profilePhoto','profileInitials',photo,$('#profileName').value);$('#profileRemovePhoto').hidden=false;profileMessage('Фото настроено. Нажми «Сохранить профиль».');closeAvatarCrop();return true;
  }catch(err){$('#avatarCropMessage').textContent=err.message||'Не удалось применить кадр.';return false}
}
function avatarPointerPosition(event){const r=$('#avatarCropCanvas').getBoundingClientRect();return {x:(event.clientX-r.left)*300/r.width,y:(event.clientY-r.top)*300/r.height}}
function avatarGestureSnapshot(){
  if(!avatarCrop)return;const pts=[...avatarCrop.pointers.values()];avatarCrop.gesture={x:avatarCrop.x,y:avatarCrop.y,zoom:avatarCrop.zoom,center:pts.length?{x:pts.reduce((s,p)=>s+p.x,0)/pts.length,y:pts.reduce((s,p)=>s+p.y,0)/pts.length}:{x:150,y:150},distance:pts.length===2?Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y):0};
}
$('#avatarCropCanvas').addEventListener('pointerdown',e=>{if(!avatarCrop||e.button>0)return;e.preventDefault();avatarCrop.pointers.set(e.pointerId,avatarPointerPosition(e));e.currentTarget.setPointerCapture(e.pointerId);avatarGestureSnapshot()});
$('#avatarCropCanvas').addEventListener('pointermove',e=>{
  if(!avatarCrop||!avatarCrop.pointers.has(e.pointerId))return;e.preventDefault();avatarCrop.pointers.set(e.pointerId,avatarPointerPosition(e));const pts=[...avatarCrop.pointers.values()],g=avatarCrop.gesture,center={x:pts.reduce((s,p)=>s+p.x,0)/pts.length,y:pts.reduce((s,p)=>s+p.y,0)/pts.length};
  if(pts.length===2&&g.distance){avatarCrop.zoom=Math.min(4,Math.max(1,g.zoom*Math.hypot(pts[1].x-pts[0].x,pts[1].y-pts[0].y)/g.distance));const ratio=avatarCrop.zoom/g.zoom;avatarCrop.x=(g.x+150-g.center.x)*ratio+center.x-150;avatarCrop.y=(g.y+150-g.center.y)*ratio+center.y-150}else{avatarCrop.x=g.x+center.x-g.center.x;avatarCrop.y=g.y+center.y-g.center.y}drawAvatarCrop();
});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('#avatarCropCanvas').addEventListener(name,e=>{if(avatarCrop){avatarCrop.pointers.delete(e.pointerId);avatarGestureSnapshot()}});
$('#avatarCropCanvas').addEventListener('keydown',e=>{if(!avatarCrop||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();avatarCrop.x+=e.key==='ArrowLeft'?-10:e.key==='ArrowRight'?10:0;avatarCrop.y+=e.key==='ArrowUp'?-10:e.key==='ArrowDown'?10:0;drawAvatarCrop()});
$('#avatarCropZoom').addEventListener('input',e=>{if(avatarCrop){avatarCrop.zoom=Math.min(4,Math.max(1,Number(e.target.value)||1));drawAvatarCrop();avatarGestureSnapshot()}});
$('#avatarCropCenter').onclick=()=>{if(avatarCrop){avatarCrop.x=0;avatarCrop.y=0;drawAvatarCrop();avatarGestureSnapshot()}};$('#avatarCropReset').onclick=()=>{if(avatarCrop){avatarCrop.zoom=1;avatarCrop.x=0;avatarCrop.y=0;drawAvatarCrop();avatarGestureSnapshot()}};
$('#avatarCropApply').onclick=applyAvatarCrop;$('#avatarCropCancel').onclick=closeAvatarCrop;$('#avatarCropClose').onclick=closeAvatarCrop;$('#avatarCropDialog').addEventListener('cancel',e=>{e.preventDefault();closeAvatarCrop()});
$('#profileRemovePhoto').onclick=()=>{if(profileBusy)return;if(!profileDraftPhoto)return;profileDraftPhoto='';profileDraftDirty=true;$('#profileRemovePhoto').hidden=true;showProfileAvatar('profilePhoto','profileInitials','',$('#profileName').value);profileMessage('Фото удалено из черновика. Нажми «Сохранить профиль».')};
// End avatar cropper.

// Learning workspace: explicit edits, evidence-based progress, self-assessed reviews.
function studioIcon(name){
  const paths={code:'<path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18"/>',book:'<path d="M12 5v15M12 5C8 2 3 4 3 4v15s5-2 9 1c4-3 9-1 9-1V4s-5-2-9 1Z"/>',chat:'<path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-1 1v-8.5A8.5 8.5 0 0 1 11.5 4H13a8 8 0 0 1 8 7.5Z"/>',file:'<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/>',image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',plus:'<path d="M12 5v14M5 12h14"/>'};
  return `<span class="studio-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${paths[name]||paths.book}</svg></span>`;
}
function learningSkillIcon(skill){return /код|разработ|программ|css|html|javascript|python|web|веб/i.test(skill.title||'')?'code':/язык|англий|english|общени/i.test(skill.title||'')?'chat':'book'}

let learningSkillId='',learningView='skills',learningTab='route',learningEditor=null,learningEditorAccount='',learningEditorStamp='',learningEditorSnapshot='',learningEditorInitial='',learningFileDraft=null,learningFileBusy=false,learningReviewActive=null,learningReviewShown=false,learningReviewAccount='',learningReviewStamp='',learningReviewSnapshot='';
const LEARNING_MATERIAL_TYPES={article:'Статья',video:'Видео',book:'Книга',pdf:'PDF',note:'Заметка',course:'Курс'};
const LEARNING_UNITS={items:'частей',pages:'страниц',minutes:'минут',chapters:'глав'};
const LEARNING_REVIEW_INTERVALS=[1,3,7,14,30,60,120];
function learningSkills(){return (Array.isArray(db.learningSkills)?db.learningSkills:[]).filter(s=>s&&typeof s.id==='string')}
function learningSkill(id=learningSkillId){return learningSkills().find(s=>s.id===id)}
function learningItems(skill,key){return (Array.isArray(skill?.[key])?skill[key]:[]).filter(x=>x&&typeof x.id==='string')}
function learningStages(skill){return learningItems(skill,'stages')}
function learningLocalDate(){return iso(new Date())}
function learningDueCards(date=learningLocalDate()){
  return learningSkills().flatMap(skill=>learningItems(skill,'cards').filter(card=>card.dueDate&&card.dueDate<=date).map(card=>({skill,card}))).sort((a,b)=>String(a.card.dueDate).localeCompare(String(b.card.dueDate)));
}
function learningAttempts(skill,stageId){return learningItems(skill,'attempts').filter(a=>a.stageId===stageId)}
function learningStageVerified(skill,stage){return learningAttempts(skill,stage.id).at(-1)?.outcome==='pass'}
function learningStagePhase(skill,stage){return learningStageVerified(skill,stage)?'Проверено':learningAttempts(skill,stage.id).length?'Практика':stage.studied?'Практика':'Изучение'}
function learningProgress(skill){const stages=learningStages(skill),done=stages.filter(s=>learningStageVerified(skill,s)).length;return {done,total:stages.length,percent:stages.length?Math.round(done/stages.length*100):0}}
function learningNextStage(skill){return learningStages(skill).find(s=>!learningStageVerified(skill,s))||null}
function learningOptions(items,value,empty='Без этапа'){return `<option value="">${escapeHTML(empty)}</option>`+items.map(x=>`<option value="${escapeHTML(x.id)}" ${x.id===value?'selected':''}>${escapeHTML(x.title||x.name||'Без названия')}</option>`).join('')}
function learningTrackedMinutes(skill){
  const ids=new Set((db.calendar||[]).filter(e=>e.learningSkillId===skill.id).map(e=>e.id));
  return Math.round((db.timeEntries||[]).filter(e=>ids.has(e.calendarEventId)||ids.has(String(e.taskId||'').replace(/^__calendar_focus__:/,''))).reduce((sum,e)=>sum+Math.max(0,Number(e.ms)||0),0)/60000);
}
function learningCommit(change,label){
  const old={learningSkills:db.learningSkills,calendar:structuredClone(db.calendar||[]),portfolioWorks:db.portfolioWorks,meta:structuredClone(db.meta||{})};
  db.learningSkills=structuredClone(learningSkills());
  try{if(change()===false){Object.assign(db,old);return false}save(label);renderLearning();return true}
  catch(err){Object.assign(db,old);console.error(err);alert('Не удалось сохранить. Данные остаются на экране — попробуй ещё раз.');return false}
}
function renderLearning(){
  const skills=learningSkills(),due=learningDueCards();
  if(learningSkillId&&!learningSkill())learningSkillId='';
  if(!learningSkillId&&(window.innerWidth>820&&!window.matchMedia?.('(pointer: coarse)').matches)&&skills.length)learningSkillId=skills[0].id;
  $('#learningDueCount').textContent=due.length;
  $$('[data-learning-view]').forEach(b=>{const active=b.dataset.learningView===learningView;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))});
  $('#learningWorkspace').hidden=learningView!=='skills';$('#learningLibrary').hidden=learningView!=='materials';$('#learningReview').hidden=learningView!=='review';
  $('#learningWorkspace').classList.toggle('has-skill',!!learningSkillId);
  const query=$('#learningSearch').value.trim().toLocaleLowerCase('ru');
  const filtered=skills.filter(s=>[s.title,s.goal].some(t=>String(t||'').toLocaleLowerCase('ru').includes(query)));
  $('#learningSkillList').innerHTML=filtered.length?filtered.map(s=>{const p=learningProgress(s);return `<button type="button" class="learning-skill ${s.id===learningSkillId?'selected':''}" data-learning-skill="${escapeHTML(s.id)}" aria-pressed="${s.id===learningSkillId}"><span class="learning-skill-heading"><span class="learning-skill-icon studio-icon">${studioIcon(learningSkillIcon(s))}</span><span class="learning-skill-copy"><strong>${escapeHTML(s.title)}</strong><small>${escapeHTML(s.goal||'Добавь желаемый результат')}</small></span></span><div class="learning-progress" role="progressbar" aria-label="Прогресс маршрута ${escapeHTML(s.title)}" aria-valuenow="${p.percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${p.percent}%"></span></div><small class="learning-plan-label">План: ${p.done} из ${p.total} этапов · ${p.percent}%</small></button>`}).join(''):`<div class="learning-empty"><strong>${skills.length?'Ничего не найдено':'Чему хочешь научиться?'}</strong><p>${skills.length?'Измени поисковый запрос.':'Добавь навык, выбери результат и составь первый этап.'}</p></div>`;
  $$('[data-learning-skill]').forEach(b=>b.onclick=()=>{learningSkillId=b.dataset.learningSkill;learningTab='route';renderLearning()});
  renderLearningDetail();renderLearningLibrary();renderLearningReviewQueue();
}
function learningAction(action,text,extra='',primary=false){return `<button type="button" class="btn${primary?' primary':''}" data-learning-action="${action}" ${extra}>${text}</button>`}
function renderLearningDetail(){
  const box=$('#learningDetail'),skill=learningSkill();
  if(!skill){box.innerHTML=`<div class="learning-empty"><strong>Твой следующий навык</strong><p>Здесь появятся маршрут, материалы, практика и повторение.</p>${learningAction('new-skill','＋ Добавить навык','',true)}</div>`;bindLearningActions(box);return}
  const p=learningProgress(skill),stages=learningStages(skill),next=learningNextStage(skill),due=learningDueCards().filter(x=>x.skill.id===skill.id).length;
  box.innerHTML=`${learningAction('back','‹ Все навыки')}<div class="learning-detail-header"><div class="learning-heading"><span class="learning-detail-icon studio-icon">${studioIcon(learningSkillIcon(skill))}</span><div><h2>${escapeHTML(skill.title)}</h2><p>Результат: ${escapeHTML(skill.goal||'Не указан')}</p></div></div><div class="learning-summary"><span>Прогресс плана<strong>${p.percent}%</strong></span><span>Проверено этапов<strong>${p.done} / ${p.total}</strong></span></div></div><div class="learning-heading-actions">${learningAction('edit-skill','Настройки навыка')}${learningAction('delete-skill','Удалить','aria-label="Удалить навык"')}</div><div class="learning-subtabs">${[['route','Маршрут'],['materials','Материалы'],['practice','Практика'],['results','Результаты']].map(([v,t])=>`<button type="button" data-learning-tab="${v}" class="${learningTab===v?'active':''}" aria-pressed="${learningTab===v}">${t}</button>`).join('')}</div><div id="learningTabContent"></div>`;
  // The mobile return button uses the same action binding with a distinct class.
  box.querySelector('[data-learning-action="back"]')?.classList.add('learning-mobile-back');
  const content=$('#learningTabContent');
  if(learningTab==='route'){
    const start=next?`<div class="learning-next"><div><span class="small">Следующий шаг · ${learningStagePhase(skill,next)}</span><strong>${escapeHTML(next.studied?(next.exercise||next.title):next.title)}</strong><span class="small">${escapeHTML(next.studied?'Попробуй самостоятельно, затем проверь результат.':'Изучи материал и отметь, что готов перейти к практике.')} · ${Number(next.minutes)||25} минут</span></div><div class="actions">${learningAction('start-stage','Начать',`data-stage-id="${escapeHTML(next.id)}"`,true)}${learningAction('schedule','В календарь',`data-stage-id="${escapeHTML(next.id)}"`)}</div></div>`:`<div class="learning-next"><div><strong>${stages.length?'Маршрут пройден':'Составь первый этап'}</strong><span class="small">${stages.length?'Применяй навык в новых задачах и возвращайся к повторению.':'Определи маленький результат, материал и способ проверки.'}</span></div>${learningAction(stages.length?'results':'new-stage',stages.length?'Посмотреть результаты':'＋ Этап','',true)}</div>`;
    content.innerHTML=start+`<h2 class="learning-route-title">Твой маршрут</h2><div class="learning-route">`+stages.map((stage,index)=>{
      const verified=learningStageVerified(skill,stage),attempts=learningAttempts(skill,stage.id),materials=learningItems(skill,'materials').filter(m=>m.stageId===stage.id);
      return `<details class="learning-stage ${verified?'verified':''}" data-stage-details="${escapeHTML(stage.id)}" ${next?.id===stage.id?'open':''}><summary><span class="learning-stage-num">${verified?'✓':index+1}</span><strong>${escapeHTML(stage.title)}</strong><span class="learning-badge ${verified?'checked':''}">${!verified&&next?.id!==stage.id?'Дальше':learningStagePhase(skill,stage)}</span><span aria-hidden="true">⌄</span></summary><div class="learning-stage-body"><div class="learning-cycle"><span class="${stage.studied?'passed':''}">1. Изучить</span><span class="${attempts.length?'passed':''}">2. Попробовать</span><span class="${verified?'passed':''}">3. Проверить</span></div><details class="learning-stage-more"><summary>Задание, материалы и настройки</summary><p><strong>Результат:</strong> ${escapeHTML(stage.result||'Укажи, что должно получиться')}</p><p><strong>Практика:</strong> ${escapeHTML(stage.exercise||'Добавь упражнение')}</p><p><strong>Критерии:</strong> ${escapeHTML(stage.criteria||'Добавь критерии проверки')}</p><span class="small">${materials.length} материалов · ${attempts.length} попыток</span><div class="actions" style="margin-top:14px">${learningAction('studied',stage.studied?'Вернуть к изучению':'Материал изучен',`data-stage-id="${escapeHTML(stage.id)}"`)}${learningAction('new-attempt','Записать попытку',`data-stage-id="${escapeHTML(stage.id)}"`,true)}${learningAction('new-material','＋ Материал',`data-stage-id="${escapeHTML(stage.id)}"`)}${learningAction('new-card','＋ Вопрос',`data-stage-id="${escapeHTML(stage.id)}"`)}${learningAction('schedule','В календарь',`data-stage-id="${escapeHTML(stage.id)}"`)}${learningAction('edit-stage','Изменить',`data-stage-id="${escapeHTML(stage.id)}"`)}${learningAction('stage-up','↑',`data-stage-id="${escapeHTML(stage.id)}" aria-label="Переместить этап выше" ${index===0?'disabled':''}`)}${learningAction('stage-down','↓',`data-stage-id="${escapeHTML(stage.id)}" aria-label="Переместить этап ниже" ${index===stages.length-1?'disabled':''}`)}${learningAction('delete-stage','Удалить',`data-stage-id="${escapeHTML(stage.id)}"`)}</div></details></div></details>`;
    }).join('')+`</div>${learningAction('new-stage','＋ Добавить этап','data-style="add-stage"')}<div class="learning-bottom"><div><strong>${studioIcon('clock')}Повторить сегодня</strong><span class="small">${due} вопросов по этому навыку</span><br>${learningAction('review-skill','Повторить')}</div><div><strong>${studioIcon('file')}Материалы этапа</strong>${learningItems(skill,'materials').filter(m=>!next||m.stageId===next.id).slice(0,2).map(m=>`<div class="learning-material-mini">${studioIcon('file')}${learningAction('edit-material',escapeHTML(m.title),`data-item-id="${escapeHTML(m.id)}"`)}<small>${escapeHTML(LEARNING_MATERIAL_TYPES[m.type]||'Материал')}</small></div>`).join('')||'<span class="small">Добавь материал для следующего шага</span>'}<br>${learningAction('new-material','＋ Материал',`data-stage-id="${escapeHTML(next?.id||'')}"`)}</div></div>`;
  }else if(learningTab==='materials'){
    content.innerHTML=`<div class="section-title"><h2>Материалы навыка</h2>${learningAction('new-material','＋ Материал','',true)}</div>`+learningMaterialsHTML(skill)+`<div class="section-title" style="margin-top:24px"><h2>Вопросы для закрепления</h2>${learningAction('new-card','＋ Вопрос')}</div>`+learningCardsHTML(skill);
  }else if(learningTab==='practice'){
    content.innerHTML=`<div class="section-title"><h2>Практика и проверка</h2>${learningAction('new-attempt','＋ Попытка','',true)}</div><p class="small">Этап засчитывается после успешной попытки. Отмечай, как проверен результат.</p>`+learningAttemptsHTML(skill);
  }else{
    const final=skill.finalResult||{};
    content.innerHTML=`<h2>Что уже получается</h2><p class="small">Время по таймеру: ${learningTrackedMinutes(skill)} мин</p><p class="small">Процент отражает выполнение твоего маршрута. Самооценка и проверка преподавателем отмечены отдельно.</p>`+(stages.filter(s=>learningStageVerified(skill,s)).map(stage=>{const a=learningAttempts(skill,stage.id).at(-1);return `<div class="learning-item"><div class="learning-item-main"><strong>✓ ${escapeHTML(stage.title)}</strong><span class="small">${escapeHTML(stage.result||'')} · ${learningVerificationLabel(a?.verifiedBy)}</span></div></div>`}).join('')||'<div class="learning-empty">Проверенные этапы появятся после успешных попыток.</div>')+`<h2 style="margin-top:26px">Итоговая работа</h2><p class="learning-text">${escapeHTML(skill.finalCriteria||skill.goal||'Укажи критерии итогового результата в настройках навыка.')}</p><div class="learning-answer">${escapeHTML(final.description||'Добавь результат, ссылку и описание того, что получилось.')}${safePortfolioURL(final.url)?`<p><a href="${escapeHTML(safePortfolioURL(final.url))}" target="_blank" rel="noopener noreferrer">Открыть результат ↗</a></p>`:''}</div><div class="learning-result-actions">${learningAction('final-result','Записать результат','',true)}${learningAction('portfolio','В портфолио')}${skill.projectId&&db.projects.some(p=>p.id===skill.projectId)?learningAction('project','Открыть связанную задачу'):''}</div><details style="margin-top:24px"><summary>Отправная точка и план</summary><p class="learning-text">${escapeHTML(skill.baseline||'Начальный уровень не указан.')}</p><p class="small">План: ${Number(skill.weeklyMinutes)||0} минут в неделю. Длительность занятий меняется в календаре.</p></details>`;
  }
  $$('[data-learning-tab]',box).forEach(b=>b.onclick=()=>{learningTab=b.dataset.learningTab;renderLearningDetail()});bindLearningActions(box);
}
function learningVerificationLabel(value){return {self:'Самопроверка',mentor:'Проверка преподавателем',test:'Проверка тестом / по критериям'}[value]||'Самопроверка'}
function learningMaterialsHTML(skill,filter=()=>true){
  const items=learningItems(skill,'materials').filter(filter);
  return items.length?items.map(m=>{
    const total=Math.max(0,Number(m.total)||0),current=Math.min(total,Math.max(0,Number(m.current)||0)),progress=total?Math.round(current/total*100):0,stage=learningStages(skill).find(s=>s.id===m.stageId),link=safePortfolioURL(m.url);
    return `<div class="learning-item"><div class="learning-item-main"><strong>${escapeHTML(m.title)}</strong><span class="small">${escapeHTML(LEARNING_MATERIAL_TYPES[m.type]||'Материал')} · ${escapeHTML(skill.title)}${stage?' · '+escapeHTML(stage.title):''}</span><span class="small">${total?`${current} / ${total} ${LEARNING_UNITS[m.unit]||'частей'} · ${progress}%`:'Объём не указан'}${m.bookmark?' · '+escapeHTML(m.bookmark):''}</span>${total?`<div class="learning-progress"><span style="width:${progress}%"></span></div>`:''}${m.note?`<details><summary class="small">Заметка</summary><p class="learning-text">${escapeHTML(m.note)}</p></details>`:''}</div><div class="learning-item-actions">${link?`<a class="btn" href="${escapeHTML(link)}" target="_blank" rel="noopener noreferrer">Открыть ↗</a>`:''}${learningSafePDF(m.file)?learningAction('download-material','PDF ↓',`data-skill-id="${escapeHTML(skill.id)}" data-item-id="${escapeHTML(m.id)}"`):''}${learningAction('edit-material','Изменить',`data-skill-id="${escapeHTML(skill.id)}" data-item-id="${escapeHTML(m.id)}"`)}${learningAction('new-card','＋ Вопрос',`data-skill-id="${escapeHTML(skill.id)}" data-stage-id="${escapeHTML(m.stageId||'')}"`)}${learningAction('delete-material','×',`data-skill-id="${escapeHTML(skill.id)}" data-item-id="${escapeHTML(m.id)}" aria-label="Удалить материал"`)}</div></div>`;
  }).join(''):'<div class="learning-empty">Добавь статью, видео, книгу, PDF или свою заметку.</div>';
}
function learningCardsHTML(skill){return learningItems(skill,'cards').map(c=>`<div class="learning-item"><div class="learning-item-main"><strong>${escapeHTML(c.question)}</strong><span class="small">Следующее повторение: ${escapeHTML(c.dueDate||learningLocalDate())} · ${learningItems(c,'reviews').length} повторений</span></div><div class="learning-item-actions">${learningAction('review-card','Повторить',`data-item-id="${escapeHTML(c.id)}"`)}${learningAction('edit-card','Изменить',`data-item-id="${escapeHTML(c.id)}"`)}${learningAction('delete-card','×',`data-item-id="${escapeHTML(c.id)}" aria-label="Удалить вопрос"`)}</div></div>`).join('')||'<div class="learning-empty">Создай вопрос с ответом или короткое упражнение для повторения.</div>'}
function learningAttemptsHTML(skill){return learningItems(skill,'attempts').slice().reverse().map(a=>{const stage=learningStages(skill).find(s=>s.id===a.stageId);return `<div class="learning-item"><div class="learning-item-main"><strong>${a.outcome==='pass'?'✓':'↻'} ${escapeHTML(a.title||stage?.title||'Попытка')}</strong><span class="small">${escapeHTML(a.date)} · ${escapeHTML(stage?.title||'Этап удалён')} · ${a.outcome==='pass'?'Получилось':'Нужна практика'} · ${learningVerificationLabel(a.verifiedBy)}</span><p class="learning-text">${escapeHTML(a.note||'')}</p>${a.nextAction?`<span class="small">Следующий шаг: ${escapeHTML(a.nextAction)}</span>`:''}</div><div class="learning-item-actions">${learningAction('edit-attempt','Изменить',`data-item-id="${escapeHTML(a.id)}"`)}${learningAction('delete-attempt','×',`data-item-id="${escapeHTML(a.id)}" aria-label="Удалить попытку"`)}</div></div>`}).join('')||'<div class="learning-empty">Выполни упражнение и запиши попытку: результат, ошибки и способ проверки.</div>'}
function renderLearningLibrary(){
  const select=$('#learningMaterialSkill'),value=select.value;select.innerHTML=learningOptions(learningSkills(),value,'Все навыки');select.value=learningSkill(value)?value:'';
  const q=$('#learningMaterialSearch').value.trim().toLocaleLowerCase('ru'),skills=learningSkills().filter(s=>!select.value||s.id===select.value);
  $('#learningLibraryList').innerHTML=skills.length?skills.map(s=>learningMaterialsHTML(s,m=>[m.title,m.note,m.bookmark].some(t=>String(t||'').toLocaleLowerCase('ru').includes(q)))).join(''):'<div class="learning-empty">Сначала добавь навык, затем материалы внутри него.</div>';bindLearningActions($('#learningLibraryList'));
}
function renderLearningReviewQueue(){
  const due=learningDueCards();$('#learningStartReview').disabled=!due.length;
  $('#learningReviewList').innerHTML=due.length?due.map(({skill,card})=>`<div class="learning-item"><div class="learning-item-main"><strong>${escapeHTML(card.question)}</strong><span class="small">${escapeHTML(skill.title)} · срок ${escapeHTML(card.dueDate)}</span></div>${learningAction('review-card','Повторить',`data-skill-id="${escapeHTML(skill.id)}" data-item-id="${escapeHTML(card.id)}"`)}</div>`).join(''):'<div class="learning-empty"><strong>На сегодня всё повторено</strong><p>Добавляй вопросы внутри навыков. Здесь появятся те, к которым пора вернуться.</p></div>';bindLearningActions($('#learningReviewList'));
}
function bindLearningActions(root){
  $$('[data-learning-action]',root).forEach(b=>b.onclick=()=>learningHandleAction(b.dataset.learningAction,b.dataset));
}
function learningHandleAction(action,d={}){
  const skillId=d.skillId||learningSkillId,skill=learningSkill(skillId),stageId=d.stageId||'',itemId=d.itemId||'';
  if(action==='new-skill')return openLearningEditor('skill');
  if(action==='back'){learningSkillId='';$('#learningWorkspace').classList.remove('has-skill');return renderLearning()}
  if(!skill)return false;
  if(action==='edit-skill')return openLearningEditor('skill',skill.id,skill.id);
  if(action==='new-stage'||action==='edit-stage')return openLearningEditor('stage',skill.id,action==='edit-stage'?stageId:'');
  for(const type of ['material','card','attempt']){
    if(action===`new-${type}`||action===`edit-${type}`)return openLearningEditor(type,skill.id,action.startsWith('edit')?itemId:'',stageId);
    if(action===`delete-${type}`)return deleteLearningItem(skill.id,type,itemId);
  }
  if(action==='delete-skill')return deleteLearningSkill(skill.id);
  if(action==='delete-stage')return deleteLearningItem(skill.id,'stage',stageId);
  if(action==='studied')return learningCommit(()=>{const s=learningSkill(skill.id),stage=learningStages(s).find(x=>x.id===stageId);if(!stage)return false;stage.studied=!stage.studied;s.updatedAt=new Date().toISOString()},'Статус изучения изменён');
  if(action==='stage-up'||action==='stage-down')return learningCommit(()=>{const s=learningSkill(skill.id),items=learningStages(s),i=items.findIndex(x=>x.id===stageId),j=i+(action==='stage-up'?-1:1);if(i<0||j<0||j>=items.length)return false;[items[i],items[j]]=[items[j],items[i]];s.stages=items;s.updatedAt=new Date().toISOString()},'Порядок этапов изменён');
  if(action==='schedule')return openLearningEditor('schedule',skill.id,'',stageId);
  if(action==='start-stage'){const stage=learningStages(skill).find(x=>x.id===stageId);if(!stage)return false;if(stage.studied)return openLearningEditor('attempt',skill.id,'',stage.id);learningTab='materials';renderLearningDetail();if(!learningItems(skill,'materials').some(m=>m.stageId===stage.id))openLearningEditor('material',skill.id,'',stage.id);return true}
  if(action==='materials'||action==='results'){learningTab=action;return renderLearningDetail()}
  if(action==='review-card')return startLearningReview(skill.id,itemId);
  if(action==='review-skill')return startLearningReview(skill.id);
  if(action==='final-result')return openLearningEditor('final',skill.id);
  if(action==='portfolio')return learningToPortfolio(skill.id);
  if(action==='project')return showPage('projects',{projectId:skill.projectId});
  if(action==='download-material')return downloadLearningPDF(skill.id,itemId);
}
function learningField(name,label,value='',options={}){
  const id='learningField-'+name,attrs=`id="${id}" name="${name}" ${options.required?'required':''}`;
  let control;
  if(options.select)control=`<select ${attrs}>${options.select}</select>`;
  else if(options.area)control=`<textarea ${attrs} rows="${options.rows||3}" maxlength="${options.max||20000}" placeholder="${escapeHTML(options.placeholder||'')}">${escapeHTML(value)}</textarea>`;
  else control=`<input ${attrs} type="${options.type||'text'}" value="${escapeHTML(value)}" ${options.type==='number'?`min="${options.min??0}" max="${options.max??100000}" step="1"`:`maxlength="${options.max||200}"`} ${options.accept?`accept="${options.accept}"`:''} placeholder="${escapeHTML(options.placeholder||'')}">`;
  return `<div class="field"><label for="${id}">${label}</label>${control}</div>`;
}
function learningSelect(map,value){return Object.entries(map).map(([v,t])=>`<option value="${v}" ${value===v?'selected':''}>${escapeHTML(t)}</option>`).join('')}
function learningEditorRecord(type,skill,id){return type==='skill'?skill:type==='final'?skill?.finalResult:learningItems(skill,{stage:'stages',material:'materials',card:'cards',attempt:'attempts'}[type]).find(x=>x.id===id)}
function learningEditorValues(){const form=$('#learningEditForm');return Object.fromEntries([...new FormData(form)].filter(([k,v])=>typeof v==='string'))}
function learningEditorDirty(){return !!learningEditor&&(JSON.stringify(learningEditorValues())!==learningEditorInitial||learningFileDraft!==null)}
function closeLearningEditor(force=false){
  if(learningFileBusy){$('#learningEditMessage').textContent='Дождись добавления PDF.';return false}
  if(!force&&learningEditorDirty()&&!confirm('Закрыть без сохранения изменений?'))return false;
  $('#learningEditDialog').close();learningEditor=null;learningFileDraft=null;return true;
}
function openLearningEditor(type,skillId='',id='',stageId=''){
  if(learningEditor&&!closeLearningEditor())return false;
  const skill=learningSkill(skillId),record=learningEditorRecord(type,skill,id)||{},stage=learningStages(skill).find(s=>s.id===stageId)||learningNextStage(skill);
  if(type!=='skill'&&!skill)return false;
  if(id&&type!=='skill'&&!learningEditorRecord(type,skill,id))return false;
  learningEditor={type,skillId,id,stageId};learningEditorAccount=profileStorageKey();learningEditorStamp=skill?.updatedAt||'';learningEditorSnapshot=JSON.stringify(skill||null);learningFileDraft=null;
  let fields='';
  if(type==='skill')fields=learningField('title','Название навыка',record.title,{required:true,max:120,placeholder:'Например, веб-разработка'})+learningField('goal','Какой результат хочешь получить?',record.goal,{required:true,area:true,max:2000,placeholder:'Что ты сможешь сделать самостоятельно?'})+learningField('baseline','Что уже умеешь?',record.baseline,{area:true,max:5000})+learningField('weeklyMinutes','Минут на обучение в неделю',record.weeklyMinutes||120,{type:'number',max:10080})+learningField('finalCriteria','Критерии итоговой работы',record.finalCriteria,{area:true,max:5000})+learningField('projectId','Связанная задача',record.projectId,{select:learningOptions((db.projects||[]).filter(p=>!p.archived||p.id===record.projectId),record.projectId,'Без привязки')});
  if(type==='stage')fields=learningField('title','Название этапа',record.title,{required:true,max:120})+learningField('result','Результат этапа',record.result,{required:true,area:true,max:3000})+learningField('exercise','Практическое задание',record.exercise,{area:true,max:5000})+learningField('criteria','Как проверить результат?',record.criteria,{required:true,area:true,max:5000,placeholder:'Укажи наблюдаемые критерии успеха'})+learningField('minutes','Длительность занятия, мин',record.minutes||25,{type:'number',min:5,max:240});
  if(['material','card','attempt'].includes(type))fields=learningField('stageId','Этап',record.stageId||stageId||stage?.id||'',{required:type==='attempt',select:learningOptions(learningStages(skill),record.stageId||stageId||stage?.id||'',type==='attempt'?'Выбери этап':'Без этапа')});
  if(type==='material')fields+=learningField('title','Название материала',record.title,{required:true,max:200})+learningField('type','Тип',record.type||'article',{select:learningSelect(LEARNING_MATERIAL_TYPES,record.type||'article')})+learningField('url','Ссылка',record.url,{type:'url',max:2048,placeholder:'https://…'})+`<div class="learning-field-pair">${learningField('total','Общий объём',record.total||0,{type:'number'})}${learningField('current','Пройдено',record.current||0,{type:'number'})}</div>`+learningField('unit','Единица объёма',record.unit||'items',{select:learningSelect(LEARNING_UNITS,record.unit||'items')})+learningField('bookmark','Где остановился?',record.bookmark,{max:200,placeholder:'Страница 42 / 12:30 / урок 3'})+learningField('note','Заметка, выводы и вопросы',record.note,{area:true,rows:6})+learningField('pdfFile','Прикрепить PDF до 1 МБ','',{type:'file',accept:'application/pdf'})+`<p class="small" id="learningPDFStatus">${learningSafePDF(record.file)?escapeHTML(record.file.name)+' · уже прикреплён':'PDF сохраняется вместе с данными; большие файлы добавляй ссылкой.'}</p>${learningSafePDF(record.file)?'<label class="check-line"><input name="removePDF" type="checkbox"> Удалить прикреплённый PDF</label>':''}`;
  if(type==='card')fields+=learningField('question','Вопрос или упражнение',record.question,{required:true,area:true,max:3000,placeholder:'Что нужно вспомнить или выполнить без подсказки?'})+learningField('answer','Ответ / критерии выполнения',record.answer,{required:true,area:true,max:10000})+learningField('dueDate','Первое / следующее повторение',record.dueDate||learningLocalDate(),{type:'date',required:true});
  if(type==='attempt')fields+=learningField('title','Что пробовал сделать?',record.title||stage?.exercise||stage?.title||'',{required:true,max:200})+`<p class="small" id="learningAttemptCriteria">Критерии этапа: ${escapeHTML(learningStages(skill).find(s=>s.id===(record.stageId||stageId||stage?.id))?.criteria||'Сначала добавь критерии в этап.')}</p>`+learningField('date','Дата попытки',record.date||learningLocalDate(),{type:'date',required:true})+learningField('outcome','Результат',record.outcome||'practice',{select:learningSelect({practice:'Нужна практика',pass:'Получилось — критерии выполнены'},record.outcome||'practice')})+learningField('verifiedBy','Как проверен результат?',record.verifiedBy||'self',{select:learningSelect({self:'Самопроверка',mentor:'Преподавателем',test:'Тестом / по критериям'},record.verifiedBy||'self')})+learningField('note','Результат, ошибки и обратная связь',record.note,{required:true,area:true,rows:5})+learningField('nextAction','Что сделать в следующий раз?',record.nextAction,{area:true,max:3000});
  if(type==='schedule')fields=learningField('stageId','Этап',stageId||stage?.id||'',{required:true,select:learningOptions(learningStages(skill),stageId||stage?.id||'','Выбери этап')})+learningField('date','Дата',learningLocalDate(),{required:true,type:'date'})+`<div class="learning-field-pair">${learningField('start','Начало','19:00',{required:true,type:'time'})}${learningField('end','Окончание',hhmm(1140+(Number(stage?.minutes)||25)),{required:true,type:'time'})}</div><p class="small">Занятие появится в календаре и «Сегодня». Выполнение занятия не засчитывает этап автоматически.</p>`;
  if(type==='final')fields=learningField('description','Что получилось? Результат и проверка',record.description,{required:true,area:true,rows:7})+learningField('url','Ссылка на итоговую работу',record.url,{type:'url',max:2048});
  $('#learningEditTitle').textContent={skill:id?'Настройки навыка':'Новый навык',stage:id?'Изменить этап':'Новый этап',material:id?'Материал и прогресс':'Новый материал',card:id?'Изменить вопрос':'Новый вопрос',attempt:id?'Изменить попытку':'Записать попытку',schedule:'Занятие в календаре',final:'Итоговая работа'}[type];
  $('#learningEditFields').innerHTML=fields;$('#learningEditMessage').textContent='Изменения сохранятся после нажатия «Готово».';$('#learningEditSave').disabled=false;
  if(type==='material')$('#learningField-pdfFile').onchange=prepareLearningPDF;
  if(type==='attempt')$('#learningField-stageId').onchange=()=>{$('#learningAttemptCriteria').textContent='Критерии этапа: '+(learningStages(skill).find(s=>s.id===$('#learningField-stageId').value)?.criteria||'Выбери этап с критериями проверки.')};
  learningEditorInitial=JSON.stringify(learningEditorValues());$('#learningEditDialog').showModal();$('#learningEditFields').querySelector('input:not([type="file"]),textarea,select')?.focus();return true;
}
function learningValidDate(value){try{return /^\d{4}-\d{2}-\d{2}$/.test(value)&&iso(new Date(value+'T12:00:00'))===value}catch{return false}}
function saveLearningEditor(){
  if(!learningEditor||learningFileBusy)return false;
  const ctx=learningEditor,{type,skillId,id}=ctx,v=learningEditorValues(),skill=learningSkill(skillId);
  const message=t=>{$('#learningEditMessage').textContent=t;return false};
  if(learningEditorAccount!==profileStorageKey())return message('Профиль изменился. Закрой редактор и открой его снова.');
  if((type!=='skill'||id)&&!skill)return message('Навык удалён. Закрой редактор.');
  if(skill&&((skill.updatedAt||'')!==learningEditorStamp||JSON.stringify(skill)!==learningEditorSnapshot))return message('Навык изменён на другом экране или устройстве. Скопируй текст и открой редактор снова.');
  for(const k of ['title','goal','result','question','answer','description','note'])if(v[k]!==undefined)v[k]=v[k].trim();
  if(['skill','stage','material','attempt'].includes(type)&&!v.title)return message('Укажи название.');
  if(type==='skill'&&!v.goal)return message('Укажи желаемый результат.');
  if(type==='stage'&&(!v.result||!v.criteria))return message('Укажи результат этапа и критерии проверки.');
  if(type==='card'&&(!v.question||!v.answer||!learningValidDate(v.dueDate)))return message('Заполни вопрос, ответ и дату повторения.');
  if(type==='attempt'&&(!v.note||!learningValidDate(v.date)))return message('Запиши результат попытки и корректную дату.');
  if(type==='final'&&!v.description)return message('Опиши итоговый результат.');
  if(v.url&&!safePortfolioURL(v.url))return message('Ссылка должна начинаться с http:// или https://.');
  if(v.stageId&&!learningStages(skill).some(s=>s.id===v.stageId))return message('Выбранный этап больше не существует.');
  if(['attempt','schedule'].includes(type)&&!v.stageId)return message('Выбери этап.');
  if(type==='material'&&(!Number.isInteger(Number(v.total))||!Number.isInteger(Number(v.current))||Number(v.total)<0||Number(v.current)<0||Number(v.current)>Number(v.total)||Number(v.total)>100000))return message('Пройденный объём должен быть от 0 до общего объёма.');
  if(type==='skill'&&(!Number.isInteger(Number(v.weeklyMinutes))||Number(v.weeklyMinutes)<0||Number(v.weeklyMinutes)>10080))return message('Проверь недельный план времени.');
  if(type==='stage'&&(!Number.isInteger(Number(v.minutes))||Number(v.minutes)<5||Number(v.minutes)>240))return message('Длительность занятия: от 5 до 240 минут.');
  if(type==='schedule'){
    if(!learningValidDate(v.date)||!/^\d{2}:\d{2}$/.test(v.start)||!/^\d{2}:\d{2}$/.test(v.end))return message('Проверь дату и время.');
    const start=mins(v.start),end=mins(v.end)===0?1440:mins(v.end),dow=new Date(v.date+'T12:00:00').getDay(),weekend=dow===0||dow===6;
    if(start<(weekend?480:420)||end<=start||end>(weekend?1440:1380))return message(weekend?'Занятие должно быть между 08:00 и 00:00 и закончиться позже начала.':'Занятие должно быть между 07:00 и 23:00 и закончиться позже начала.');
    if((db.calendar||[]).some(e=>e.learningSkillId===skillId&&e.learningStageId===v.stageId&&e.date===v.date&&e.start===v.start&&e.end===v.end&&e.status!=='moved'))return message('Это занятие уже есть в календаре.');
  }
  const now=new Date().toISOString();let newId=id||uid();
  const ok=learningCommit(()=>{
    let s=learningSkill(skillId);
    if(type==='skill'){
      const record={...(s||{}),id:id||newId,title:v.title,goal:v.goal,baseline:v.baseline||'',weeklyMinutes:Number(v.weeklyMinutes),finalCriteria:v.finalCriteria||'',projectId:(db.projects||[]).some(p=>p.id===v.projectId)?v.projectId:'',stages:s?.stages||[],materials:s?.materials||[],cards:s?.cards||[],attempts:s?.attempts||[],createdAt:s?.createdAt||now,updatedAt:now};
      if(s)db.learningSkills=db.learningSkills.map(x=>x.id===s.id?record:x);else db.learningSkills.push(record);learningSkillId=record.id;learningView='skills';
    }else if(type==='schedule'){
      const stage=learningStages(s).find(x=>x.id===v.stageId);db.calendar.push({id:newId,title:`${s.title} · ${stage.title}`,date:v.date,start:v.start,end:v.end,category:'study',projectId:'',taskId:'',note:stage.exercise||stage.result||'',status:'planned',done:false,learningSkillId:s.id,learningStageId:stage.id});
    }else if(type==='final')s.finalResult={...(s.finalResult||{}),description:v.description,url:v.url?safePortfolioURL(v.url):'',updatedAt:now};
    else{
      const key={stage:'stages',material:'materials',card:'cards',attempt:'attempts'}[type],old=learningItems(s,key).find(x=>x.id===id)||{};
      let record={...old,id:newId,createdAt:old.createdAt||now,updatedAt:now};
      if(type==='stage')Object.assign(record,{title:v.title,result:v.result,exercise:v.exercise||'',criteria:v.criteria,minutes:Number(v.minutes),studied:!!old.studied});
      if(type==='material')Object.assign(record,{title:v.title,type:Object.hasOwn(LEARNING_MATERIAL_TYPES,v.type)?v.type:'article',url:v.url?safePortfolioURL(v.url):'',total:Number(v.total),current:Number(v.current),unit:Object.hasOwn(LEARNING_UNITS,v.unit)?v.unit:'items',bookmark:v.bookmark||'',note:v.note||'',stageId:v.stageId||'',file:v.removePDF?null:learningFileDraft||old.file||null});
      if(type==='card')Object.assign(record,{question:v.question,answer:v.answer,stageId:v.stageId||'',dueDate:v.dueDate,level:Number(old.level)||0,reviews:old.reviews||[]});
      if(type==='attempt')Object.assign(record,{title:v.title,stageId:v.stageId,date:v.date,outcome:v.outcome==='pass'?'pass':'practice',verifiedBy:['self','mentor','test'].includes(v.verifiedBy)?v.verifiedBy:'self',note:v.note,nextAction:v.nextAction||''});
      s[key]=id?learningItems(s,key).map(x=>x.id===id?record:x):learningItems(s,key).concat(record);
    }
    if(s)s.updatedAt=now;
  },type==='schedule'?'Занятие добавлено в календарь':'Обучение сохранено');
  if(ok){closeLearningEditor(true);if(type==='schedule'){renderCalendar();renderToday()}return true}
  return message('Сохранение не завершилось. Попробуй снова; введённые данные остаются в редакторе.');
}
function deleteLearningSkill(id){
  const skill=learningSkill(id);if(!skill||!confirm(`Удалить навык «${skill.title}» вместе с его этапами, материалами и повторениями? Занятия в календаре и работы портфолио останутся.`))return false;
  return learningCommit(()=>{db.learningSkills=db.learningSkills.filter(s=>s.id!==id);db.calendar.forEach(e=>{if(e.learningSkillId===id){delete e.learningSkillId;delete e.learningStageId}});db.portfolioWorks=(db.portfolioWorks||[]).map(w=>w.learningSkillId===id?{...w,learningSkillId:''}:w)},'Навык удалён');
}
function deleteLearningItem(skillId,type,id){
  const key={stage:'stages',material:'materials',card:'cards',attempt:'attempts'}[type],skill=learningSkill(skillId),item=learningItems(skill,key).find(x=>x.id===id);
  if(!item||!confirm(type==='stage'?'Удалить этап? Материалы и вопросы сохранятся без привязки; история попыток и занятия останутся.':'Удалить запись из обучения?'))return false;
  return learningCommit(()=>{const s=learningSkill(skillId);s[key]=learningItems(s,key).filter(x=>x.id!==id);if(type==='stage'){
    for(const list of ['materials','cards','attempts'])s[list]=learningItems(s,list).map(x=>x.stageId===id?{...x,stageId:''}:x);
    db.calendar.forEach(e=>{if(e.learningSkillId===skillId&&e.learningStageId===id)delete e.learningStageId});
  }s.updatedAt=new Date().toISOString()},'Запись обучения удалена');
}
function learningSafePDF(file){return file&&typeof file.name==='string'&&typeof file.data==='string'&&file.data.length<=1400000&&/^data:application\/pdf;base64,[a-zA-Z0-9+/=]+$/.test(file.data)}
async function prepareLearningPDF(event){
  const file=event.target.files?.[0],ctx=learningEditor,account=profileStorageKey();if(!file)return;
  learningFileBusy=true;$('#learningEditSave').disabled=true;
  try{
    if(file.size>1024*1024||file.size<5)throw Error('PDF должен быть не больше 1 МБ. Большой файл добавь ссылкой.');
    const bytes=await file.arrayBuffer(),array=new Uint8Array(bytes);
    if(String.fromCharCode(...array.slice(0,5))!=='%PDF-')throw Error('Этот файл не похож на PDF.');
    let binary='';for(let i=0;i<array.length;i+=8192)binary+=String.fromCharCode(...array.subarray(i,i+8192));
    const prepared={name:file.name.slice(0,200),data:'data:application/pdf;base64,'+btoa(binary)};
    if(ctx!==learningEditor||account!==profileStorageKey())throw Error('Профиль или редактор изменился. Добавь файл снова.');
    if(!learningSafePDF(prepared))throw Error('Не удалось подготовить PDF.');
    learningFileDraft=prepared;$('#learningPDFStatus').textContent=prepared.name+' · добавлен, нажми «Готово»';
  }catch(err){$('#learningEditMessage').textContent=err.message}finally{learningFileBusy=false;$('#learningEditSave').disabled=false;event.target.value=''}
}
function downloadLearningPDF(skillId,id){
  const file=learningItems(learningSkill(skillId),'materials').find(m=>m.id===id)?.file;if(!learningSafePDF(file))return false;
  const bytes=Uint8Array.from(atob(file.data.split(',')[1]),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download=file.name.replace(/[\\/]/g,'_');a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
}
function startLearningReview(skillId='',cardId=''){
  const chosen=cardId?{skill:learningSkill(skillId),card:learningItems(learningSkill(skillId),'cards').find(c=>c.id===cardId)}:learningDueCards().find(x=>!skillId||x.skill.id===skillId);
  if(!chosen?.skill||!chosen.card){alert('Сейчас нет вопросов для повторения.');return false}
  learningReviewActive={skillId:chosen.skill.id,cardId:chosen.card.id,filterSkillId:cardId?'':skillId,oneOnly:!!cardId};learningReviewAccount=profileStorageKey();learningReviewStamp=chosen.card.updatedAt||'';learningReviewSnapshot=JSON.stringify(chosen.card);learningReviewShown=false;
  $('#learningReviewTitle').textContent='Вспомни без подсказки';$('#learningReviewContext').textContent=chosen.skill.title+' · '+(learningStages(chosen.skill).find(s=>s.id===chosen.card.stageId)?.title||'Повторение');$('#learningReviewQuestion').textContent=chosen.card.question;$('#learningRecallAnswer').value='';$('#learningReferenceAnswer').textContent=chosen.card.answer;$('#learningAnswerPanel').hidden=true;$('#learningReveal').hidden=false;$('#learningReviewMessage').textContent='';
  if(!$('#learningReviewDialog').open)$('#learningReviewDialog').showModal();$('#learningRecallAnswer').focus();return true;
}
function revealLearningAnswer(){if(!learningReviewActive)return false;learningReviewShown=true;$('#learningAnswerPanel').hidden=false;$('#learningReveal').hidden=true;return true}
function rateLearningReview(rating){
  if(!learningReviewActive||!learningReviewShown||!['again','hard','good'].includes(rating))return false;
  const ctx=learningReviewActive,skill=learningSkill(ctx.skillId),card=learningItems(skill,'cards').find(c=>c.id===ctx.cardId);
  if(learningReviewAccount!==profileStorageKey()||!card||(card.updatedAt||'')!==learningReviewStamp||JSON.stringify(card)!==learningReviewSnapshot){$('#learningReviewMessage').textContent='Вопрос или профиль изменился. Закрой повторение и начни снова.';return false}
  const now=new Date().toISOString(),level=Math.min(LEARNING_REVIEW_INTERVALS.length-1,Math.max(0,Math.floor(Number(card.level)||0)));
  const interval=rating==='again'?1:rating==='hard'?Math.max(1,Math.round(LEARNING_REVIEW_INTERVALS[level]/2)):LEARNING_REVIEW_INTERVALS[level];
  const dueDate=nextISODate(learningLocalDate(),interval),answer=$('#learningRecallAnswer').value.slice(0,10000);
  const ok=learningCommit(()=>{const s=learningSkill(ctx.skillId),c=learningItems(s,'cards').find(x=>x.id===ctx.cardId);c.level=rating==='again'?0:rating==='hard'?Math.max(0,level-1):Math.min(level+1,LEARNING_REVIEW_INTERVALS.length-1);c.dueDate=dueDate;c.updatedAt=now;c.reviews=[...learningItems(c,'reviews'),{id:uid(),date:learningLocalDate(),rating,answer,intervalDays:interval}];s.updatedAt=now},'Повторение сохранено');
  if(!ok){$('#learningReviewMessage').textContent='Не удалось сохранить повторение. Ответ остаётся здесь.';return false}
  learningReviewActive=null;
  if(!ctx.oneOnly&&learningDueCards().some(x=>!ctx.filterSkillId||x.skill.id===ctx.filterSkillId))return startLearningReview(ctx.filterSkillId);
  $('#learningReviewDialog').close();showUndoToast(`Повторение сохранено · следующее ${dueDate}`);return true;
}
function renderLearningEventLink(event){
  const b=$('#eventLearningLink'),skill=learningSkill(event?.learningSkillId);b.hidden=!skill;b.onclick=skill?()=>{$('#eventDialog').close();openLearningEvent(event)}:null;
}
function openLearningEvent(event){
  const skill=learningSkill(event?.learningSkillId);if(!skill)return false;learningSkillId=skill.id;learningView='skills';learningTab='route';showPage('learning');
  const stage=learningStages(skill).find(s=>s.id===event.learningStageId);if(stage){const detail=[...$$('[data-stage-details]')].find(b=>b.dataset.stageDetails===stage.id);if(detail){detail.open=true;detail.scrollIntoView({block:'nearest',behavior:'smooth'})}}return true;
}
function learningToPortfolio(skillId){
  const skill=learningSkill(skillId);if(!skill)return false;const final=skill.finalResult||{};
  if(!final.description){alert('Сначала запиши итоговый результат.');return false}
  const work=portfolioWorks().find(w=>w.learningSkillId===skillId);if(!closePortfolioEditor())return false;showPage('portfolio');
  if(!openPortfolioWork(work?.id||''))return false;
  if(!work){portfolioDraft.learningSkillId=skillId;$('#portfolioTitle').value=skill.title+' — итоговая работа';$('#portfolioDescription').value=final.description;$('#portfolioURL').value=safePortfolioURL(final.url);$('#portfolioProjectSelect').value=skill.projectId||'';$('#portfolioSaveStatus').textContent='Результат подготовлен · нажми «Готово», чтобы сохранить'}return true;
}
$('#learningAddSkill').onclick=()=>openLearningEditor('skill');$('#learningSearch').addEventListener('input',renderLearning);
$$('[data-learning-view]').forEach(b=>b.onclick=()=>{learningView=b.dataset.learningView;renderLearning()});$('#learningMaterialSearch').addEventListener('input',renderLearningLibrary);$('#learningMaterialSkill').addEventListener('change',renderLearningLibrary);
$('#learningEditForm').addEventListener('submit',e=>{e.preventDefault();saveLearningEditor()});$('#learningEditClose').onclick=()=>closeLearningEditor();$('#learningEditCancel').onclick=()=>closeLearningEditor();$('#learningEditDialog').addEventListener('cancel',e=>{e.preventDefault();closeLearningEditor()});
$('#learningStartReview').onclick=()=>startLearningReview();$('#learningReveal').onclick=revealLearningAnswer;$$('[data-learning-rate]').forEach(b=>b.onclick=()=>rateLearningReview(b.dataset.learningRate));$('#learningReviewClose').onclick=()=>{$('#learningReviewDialog').close();learningReviewActive=null};$('#learningReviewDialog').addEventListener('cancel',()=>{learningReviewActive=null});
// End learning workspace.


enhanceNativeDateTimeInputs();

try{if(!plannerStorageBlocked)persistLocal(false)}catch(err){plannerStorageBlocked=true;plannerLoadError=err.message}renderRecoveryStatus();if(!plannerStorageBlocked)writeRecoveryBackup('Автоматический резерв',false);fillProjectSelect();renderToday(); renderMoney(); renderProjects(); renderWorkouts();  renderArchive(); renderFocusPage();

profileOverviewReady=true;renderAccountProfile();

if('serviceWorker' in navigator && location.protocol.startsWith('http')){
  navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}

// Viewport changes only update layout, never planner records or unsaved forms.
let mobileViewportBaseline=0,mobileViewportWidth=0,mobileViewportFrame=0,mobileLayoutMode=null;
function mobileViewportState(){
 const v=window.visualViewport,width=Number(window.innerWidth)||0,height=Number(v?.height)||Number(window.innerHeight)||Number(document.documentElement.clientHeight)||0;
 const editing=!!document.activeElement?.matches?.('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),textarea,[contenteditable="true"]');
 if(!mobileViewportBaseline||Math.abs(width-mobileViewportWidth)>80){mobileViewportBaseline=Number(window.innerHeight)||height;mobileViewportWidth=width}
 if(!editing)mobileViewportBaseline=Math.max(mobileViewportBaseline,Number(window.innerHeight)||height);
 const mobile=width<=820||!!window.matchMedia?.('(pointer: coarse)').matches,zoom=Number(v?.scale)||1;
 return {height:Math.max(120,height),top:Math.max(0,Number(v?.offsetTop)||0),keyboard:mobile&&editing&&zoom<=1.05&&mobileViewportBaseline-height>140&&height<mobileViewportBaseline*.8,mobile};
}
function updateMobileViewport(){
 const state=mobileViewportState(),root=document.documentElement;
 root.style.setProperty('--mobile-visible-height',state.height+'px');root.style.setProperty('--mobile-visible-top',state.top+'px');root.classList.toggle('mobile-keyboard',state.keyboard);
 if(mobileLayoutMode!==state.mobile){mobileLayoutMode=state.mobile;cancelMobileCalendarPreset();const grid=$('#weekGrid');if(grid)bindCalendarGrid(grid);bindCalendarPresets()}
}
function queueMobileViewport(){if(mobileViewportFrame)return;mobileViewportFrame=requestAnimationFrame(()=>{mobileViewportFrame=0;updateMobileViewport()})}
window.visualViewport?.addEventListener('resize',queueMobileViewport);window.visualViewport?.addEventListener('scroll',queueMobileViewport);
window.addEventListener('resize',queueMobileViewport);window.addEventListener('orientationchange',()=>{mobileViewportBaseline=0;queueMobileViewport()});
document.addEventListener('focusin',queueMobileViewport);document.addEventListener('focusout',queueMobileViewport);
async function requestPlannerPersistence(){
 const button=$('#requestPersistentStorage'),status=$('#persistentStorageStatus');button.disabled=true;
 try{const storage=navigator.storage;if(!storage?.persist){status.textContent='Этот браузер не поддерживает защиту хранения. Используй экспорт JSON и синхронизацию.';return false}
 const granted=await storage.persist();status.textContent=granted?'Браузер предоставил устойчивое хранение. Экспорт и синхронизация по-прежнему полезны.':'Браузер не предоставил устойчивое хранение. Данные не удалены; используй экспорт JSON и синхронизацию.';return granted;
 }catch{status.textContent='Не удалось запросить защиту хранения. Используй экспорт JSON и синхронизацию.';return false}finally{button.disabled=false}
}
$('#requestPersistentStorage').onclick=requestPlannerPersistence;
updateMobileViewport();
