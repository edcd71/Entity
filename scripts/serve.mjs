import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.heic':'image/heic','.mov':'video/quicktime','.mp4':'video/mp4','.woff2':'font/woff2','.svg':'image/svg+xml','.aae':'application/xml'};
const server = http.createServer(async(req,res) => {
  try {
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const segments = pathname.split('/');
    if (segments.some(part=>part.startsWith('.')) || !['/','/index.html','/favicon.svg'].includes(pathname) && !/^\/(app|assets|media)\//.test(pathname)) {res.writeHead(404);res.end();return;}
    const file = path.resolve(root, '.'+(pathname === '/' ? '/index.html' : pathname));
    if (!file.startsWith(root)) {res.writeHead(403);res.end();return;}
    const resolved = await realpath(file);
    if (!resolved.startsWith(root)) {res.writeHead(403);res.end();return;}
    const info = await stat(resolved);
    if (!info.isFile()) {res.writeHead(404);res.end();return;}
    const headers={'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream','Accept-Ranges':'bytes','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Cache-Control':file.endsWith('.json')?'no-store':'no-cache'};
    if(req.headers.range) {
      const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      let start,end;
      if(match && (match[1] || match[2])) {
        start=match[1] ? Number(match[1]) : Math.max(0,info.size-Number(match[2]));
        end=match[1] && match[2] ? Math.min(Number(match[2]),info.size-1) : info.size-1;
      }
      if (!match || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>end || start>=info.size) {res.writeHead(416,{'Content-Range':`bytes */${info.size}`});res.end();return;}
      res.writeHead(206,{...headers,'Content-Length':end-start+1,'Content-Range':`bytes ${start}-${end}/${info.size}`});
      if(req.method==='HEAD')res.end(); else createReadStream(file,{start,end}).pipe(res);
    } else {
      res.writeHead(200,{...headers,'Content-Length':info.size});
      if(req.method==='HEAD')res.end(); else createReadStream(file).pipe(res);
    }
  } catch {res.writeHead(404);res.end('Not found');}
});
server.listen(port,'127.0.0.1',()=>console.log(`entity → http://127.0.0.1:${port}`));
