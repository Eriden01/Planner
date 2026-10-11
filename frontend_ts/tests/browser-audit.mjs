import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

let playwright;
try { playwright = createRequire(import.meta.url)('playwright'); }
catch { playwright = createRequire(resolve(dirname(process.execPath), '../package.json'))('playwright'); }
const root = resolve(import.meta.dirname, '../..');
const reportDir = resolve(root, 'docs/audit');
await mkdir(reportDir, { recursive: true });
const server = spawn(process.execPath, ['frontend_ts/scripts/serve.mjs'], { cwd: root, stdio: ['ignore','pipe','pipe'] });
let browser;
try {
  await Promise.race([once(server.stdout, 'data'), once(server, 'exit').then(() => { throw Error('Server failed'); })]);
  browser = await playwright.chromium.launch({ channel: process.env.PLANNER_BROWSER || 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, serviceWorkers: 'block' });
  await context.route('**/*', route => new URL(route.request().url()).hostname === 'localhost' ? route.continue() : route.abort());
  await context.addInitScript(() => { Object.defineProperty(navigator, 'onLine', { get: () => false }); });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => dialog.accept());
  await page.goto('http://localhost:8080/');
  await page.waitForFunction(() => typeof profileOverviewReady !== 'undefined' && profileOverviewReady);
  const structure = await page.evaluate(() => {
    const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
    return { duplicateIds: ids.filter((id,i) => ids.indexOf(id) !== i), images: [...document.images].filter(i => i.hasAttribute('src')).length,
      cssRules: [...document.styleSheets].reduce((n,s) => n + s.cssRules.length, 0) };
  });
  assert.deepEqual(structure.duplicateIds, []);
  for (const name of ['today','calendar','projects','money','workouts','learning','portfolio','archive','account','settings']) {
    await page.evaluate(name => showPage(name), name);
    assert.equal(await page.locator('#page-' + name).isVisible(), true, name);
  }
  const baseline = await page.evaluate(() => {
    const old = moneyCursor; moneyCursor = new Date(2026,0,31,12); moneyPeriod = 'month'; shiftMoneyCursor(1);
    const shiftedMonth = moneyCursor.getMonth(); moneyCursor = old;
    const category = normalizeCalendarCategory('learning');
    return { shiftedMonth, category };
  });
  if (process.argv.includes('--baseline')) {
    await page.evaluate(() => showPage('today'));
    await page.screenshot({ path: resolve(reportDir, 'before-desktop.png') });
    await writeFile(resolve(reportDir, 'baseline.json'), JSON.stringify({ structure, baseline, errors }, null, 2));
    console.log(JSON.stringify({ structure, baseline, errors }));
  } else {
    assert.equal(baseline.shiftedMonth, 1, 'January 31 must advance to February');
    assert.equal(baseline.category, 'study', 'Learning category must survive normalization');
    await runRegressions(page);
    assert.deepEqual(errors, [], 'Browser runtime errors');
    await page.evaluate(() => showPage('today'));
    await page.screenshot({ path: resolve(reportDir, 'after-desktop.png') });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { calendarView='day'; showPage('calendar'); });
    await page.screenshot({ path: resolve(reportDir, 'after-mobile.png') });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, 'Mobile page horizontal overflow');
    await checkOffline(browser);
    await writeFile(resolve(reportDir, 'browser-results.json'), JSON.stringify({ structure, errors, mobileOverflow: overflow, offlineReload: 'pass', result: 'pass' }, null, 2));
    console.log('PASS: navigation, DOM IDs, categories, month navigation, regressions, mobile width, offline reload.');
  }
} finally {
  await browser?.close(); server.kill();
}

async function checkOffline(browser) {
  const context=await browser.newContext();
  await context.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://localhost:8080/');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const cached=await page.evaluate(async()=>{const cache=await caches.open('planner-v0947-audit1');return (await cache.keys()).map(r=>new URL(r.url).pathname)});
  for(const path of ['/js/app.js','/styles/app.css','/images/profile-89aa5b0d3614.png'])assert.ok(cached.includes(path),path);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(()=>profileOverviewReady);
  await page.evaluate(()=>showPage('account'));
  assert.equal(await page.locator('#page-account').isVisible(),true);
  assert.deepEqual(errors,[],'Offline runtime errors');
  await context.close();
}

async function runRegressions(page) {
  const result = await page.evaluate(async () => {
    const check=(condition,label)=>{if(!condition)throw Error(label)};
    db=normalizeCloudData({});persistLocal(false);plannerRevision=0;
    db.projects.push({id:'p1',name:'First',archived:false});save();
    const before=JSON.stringify(db),undo=localStorage.getItem(scopedPlannerKey(UNDO_HISTORY_KEY)),revision=plannerRevision;
    const originalSet=Storage.prototype.setItem;
    Storage.prototype.setItem=function(key,value){if(key===plannerDataKey())throw new DOMException('Test quota','QuotaExceededError');return originalSet.call(this,key,value)};
    try {
      check(undoLastAction()===false,'Undo must fail when storage is full');
      check(JSON.stringify(db)===before,'Failed undo must restore in-memory data');
      check(localStorage.getItem(scopedPlannerKey(UNDO_HISTORY_KEY))===undo,'Failed undo must retain history');
      check(plannerRevision===revision,'Failed undo must not increment revision');
    } finally {Storage.prototype.setItem=originalSet}
    check(undoLastAction()===true&&db.projects.length===0,'Undo data');
    check(plannerRevision===revision+1,'Undo revision protects pending cloud push');
    check(redoLastAction()===true&&db.projects.length===1,'Redo data');
    check(plannerRevision===revision+2,'Redo revision');
    const date=todayISO;
    for(const template of [{dayIndex:7,start:'09:00',end:'10:00'},{dayIndex:0,start:'<img src=x>',end:'10:00'}]){
      let rejected=false;try{validatePlannerState({weekTemplate:[template]})}catch{rejected=true}
      check(rejected,'Malformed week template must be rejected before application');
    }
    db.calendar=[{id:'move1',projectId:'p1',status:'moved',movedToEventId:'move2'},{id:'move2',projectId:'p1',status:'planned'}];
    check(taskAreaEvents('p1').map(x=>x.id).join(',')==='move2','Moved tasks counted once');
    db.calendar=[];
    db.food.push({id:'food1',date,title:'Lunch',amount:10,category:'Food',moneyId:'m1'});
    db.money.push({id:'m1',date,amount:10,type:'expense',source:'food',sourceId:'food1'});
    openMoneyEntryEditor('m1');
    check($('#foodDialog').open&&!$('#moneyDialog').open,'Linked expense must open source editor');
    $('#foodDialog').close();
    db.timeEntries.push({id:'t1',date,ms:3600000,taskId:FREE_FOCUS_ID});
    $('.today-focus-statistics').open=true;renderFocusPage();
    check($('#focusToday').textContent===msHoursText(3600000),'Focus statistics must refresh');
    db.learningSkills.push({id:'s1',title:'Study',stages:[{id:'st1',title:'One',minutes:25}]});
    openLearningEditor('schedule','s1','','st1');
    check(saveLearningEditor(),'Schedule learning');
    check(db.calendar.at(-1).category==='study','Learning scheduler category');
    check(todayAttentionEvents().some(e=>e.learningSkillId==='s1'),'Learning in Today');
    let resets=0;const form=$('#calendarPresetForm'),originalReset=form.reset;
    form.reset=()=>{resets++;originalReset.call(form)};
    bindCalendarPresets();bindCalendarPresets();$('#addCalendarPreset').click();
    check(resets===1,'Preset binding must be idempotent');form.reset=originalReset;$('#calendarPresetDialog').close();
    const base=normalizeCloudData({projects:[{id:'p',name:'Base'}]});
    const left=structuredClone(base),right=structuredClone(base);
    left.projects.push({id:'left',name:'Local'});right.projects.push({id:'right',name:'Remote'});
    check(mergeCloudDomains(left,right,base).projects.length===3,'Independent merge');
    left.projects[0].name='L';right.projects[0].name='R';
    let conflicts=0;try{mergeCloudDomains(left,right,base)}catch{conflicts++}
    left.projects=[];try{mergeCloudDomains(left,right,base)}catch{conflicts++}
    check(conflicts===2,'Conflicting edits must not silently overwrite');
    const oldClient=cloudClient,oldUser=cloudUser,oldScope=plannerScope,oldBase=plannerSyncBase,oldRender=renderAfterRemote;
    let renderCount=0;renderAfterRemote=()=>{renderCount++};
    cloudUser={id:'audit-user'};plannerScope='audit-user';cloudBusy=false;cloudMode='ready';cloudDirty=true;
    const remote=structuredClone(db);plannerSyncBase=structuredClone(remote);
    cloudClient={from(){let write=false;const q={select(){return q},eq(){return q},is(){return q},update(){write=true;return q},maybeSingle(){return Promise.resolve({data:write?{version:2}:{data:remote,version:1},error:null})}};return q}};
    try{check(await pushCloudState(true),'Mocked cloud push');check(renderCount===0,'Unchanged push must preserve DOM')}
    finally{cloudClient=oldClient;cloudUser=oldUser;plannerScope=oldScope;plannerSyncBase=oldBase;renderAfterRemote=oldRender}
    persistLocal(false);
    const resetRevision=plannerRevision;$('#resetData').click();
    check(!db.projects.length&&plannerRevision===resetRevision+1,'Reset must use the revisioned save path');
    check(undoLastAction()&&db.projects.length===1,'Reset must be undoable');
    return 'pass';
  });
  assert.equal(result, 'pass');
}
