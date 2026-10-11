import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const publicRoot=new URL('../public/',import.meta.url);

test('All local HTML and CSS references resolve; JavaScript parses',async()=>{
  const html=await readFile(new URL('index.html',publicRoot),'utf8');
  const css=await readFile(new URL('styles/app.css',publicRoot),'utf8');
  for(const [,file] of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g))await readFile(new URL(file,publicRoot));
  for(const [,file] of css.matchAll(/url\(['"]?(\.\.\/[^)'" ]+)['"]?\)/g))await readFile(new URL(file,new URL('styles/',publicRoot)));
  for(const file of ['js/app.js','service-worker.js'])new vm.Script(await readFile(new URL(file,publicRoot),'utf8'));
  for(const [,code] of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(code);
  assert.ok(!html.includes('cdn.jsdelivr.net'),'Cloud SDK should not block parsing the local application');
});

test('Service worker installs the full release at root and subdirectory',async()=>{
  const source=await readFile(new URL('service-worker.js',publicRoot),'utf8');
  for(const prefix of ['/','/planner/']){
    const listeners={},requests=[];let claimed=false;
    const scope={self:{location:{href:'https://test.invalid'+prefix+'service-worker.js'},addEventListener:(name,fn)=>listeners[name]=fn,clients:{claim:async()=>{claimed=true}}},
      URL,Request,Response,Set,Promise,caches:{open:async()=>({addAll:async items=>requests.push(...items)}),keys:async()=>[],delete:async()=>true}};
    vm.runInNewContext(source,scope);
    let pending;listeners.install({waitUntil:p=>pending=p});await pending;
    assert.equal(requests.length,8);
    for(const request of requests){
      const path=new URL(request.url).pathname;assert.ok(path.startsWith(prefix));
      await readFile(new URL(path.slice(prefix.length)||'index.html',publicRoot));
      assert.equal(request.cache,'reload');
    }
    listeners.activate({waitUntil:p=>pending=p});await pending;assert.equal(claimed,true);
    for(const url of ['https://test.invalid'+prefix+'private.json','https://test.invalid/api/me','https://other.invalid/']){
      let intercepted=false;listeners.fetch({request:new Request(url),respondWith:()=>{intercepted=true}});assert.equal(intercepted,false);
    }
  }
});
