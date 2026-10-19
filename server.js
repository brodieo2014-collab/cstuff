import http from 'node:http';
import dns from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';
import { Readable } from 'node:stream';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import compression from 'compression';
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
const resolver = new dns.promises.Resolver();
if (Array.isArray(wisp.options.dns_servers) && wisp.options.dns_servers.length) { try { resolver.setServers(wisp.options.dns_servers); } catch {} }
const isLoopback = (a) => /^(127\.|0\.0\.0\.0$|::1$|::$)/.test(a);
wisp.options.dns_method = async (host) => {
  if (host === GAME_HOST) return '127.0.0.1';
  let addr;
  // Same order the proxy library used before: IPv6 first, then IPv4. (Some hosts only reach the internet one way.)
  try { addr = (await resolver.resolve6(host))[0]; } catch { try { addr = (await resolver.resolve4(host))[0]; } catch (e) { console.error('dns failed for', host, e && e.code); throw e; } }
  if (isLoopback(addr) && !TEST_LOOPBACK) throw new Error('blocked');
  return addr;
};
wisp.options.allow_loopback_ips = true; // safe: the resolver above only ever returns loopback for GAME_HOST

const app = express();
app.disable('x-powered-by');
app.use(compression()); // game files (pages, scripts, wasm) shrink a lot

// Requests that arrive under the game host name (from the proxy) may only use the game relay.
app.use((req, res, next) => {
  if (req.hostname === GAME_HOST && !req.path.startsWith('/gm/')) return res.status(404).type('text').send('Not found');
  next();
});
// Remembers the last files the relay could not find, so the games page can show what is missing.
const gmFails = [];
const noteFail = (repo, rel, why) => { gmFails.push({ t: Date.now(), p: `${repo}/${rel}`.slice(0, 160), why }); if (gmFails.length > 40) gmFails.shift(); };
app.get('/gm/_log', (req, res) => { res.set('Cache-Control', 'no-store'); res.json(gmFails.filter((f) => f.t >= (Number(req.query.since) || 0))); });
app.get('/gm/_info', (_req, res) => res.json({ host: GAME_HOST, port: Number(PORT) }));

// Lets games that need SharedArrayBuffer (multi-threaded engines) work: the games page becomes cross-origin isolated.
app.use((req, res, next) => {
  if (req.path === '/games.html') { res.set({ 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'credentialless' }); }
  next();
});
// Connection check: open /_nettest to see whether this server can reach the internet (DNS, TCP and TLS).
const NETTEST_HOSTS = new Set(['duckduckgo.com', 'en.wikipedia.org', 'www.google.com', 'example.com']);
app.get('/_nettest', async (req, res) => {
  const host = NETTEST_HOSTS.has(String(req.query.host)) ? String(req.query.host) : 'duckduckgo.com';
  const out = { host, resolver: dns.getServers() };
  const t = async (name, fn) => { const t0 = Date.now(); try { out[name] = { ok: await fn(), ms: Date.now() - t0 }; } catch (e) { out[name] = { error: (e && (e.code || e.message)) || String(e), ms: Date.now() - t0 }; } };
  await t('dns_resolve6', () => resolver.resolve6(host));
  await t('dns_resolve4', () => resolver.resolve4(host));
  await t('dns_lookup', async () => (await dns.promises.lookup(host, { all: true })).map((a) => a.address));
  const addrs = [...(out.dns_resolve6.ok || []).slice(0, 1), ...(out.dns_resolve4.ok || []).slice(0, 1)];
  for (const a of addrs) {
    await t('tcp_' + a, () => new Promise((ok, no) => { const s = net.connect({ host: a, port: 443, timeout: 6000 }, () => { s.destroy(); ok('connected'); }); s.on('error', no); s.on('timeout', () => { s.destroy(); no(new Error('timeout')); }); }));
    await t('tls_' + a, () => new Promise((ok, no) => { const s = tls.connect({ host: a, port: 443, servername: host, timeout: 6000 }, () => { const p = s.getProtocol(); s.destroy(); ok('handshake ok ' + p); }); s.on('error', no); s.on('timeout', () => { s.destroy(); no(new Error('timeout')); }); }));
  }
  res.set('Cache-Control', 'no-store').type('json').send(JSON.stringify(out, null, 2));
});
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

const GM_RAW = process.env.GM_RAW || 'https://raw.githubusercontent.com';
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
  // jsDelivr refuses big files (over about 20 MB), so fall back to GitHub's own raw host for those.
  const rawRef = ref === 'latest' ? 'HEAD' : ref;
  return relay(req, res, `${GM_JSD}/${owner}/${repo}@${ref}/${encRel(rel)}`, 'x', `${owner}/${repo}/${rel}`, rel,
    [`${GM_RAW}/${owner}/${repo}/${rawRef}/${encRel(rel)}`]);
});
// Other public CDNs games lean on (Ruffle for Flash games, libraries, fonts), through the same relay.
const H_HOSTS = new Set(['unpkg.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com']);
app.get('/gm/h/:host/*path', (req, res) => {
  const { host } = req.params;
  const rel = [].concat(req.params.path || []).join('/');
  const qi = req.originalUrl.indexOf('?');
  const query = qi >= 0 ? req.originalUrl.slice(qi) : '';
  if (!H_HOSTS.has(host) || rel.length > 400 || !GM_PATH.test(rel) || rel.split('/').some((p) => p === '.' || p === '..') || (query && !/^\?[\w=&.,:+%@|;\-]{1,300}$/.test(query))) {
    return res.status(404).type('text').send('Not found');
  }
  return relay(req, res, `${process.env.GM_H_BASE || 'https:/'}/${host}/${encRel(rel)}${query}`, 'h', `${host}/${rel}`, rel);
});
app.get('/gm/:repo/*path', (req, res) => {
  const { repo } = req.params;
  const rel = [].concat(req.params.path || []).join('/');
  if (!GM_REPOS.has(repo) || rel.length > 400 || !GM_PATH.test(rel) || rel.split('/').some((p) => p === '.' || p === '..')) {
    return res.status(404).type('text').send('Not found');
  }
  return relay(req, res, `${GM_UPSTREAM}/${repo}/main/${encRel(rel)}`, repo, rel, rel);
});

const TEXTY = new Set(['.html', '.htm', '.js', '.mjs', '.json', '.css']);
function rewriteText(t, isHtml) {
  t = t
    .replace(/(?:https?:)?\/\/(?:cdn|fastly|gcore|testingcf)\.jsdelivr\.net\/gh\/gn-math\/(html|assets|covers)@(?:main|master|latest)\//g, '/gm/$1/')
    .replace(/https?:\/\/raw\.githubusercontent\.com\/gn-math\/(html|assets|covers)\/(?:main|master|HEAD)\//g, '/gm/$1/')
    .replace(/(?:https?:)?\/\/(?:cdn|fastly|gcore|testingcf)\.jsdelivr\.net\/gh\/([\w.\-]+)\/([\w.\-]+)@([\w.\-]+)\//g, '/gm/x/$1/$2/$3/')
    .replace(/https?:\/\/raw\.githubusercontent\.com\/([\w.\-]+)\/([\w.\-]+)\/([\w.\-]+)\//g, '/gm/x/$1/$2/$3/')
    .replace(/(?:https?:)?\/\/(unpkg\.com|cdnjs\.cloudflare\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//g, '/gm/h/$1/')
    .replace(/(?:https?:)?\/\/cdn\.jsdelivr\.net\/npm\//g, '/gm/h/cdn.jsdelivr.net/npm/');
  if (isHtml) t = t.replace(/<script\b[^>]*src=["'][^"']*(?:googletagmanager|google-analytics|doubleclick|googlesyndication|adsbygoogle)[^"']*["'][^>]*>\s*<\/script>/gi, '');
  return t;
}
async function relay(req, res, url, repo, label, rel, alts = []) {
  // The time limit covers connecting and the response headers only, so big downloads are not cut off midway.
  const get = (u) => {
    const ac = new AbortController(); const timer = setTimeout(() => ac.abort(), 30000);
    return fetch(u, { signal: ac.signal, headers: { 'accept-encoding': 'identity' } }).catch(() => null).finally(() => clearTimeout(timer));
  };
  const tryList = [url, ...alts];
  if (repo === 'html') tryList.push(`${GM_SITE}/${encRel(rel)}`); // some games refer to files that live on the gn-math site itself
  let up = null, reached = false;
  for (const u of tryList) {
    const r = await get(u);
    if (!r) continue;
    reached = true;
    if (!r.ok || !r.body) { if (!up) up = r; continue; }
    if (u !== url && /text\/html/i.test(r.headers.get('content-type') || '')) continue; // a web page is not a game file
    up = r; break;
  }
  if (!reached) { noteFail(repo, label, 'unreachable'); return res.status(502).type('text').send('Could not reach the game host'); }
  if (!up.ok || !up.body) noteFail(repo, label, 'HTTP ' + up.status);
  if (!up.ok || !up.body) return res.status(up.status === 404 ? 404 : 502).type('text').send('Upstream HTTP ' + up.status);

  let ext = path.extname(rel).toLowerCase();
  if (!ext) { const ct = up.headers.get('content-type') || ''; ext = /css/i.test(ct) ? '.css' : /javascript/i.test(ct) ? '.js' : /json/i.test(ct) ? '.json' : ''; }
  const viaProxy = req.hostname === GAME_HOST;
  res.type(ext || 'application/octet-stream');
  if (!res.get('Content-Type')) res.type('application/octet-stream');
  const len = up.headers.get('content-length');
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
    // If someone opens a game page straight from this address, it runs in an opaque origin, never as cstuff.
    ...(viaProxy ? {} : { 'Content-Security-Policy': 'sandbox allow-scripts allow-popups allow-forms allow-modals allow-pointer-lock' }),
    'Cache-Control': viaProxy ? 'no-cache' : 'public, max-age=86400',
  };
  if (TEXTY.has(ext) && len && Number(len) < 3e6) {
    // Games point some files at public CDNs and GitHub; send those requests through this relay instead.
    // Small text files (pages, scripts, data) are rewritten; big files and media are streamed untouched.
    const text = rewriteText(await up.text(), ext === '.html' || ext === '.htm');
    res.set(headers);
    return res.send(text);
  }
  if (len) res.set('Content-Length', len);
  res.set(headers);
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
