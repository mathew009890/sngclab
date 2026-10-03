'use strict';
const app = document.getElementById('app');

// Build DOM with textContent only (never innerHTML) so stored content cannot inject HTML.
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
}
const show = (...nodes) => app.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
async function api(path) {
  const res = await fetch('/api' + path, { credentials: 'same-origin' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Request failed');
  return body;
}
function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 1800); }
const empty = msg => h('div', { class: 'state' }, msg);
const fmtDate = d => new Date(d).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const crumbs = (...parts) => h('nav', { class: 'crumbs', 'aria-label': 'Breadcrumb' }, parts.map((p, i) => [i ? h('span', { class: 'sep' }, '/') : null, p]));

const setActiveSem = () => {};
// Back link goes to the parent page (reliable even if the page was opened directly)
const back = (href, label) => h('a', { class: 'back', href }, `← ${label}`);

// copyable section: only drawn when it has content, so code/output/etc. are optional per program
function copyBtn(getText, label = 'Copy code', cls = '') {
  const b = h('button', { class: 'copy-btn ' + cls, type: 'button' }, label);
  b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(getText()); b.textContent = 'Copied!'; } catch { b.textContent = "Couldn't copy"; }
    setTimeout(() => (b.textContent = label), 1600);
  });
  return b;
}
function block(title, content, lang) {
  if (!content || !content.trim()) return null;
  const code = h('code', lang ? { class: `language-${lang}` } : {}, content);
  if (lang && window.hljs) hljs.highlightElement(code);
  return h('section', { class: 'blk' + (lang ? ' code' : '') }, h('div', { class: 'blk-head' }, h('h2', {}, title), lang ? copyBtn(() => content) : null), h('pre', {}, code));
}
function programBody(p) {
  const shots = p.files.length ? h('section', { class: 'blk' }, h('div', { class: 'blk-head' }, h('h2', {}, 'Output screenshots')),
    h('div', { class: 'shots' }, p.files.map(f => h('a', { href: `/uploads/${f.filename}`, target: '_blank', rel: 'noopener' },
      h('img', { src: `/uploads/${f.filename}`, alt: f.original_name, loading: 'lazy' }))))) : null;
  const parts = [block('Aim', p.aim), block('Algorithm', p.algorithm), block('Source code', p.source_code, p.language === 'text' ? 'plaintext' : p.language),
    block('Output', p.output), shots, block('Result', p.result), block('Notes', p.notes)].filter(Boolean);
  return parts.length ? parts : [h('p', { class: 'muted' }, 'Nothing has been added to this exercise yet.')];
}

// ---- views ----
async function homeView() {
  setActiveSem(null);
  const [sems, labs] = await Promise.all([api('/semesters'), api('/labs')]);
  show(h('section', { class: 'hero' }, h('h1', {}, 'Every lab program, one tap away.'),
      h('p', { class: 'lead' }, 'Aim, algorithm, code and output for each exercise, organised by semester and lab.')),
    h('div', { class: 'sems-grid' }, sems.map(s => {
      const mine = labs.filter(l => l.semester_id === s.id);
      return h('article', { class: 'sem' },
        h('a', { class: 'sem-head', href: `#/semester/${s.id}` }, h('span', { class: 'sem-no' }, s.id), h('span', {}, h('b', {}, s.name), h('small', {}, `${s.program_count} programs`))),
        mine.length ? h('ul', {}, mine.map(l => h('li', {}, h('a', { href: `#/lab/${l.id}` }, h('span', {}, l.title), h('span', { class: 'count' }, l.program_count)))))
          : h('p', { class: 'none' }, 'No labs yet'));
    })));
}

async function semesterView(id) {
  setActiveSem(id);
  const labs = await api(`/labs?semester=${id}`);
  show(back('#/', 'Home'), crumbs(h('a', { href: '#/' }, 'Home'), `Semester ${id}`), h('h1', {}, `Semester ${id}`),
    labs.length ? h('div', { class: 'labs-grid' }, labs.map(l => h('a', { class: 'lab', href: `#/lab/${l.id}` },
      l.code && h('span', { class: 'tag' }, l.code), h('h3', {}, l.title), h('p', {}, l.description || `${l.program_count} programs`))))
      : empty('No labs have been added to this semester yet.'));
}

// lab page: program list on the left, selected program on the right (a dropdown on phones)
async function labView(labId, progId) {
  const [lab, list] = await Promise.all([api(`/labs/${labId}`), api(`/programs?lab=${labId}&limit=50`)]);
  setActiveSem(lab.semester_id);
  const items = list.items, cur = progId ? Number(progId) : items[0]?.id;
  const p = cur ? await api(`/programs/${cur}`) : null;
  const go = id => `#/lab/${labId}/${id}`;
  document.title = `${p ? p.title + ' · ' : ''}${lab.title} · LabHub`;
  show(back(`#/semester/${lab.semester_id}`, `Semester ${lab.semester_id}`), crumbs(h('a', { href: '#/' }, 'Home'), h('a', { href: `#/semester/${lab.semester_id}` }, `Semester ${lab.semester_id}`), lab.title),
    h('h1', {}, lab.title), lab.description && h('p', { class: 'lead' }, lab.description),
    items.length ? h('div', { class: 'lab-layout' },
      h('nav', { class: 'plist', 'aria-label': 'Programs' }, h('h2', {}, `${items.length} programs`),
        items.map(i => h('a', { class: 'pitem', href: go(i.id), 'aria-current': i.id === p.id }, h('span', { class: 'pno' }, i.exercise_no), h('span', {}, i.title)))),
      h('article', { class: 'pane' },
        h('select', { class: 'pselect', 'aria-label': 'Choose program', onchange: e => (location.hash = go(e.target.value)) },
          items.map(i => h('option', { value: i.id, selected: i.id === p.id }, `${i.exercise_no}. ${i.title}`))),
        h('h1', {}, `${p.exercise_no}. ${p.title}`), h('p', { class: 'muted' }, `Updated ${fmtDate(p.updated_at)}`), p.source_code.trim() && copyBtn(() => p.source_code, 'Copy code only', 'big'),
        programBody(p),
        h('div', { class: 'pager' },
          p.prev ? h('a', { class: 'btn', href: go(p.prev.id) }, `← ${p.prev.title}`) : h('span'),
          p.next ? h('a', { class: 'btn', href: go(p.next.id) }, `${p.next.title} →`) : h('span'))))
      : empty('No programs in this lab yet.'));
}

async function searchView(q) {
  setActiveSem(null);
  const d = await api(`/programs?q=${encodeURIComponent(q)}&limit=50`);
  show(back('#/', 'Home'), h('h1', {}, 'Search'), h('p', { class: 'muted' }, `${d.total} results for “${q}”`),
    d.items.length ? h('div', { class: 'results' }, d.items.map(p => h('a', { class: 'result', href: `#/lab/${p.lab_id}/${p.id}` },
      h('span', { class: 'tag' }, `Sem ${p.semester_id} · ${p.lab_title}`), h('b', {}, `${p.exercise_no}. ${p.title}`), p.aim && h('span', { class: 'muted' }, p.aim.slice(0, 120)))))
      : empty('Nothing matched. Try a shorter or different keyword.'));
}

// ---- router ----
async function route() {
  const [pathPart, query = ''] = (location.hash.slice(1) || '/').split('?');
  const [, view, arg, arg2] = pathPart.split('/');
  document.title = 'LabHub'; show(h('div', { class: 'spinner', role: 'status', 'aria-label': 'Loading' }));
  try {
    if (!view) await homeView();
    else if (view === 'semester' && /^[1-6]$/.test(arg)) await semesterView(arg);
    else if (view === 'lab' && /^\d+$/.test(arg) && (!arg2 || /^\d+$/.test(arg2))) await labView(arg, arg2);
    else if (view === 'program' && /^\d+$/.test(arg)) { const p = await api(`/programs/${arg}`); location.replace(`#/lab/${p.lab_id}/${p.id}`); return; }
    else if (view === 'search') await searchView(new URLSearchParams(query).get('q') || '');
    else show(empty('That page does not exist.'));
  } catch (e) { show(h('div', { class: 'state' }, h('p', {}, e.message), h('button', { class: 'btn', onclick: route }, 'Try again'))); }
  window.scrollTo(0, 0);
}
document.getElementById('searchForm').addEventListener('submit', e => {
  e.preventDefault(); const q = document.getElementById('searchInput').value.trim();
  if (q) location.hash = `#/search?q=${encodeURIComponent(q)}`;
});
window.addEventListener('hashchange', route);
route();
