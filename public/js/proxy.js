import { BareMuxConnection } from '/baremux/index.mjs';

const $ = (id) => document.getElementById(id);
const status = $('status');
const frame = $('frame');
const browser = $('browser');
const urlBar = $('b-url');
let ready = null;

function say(msg, cls = '') { status.textContent = msg; status.className = 'status ' + cls; }

async function init() {
  if (!('serviceWorker' in navigator)) throw new Error('This browser does not support service workers.');
  if (!window.isSecureContext) throw new Error('A secure (https) connection is required.');
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;
  const conn = new BareMuxConnection('/baremux/worker.js');
  const wisp = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/wisp/';
  await conn.setTransport('/epoxy/index.mjs', [{ wisp }]);
}

function start() {
  if (!ready) ready = init();
  return ready;
}

function toUrl(input) {
  const v = input.trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^[^\s]+\.[a-z]{2,}([/:?#].*)?$/i.test(v) || /^localhost(:\d+)?/i.test(v)) return 'https://' + v;
  return 'https://duckduckgo.com/?q=' + encodeURIComponent(v);
}

function encode(url) { return __uv$config.prefix + __uv$config.encodeUrl(url); }
function decodeFrame() {
  try {
    const p = frame.contentWindow.location.pathname + frame.contentWindow.location.search + frame.contentWindow.location.hash;
    if (p.startsWith(__uv$config.prefix)) return __uv$config.decodeUrl(p.slice(__uv$config.prefix.length));
  } catch {}
  return null;
}

async function open(input) {
  const url = toUrl(input);
  if (!url) return;
  say('Connecting…');
  try {
    await start();
  } catch (e) {
    ready = null;
    say('Could not start the proxy: ' + e.message, 'err');
    return;
  }
  say('Ready', 'ok');
  browser.classList.add('open');
  urlBar.value = url;
  frame.src = encode(url);
}

frame.addEventListener('load', () => {
  const u = decodeFrame();
  if (u) urlBar.value = u;
});

$('go').addEventListener('submit', (e) => { e.preventDefault(); open($('q').value); });
document.querySelectorAll('.tile').forEach((t) => t.addEventListener('click', () => open(t.dataset.url)));
$('b-home').onclick = () => { browser.classList.remove('open'); frame.src = 'about:blank'; };
$('b-back').onclick = () => { try { frame.contentWindow.history.back(); } catch {} };
$('b-fwd').onclick = () => { try { frame.contentWindow.history.forward(); } catch {} };
$('b-reload').onclick = () => { try { frame.contentWindow.location.reload(); } catch {} };
$('b-full').onclick = () => { (frame.requestFullscreen || frame.webkitRequestFullscreen)?.call(frame); };
urlBar.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(urlBar.value); });

// warm up in the background so the first click is fast
say('Starting up…');
start().then(() => say('Ready', 'ok')).catch((e) => { ready = null; say('Proxy failed to start: ' + e.message, 'err'); });
