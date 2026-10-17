/* global UVServiceWorker */
importScripts('/uv/uv.bundle.js');
importScripts('/uvconfig.js');
importScripts(__uv$config.sw);

const uv = new UVServiceWorker();

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (uv.route(event)) event.respondWith(uv.fetch(event));
});
