/* Runs in <head> so the theme is applied before the page paints. */
(() => {
  try {
    const s = JSON.parse(localStorage.getItem('cstuff:settings') || '{}');
    if (s.theme && s.theme !== 'black') document.documentElement.dataset.theme = s.theme;
  } catch {}
})();
