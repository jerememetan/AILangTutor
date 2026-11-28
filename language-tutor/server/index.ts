import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLessonHandler, maxRequestBytes } from './lesson/handler.ts';
import { createProviders } from './lesson/providers.ts';

const port = 8787;
const clientRoot = fileURLToPath(new URL('../dist', import.meta.url));
const providers = createProviders(process.env);
const lesson = createLessonHandler(providers);
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.vrm': 'model/gltf-binary', '.svg': 'image/svg+xml',
};

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `localhost:${port}`}`);
    const method = request.method ?? 'GET';
    if (url.pathname.startsWith('/api/lesson/')) {
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
        else if (value) headers.set(key, value);
      }
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of request.iterator({ destroyOnReturn: false })) {
        size += chunk.length;
        if (size > maxRequestBytes) {
          response.writeHead(413, { 'Content-Type': 'application/json', Connection: 'close' });
          response.end(JSON.stringify({ error: 'That recording is too long. Try a shorter turn.' }));
          return;
        }
        chunks.push(chunk);
      }
      const result = await lesson(new Request(url, {
        method, headers, body: size && method !== 'GET' && method !== 'HEAD' ? Buffer.concat(chunks) : undefined,
      }));
      response.writeHead(result.status, Object.fromEntries(result.headers));
      response.end(Buffer.from(await result.arrayBuffer()));
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      response.writeHead(405).end();
      return;
    }
    const path = decodeURIComponent(url.pathname);
    const extension = extname(path);
    const file = resolve(clientRoot, extension ? '.' + path : 'index.html');
    if (!file.startsWith(clientRoot + sep)) {
      response.writeHead(404).end();
      return;
    }
    const bytes = await readFile(file).catch(() => null);
    if (!bytes) {
      response.writeHead(404).end(extension ? 'Asset unavailable' : 'Run npm run build to serve the app here.');
      return;
    }
    response.writeHead(200, {
      'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    response.end(method === 'HEAD' ? undefined : bytes);
  } catch {
    if (!response.headersSent) response.writeHead(500, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ error: 'The lesson server could not complete the request.' }));
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Verba lesson API and built app at http://127.0.0.1:${port}`);
  if (!providers) console.log('Live voice requires the credentials listed in .env.example.');
});
