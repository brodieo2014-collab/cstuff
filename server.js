import http from 'node:http';
import dns from 'node:dns';
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
// "Play through the proxy" for games: the proxy reaches this same server under a made-up host name, because
// Scramjet refuses to proxy the site it is running on. Only that name may resolve to this machine.
const GAME_HOST = 'cstuff-games.test';
const TEST_LOOPBACK = process.env.ALLOW_LOOPBACK === '1'; // local testing only
const resolver = new dns.Resolver();
if (Array.isArray(wisp.options.dns_servers) && wisp.options.dns_servers.length) { try { resolver.setServers(wisp.options.dns_servers); } catch {} }
const isLoopback = (a) => /^(127\.|0\.0\.0\.0$|::1$|::$)/.test(a);
wisp.options.dns_method = async (host) => {
  if (host === GAME_HOST) return '127.0.0.1';
  let addr;
  try { addr = (await resolver.resolve4(host))[0]; } catch { addr = (await resolver.resolve6(host))[0]; }
  if (isLoopback(addr) && !TEST_LOOPBACK) throw new Error('blocked');
  return addr;
};
wisp.options.allow_loopback_ips = true; // safe: the resolver above only ever returns loopback for GAME_HOST

const app = express();
app.disable('x-powered-by');

// Requests that arrive under the game host name (from the proxy) may only use the game relay and the static proxy libraries.
app.use((req, res, next) => {
  if (req.hostname === GAME_HOST) {
    const allowed = ['/gm/', '/scram/', '/baremux/', '/epoxy/'];
    for (const p of allowed) {
      if (req.path.startsWith(p)) return next();
    }
    return res.status(404).type('text').send('Not found');
  }
  next();
});
// Remembers the last files the relay could not find, so the games page can show what is missing.
const gmFails = [];
const noteFail = (repo, rel, why) => { gmFails.push({ t: Date.now(), p: `${repo}/${rel}`.slice(0, 160), why }); if (gmFails.length > 40) gmFails.shift(); };
app.get('/gm/_log', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(gmFails.filter((f) => f.t >= (Number(req.query.since) || 0))); });
app.get('/gm/_info', (_req, res) => res.json({ host: GAME_HOST, port: Number(PORT) }));

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
const GM_SITE = (process.env.GM_SITE || 'https://gn-math.dev').replace(/\/$/, '');
const GM_REPOS = new Set(['html', 'assets', 'covers']);
const GM_PATH = /^[\w .@()+,\-]+(?:\/[\w .@()+,\-]+)*$/;

const GM_JSD = process.env.GM_JSD || 'https://cdn.jsdelivr.net/gh';
const SEG = /^[\w.\-]+$/;
const encRel = (rel) => rel.split('/').map(encodeURIComponent).join('/');
// Games sometimes say "load my files from github.com/<owner>/<repo>" (through jsDelivr). Same relay, fixed host.
app.get('/gm/x/:owner/:repo/:ref/*path', (req, res) => {
  const { owner, repo, ref } = req.params;
  const rel = [].concat(req.params.path || []).join('/');
  if (!SEG.test(owner) || !SEG.test(repo) || !/^[\w.\-]+$/.test(ref) || rel.length > 400 || !GM_PATH.test(rel) || rel.split('/').some((p) => p === '.' || p === '..')) {
    return res.status(404).type('text').send('Not found');
  }
  return relay(req, res, `${GM_JSD}/${owner}/${repo}@${ref}/${encRel(rel)}`, 'x', `${owner}/${repo}/${rel}`, rel);
});
app.get('/gm/:repo/*path', (req, res) => {
  const { repo } = req.params;
  const rel = [].concat(req.params.path || []).join('/');
  if (!GM_REPOS.has(repo) || rel.length > 400 || !GM_PATH.test(rel) || rel.split('/').some((p) => p === '.' || p === '..')) {
    return res.status(404).type('text').send('Not found');
  }
  return relay(req, res, `${GM_UPSTREAM}/${repo}/main/${encRel(rel)}`, repo, rel, rel);
});

async function relay(req, res, url, repo, label, rel) {
  // Try fetching the upstream resource. Some hosts (YouTube, large CDNs) can be picky about TLS/user-agent
  // and may close connections during handshake; retry with a browser-like User-Agent if the first attempt fails.
  const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36';
  const tryFetch = async (u, to, headers) => {
    try {
      return await fetch(u, { signal: AbortSignal.timeout(to), headers });
    } catch (e) {
      return { __error: e };
    }
  };

  let up = await tryFetch(url, 30000, { 'accept-encoding': 'identity' });
  if (!up || up.__error) {
    // Retry once with a browser UA and a slightly longer timeout.
    up = await tryFetch(url, 45000, { 'accept-encoding': 'identity', 'user-agent': BROWSER_UA });
    if (up && up.__error) {
      // log the error for admins and fall through to the normal failure path
      noteFail(repo, label, String(up.__error && up.__error.message ? up.__error.message : 'fetch error'));
      return res.status(502).type('text').send('Could not reach the game host');
    }
  }

  if (!up.ok || !up.body) noteFail(repo, label, 'HTTP ' + up.status);
  if (!up.ok || !up.body) return res.status(up.status === 404 ? 404 : 502).type('text').send('Upstream HTTP ' + up.status);

  const ext = path.extname(rel).toLowerCase();
  const viaProxy = req.hostname === GAME_HOST;
  res.type(ext || 'application/octet-stream');
  if (!res.get('Content-Type')) res.type('application/octet-stream');
  const len = up.headers.get('content-length');
  if (viaProxy && ext === '.html' && len && Number(len) < 3e6) {
    // Games point some files at public CDNs; send them to this relay instead, and drop analytics scripts.
    let html = await up.text();
    html = html.replace(/(<base\s[^>]*href=["'])https?:\/\/(?:cdn|fastly|gcore|testingcf)\.jsdelivr\.net\/gh\/([\w.\-]+)\/([\w.\-]+)@([\w.\-]+)\//gi, '$1/gm/x/$2/$3/$4/')
      .replace(/https?:\/\/((?:cdn|fastly|gcore|testingcf)\.jsdelivr\.net)\/gh\/gn-math\/(html|assets|covers)@(?:main|master)\//g, '/gm/$2/')
      .replace(/https?:\/\/raw\.githubusercontent\.com\/gn-math\/(html|assets|covers)\/(?:main|master)\//g, '/gm/$1/')
      .replace(/<script\b[^>]*src=["'][^"']*(?:googletagmanager|google-analytics|doubleclick|googlesyndication|adsbygoogle)[^"']*["'][^>]*>\s*<\/script>/gi, '');
    res.set({ 'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    return res.type('text/html; charset=utf-8').send(html);
  }
  if (len) res.set('Content-Length', len);
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
    // If someone opens a game page straight from this address, it runs in an opaque origin, never as cstuff.
    ...(viaProxy ? {} : { 'Content-Security-Policy': 'sandbox allow-scripts allow-popups allow-forms allow-modals allow-pointer-lock' }),
    'Cache-Control': 'public, max-age=86400',
  });
  const body = Readable.fromWeb(up.body);
  body.on('error', () => res.destroy());
  res.on('close', () => body.destroy());
  body.pipe(res);
}

app.get('/proxy', (_req, res) => res.redirect('/'));
app.use((_req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

const server = http.createServer(app);
// Long-lived proxy connections: keep sockets open longer than the platform's load balancer does.
server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;
// A stray error in one request should never take the whole site (and every proxy connection) down.
process.on('uncaughtException', (e) => console.error('uncaught:', e));
process.on('unhandledRejection', (e) => console.error('unhandled:', e));

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
