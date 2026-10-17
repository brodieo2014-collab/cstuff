const $ = (id) => document.getElementById(id);
const msgs = $('msgs');
let ws, myName = '', retry = 0;

$('name').value = localStorage.getItem('cstuff:name') || '';

function add(cls, nameText, text, ts) {
  const d = document.createElement('div');
  d.className = 'm ' + cls;
  if (nameText) {
    const n = document.createElement('span'); n.className = 'n'; n.textContent = nameText; d.appendChild(n);
  }
  d.appendChild(document.createTextNode(text));
  if (ts) {
    const t = document.createElement('span'); t.className = 'tm';
    t.textContent = new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    d.appendChild(t);
  }
  const stick = msgs.scrollTop + msgs.clientHeight >= msgs.scrollHeight - 40;
  msgs.appendChild(d);
  while (msgs.children.length > 200) msgs.removeChild(msgs.firstChild);
  if (stick) msgs.scrollTop = msgs.scrollHeight;
}

function connect(name) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/chat-ws');
  ws.onopen = () => { retry = 0; ws.send(JSON.stringify({ type: 'join', name })); };
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.type === 'hello') {
      myName = m.name; $('me').textContent = 'You are ' + myName;
      msgs.textContent = '';
      m.history.forEach((h) => add(h.name === myName ? 'me' : '', h.name, h.text, h.ts));
      add('sys', '', 'Connected. Say hi!');
    } else if (m.type === 'msg') {
      add(m.name === myName ? 'me' : '', m.name, m.text, m.ts);
    } else if (m.type === 'system') {
      add('sys', '', m.text);
      if (typeof m.online === 'number') $('online').textContent = m.online;
    }
  };
  ws.onclose = () => {
    add('sys', '', 'Disconnected. Reconnecting…');
    setTimeout(() => connect(myName || name), Math.min(10000, 1000 * ++retry));
  };
}

$('join-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('name').value.trim();
  localStorage.setItem('cstuff:name', name);
  $('join').hidden = true; $('chat').hidden = false;
  connect(name);
  $('text').focus();
});
$('send').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = $('text').value.trim();
  if (!t || !ws || ws.readyState !== 1) return;
  ws.send(JSON.stringify({ type: 'msg', text: t }));
  $('text').value = '';
});
