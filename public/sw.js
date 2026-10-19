/* global $scramjetLoadWorker */
importScripts('/scram/scramjet.all.js');

const { ScramjetServiceWorker } = $scramjetLoadWorker();
const scramjet = new ScramjetServiceWorker();
const PREFIX = '/scramjet/';
let configApplied = false;

// The games page is cross-origin isolated, which requires every page and worker inside it to say so too.
function isolate(res, dest) {
  if (!['document', 'iframe', 'frame', 'worker', 'sharedworker'].includes(dest)) return res;
  if (!res || res.type === 'opaque' || res.type === 'opaqueredirect' || res.status === 0) return res;
  try {
    const h = new Headers(res.headers);
    h.set('Cross-Origin-Embedder-Policy', 'credentialless');
    h.set('Cross-Origin-Resource-Policy', 'cross-origin');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  } catch { return res; }
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const { pathname } = new URL(event.request.url);
  // Only proxied URLs go through Scramjet; everything else (site files, transport worker) is untouched.
  if (!pathname.startsWith(PREFIX)) return;
  event.respondWith((async () => {
    try {
      if (!configApplied) {
        // Scramjet 1.x can receive its config by message without applying it globally;
        // forcing a fresh read from storage applies it.
        scramjet.config = undefined;
        await scramjet.loadConfig();
        configApplied = !!scramjet.config;
      }
      if (scramjet.route(event)) return isolate(await scramjet.fetch(event), event.request.destination);
      return await fetch(event.request);
    } catch (err) {
      return new Response('cstuff proxy error: ' + (err && (err.stack || err.message) || err), { status: 502, headers: { 'content-type': 'text/plain' } });
    }
  })());
});
