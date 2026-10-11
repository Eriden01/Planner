const CACHE='planner-v0947-audit1';
const CLOUD_LIBRARY='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.1';
const SDK_CACHE='planner-cloud-sdk-v1';
const CORE=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png',
  './js/app.js','./styles/app.css','./images/profile-89aa5b0d3614.png'];
const CORE_URLS=new Set(CORE.map(path=>new URL(path,self.location.href).href));

// Install the entire local release before activation. A CDN outage must not
// block the local PWA. Wait for old tabs to close to avoid mixed releases.
self.addEventListener('install',event=>event.waitUntil(
  caches.open(CACHE).then(cache=>cache.addAll(CORE.map(path=>new Request(new URL(path,self.location.href),{cache:'reload'}))))
));
self.addEventListener('activate',event=>event.waitUntil(
  caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('planner-v')&&key!==CACHE).map(key=>caches.delete(key))))
    .then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.href===CLOUD_LIBRARY){
    event.respondWith(caches.open(SDK_CACHE).then(async cache=>{
      const cached=await cache.match(event.request);if(cached)return cached;
      const response=await fetch(event.request);
      if(response.ok||response.type==='opaque')await cache.put(event.request,response.clone()).catch(()=>{});
      return response;
    }));return;
  }
  if(!CORE_URLS.has(url.href))return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const cached=await cache.match(event.request);if(cached)return cached;
    return fetch(event.request);
  }));
});
