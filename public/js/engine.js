/* Shared proxy engine: starts the service worker, the transport and Scramjet once per page. */
import { BareMuxConnection } from '/baremux/index.mjs';

const SJ_STORES = ['config', 'cookies', 'redirectTrackers', 'referrerPolicies', 'publicSuffixList'];
const BUSY = 'Storage is busy. Close other cstuff tabs and retry.';

// Scramjet's service worker opens its database the moment it starts, before the page has created the
// stores it needs. Creating them first (and repairing a half-made database) avoids that race.
function openSjDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('$scramjet', 1);
    req.onupgradeneeded = () => {
      for (const n of SJ_STORES) if (!req.result.objectStoreNames.contains(n)) req.result.createObjectStore(n);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error(BUSY));
  });
}
async function ensureSjDb() {
  let db = await openSjDb();
  if (SJ_STORES.every((n) => db.objectStoreNames.contains(n))) { db.close(); return; }
  db.close();
  await new Promise((res, rej) => {
    const d = indexedDB.deleteDatabase('$scramjet');
    d.onsuccess = res; d.onerror = () => rej(d.error); d.onblocked = () => rej(new Error(BUSY));
  });
  db = await openSjDb();
  db.close();
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.$scramjetLoadController) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Could not load the proxy engine.'));
    document.head.appendChild(s);
  });
}

async function init() {
  if (!('serviceWorker' in navigator)) throw new Error('This browser does not support service workers.');
  if (!window.isSecureContext) throw new Error('A secure (https) connection is required.');
  await loadScript('/scram/scramjet.all.js');
  await ensureSjDb();
  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  await navigator.serviceWorker.ready;

  const conn = new BareMuxConnection('/baremux/worker.js');
  const wisp = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/wisp/';
  await conn.setTransport('/epoxy/index.mjs', [{ wisp }]);

  const { ScramjetController } = $scramjetLoadController();
  const sj = new ScramjetController({
    prefix: '/scramjet/',
    files: {
      wasm: '/scram/scramjet.wasm.wasm',
      all: '/scram/scramjet.all.js',
      sync: '/scram/scramjet.sync.js',
    },
  });
  await sj.init();
  return sj;
}

let ready = null;
/** Resolves to the Scramjet controller. Safe to call many times; retries after a failure. */
export function getEngine() {
  if (!ready) ready = init().catch((e) => { ready = null; throw e; });
  return ready;
}
