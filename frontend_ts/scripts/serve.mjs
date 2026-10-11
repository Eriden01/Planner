import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';

const root = new URL('../public/', import.meta.url);
const files = new Map([
  ['/index.html', 'text/html; charset=utf-8'],
  ['/service-worker.js', 'text/javascript; charset=utf-8'],
  ['/manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['/icon-192.png', 'image/png'],
  ['/icon-512.png', 'image/png'],
  ['/js/app.js', 'text/javascript; charset=utf-8'],
  ['/styles/app.css', 'text/css; charset=utf-8'],
]);
for (const name of await readdir(new URL('images/',root))) {
  if (/^[a-zA-Z0-9-]+\.(png|jpg|webp)$/.test(name)) {
    const ext=name.split('.').pop();
    files.set('/images/'+name,ext==='jpg'?'image/jpeg':'image/'+ext);
  }
}

const server = http.createServer(async (request, response) => {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let path;
  try { path = new URL(request.url, 'http://localhost').pathname; }
  catch { response.writeHead(400).end(); return; }
  if (path === '/') path = '/index.html';
  if (!files.has(path)) { response.writeHead(404).end('Not found'); return; }
  try {
    const body = await readFile(fileURLToPath(new URL(path.slice(1), root)));
    response.writeHead(200, {
      'Content-Type': files.get(path),
      'Content-Length': body.length,
      'Cache-Control': 'no-cache',
    });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch { response.writeHead(500).end('Unable to read application file'); }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(8080, '127.0.0.1', () => console.log('Planner: http://localhost:8080'));
