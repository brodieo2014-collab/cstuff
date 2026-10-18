import http from 'node:http';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { server as wisp } from '@mercuryworkshop/wisp-js/server';
import { scramjetPath } from '@mercuryworkshop/scramjet/path';
import { baremuxPath } from '@mercuryworkshop/bare-mux/node';
import { epoxyPath } from '@mercuryworkshop/epoxy-transport';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8080;

wisp.options.allow_udp_streams = false;
wisp.options.dns_method = 'resolve';
if (process.env.ALLOW_LOOPBACK === '1') wisp.options.allow_loopback_ips = true; // local testing only

const app = express();
app.disable('x-powered-by');

app.get('/healthz', (_req, res) => res.type('text').send('ok'));

const staticOpts = { maxAge: '1h' };
// Site files are revalidated on every load so updates show up right away; the big proxy libraries can be cached.
app.use(express.static(path.join(__dirname, 'public'), { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));
app.use('/scram/', express.static(scramjetPath, staticOpts));
app.use('/baremux/', express.static(baremuxPath, staticOpts));
app.use('/epoxy/', express.static(epoxyPath, staticOpts));

// ---------- gn-math relay ----------
// Fetches gn-math's game files from GitHub and serves them with proper file types. GitHub's raw host labels
// everything text/plain (browsers then refuse to run scripts), and CDNs like jsDelivr are blocked on some networks.
const GM_UPSTREAM = process.env.GM_UPSTREAM || 'https://raw.githubusercontent.com/gn-math';
const GM_REPOS = new Set(['html', 'assets', 'covers']);
const GM_PATH = /^[\w .@()+,\-]+(?:\/[\w .@()+,\-]+)*$/;

app.get('/gm/:repo/*path', async (req, res) => {
  const { repo } = req.params;
  const rel = [].concat(req.params.path || []).join('/');
  if (!GM_REPOS.has(repo) || rel.length > 400 || !GM_PATH.test(rel) || rel.split('/').some((p) => p === '.' || p === '..')) {
    return res.status(404).type('text').send('Not found');
  }
  const url = `${GM_UPSTREAM}/${repo}/main/${rel.split('/').map(encodeURIComponent).join('/')}`;
  let up;
  try {
    up = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'accept-encoding': 'identity' } });
  } catch {
    return res.status(502).type('text').send('Could not reach the game host');
  }
  if (!up.ok || !up.body) return res.status(up.status === 404 ? 404 : 502).type('text').send('Upstream HTTP ' + up.status);

  const ext = path.extname(rel).toLowerCase();
  res.type(ext || 'application/octet-stream');
  if (!res.get('Content-Type')) res.type('application/octet-stream');
  const len = up.headers.get('content-length');
  if (len) res.set('Content-Length', len);
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
    // If someone opens a game page straight from this address, it runs in an opaque origin, never as cstuff.
    'Content-Security-Policy': 'sandbox allow-scripts allow-popups allow-forms allow-modals allow-pointer-lock',
    'Cache-Control': 'public, max-age=86400',
  });
  const body = Readable.fromWeb(up.body);
  body.on('error', () => res.destroy());
  res.on('close', () => body.destroy());
  body.pipe(res);
});

app.get('/proxy', (_req, res) => res.redirect('/'));
app.use((_req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

const server = http.createServer(app);

// ---------- chat ----------
const wss = new WebSocketServer({ noServer: true, maxPayload: 2048 });
const history = [];
const HISTORY_MAX = 60;

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const c of wss.clients) if (c.readyState === 1 && c.joined) c.send(data);
}
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);

wss.on('connection', (ws) => {
  ws.joined = false;
  ws.name = '';
  ws.stamps = [];
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    if (!m || typeof m !== 'object') return;

    if (m.type === 'join') {
      const name = clean(m.name, 20) || 'guest' + Math.floor(Math.random() * 9000 + 1000);
      ws.name = name;
      ws.joined = true;
      ws.send(JSON.stringify({ type: 'hello', name, history }));
      broadcast({ type: 'system', text: `${name} joined`, online: onlineCount() });
      return;
    }
    if (m.type === 'msg' && ws.joined) {
      const text = clean(m.text, 300);
      if (!text) return;
      const now = Date.now();
      ws.stamps = ws.stamps.filter((t) => now - t < 8000);
      if (ws.stamps.length >= 5) {
        ws.send(JSON.stringify({ type: 'system', text: 'Slow down a little.', online: onlineCount() }));
        return;
      }
      ws.stamps.push(now);
      const msg = { type: 'msg', name: ws.name, text, ts: now };
      history.push(msg);
      if (history.length > HISTORY_MAX) history.shift();
      broadcast(msg);
    }
  });

  ws.on('close', () => {
    if (ws.joined) broadcast({ type: 'system', text: `${ws.name} left`, online: onlineCount() });
  });
});

function onlineCount() {
  let n = 0;
  for (const c of wss.clients) if (c.joined && c.readyState === 1) n++;
  return n;
}

setInterval(() => {
  for (const c of wss.clients) {
    if (!c.isAlive) { c.terminate(); continue; }
    c.isAlive = false;
    c.ping();
  }
}, 30000);

// ---------- upgrades: chat + wisp (proxy transport) ----------
server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/chat-ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else if (pathname.startsWith('/wisp/')) {
    wisp.routeRequest(req, socket, head);
  } else {
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => console.log(`cstuff listening on :${PORT}`));

const shutdown = () => { server.close(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
