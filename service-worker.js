const CACHE='planner-v0943';
const CLOUD_LIBRARY='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1';
const SDK_CACHE='planner-cloud-sdk-v1';
const CORE=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>caches.open(SDK_CACHE).then(c=>c.add(CLOUD_LIBRARY)).catch(()=>{})).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('planner-v')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const u=new URL(e.request.url);
  if(u.origin!==self.location.origin){
    if(u.href===CLOUD_LIBRARY)e.respondWith(fetch(e.request).then(r=>{
      if(r.ok||r.type==='opaque'){const copy=r.clone();e.waitUntil(caches.open(SDK_CACHE).then(c=>c.put(e.request,copy)).catch(()=>{}))}
      return r;
    }).catch(()=>caches.match(e.request).then(r=>r||Response.error())));
    return;
  }
  e.respondWith(fetch(e.request).then(r=>{
    if(r&&r.ok){const copy=r.clone();e.waitUntil(caches.open(CACHE).then(c=>c.put(e.request,copy)).catch(()=>{}))}
    return r;
  }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
