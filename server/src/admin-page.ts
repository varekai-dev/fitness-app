/**
 * The admin page: sign-in with Google, the Groq key, the daily limit, model
 * prices and AI spending per user. Plain HTML and script, served by the Worker.
 */
export const adminPage = (clientId: string) => `<!doctype html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Fitness Admin</title>
<script src="https://accounts.google.com/gsi/client" async></script>
<style>
  :root { --bg:#f6f7f9; --card:#fff; --text:#16181d; --muted:#6b7280; --line:#e5e7eb; --accent:#16a34a; --danger:#dc2626; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0f1115; --card:#181b21; --text:#e8eaed; --muted:#9aa0a8; --line:#2a2e36; --accent:#22c55e; --danger:#f87171; }
  }
  * { box-sizing: border-box; }
  body { margin:0; font:15px/1.45 system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:var(--bg); color:var(--text); }
  main { max-width:1000px; margin:0 auto; padding:24px 16px 48px; }
  header { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:20px; }
  h1 { font-size:22px; margin:0; }
  h2 { font-size:16px; margin:0 0 12px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:16px; margin-bottom:16px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(280px, 1fr)); gap:16px; }
  .grid .card { margin-bottom:0; }
  .muted { color:var(--muted); font-size:13px; }
  .stats { display:flex; flex-wrap:wrap; gap:24px; }
  .stat b { display:block; font-size:22px; }
  input, select, button { font:inherit; color:inherit; }
  input, select { background:var(--bg); border:1px solid var(--line); border-radius:8px; padding:7px 10px; min-width:0; }
  button { background:var(--accent); color:#fff; border:0; border-radius:8px; padding:8px 14px; cursor:pointer; }
  button.ghost { background:transparent; color:var(--text); border:1px solid var(--line); }
  button.danger { background:transparent; color:var(--danger); border:1px solid var(--line); padding:4px 10px; }
  .row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .row input { flex:1; }
  .scroll { overflow-x:auto; }
  table { width:100%; border-collapse:collapse; font-size:14px; }
  th, td { text-align:left; padding:8px 6px; border-bottom:1px solid var(--line); white-space:nowrap; }
  th { color:var(--muted); font-weight:500; font-size:13px; }
  td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; }
  td input { width:90px; padding:4px 8px; }
  .msg { min-height:20px; font-size:13px; margin-top:8px; }
  .msg.err { color:var(--danger); }
  #login { text-align:center; padding:48px 16px; }
  #login .card { display:inline-block; padding:32px; }
  #gbtn { display:flex; justify-content:center; margin-top:16px; }
  [hidden] { display:none !important; }
</style>
</head>
<body>
<main>
  <section id="login" hidden>
    <div class="card">
      <h1>Fitness Admin</h1>
      <p class="muted">Увійди акаунтом Google, який є в ADMIN_EMAILS.</p>
      <div id="gbtn"></div>
      <div id="login-msg" class="msg err"></div>
    </div>
  </section>

  <section id="app" hidden>
    <header>
      <h1>Fitness Admin</h1>
      <div class="row">
        <span id="who" class="muted"></span>
        <button class="ghost" id="logout">Вийти</button>
      </div>
    </header>

    <div class="grid">
      <div class="card">
        <h2>Ключ Groq API</h2>
        <p class="muted">Поточний: <span id="key-now">—</span></p>
        <form id="key-form" class="row">
          <input id="key" type="password" placeholder="gsk_…" autocomplete="off">
          <button>Зберегти</button>
        </form>
        <div id="key-msg" class="msg"></div>
      </div>
      <div class="card">
        <h2>Ліміт на користувача</h2>
        <p class="muted">Запитів до AI на добу (UTC) для одного користувача.</p>
        <form id="limit-form" class="row">
          <input id="limit" type="number" min="1" step="1">
          <button>Зберегти</button>
        </form>
        <div id="limit-msg" class="msg"></div>
      </div>
    </div>
    <div style="height:16px"></div>

    <div class="card">
      <div class="row" style="justify-content:space-between">
        <h2 style="margin:0">Витрати</h2>
        <select id="days">
          <option value="1">24 години</option>
          <option value="7">7 днів</option>
          <option value="30" selected>30 днів</option>
          <option value="90">90 днів</option>
          <option value="0">Весь час</option>
        </select>
      </div>
      <div style="height:12px"></div>
      <div class="stats">
        <div class="stat"><span class="muted">Витрачено</span><b id="t-cost">—</b></div>
        <div class="stat"><span class="muted">Запитів</span><b id="t-req">—</b></div>
        <div class="stat"><span class="muted">Користувачів</span><b id="t-users">—</b></div>
        <div class="stat"><span class="muted">Токенів (вхід / вихід)</span><b id="t-tok">—</b></div>
      </div>
    </div>

    <div class="card">
      <h2>По користувачах</h2>
      <div class="scroll"><table id="users"></table></div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>По функціях</h2>
        <div class="scroll"><table id="features"></table></div>
      </div>
      <div class="card">
        <h2>По днях</h2>
        <div class="scroll"><table id="daily"></table></div>
      </div>
    </div>
    <div style="height:16px"></div>

    <div class="card">
      <h2>Моделі та ціни</h2>
      <p class="muted">USD за мільйон токенів (console.groq.com/docs/models). Застосунок може викликати лише моделі з цього списку. Витрати рахуються за поточними цінами.</p>
      <div class="scroll"><table id="models"></table></div>
      <div id="models-msg" class="msg"></div>
    </div>
  </section>
</main>
<script>
const CLIENT_ID = ${JSON.stringify(clientId)};
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const usd = (v) => '$' + (v || 0).toFixed(v >= 10 ? 2 : 4);
const int = (v) => (v || 0).toLocaleString('uk-UA');
const date = (ms) => new Date(ms).toLocaleString('uk-UA', { dateStyle: 'short', timeStyle: 'short' });

async function api(path, body, method) {
  const res = await fetch('/admin/api/' + path, {
    method: method || (body ? 'PUT' : 'GET'),
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { showLogin(); throw new Error('Потрібно увійти'); }
  if (!res.ok) throw new Error(data.error || 'Помилка ' + res.status);
  return data;
}

function say(id, text, error) {
  $(id).textContent = text;
  $(id).className = 'msg' + (error ? ' err' : '');
}

function showLogin(message) {
  $('app').hidden = true;
  $('login').hidden = false;
  if (message) $('login-msg').textContent = message;
  if (!CLIENT_ID) { $('login-msg').textContent = 'На сервері не задано GOOGLE_CLIENT_ID.'; return; }
  const render = () => {
    google.accounts.id.initialize({ client_id: CLIENT_ID, callback: onCredential });
    google.accounts.id.renderButton($('gbtn'), { theme: 'outline', size: 'large', text: 'signin_with' });
  };
  window.google?.accounts ? render() : window.addEventListener('load', render, { once: true });
}

async function onCredential({ credential }) {
  const res = await fetch('/admin/api/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential }),
  });
  if (res.ok) return load();
  $('login-msg').textContent = res.status === 403
    ? 'Цього акаунта немає в ADMIN_EMAILS.'
    : 'Не вдалося увійти.';
}

function table(el, head, rows) {
  $(el).innerHTML = '<tr>' + head.map(([t, num]) => '<th' + (num ? ' class="num"' : '') + '>' + t + '</th>').join('') + '</tr>'
    + (rows.length ? rows.join('') : '<tr><td colspan="' + head.length + '" class="muted">Немає даних</td></tr>');
}
const td = (v, num) => '<td' + (num ? ' class="num"' : '') + '>' + v + '</td>';

async function load() {
  const d = await api('overview?days=' + $('days').value);
  $('login').hidden = true;
  $('app').hidden = false;
  $('who').textContent = d.email;
  $('key-now').textContent = d.groqKey || 'не задано';
  $('limit').value = d.dailyLimit;

  const sum = (k) => d.users.reduce((a, u) => a + (u[k] || 0), 0);
  $('t-cost').textContent = usd(sum('cost'));
  $('t-req').textContent = int(sum('requests'));
  $('t-users').textContent = int(d.users.length);
  $('t-tok').textContent = int(sum('inputTokens')) + ' / ' + int(sum('outputTokens'));

  const stats = (r) => [td(int(r.requests), 1), td(int(r.inputTokens), 1), td(int(r.outputTokens), 1), td(usd(r.cost), 1)];
  const statHead = [['Запити', 1], ['Вхід', 1], ['Вихід', 1], ['USD', 1]];
  table('users', [['Користувач'], ...statHead, ['Останній запит']],
    d.users.map((u) => '<tr>' + [td(esc(u.email)), ...stats(u), td(date(u.lastAt))].join('') + '</tr>'));
  table('features', [['Функція'], ...statHead],
    d.features.map((f) => '<tr>' + [td(esc(f.feature)), ...stats(f)].join('') + '</tr>'));
  table('daily', [['День'], ...statHead],
    d.daily.map((r) => '<tr>' + [td(esc(r.day)), ...stats(r)].join('') + '</tr>'));

  table('models', [['Модель'], ['Вхід', 1], ['Вихід', 1], ['']],
    [...d.models.map((m) => '<tr data-model="' + esc(m.model) + '">' + [
      td(esc(m.model)),
      td('<input type="number" step="0.01" min="0" name="in" value="' + m.inputPerM + '">', 1),
      td('<input type="number" step="0.01" min="0" name="out" value="' + m.outputPerM + '">', 1),
      td('<button class="ghost" data-act="save">Зберегти</button> <button class="danger" data-act="remove">Прибрати</button>'),
    ].join('') + '</tr>'),
    '<tr data-new>' + [
      td('<input name="model" placeholder="нова модель" style="width:200px">'),
      td('<input type="number" step="0.01" min="0" name="in" placeholder="0.00">', 1),
      td('<input type="number" step="0.01" min="0" name="out" placeholder="0.00">', 1),
      td('<button class="ghost" data-act="save">Додати</button>'),
    ].join('') + '</tr>']);
}

$('models').addEventListener('click', async (e) => {
  const act = e.target.dataset?.act;
  if (!act) return;
  const row = e.target.closest('tr');
  const model = row.dataset.model || row.querySelector('[name=model]').value.trim();
  if (!model) return;
  if (act === 'remove' && !confirm('Застосунок більше не зможе викликати ' + model + '. Прибрати?')) return;
  try {
    await api('models', act === 'remove'
      ? { model, remove: true }
      : { model, inputPerM: Number(row.querySelector('[name=in]').value), outputPerM: Number(row.querySelector('[name=out]').value) });
    say('models-msg', 'Збережено');
    load();
  } catch (err) { say('models-msg', err.message, true); }
});

$('key-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const key = $('key').value.trim();
  if (!key) return;
  say('key-msg', 'Перевіряю…');
  try {
    const r = await api('groq-key', { key });
    $('key-now').textContent = r.groqKey;
    $('key').value = '';
    say('key-msg', 'Ключ працює і збережений');
  } catch (err) {
    say('key-msg', err.message === 'invalid_key' ? 'Groq відхилив цей ключ' : err.message, true);
  }
});

$('limit-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await api('daily-limit', { dailyLimit: Number($('limit').value) });
    say('limit-msg', 'Збережено');
  } catch (err) { say('limit-msg', err.message, true); }
});

$('days').addEventListener('change', () => load().catch(() => {}));
$('logout').addEventListener('click', async () => {
  await api('logout', {}, 'POST').catch(() => {});
  showLogin();
});

load().catch(() => {});
</script>
</body>
</html>`;
