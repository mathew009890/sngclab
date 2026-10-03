'use strict';
// NOTE: nothing here protects data. The server re-checks session, role and CSRF token on every write.
const app = document.getElementById('app');
let csrfToken = '', state = { tab: 'programs', labs: [], q: '', sem: '', sort: 'updated' };

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v; else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
async function api(path, { method = 'GET', body, form } = {}) {
  const headers = { 'x-csrf-token': csrfToken };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch('/api' + path, { method, headers, credentials: 'same-origin', body: form || (body && JSON.stringify(body)) });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Request failed'); e.details = data.details; e.status = res.status; throw e; }
  return data;
}
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000); }
function confirmDelete(msg) {
  const d = document.getElementById('confirm'); document.getElementById('confirmMsg').textContent = msg; d.returnValue = '';
  return new Promise(r => { d.onclose = () => r(d.returnValue === 'ok'); d.showModal(); });
}
const fmtDate = d => new Date(d).toLocaleDateString();

// ---- login ----
function loginView() {
  const err = h('p', { class: 'err', role: 'alert' });
  const email = h('input', { type: 'email', id: 'em', required: true, autocomplete: 'username' });
  const pw = h('input', { type: 'password', id: 'pw', required: true, autocomplete: 'current-password' });
  app.replaceChildren(h('form', { class: 'section', style: 'max-width:380px;margin:3rem auto', onsubmit: async e => {
    e.preventDefault(); err.textContent = '';
    try { const r = await api('/auth/login', { method: 'POST', body: { email: email.value, password: pw.value } }); csrfToken = r.csrfToken; start(); }
    catch (x) { err.textContent = x.message; } } },
    h('h1', {}, 'Admin login'), h('label', { for: 'em' }, 'Email'), email, h('label', { for: 'pw', style: 'margin-top:.8rem' }, 'Password'), pw, err,
    h('button', { class: 'btn primary', style: 'margin-top:.6rem' }, 'Log in')));
}

// ---- shell ----
async function start() {
  document.getElementById('logoutBtn').hidden = false;
  state.labs = await api('/labs');
  render();
}
function render() {
  const tabs = ['overview', 'programs', 'labs'].map(t => h('button', { class: 'btn', 'aria-current': state.tab === t, onclick: () => { state.tab = t; render(); } }, t[0].toUpperCase() + t.slice(1)));
  const holder = h('div'); app.replaceChildren(h('div', { class: 'tabs' }, tabs), holder);
  ({ overview: overviewTab, programs: programsTab, labs: labsTab })[state.tab](holder).catch(e => holder.replaceChildren(h('p', { class: 'err' }, e.message)));
}

async function overviewTab(el) {
  const s = await api('/stats');
  el.replaceChildren(h('div', { class: 'stats' }, ['labs', 'programs', 'files'].map(k => h('div', {}, h('b', {}, s[k]), k))),
    h('p', { class: 'muted' }, 'Create labs first, then add programs to them.'),
    h('button', { class: 'btn primary', onclick: () => programForm() }, 'New program'));
}

// ---- programs list: server-side search/filter/sort/pagination keeps hundreds of rows fast ----
async function programsTab(el) {
  const sortMap = { updated: 'newest', title: 'title', order: '' };
  const data = await api(`/programs?q=${encodeURIComponent(state.q)}&semester=${state.sem}&sort=${sortMap[state.sort]}&limit=50`);
  const q = h('input', { type: 'search', placeholder: 'Search…', value: state.q, 'aria-label': 'Search programs' });
  q.addEventListener('keydown', e => { if (e.key === 'Enter') { state.q = q.value; render(); } });
  const sem = h('select', { 'aria-label': 'Semester', onchange: e => { state.sem = e.target.value; render(); } }, h('option', { value: '' }, 'All semesters'),
    [1, 2, 3, 4, 5, 6].map(n => h('option', { value: n, selected: String(n) === state.sem }, `Semester ${n}`)));
  const sort = h('select', { 'aria-label': 'Sort', onchange: e => { state.sort = e.target.value; render(); } },
    [['updated', 'Recently updated'], ['title', 'Title'], ['order', 'Semester / lab']].map(([v, t]) => h('option', { value: v, selected: v === state.sort }, t)));
  el.replaceChildren(
    h('div', { class: 'filters' }, q, sem, sort, h('button', { class: 'btn primary', onclick: () => programForm() }, 'New program')),
    data.items.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Sem', 'Lab', 'Ex', 'Title', 'Updated', ''].map(c => h('th', {}, c)))),
      h('tbody', {}, data.items.map(p => h('tr', {}, h('td', {}, p.semester_id), h('td', {}, p.lab_title), h('td', {}, p.exercise_no), h('td', {}, p.title), h('td', {}, fmtDate(p.updated_at)),
        h('td', { class: 'row' },
          h('button', { class: 'btn sm', onclick: async () => programForm(await api(`/programs/${p.id}`)) }, 'Edit'),
          h('button', { class: 'btn sm danger', onclick: async () => {
            if (!await confirmDelete(`Delete “${p.title}” and its uploads? This cannot be undone.`)) return;
            try { await api(`/programs/${p.id}`, { method: 'DELETE' }); toast('Deleted'); render(); } catch (e) { toast(e.message); } } }, 'Delete')))))))
      : h('div', { class: 'state' }, 'No programs found. Add your first one with “New program”.'));
}

// ---- program form with preview + uploads ----
function programForm(p = {}) {
  if (!state.labs.length) { toast('Create a lab first'); state.tab = 'labs'; return render(); }
  const f = {}, errs = {}, field = (name, label, el, full) => { f[name] = el; errs[name] = h('span', { class: 'err' }); return h('div', { class: full ? 'full' : '' }, h('label', {}, label), el, errs[name]); };
  const ta = (n, v) => h('textarea', { name: n, value: v || '' });
  const preview = h('div');
  const values = () => ({ lab_id: f.lab_id.value, exercise_no: f.exercise_no.value, title: f.title.value, language: f.language.value,
    ...Object.fromEntries(['aim', 'algorithm', 'source_code', 'output', 'result', 'notes'].map(k => [k, f[k].value])) });
  const files = h('div', { class: 'row' }), fileInput = h('input', { type: 'file', multiple: true, accept: 'image/png,image/jpeg,image/webp,image/gif' });
  const drawFiles = list => files.replaceChildren(...list.map(x => h('span', { class: 'tag' }, x.original_name, ' ',
    h('button', { type: 'button', class: 'btn sm danger', onclick: async () => { if (!await confirmDelete(`Remove ${x.original_name}?`)) return;
      await api(`/files/${x.id}`, { method: 'DELETE' }); p.files = p.files.filter(y => y.id !== x.id); drawFiles(p.files); } }, 'Remove'))));
  const form = h('form', { class: 'formgrid', novalidate: true, onsubmit: async e => {
    e.preventDefault(); Object.values(errs).forEach(x => x.textContent = '');
    try {
      const saved = await api(p.id ? `/programs/${p.id}` : '/programs', { method: p.id ? 'PUT' : 'POST', body: values() });
      if (fileInput.files.length) { const fd = new FormData(); [...fileInput.files].forEach(x => fd.append('files', x)); await api(`/programs/${saved.id}/files`, { method: 'POST', form: fd }); }
      toast('Saved'); render();
    } catch (x) { Object.entries(x.details || {}).forEach(([k, m]) => errs[k] && (errs[k].textContent = m)); toast(x.message); } } },
    field('lab_id', 'Lab', h('select', {}, state.labs.map(l => h('option', { value: l.id, selected: l.id === p.lab_id }, `Sem ${l.semester_id} · ${l.title}`)))),
    field('exercise_no', 'Exercise number', h('input', { type: 'number', min: 1, value: p.exercise_no || '' })),
    field('title', 'Title', h('input', { maxlength: 200, value: p.title || '' }), true),
    field('language', 'Language (for highlighting)', h('input', { maxlength: 20, value: p.language || 'python' })),
    field('aim', 'Aim', ta('aim', p.aim), true), field('algorithm', 'Algorithm (optional)', ta('algorithm', p.algorithm), true),
    field('source_code', 'Source code (optional, leave empty if none)', ta('source_code', p.source_code), true), field('output', 'Output (optional)', ta('output', p.output), true),
    field('result', 'Result', ta('result', p.result), true), field('notes', 'Notes', ta('notes', p.notes), true),
    h('div', { class: 'full' }, h('label', {}, 'Output screenshots (PNG, JPEG, WebP, GIF · max 5 MB each)'), fileInput, files),
    h('div', { class: 'full row' }, h('button', { class: 'btn primary' }, 'Save program'),
      h('button', { type: 'button', class: 'btn', onclick: () => { const v = values(); preview.replaceChildren(h('div', { class: 'section' }, h('h1', {}, `Ex ${v.exercise_no}: ${v.title}`),
        ...['aim', 'algorithm', 'source_code', 'output', 'result', 'notes'].filter(k => v[k]).map(k => h('div', {}, h('h2', {}, k.replace('_', ' ')), h('pre', { style: 'white-space:pre-wrap;font-family:var(--mono)' }, v[k]))))); } }, 'Preview'),
      h('button', { type: 'button', class: 'btn', onclick: render }, 'Cancel')));
  Object.assign(f, Object.fromEntries([...form.elements].filter(x => x.name).map(x => [x.name, x])));
  const [labSel, exNo, title, lang] = form.querySelectorAll('select, input:not([type=file])'); Object.assign(f, { lab_id: labSel, exercise_no: exNo, title, language: lang });
  drawFiles(p.files = p.files || []);
  app.replaceChildren(h('h1', {}, p.id ? 'Edit program' : 'New program'), form, preview);
}

// ---- labs ----
async function labsTab(el) {
  state.labs = await api('/labs');
  const t = h('input', { placeholder: 'Lab title', maxlength: 150, 'aria-label': 'Lab title' }), c = h('input', { placeholder: 'Code (e.g. CS3L1)', maxlength: 30, 'aria-label': 'Lab code' });
  const s = h('select', { 'aria-label': 'Semester' }, [1, 2, 3, 4, 5, 6].map(n => h('option', { value: n }, `Semester ${n}`)));
  const add = h('form', { class: 'filters', onsubmit: async e => { e.preventDefault();
    try { await api('/labs', { method: 'POST', body: { title: t.value, code: c.value, semester_id: s.value } }); toast('Lab created'); render(); } catch (x) { toast(x.details?.title || x.message); } } },
    s, c, t, h('button', { class: 'btn primary' }, 'Add lab'));
  el.replaceChildren(add, state.labs.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Sem', 'Code', 'Title', 'Programs', ''].map(x => h('th', {}, x)))),
    h('tbody', {}, state.labs.map(l => h('tr', {}, h('td', {}, l.semester_id), h('td', {}, l.code), h('td', {}, l.title), h('td', {}, l.program_count), h('td', { class: 'row' },
      h('button', { class: 'btn sm', onclick: async () => { const nt = prompt('Lab title', l.title); if (!nt) return;
        try { await api(`/labs/${l.id}`, { method: 'PUT', body: { ...l, title: nt } }); render(); } catch (x) { toast(x.message); } } }, 'Rename'),
      h('button', { class: 'btn sm danger', onclick: async () => {
        if (!await confirmDelete(`Delete “${l.title}” and all ${l.program_count} programs in it?`)) return;
        try { await api(`/labs/${l.id}`, { method: 'DELETE' }); toast('Lab deleted'); render(); } catch (x) { toast(x.message); } } }, 'Delete')))))))
    : h('div', { class: 'state' }, 'No labs yet. Add one above.'));
}

document.getElementById('logoutBtn').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }); location.reload(); });
(async () => {
  try { const me = await (await fetch('/api/auth/me', { credentials: 'same-origin' })).json(); csrfToken = me.csrfToken; me.user ? start() : loginView(); }
  catch { app.replaceChildren(h('div', { class: 'state' }, 'Cannot reach the server.')); }
})();
