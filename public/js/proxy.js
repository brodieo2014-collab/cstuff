import { getEngine } from '/js/engine.js';

const $ = (id) => document.getElementById(id);
const status = $('status');
const iframe = $('frame');
const browser = $('browser');
const urlBar = $('b-url');
let ready = null;
let sjFrame;

function say(msg, cls = '') { status.textContent = msg; status.className = 'status ' + cls; }

async function init() {
  const sj = await getEngine();
  sjFrame = sj.createFrame(iframe);
  sjFrame.addEventListener('urlchange', (e) => {
    const u = e && e.url;
    if (u) urlBar.value = String(u);
  });
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
  const engines = (window.cstuff && window.cstuff.ENGINES) || {};
  const base = engines[window.cstuff?.get().engine] || 'https://duckduckgo.com/?q=';
  return base + encodeURIComponent(v);
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
  sjFrame.go(url);
}

$('go').addEventListener('submit', (e) => { e.preventDefault(); open($('q').value); });
document.querySelectorAll('.tile').forEach((t) => t.addEventListener('click', () => open(t.dataset.url)));
$('b-home').onclick = () => { browser.classList.remove('open'); iframe.src = 'about:blank'; };
$('b-back').onclick = () => { try { sjFrame.back(); } catch {} };
$('b-fwd').onclick = () => { try { sjFrame.forward(); } catch {} };
$('b-reload').onclick = () => { try { sjFrame.reload(); } catch {} };
$('b-full').onclick = () => { (iframe.requestFullscreen || iframe.webkitRequestFullscreen)?.call(iframe); };
urlBar.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(urlBar.value); });

// warm up in the background so the first click is fast
say('Starting up…');
start().then(() => say('Ready', 'ok')).catch((e) => { ready = null; say('Proxy failed to start: ' + e.message, 'err'); });
