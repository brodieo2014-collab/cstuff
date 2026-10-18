/* Shared settings + about:blank launcher. Loaded on every page. */
(() => {
  const KEY = 'cstuff:settings';
  const DEFAULTS = {
    leaves: true,
    autoBlank: false,
    engine: 'duckduckgo',
    redirect: 'https://classroom.google.com',
    theme: 'black',
    gamesMode: 'default',
  };
  const AUTUMN = ['#c2410c', '#ea580c', '#f59e0b', '#b45309', '#9a3412', '#a16207', '#d97706', '#65a30d'];
  const THEMES = {
    black:    { name: 'Black',    bg: '#000000', card: '#111113', accent: '#ff8a3d', leaves: AUTUMN },
    midnight: { name: 'Midnight', bg: '#050816', card: '#111936', accent: '#5b8cff', leaves: ['#3b5bdb', '#4c6ef5', '#74c0fc', '#364fc7', '#5c7cfa', '#91a7ff'] },
    forest:   { name: 'Forest',   bg: '#030a05', card: '#0e1c12', accent: '#5fd068', leaves: ['#2f9e44', '#51cf66', '#8ce99a', '#2b8a3e', '#a9e34b', '#69db7c'] },
    crimson:  { name: 'Crimson',  bg: '#0a0304', card: '#1e0b0e', accent: '#ff4d5e', leaves: ['#c92a2a', '#e03131', '#ff6b6b', '#a61e4d', '#f06595', '#ff8787'] },
    purple:   { name: 'Purple',   bg: '#08040f', card: '#1a0f30', accent: '#b36bff', leaves: ['#7048e8', '#9775fa', '#b197fc', '#862e9c', '#be4bdb', '#d0bfff'] },
    light:    { name: 'Light',    bg: '#f6f3ee', card: '#ffffff', accent: '#d9631f', leaves: AUTUMN },
  };
  const ENGINES = {
    duckduckgo: 'https://duckduckgo.com/?q=',
    google: 'https://www.google.com/search?q=',
    bing: 'https://www.bing.com/search?q=',
    brave: 'https://search.brave.com/search?q=',
  };

  // Only the values the user changed are stored, so new defaults reach everyone.
  function stored() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }
  function get() {
    const next = { ...DEFAULTS, ...stored() };
    if (!THEMES[next.theme]) next.theme = 'black';
    return next;
  }
  function set(patch) {
    const raw = { ...stored(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(raw)); } catch {}
    return get();
  }
  // Older versions saved the old default address; drop it so the new default applies.
  (() => {
    const r = stored();
    if (!r.v2) {
      if (r.redirect === 'https://www.google.com') delete r.redirect;
      r.v2 = 1;
      try { localStorage.setItem(KEY, JSON.stringify(r)); } catch {}
    }
  })();

  function applyTheme(id) {
    if (!THEMES[id]) id = 'black';
    if (id === 'black') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = id;
    set({ theme: id });
    window.dispatchEvent(new CustomEvent('cstuff-theme', { detail: id }));
  }

  // Opens this site inside an about:blank tab. Must be called from a click/keypress.
  function openBlank() {
    const w = window.open('about:blank', '_blank');
    if (!w) return false;
    try {
      const d = w.document;
      d.title = 'cstuff';
      d.body.style.cssText = 'margin:0;background:#000;height:100vh;overflow:hidden';
      const f = d.createElement('iframe');
      f.src = location.origin + '/';
      f.style.cssText = 'border:0;width:100%;height:100%;background:#000';
      f.allow = 'fullscreen; autoplay; clipboard-read; clipboard-write';
      d.body.appendChild(f);
    } catch { try { w.close(); } catch {} return false; }
    return true;
  }

  // Open in about:blank, then send this tab somewhere else.
  function launch() {
    if (!openBlank()) return false;
    const s = get();
    if (s.redirect) location.replace(s.redirect);
    return true;
  }

  window.cstuff = { get, set, ENGINES, THEMES, applyTheme, openBlank, launch, DEFAULTS };

  // Auto-open: browsers only allow pop-ups after a click, so show a one-click prompt.
  const onSettings = location.pathname === '/settings.html';
  if (window.top === window && get().autoBlank && !onSettings) {
    const bar = document.createElement('div');
    bar.className = 'blank-bar';
    bar.textContent = 'Click anywhere to open in about:blank';
    const go = () => {
      if (launch()) return;
      bar.textContent = 'Pop-up blocked. Allow pop-ups for this site, then click again.';
      bar.classList.add('err');
      arm();
    };
    function arm() { addEventListener('click', go, { once: true, capture: true }); }
    const mount = () => { document.body.appendChild(bar); arm(); };
    if (document.body) mount(); else addEventListener('DOMContentLoaded', mount);
  }
})();
