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
