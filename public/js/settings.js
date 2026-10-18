const $ = (id) => document.getElementById(id);
const S = window.cstuff;
let cur = S.get();

function bindToggle(id, key) {
  const el = $(id);
  el.checked = !!cur[key];
  el.addEventListener('change', () => { cur = S.set({ [key]: el.checked }); flash(); });
}
function flash(msg = 'Saved') {
  const t = $('saved'); t.textContent = msg; t.classList.add('show');
  clearTimeout(flash.t); flash.t = setTimeout(() => t.classList.remove('show'), 1200);
}

bindToggle('t-leaves', 'leaves');

const box = $('themes');
function renderThemes() {
  box.textContent = '';
  Object.entries(S.THEMES).forEach(([id, t]) => {
    const b = document.createElement('button');
    b.className = 'theme'; b.type = 'button';
    b.setAttribute('aria-pressed', String(S.get().theme === id));
    const sw = document.createElement('span'); sw.className = 'sw';
    [t.bg, t.card, t.accent].forEach((c) => { const i = document.createElement('i'); i.style.background = c; sw.appendChild(i); });
    const name = document.createElement('span'); name.textContent = t.name;
    b.append(sw, name);
    b.addEventListener('click', () => { S.applyTheme(id); renderThemes(); flash(); });
    box.appendChild(b);
  });
}
renderThemes();
bindToggle('t-auto', 'autoBlank');

$('engine').value = cur.engine;
$('engine').addEventListener('change', (e) => { cur = S.set({ engine: e.target.value }); flash(); });

$('redirect').value = cur.redirect;
$('redirect').addEventListener('change', (e) => {
  let v = e.target.value.trim();
  if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
  e.target.value = v; cur = S.set({ redirect: v }); flash();
});

$('blank').addEventListener('click', () => {
  const msg = $('blank-msg');
  if (S.launch()) return;
  msg.textContent = 'Your browser blocked the pop-up. Allow pop-ups for this site and try again.';
  msg.className = 'status err';
});
$('blank-only').addEventListener('click', () => {
  const msg = $('blank-msg');
  if (S.openBlank()) { msg.textContent = 'Opened in a new about:blank tab.'; msg.className = 'status ok'; return; }
  msg.textContent = 'Your browser blocked the pop-up. Allow pop-ups for this site and try again.';
  msg.className = 'status err';
});
$('reset').addEventListener('click', () => {
  try { localStorage.removeItem('cstuff:settings'); } catch {}
  location.reload();
});

const cl = $('cloak');
Object.entries(S.CLOAKS).forEach(([id, c]) => { const o = document.createElement('option'); o.value = id; o.textContent = c.name; cl.appendChild(o); });
cl.value = cur.cloak;
cl.addEventListener('change', () => { cur = S.set({ cloak: cl.value }); flash('Saved. Reload to see it'); });
const pk = $('panic');
const showKey = () => { pk.value = cur.panicKey || 'off'; };
showKey();
pk.addEventListener('keydown', (e) => {
  e.preventDefault(); e.stopPropagation();
  if (e.key === 'Tab' || e.key === 'Shift') return;
  cur = S.set({ panicKey: e.key === 'Backspace' ? '' : e.key.length === 1 ? e.key : cur.panicKey });
  showKey(); flash();
});
