/* Shared settings + about:blank launcher. Loaded on every page. */
(() => {
  const KEY = 'cstuff:settings';
  const DEFAULTS = {
    leaves: true,
    autoBlank: false,
    engine: 'duckduckgo',
    redirect: 'https://www.google.com',
  };
  const ENGINES = {
    duckduckgo: 'https://duckduckgo.com/?q=',
    google: 'https://www.google.com/search?q=',
    bing: 'https://www.bing.com/search?q=',
    brave: 'https://search.brave.com/search?q=',
  };

  function get() {
    try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY)) || {}) }; }
    catch { return { ...DEFAULTS }; }
  }
  function set(patch) {
    const next = { ...get(), ...patch };
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    return next;
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

  window.cstuff = { get, set, ENGINES, openBlank, launch, DEFAULTS };

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
