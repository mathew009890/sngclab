require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const PgStore = require('connect-pg-simple')(session);
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const { Pool } = require('pg');

const isProd = process.env.NODE_ENV === 'production';
if (!process.env.SESSION_SECRET || !process.env.DATABASE_URL) { console.error('Missing SESSION_SECRET or DATABASE_URL'); process.exit(1); }

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: isProd ? { rejectUnauthorized: false } : false });
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const app = express();
if (isProd) app.set('trust proxy', 1); // behind host's HTTPS proxy

// ---------- Security middleware ----------
app.use(helmet({ contentSecurityPolicy: { directives: {
  defaultSrc: ["'self'"], scriptSrc: ["'self'", 'https://cdnjs.cloudflare.com'],
  styleSrc: ["'self'", 'https://fonts.googleapis.com', 'https://cdnjs.cloudflare.com'],
  fontSrc: ['https://fonts.gstatic.com'], imgSrc: ["'self'", 'data:'], objectSrc: ["'none'"], frameAncestors: ["'none'"] } } }));
app.use(express.json({ limit: '200kb' }));
app.use(session({
  store: new PgStore({ pool }), name: 'labhub.sid', secret: process.env.SESSION_SECRET,
  resave: false, saveUninitialized: false, rolling: true,
  cookie: { httpOnly: true, sameSite: 'strict', secure: isProd, maxAge: 1000 * 60 * 60 * 8 }
}));

// CSRF: session-bound token that must be echoed in a header on every write.
// Custom headers can't be set cross-site without CORS approval (which we never grant).
const csrf = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const sent = Buffer.from(req.get('x-csrf-token') || ''), real = Buffer.from(req.session.csrf || '');
  if (!real.length || sent.length !== real.length || !crypto.timingSafeEqual(sent, real)) return fail(res, 403, 'Invalid CSRF token');
  next();
};
// Authorization: checked on the server for every protected route.
const requireAdmin = (req, res, next) =>
  req.session.user?.role === 'admin' ? next() : fail(res, req.session.user ? 403 : 401, 'Admin access required');

const fail = (res, status, message, details) => res.status(status).json({ error: message, details });
const wrap = fn => (req, res, next) => fn(req, res, next).catch(next);
const toId = v => (/^\d{1,9}$/.test(String(v)) ? Number(v) : null);

// ---------- Validation ----------
const PROGRAM_TEXT = ['aim', 'algorithm', 'source_code', 'output', 'result', 'notes'];
function validateProgram(b) {
  const errors = {}, out = {};
  out.lab_id = toId(b.lab_id); if (!out.lab_id) errors.lab_id = 'Choose a lab';
  out.exercise_no = toId(b.exercise_no); if (!out.exercise_no) errors.exercise_no = 'Enter a positive number';
  out.title = String(b.title || '').trim(); if (!out.title || out.title.length > 200) errors.title = 'Title is required (max 200 chars)';
  out.language = /^[a-z0-9+#-]{1,20}$/i.test(b.language || '') ? b.language.toLowerCase() : 'text';
  for (const k of PROGRAM_TEXT) { out[k] = String(b[k] ?? ''); if (out[k].length > 100000) errors[k] = 'Too long'; }
  return { out, errors };
}
function validateLab(b) {
  const errors = {}, out = {};
  out.semester_id = toId(b.semester_id); if (!out.semester_id || out.semester_id > 6) errors.semester_id = 'Choose semester 1–6';
  out.title = String(b.title || '').trim(); if (!out.title || out.title.length > 150) errors.title = 'Title is required (max 150 chars)';
  out.code = String(b.code || '').trim().slice(0, 30);
  out.description = String(b.description || '').slice(0, 2000);
  return { out, errors };
}

// ---------- Auth ----------
const api = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' } });
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 12);

api.get('/auth/me', (req, res) => {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(32).toString('hex');
  res.json({ user: req.session.user || null, csrfToken: req.session.csrf });
});
api.post('/auth/login', loginLimiter, csrf, wrap(async (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim(), password = String(req.body.password || '');
  const { rows } = await pool.query('SELECT id,email,role,password_hash FROM users WHERE email=$1', [email]);
  const ok = await bcrypt.compare(password, rows[0]?.password_hash || DUMMY_HASH); // same cost whether or not user exists
  if (!rows[0] || !ok) return fail(res, 401, 'Invalid email or password');
  const csrfToken = crypto.randomBytes(32).toString('hex');
  req.session.regenerate(err => { // new session id on login prevents session fixation
    if (err) return fail(res, 500, 'Login failed');
    req.session.user = { id: rows[0].id, email: rows[0].email, role: rows[0].role };
    req.session.csrf = csrfToken;
    res.json({ user: req.session.user, csrfToken });
  });
}));
api.post('/auth/logout', csrf, (req, res) => req.session.destroy(() => { res.clearCookie('labhub.sid'); res.status(204).end(); }));

// ---------- Public read-only routes ----------
api.get('/semesters', wrap(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT s.id, s.name, COUNT(DISTINCT l.id)::int AS lab_count, COUNT(p.id)::int AS program_count
    FROM semesters s LEFT JOIN labs l ON l.semester_id=s.id LEFT JOIN programs p ON p.lab_id=l.id
    GROUP BY s.id ORDER BY s.id`);
  res.json(rows);
}));
api.get('/labs', wrap(async (req, res) => {
  const sem = req.query.semester ? toId(req.query.semester) : null;
  const { rows } = await pool.query(`
    SELECT l.*, COUNT(p.id)::int AS program_count FROM labs l LEFT JOIN programs p ON p.lab_id=l.id
    WHERE ($1::int IS NULL OR l.semester_id=$1) GROUP BY l.id ORDER BY l.semester_id, l.title`, [sem]);
  res.json(rows);
}));
api.get('/labs/:id', wrap(async (req, res) => {
  const id = toId(req.params.id); if (!id) return fail(res, 400, 'Invalid id');
  const lab = (await pool.query('SELECT * FROM labs WHERE id=$1', [id])).rows[0];
  if (!lab) return fail(res, 404, 'Lab not found');
  res.json(lab);
}));
api.get('/programs', wrap(async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const lab = req.query.lab ? toId(req.query.lab) : null, sem = req.query.semester ? toId(req.query.semester) : null;
  const lang = String(req.query.language || '').slice(0, 20) || null;
  const sort = { newest: 'p.updated_at DESC', title: 'p.title ASC' }[req.query.sort] || 'l.semester_id, l.title, p.exercise_no';
  const page = Math.max(1, toId(req.query.page) || 1), limit = Math.min(50, toId(req.query.limit) || 20);
  const like = q ? `%${q.replace(/[\\%_]/g, '\\$&')}%` : null;
  const { rows } = await pool.query(`
    SELECT p.id, p.exercise_no, p.title, p.language, p.aim, p.updated_at, p.lab_id,
           l.title AS lab_title, l.semester_id, COUNT(*) OVER()::int AS total
    FROM programs p JOIN labs l ON l.id=p.lab_id
    WHERE ($1::int IS NULL OR p.lab_id=$1) AND ($2::int IS NULL OR l.semester_id=$2)
      AND ($3::text IS NULL OR p.language=$3)
      AND ($4::text IS NULL OR p.title ILIKE $4 OR p.aim ILIKE $4 OR p.source_code ILIKE $4)
    ORDER BY ${sort} LIMIT $5 OFFSET $6`, [lab, sem, lang, like, limit, (page - 1) * limit]);
  res.json({ items: rows, total: rows[0]?.total || 0, page, limit });
}));
api.get('/programs/:id', wrap(async (req, res) => {
  const id = toId(req.params.id); if (!id) return fail(res, 400, 'Invalid id');
  const p = (await pool.query(`SELECT p.*, l.title AS lab_title, l.semester_id FROM programs p JOIN labs l ON l.id=p.lab_id WHERE p.id=$1`, [id])).rows[0];
  if (!p) return fail(res, 404, 'Program not found');
  delete p.search;
  const files = (await pool.query('SELECT id, filename, original_name FROM program_files WHERE program_id=$1 ORDER BY id', [id])).rows;
  const nav = async (op, ord) => (await pool.query(
    `SELECT id, title, exercise_no FROM programs WHERE lab_id=$1 AND exercise_no ${op} $2 ORDER BY exercise_no ${ord} LIMIT 1`, [p.lab_id, p.exercise_no])).rows[0] || null;
  res.json({ ...p, files, prev: await nav('<', 'DESC'), next: await nav('>', 'ASC') });
}));

// ---------- Admin write routes (auth → CSRF → validation → SQL) ----------
const admin = express.Router();
admin.use(requireAdmin, csrf);

admin.post('/labs', wrap(async (req, res) => {
  const { out, errors } = validateLab(req.body); if (Object.keys(errors).length) return fail(res, 422, 'Validation failed', errors);
  const r = await pool.query('INSERT INTO labs(semester_id,code,title,description) VALUES($1,$2,$3,$4) RETURNING *', [out.semester_id, out.code, out.title, out.description]);
  res.status(201).json(r.rows[0]);
}));
admin.put('/labs/:id', wrap(async (req, res) => {
  const id = toId(req.params.id); if (!id) return fail(res, 400, 'Invalid id');
  const { out, errors } = validateLab(req.body); if (Object.keys(errors).length) return fail(res, 422, 'Validation failed', errors);
  const r = await pool.query('UPDATE labs SET semester_id=$1,code=$2,title=$3,description=$4,updated_at=now() WHERE id=$5 RETURNING *', [out.semester_id, out.code, out.title, out.description, id]);
  r.rows[0] ? res.json(r.rows[0]) : fail(res, 404, 'Lab not found');
}));
admin.delete('/labs/:id', wrap(async (req, res) => {
  const id = toId(req.params.id); if (!id) return fail(res, 400, 'Invalid id');
  const files = (await pool.query('SELECT f.filename FROM program_files f JOIN programs p ON p.id=f.program_id WHERE p.lab_id=$1', [id])).rows;
  const r = await pool.query('DELETE FROM labs WHERE id=$1', [id]);
  if (!r.rowCount) return fail(res, 404, 'Lab not found');
  files.forEach(f => fs.unlink(path.join(UPLOAD_DIR, f.filename), () => {}));
  res.status(204).end();
}));
admin.post('/programs', wrap(async (req, res) => {
  const { out, errors } = validateProgram(req.body); if (Object.keys(errors).length) return fail(res, 422, 'Validation failed', errors);
  const cols = ['lab_id', 'exercise_no', 'title', 'language', ...PROGRAM_TEXT];
  const r = await pool.query(`INSERT INTO programs(${cols}) VALUES(${cols.map((_, i) => '$' + (i + 1))}) RETURNING id`, cols.map(c => out[c]));
  res.status(201).json({ id: r.rows[0].id });
}));
admin.put('/programs/:id', wrap(async (req, res) => {
  const id = toId(req.params.id); if (!id) return fail(res, 400, 'Invalid id');
  const { out, errors } = validateProgram(req.body); if (Object.keys(errors).length) return fail(res, 422, 'Validation failed', errors);
  const cols = ['lab_id', 'exercise_no', 'title', 'language', ...PROGRAM_TEXT];
  const r = await pool.query(`UPDATE programs SET ${cols.map((c, i) => `${c}=$${i + 1}`)}, updated_at=now() WHERE id=$${cols.length + 1} RETURNING id`, [...cols.map(c => out[c]), id]);
  r.rows[0] ? res.json({ id }) : fail(res, 404, 'Program not found');
}));
admin.delete('/programs/:id', wrap(async (req, res) => {
  const id = toId(req.params.id); if (!id) return fail(res, 400, 'Invalid id');
  const files = (await pool.query('SELECT filename FROM program_files WHERE program_id=$1', [id])).rows;
  const r = await pool.query('DELETE FROM programs WHERE id=$1', [id]);
  if (!r.rowCount) return fail(res, 404, 'Program not found');
  files.forEach(f => fs.unlink(path.join(UPLOAD_DIR, f.filename), () => {}));
  res.status(204).end();
}));

// ---------- Uploads: size cap, count cap, magic-byte sniffing, random names ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 5 } });
const SIGNATURES = [
  { mime: 'image/png', ext: '.png', test: b => b.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) },
  { mime: 'image/jpeg', ext: '.jpg', test: b => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  { mime: 'image/webp', ext: '.webp', test: b => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { mime: 'image/gif', ext: '.gif', test: b => b.subarray(0, 3).toString() === 'GIF' }
]; // SVG deliberately excluded: it can carry scripts.
admin.post('/programs/:id/files', upload.array('files', 5), wrap(async (req, res) => {
  const id = toId(req.params.id); if (!id) return fail(res, 400, 'Invalid id');
  if (!(await pool.query('SELECT 1 FROM programs WHERE id=$1', [id])).rowCount) return fail(res, 404, 'Program not found');
  if (!req.files?.length) return fail(res, 400, 'No files received');
  const saved = [];
  for (const f of req.files) {
    const sig = SIGNATURES.find(s => s.test(f.buffer));
    if (!sig) return fail(res, 415, `${f.originalname}: only PNG, JPEG, WebP or GIF images are allowed`);
    const filename = crypto.randomBytes(16).toString('hex') + sig.ext; // never use the client's filename on disk
    await fs.promises.writeFile(path.join(UPLOAD_DIR, filename), f.buffer, { flag: 'wx' });
    const r = await pool.query('INSERT INTO program_files(program_id,filename,original_name,mime_type,size_bytes) VALUES($1,$2,$3,$4,$5) RETURNING id,filename,original_name',
      [id, filename, f.originalname.slice(0, 200), sig.mime, f.size]);
    saved.push(r.rows[0]);
  }
  res.status(201).json(saved);
}));
admin.delete('/files/:id', wrap(async (req, res) => {
  const id = toId(req.params.id); if (!id) return fail(res, 400, 'Invalid id');
  const r = await pool.query('DELETE FROM program_files WHERE id=$1 RETURNING filename', [id]);
  if (!r.rows[0]) return fail(res, 404, 'File not found');
  fs.unlink(path.join(UPLOAD_DIR, r.rows[0].filename), () => {});
  res.status(204).end();
}));
admin.get('/stats', wrap(async (req, res) => {
  const { rows } = await pool.query(`SELECT (SELECT COUNT(*) FROM labs)::int labs, (SELECT COUNT(*) FROM programs)::int programs, (SELECT COUNT(*) FROM program_files)::int files`);
  res.json(rows[0]);
}));

app.use('/api', api, admin);
app.use('/api', (req, res) => fail(res, 404, 'Not found'));
app.use('/uploads', express.static(UPLOAD_DIR, { index: false, dotfiles: 'deny', setHeaders: r => r.setHeader('X-Content-Type-Options', 'nosniff') }));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin.html')));
app.use(express.static(path.join(__dirname, '../frontend')));

// ---------- Centralized error handler ----------
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return fail(res, 413, err.code === 'LIMIT_FILE_SIZE' ? 'File exceeds 5 MB' : err.message);
  if (err.type === 'entity.parse.failed') return fail(res, 400, 'Malformed JSON');
  if (err.code === '23505') return fail(res, 409, 'That exercise number already exists in this lab');
  if (err.code === '23503') return fail(res, 422, 'Referenced lab or semester does not exist');
  console.error(err); // log details server-side only
  fail(res, 500, 'Something went wrong');
});

app.listen(process.env.PORT || 3000, () => console.log('Lab Hub running on port', process.env.PORT || 3000));
