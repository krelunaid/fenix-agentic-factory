import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';

const root = join(process.cwd(), 'public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
createServer(async (request, response) => {
  const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
  const relative = pathname === '/' ? 'index.html' : normalize(pathname).replace(/^\/+/, '');
  const file = join(root, relative);
  if (!file.startsWith(root)) { response.writeHead(403).end('Forbidden'); return; }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not_file');
    response.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    createReadStream(file).pipe(response);
  } catch { response.writeHead(404).end('Not found'); }
}).listen(8080, '0.0.0.0', () => console.log('FENIX preview ready on 8080'));
