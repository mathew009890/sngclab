'use strict';
<<<<<<< HEAD
// Nothing here protects data: the server re-checks session, role and CSRF token on every write.
=======

>>>>>>> b084a922687c226f1a3c9638c526432a7c6e656f
const app = document.getElementById('app');
let csrfToken = '', state = { tab: 'overview', labs: [], q: '', sem: '', lab: '' };
const LANGS = { java: 'Java', python: 'Python', c: 'C', cpp: 'C++', sql: 'SQL', javascript: 'JavaScript', html: 'HTML', text: 'No code (text only)' };
const SEMS = [1, 2, 3, 4, 5, 6];

function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v; else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const put = (el, ...nodes) => el.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
async function api(path, { method = 'GET', body, form } = {}) {
  const headers = { 'x-csrf-token': csrfToken };
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch('/api' + path, { method, headers, credentials: 'same-origin', body: form || (body && JSON.stringify(body)) });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.error || 'Request failed'); e.details = data.details; throw e; }
  return data;
}
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }
function confirmAction(msg, ok = 'Delete', danger = true) {
  const d = document.getElementById('confirm'), btn = d.querySelector('[value=ok]');
  document.getElementById('confirmMsg').textContent = msg; btn.textContent = ok; btn.className = 'btn ' + (danger ? 'danger' : 'primary'); d.returnValue = '';
  return new Promise(r => { d.onclose = () => r(d.returnValue === 'ok'); d.showModal(); });
}
const fmtDate = d => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const goTab = tab => { state.tab = tab; render(); };


function loginView() {
  const err = h('p', { class: 'err', role: 'alert' });
  const email = h('input', { type: 'email', id: 'em', required: true, autocomplete: 'username' });
  const pw = h('input', { type: 'password', id: 'pw', required: true, autocomplete: 'current-password' });
  app.replaceChildren(h('form', { class: 'section login-card', onsubmit: async e => {
    e.preventDefault(); err.textContent = '';
    try { const r = await api('/auth/login', { method: 'POST', body: { email: email.value, password: pw.value } }); csrfToken = r.csrfToken; start(); }
    catch (x) { err.textContent = x.message; } } },
    h('h1', {}, 'Admin login'), h('label', { for: 'em' }, 'Email'), email, h('label', { for: 'pw', class: 'mt' }, 'Password'), pw, err,
    h('button', { class: 'btn primary mt' }, 'Log in')));
}
<<<<<<< HEAD
async function start() { document.getElementById('side').hidden = false; state.labs = await api('/labs'); render(); }
=======


async function start() {
  document.getElementById('side').hidden = false;
  state.labs = await api('/labs');
  render();
}
>>>>>>> b084a922687c226f1a3c9638c526432a7c6e656f
function render() {
  document.querySelectorAll('#side [data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === state.tab));
  const holder = h('div'); app.replaceChildren(holder);
  ({ overview: overviewTab, programs: programsTab, labs: labsTab })[state.tab](holder).catch(e => put(holder, h('p', { class: 'err' }, e.message)));
}
document.querySelectorAll('#side [data-tab]').forEach(b => b.addEventListener('click', () => goTab(b.dataset.tab)));

// ---- dashboard: stats, website lock, quick start ----
async function overviewTab(el) {
  const [s, site] = await Promise.all([api('/stats'), api('/settings')]);
  const msg = h('textarea', { class: 'short', maxlength: 300, 'aria-label': 'Message shown to students', value: site.message });
  const save = async locked => {
    try { const r = await api('/settings', { method: 'PUT', body: { locked, message: msg.value } }); toast(r.locked ? 'Website is now LOCKED' : 'Website is now open'); render(); }
    catch (e) { toast(e.message); }
  };
  const toggle = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(site.locked), 'aria-label': 'Lock website', onclick: async () => {
    if (!site.locked && !await confirmAction('Lock the website? Students will only see the “temporarily closed” message until you unlock it.', 'Lock website', false)) return;
    save(!site.locked); } });
  const steps = [['Add your labs (Java, DBMS…)', s.labs > 0, 'labs'], ['Add programs to each lab', s.programs > 0, 'programs']];
  put(el, h('div', { class: 'page-head' }, h('h1', {}, 'Dashboard'), h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: () => goTab('labs') }, '+ Add lab'), h('button', { class: 'btn primary', onclick: () => programForm() }, '+ New program'))),
    h('div', { class: 'stats' }, [['labs', 'Labs'], ['programs', 'Programs'], ['files', 'Screenshots']].map(([k, l]) => h('div', {}, h('b', {}, s[k]), l))),
    h('section', { class: 'card lock' + (site.locked ? ' on' : '') },
      h('div', { class: 'lock-top' }, h('div', {}, h('h2', {}, 'Website lock'),
        h('p', { class: 'muted' }, 'Turn this on during exams. Students see a “temporarily closed” message. You can still use the site while logged in as admin.')), toggle),
      h('label', {}, 'Message shown to students'), msg,
      h('div', { class: 'row mt' }, h('span', { class: 'pill ' + (site.locked ? 'bad' : 'ok') }, site.locked ? 'LOCKED: students cannot view' : 'OPEN: students can view'),
        h('button', { class: 'btn sm', onclick: () => save(site.locked) }, 'Save message'))),
    h('section', { class: 'card' }, h('h2', {}, 'Quick start'), h('ol', { class: 'steps' }, steps.map(([t, ok, tab]) =>
      h('li', { class: ok ? 'done' : '' }, h('span', { class: 'tick' }, ok ? '✓' : ''), h('span', {}, t), h('a', { href: '#', onclick: e => { e.preventDefault(); goTab(tab); } }, ok ? 'Manage' : 'Start →'))))));
}

<<<<<<< HEAD
// ---- programs list ----
=======

>>>>>>> b084a922687c226f1a3c9638c526432a7c6e656f
async function programsTab(el) {
  const d = await api(`/programs?q=${encodeURIComponent(state.q)}&semester=${state.sem}&lab=${state.lab}&sort=newest&limit=50`);
  const q = h('input', { type: 'search', placeholder: 'Search title, aim or code…', value: state.q, 'aria-label': 'Search programs' });
  const sem = h('select', { 'aria-label': 'Semester' }, h('option', { value: '' }, 'All semesters'), SEMS.map(n => h('option', { value: n, selected: String(n) === state.sem }, `Semester ${n}`)));
  const lab = h('select', { 'aria-label': 'Lab' }, h('option', { value: '' }, 'All labs'),
    state.labs.filter(l => !state.sem || String(l.semester_id) === state.sem).map(l => h('option', { value: l.id, selected: String(l.id) === state.lab }, l.title)));
  const apply = () => { state.q = q.value.trim(); state.sem = sem.value; state.lab = lab.value; render(); };
  sem.addEventListener('change', () => { lab.value = ''; apply(); }); lab.addEventListener('change', apply);
  put(el, h('div', { class: 'page-head' }, h('h1', {}, 'Programs'), h('button', { class: 'btn primary', onclick: () => programForm() }, '+ New program')),
    h('form', { class: 'filters', onsubmit: e => { e.preventDefault(); apply(); } }, q, sem, lab, h('button', { class: 'btn' }, 'Search')),
    h('p', { class: 'muted' }, `${d.total} program${d.total === 1 ? '' : 's'}${d.total > d.items.length ? ` (showing the latest ${d.items.length}, use search to narrow down)` : ''}`),
    d.items.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Semester', 'Lab', 'No.', 'Title', 'Updated', ''].map(c => h('th', {}, c)))),
      h('tbody', {}, d.items.map(p => h('tr', {}, h('td', {}, h('span', { class: 'pill' }, `Sem ${p.semester_id}`)), h('td', {}, p.lab_title), h('td', {}, p.exercise_no),
        h('td', { class: 'strong' }, p.title), h('td', { class: 'muted' }, fmtDate(p.updated_at)), h('td', { class: 'row' },
          h('button', { class: 'btn sm', onclick: async () => programForm(await api(`/programs/${p.id}`)) }, 'Edit'),
          h('a', { class: 'btn sm', href: `/index.html#/lab/${p.lab_id}/${p.id}`, target: '_blank', rel: 'noopener' }, 'View'),
          h('button', { class: 'btn sm danger', onclick: async () => {
            if (!await confirmAction(`Delete “${p.title}” and its screenshots? This cannot be undone.`)) return;
            try { await api(`/programs/${p.id}`, { method: 'DELETE' }); toast('Program deleted'); render(); } catch (e) { toast(e.message); } } }, 'Delete')))))))
      : h('div', { class: 'state' }, h('p', {}, 'No programs found.'), h('button', { class: 'btn primary', onclick: () => programForm() }, '+ Add your first program')));
}

<<<<<<< HEAD
// ---- program form: grouped steps, language picker, screenshot thumbnails, sticky save bar ----
=======
>>>>>>> b084a922687c226f1a3c9638c526432a7c6e656f
function programForm(p = {}) {
  if (!state.labs.length) { toast('Create a lab first'); return goTab('labs'); }
  const f = {}, errs = {};
  const field = (name, label, el, hint, full = true) => { f[name] = el; errs[name] = h('span', { class: 'err' });
    return h('div', { class: full ? 'full' : '' }, h('label', {}, label), hint && h('p', { class: 'hint' }, hint), el, errs[name]); };
  const ta = (v, ph) => h('textarea', { value: v || '', placeholder: ph });
  const langs = !p.language || LANGS[p.language] ? LANGS : { ...LANGS, [p.language]: p.language };
  const preview = h('div'), fileInput = h('input', { type: 'file', multiple: true, accept: 'image/png,image/jpeg,image/webp,image/gif' }), thumbs = h('div', { class: 'thumbs' });
  const drawFiles = () => put(thumbs, (p.files || []).map(x => h('figure', {}, h('img', { src: `/uploads/${x.filename}`, alt: x.original_name }),
    h('button', { type: 'button', class: 'btn sm danger', onclick: async () => { if (!await confirmAction(`Remove ${x.original_name}?`, 'Remove')) return;
      await api(`/files/${x.id}`, { method: 'DELETE' }); p.files = p.files.filter(y => y.id !== x.id); drawFiles(); } }, 'Remove'))));
  const TEXT = ['aim', 'algorithm', 'source_code', 'output', 'result', 'notes'];
  const values = () => ({ lab_id: f.lab_id.value, exercise_no: f.exercise_no.value, title: f.title.value, language: f.language.value, ...Object.fromEntries(TEXT.map(k => [k, f[k].value])) });
  const form = h('form', { novalidate: true, onsubmit: async e => {
    e.preventDefault(); Object.values(errs).forEach(x => (x.textContent = ''));
    try {
      const saved = await api(p.id ? `/programs/${p.id}` : '/programs', { method: p.id ? 'PUT' : 'POST', body: values() });
      if (fileInput.files.length) { const fd = new FormData(); [...fileInput.files].forEach(x => fd.append('files', x)); await api(`/programs/${saved.id}/files`, { method: 'POST', form: fd }); }
      toast('Program saved'); goTab('programs');
    } catch (x) { Object.entries(x.details || {}).forEach(([k, m]) => errs[k] && (errs[k].textContent = m)); toast(x.message); } } },
    h('section', { class: 'card' }, h('h2', {}, '1. Basics'), h('div', { class: 'formgrid' },
      field('lab_id', 'Lab', h('select', {}, state.labs.map(l => h('option', { value: l.id, selected: l.id === p.lab_id }, `Sem ${l.semester_id} · ${l.title}`))), null, false),
      field('exercise_no', 'Program number', h('input', { type: 'number', min: 1, value: p.exercise_no || '', placeholder: '1' }), null, false),
      field('title', 'Title', h('input', { maxlength: 200, value: p.title || '', placeholder: 'e.g. Find the factorial of a number' })),
      field('language', 'Code language', h('select', {}, Object.entries(langs).map(([v, n]) => h('option', { value: v, selected: v === (p.language || 'java') }, n))), 'Choose “No code” for theory-only exercises.', false))),
    h('section', { class: 'card' }, h('h2', {}, '2. Content'), h('p', { class: 'muted' }, 'Everything except the title is optional. Empty sections are hidden from students.'), h('div', { class: 'formgrid' },
      field('aim', 'Aim', ta(p.aim, 'What is this program meant to do?')), field('algorithm', 'Algorithm', ta(p.algorithm, 'Step 1: Start\nStep 2: …')),
      field('source_code', 'Source code', ta(p.source_code, 'Paste the code here'), 'Students get a “Copy code” button for this only.'),
      field('output', 'Output', ta(p.output, 'Paste the program output')), field('result', 'Result', ta(p.result, 'The program was executed successfully.')), field('notes', 'Notes', ta(p.notes)))),
    h('section', { class: 'card' }, h('h2', {}, '3. Output screenshots'), thumbs, h('p', { class: 'hint' }, 'PNG, JPEG, WebP or GIF, up to 5 MB each. New files upload when you save.'), fileInput),
    h('div', { class: 'bar' }, h('button', { class: 'btn primary' }, p.id ? 'Save changes' : 'Save program'),
      h('button', { type: 'button', class: 'btn', onclick: () => { const v = values(); put(preview, h('section', { class: 'card' }, h('h2', {}, `Preview: ${v.exercise_no}. ${v.title}`),
        TEXT.filter(k => v[k]).map(k => h('div', {}, h('h3', {}, k.replace('_', ' ')), h('pre', { class: 'pv' }, v[k]))))); preview.scrollIntoView({ behavior: 'smooth' }); } }, 'Preview'),
      h('button', { type: 'button', class: 'btn', onclick: () => render() }, 'Cancel')));
  drawFiles();
  app.replaceChildren(h('h1', {}, p.id ? 'Edit program' : 'New program'), form, preview);
}


async function labsTab(el, editing = null) {
  state.labs = await api('/labs');
  const t = h('input', { placeholder: 'e.g. Java', maxlength: 150, value: editing?.title || '' }), c = h('input', { placeholder: 'e.g. CS301', maxlength: 30, value: editing?.code || '' });
  const d = h('input', { placeholder: 'One line about this lab', maxlength: 2000, value: editing?.description || '' });
  const s = h('select', {}, SEMS.map(n => h('option', { value: n, selected: n === editing?.semester_id }, `Semester ${n}`)));
  const lf = (label, input) => h('div', {}, h('label', {}, label), input);
  const form = h('form', { class: 'card', onsubmit: async e => { e.preventDefault();
    try { await api(editing ? `/labs/${editing.id}` : '/labs', { method: editing ? 'PUT' : 'POST', body: { title: t.value, code: c.value, description: d.value, semester_id: s.value } });
      toast(editing ? 'Lab updated' : 'Lab created'); labsTab(el); } catch (x) { toast(x.details?.title || x.message); } } },
    h('h2', {}, editing ? `Editing “${editing.title}”` : 'Add a lab'),
    h('div', { class: 'formgrid' }, lf('Semester', s), lf('Lab name', t), lf('Code (optional)', c), lf('Description (optional)', d)),
    h('div', { class: 'row mt' }, h('button', { class: 'btn primary' }, editing ? 'Save changes' : 'Add lab'), editing ? h('button', { type: 'button', class: 'btn', onclick: () => labsTab(el) }, 'Cancel') : null));
  put(el, h('h1', {}, 'Labs'), form,
    state.labs.length ? h('div', { class: 'tablewrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Semester', 'Name', 'Code', 'Programs', ''].map(x => h('th', {}, x)))),
      h('tbody', {}, state.labs.map(l => h('tr', {}, h('td', {}, h('span', { class: 'pill' }, `Sem ${l.semester_id}`)), h('td', { class: 'strong' }, l.title), h('td', { class: 'muted' }, l.code), h('td', {}, l.program_count),
        h('td', { class: 'row' }, h('button', { class: 'btn sm', onclick: () => { labsTab(el, l); window.scrollTo(0, 0); } }, 'Edit'),
          h('button', { class: 'btn sm danger', onclick: async () => {
            if (!await confirmAction(`Delete “${l.title}” and all ${l.program_count} programs in it?`)) return;
            try { await api(`/labs/${l.id}`, { method: 'DELETE' }); toast('Lab deleted'); labsTab(el); } catch (x) { toast(x.message); } } }, 'Delete')))))))
      : h('div', { class: 'state' }, 'No labs yet. Add your first one above.'));
  if (editing) t.focus();
}

document.getElementById('logoutBtn').addEventListener('click', async () => { await api('/auth/logout', { method: 'POST' }); location.reload(); });
(async () => {
  try { const me = await (await fetch('/api/auth/me', { credentials: 'same-origin' })).json(); csrfToken = me.csrfToken; me.user ? start() : loginView(); }
  catch { app.replaceChildren(h('div', { class: 'state' }, 'Cannot reach the server.')); }
})();
