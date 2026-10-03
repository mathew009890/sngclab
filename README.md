# College Lab Hub

Browse lab programs by semester → lab → exercise. Admins manage content through a protected dashboard.

## Stack and why
| Layer | Choice | Reason |
|---|---|---|
| Frontend | Plain HTML/CSS/JS (hash router) | A read-mostly site needs no build step. highlight.js from CDN for syntax colouring. |
| Backend | Node.js + Express | Small REST API; also serves the frontend, so everything is **same-origin** and no CORS is enabled. |
| Database | PostgreSQL | Relational data, FK constraints, full-text index, session store. |
| Auth | Server-side sessions (httpOnly cookie) + bcrypt | Revocable, nothing sensitive in JS. |

## Architecture
```
Browser → Express → helmet/session → requireAdmin → csrf → validation → SQL ($1 params) → Postgres
                                                                      └→ uploads/ (disk)
```

## Folder structure
```
backend/   server.js  schema.sql  create-admin.js  package.json  .env.example
frontend/  index.html style.css script.js (public)   admin.html admin.js (dashboard)
```

## Database
`semesters(1–6) → labs → programs → program_files`, plus `users` and `session`.
Unique `(lab_id, exercise_no)`, cascade deletes, GIN full-text index. New semesters/labs/programs are just rows.

## API
Public (GET): `/api/semesters`, `/api/labs?semester=`, `/api/labs/:id`, `/api/programs?q=&lab=&semester=&language=&sort=&page=`, `/api/programs/:id`
Auth: `GET /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/logout`
Admin (session + `x-csrf-token`): `POST|PUT|DELETE /api/labs[/:id]`, `POST|PUT|DELETE /api/programs[/:id]`, `POST /api/programs/:id/files`, `DELETE /api/files/:id`, `GET /api/stats`

## Local setup
```bash
cd backend && npm install
cp .env.example .env        # fill DATABASE_URL and SESSION_SECRET (node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")
npm run db:init
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-passphrase' npm run admin:create
npm run dev                 # http://localhost:3000  ·  /admin.html
```

## Security notes
- SQL injection: every query is parameterized; sort columns come from a whitelist.
- XSS: the UI builds DOM with `textContent` (never `innerHTML`); CSP via helmet.
- CSRF: `sameSite=strict` cookie plus per-session token header on all writes.
- Access control: `requireAdmin` runs on the server for every write; there is no public signup. IDs are validated as integers.
- Auth: bcrypt cost 12, login rate limit, equal-time failure path, session regenerated on login.
- Uploads: 5 MB cap, magic-byte check (PNG/JPEG/WebP/GIF only, no SVG), random filenames, `nosniff`.
- Secrets live in `.env` (git-ignored).

## Deployment (outline)
Host on Render/Railway/Fly: Node web service + managed Postgres. Set `NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET`. The platform provides HTTPS. Free hosts have ephemeral disks: attach a persistent volume or move uploads to S3/Cloudflare R2 (only the upload route and `/uploads` need to change).

## Future improvements
Automated tests, S3/R2 storage, drag-to-reorder exercises, markdown rendering, audit log, pagination UI for >50 results.
