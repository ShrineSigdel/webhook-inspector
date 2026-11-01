# Webhook Inspector: 6-Day Plan

Each "day" is one phase. The owner reviews, tests, commits and pushes after each phase before the next one starts, so a day may take longer than a calendar day. Never start a phase until the owner names it.

Items marked **[agent]** are for the coding agent. Items marked **[owner]** are done by the owner by hand (servers, DNS, secrets, reviewing).

## Contents

- Reference: stack, architecture, layout, schema, API
- Day 0: owner setup
- Day 1: foundation and capture
- Day 2: accounts with bcrypt and JWT
- Day 3: BullMQ queue, worker and live stream
- Day 4: frontend
- Day 5: Docker, Nginx and first deploy
- Day 6: HTTPS, CI/CD, backups and polish
- Definition of done and cut list

---

# Reference

## Architecture

1. A user logs in at `/api/auth/login` and gets a JWT access token plus a refresh token in an httpOnly cookie. Guests skip this.
2. The browser calls `POST /api/endpoints` and receives an ID such as `k3j9xq2abc`.
3. An external service sends any request to `https://yourdomain/hook/k3j9xq2abc`.
4. The `api` process checks the endpoint exists (cached in Redis), adds a job to the BullMQ `capture` queue, and replies 200 immediately.
5. The `worker` process takes the job, saves the request in PostgreSQL, trims old history, and publishes it on Redis channel `endpoint:<id>`.
6. Every `api` process subscribed to that channel pushes the event to its open SSE connections.
7. Nginx sits in front of everything. A scheduled BullMQ job deletes expired data.

## Repository layout

```
webhook-inspector/
├── AGENTS.md
├── PLAN.md
├── backend/
│   ├── src/
│   │   ├── server.ts            (API process)
│   │   ├── worker.ts            (worker process)
│   │   ├── config.ts, db.ts, redis.ts, queues.ts
│   │   ├── routes/              (auth.ts, endpoints.ts, hooks.ts, stream.ts)
│   │   ├── middleware/          (auth.ts, rateLimit.ts, errorHandler.ts)
│   │   └── jobs/                (saveRequest.ts, cleanup.ts)
│   ├── migrations/001_init.sql
│   ├── Dockerfile
│   └── package.json, tsconfig.json
├── frontend/                    (Vite React app)
├── nginx/                       (Dockerfile, default.conf)
├── scripts/backup.sh
├── docs/                        (DEPLOY.md, HTTPS.md)
├── docker-compose.dev.yml       (Postgres + Redis for development)
├── docker-compose.yml           (full stack)
├── docker-compose.prod.yml      (images from GHCR)
├── .env.example
└── .github/workflows/deploy.yml
```

## Data model

One migration creates everything (`backend/migrations/001_init.sql`):

```sql
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE endpoints (
  id         TEXT PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE requests (
  id           BIGSERIAL PRIMARY KEY,
  endpoint_id  TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  method       TEXT NOT NULL,
  query        JSONB NOT NULL DEFAULT '{}',
  headers      JSONB NOT NULL,
  body         TEXT,
  content_type TEXT,
  ip           TEXT,
  size_bytes   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_requests_endpoint ON requests (endpoint_id, id DESC);
CREATE INDEX idx_endpoints_user ON endpoints (user_id);
```

`user_id` is empty for guest endpoints.

## API

| Method | Route | Access | Purpose |
|---|---|---|---|
| POST | `/api/auth/register` | Public | Create an account |
| POST | `/api/auth/login` | Public | Returns an access token and sets the refresh cookie |
| POST | `/api/auth/refresh` | Cookie | Rotates the refresh token, returns a new access token |
| POST | `/api/auth/logout` | Cookie | Revokes the refresh token |
| POST | `/api/endpoints` | Optional | Create an endpoint (24 hours for guests, 30 days for users) |
| GET | `/api/me/endpoints` | User | List your endpoints |
| GET | `/api/endpoints/:id` | Owner or link | Endpoint info, including `owned: boolean` |
| GET | `/api/endpoints/:id/requests?limit=50&before=<id>` | Owner or link | Paginated history |
| DELETE | `/api/endpoints/:id/requests` | Owner or link | Clear history |
| POST | `/api/endpoints/:id/stream-ticket` | Owner | 60-second ticket for the SSE stream |
| GET | `/api/endpoints/:id/stream` | Owner or link | SSE live stream |
| ANY | `/hook/:id` | Public | Capture any request |
| GET | `/api/health` | Public | Health check |

**Access rule:** guest endpoints (no `user_id`) are open to anyone with the link, like webhook.site. Owned endpoints are visible only to their owner, and anyone else gets a 404.

**Endpoint ID format:** 10 characters from `abcdefghijkmnpqrstuvwxyz23456789` (regex `^[a-z2-9]{10}$`).

---

# Day 0: Owner setup [owner]

The owner does this by hand before Day 1 so the agent starts from a working skeleton.

1. Create the GitHub repo and run `git init`. Add a `.gitignore` containing `node_modules`, `dist`, `.env`, `backups`, `certbot`.
2. Copy `AGENTS.md` and `PLAN.md` into the repo root.
3. Create folders: `backend/`, `nginx/`, `scripts/`, `docs/` (the `frontend/` folder is created on Day 4).
4. In `backend/`:
   - `npm init -y`
   - `npm i express pg ioredis nanoid@3 dotenv zod`
   - `npm i -D typescript tsx @types/node @types/express @types/pg eslint vitest`
   - `npx tsc --init`, then set `outDir: dist`, `rootDir: src`, `strict: true`
   - Add scripts: `dev` = `tsx watch src/server.ts`, `build` = `tsc`, `test` = `vitest run`, `lint` = `eslint src`
5. In the repo root, create `docker-compose.dev.yml`:
   ```yaml
   services:
     db:
       image: postgres:16-alpine
       environment:
         POSTGRES_USER: hooks
         POSTGRES_PASSWORD: dev
         POSTGRES_DB: hooks
       ports:
         - '5432:5432'
       volumes:
         - pgdata:/var/lib/postgresql/data
         - ./backend/migrations:/docker-entrypoint-initdb.d:ro
     redis:
       image: redis:7-alpine
       ports:
         - '6379:6379'
   volumes:
     pgdata:
   ```
6. Create `backend/.env` and `.env.example`:
   ```
   DATABASE_URL=postgres://hooks:dev@localhost:5432/hooks
   REDIS_URL=redis://localhost:6379
   JWT_SECRET=<output of: openssl rand -hex 32>
   PORT=3000
   PUBLIC_URL=http://localhost:5173
   COOKIE_SECURE=false
   ```
7. Check: `docker compose -f docker-compose.dev.yml up -d` works and `npx tsc --noEmit` runs in `backend/`.
8. Make the first commit and push. Open opencode in the repo root.

---

# Day 1: Foundation and capture

**Goal:** `curl` a hook URL and see the request saved in PostgreSQL.

## Build [agent]

1. `backend/migrations/001_init.sql` with the schema from the Reference section.
2. `config.ts`: validate env vars with zod (`DATABASE_URL`, `REDIS_URL`, `JWT_SECRET` min 32 chars, `PORT` default 3000, `PUBLIC_URL`, `COOKIE_SECURE` default false). Export a typed `config` object with `cookieSecure` as a boolean. Fail fast on bad config.
3. `db.ts` exports a `pg.Pool`. `redis.ts` exports an `ioredis` client.
4. `POST /api/endpoints` (guests only for now): generate a 10-character ID with `customAlphabet('abcdefghijkmnpqrstuvwxyz23456789', 10)` from `nanoid@3`, insert with a 24-hour expiry, respond 201 with `{ id, url, expiresAt }` where `url` is `${PUBLIC_URL}/hook/${id}`.
5. `ANY /hook/:id` capture route:
   - Uses `express.raw({ type: () => true, limit: '1mb' })` and is mounted before `express.json()`.
   - Rejects IDs that don't match `^[a-z2-9]{10}$` with 404.
   - 404 if the endpoint doesn't exist or has expired.
   - Converts the body to a string (empty string when there is no body).
   - Inserts method, query, headers, body, content type, IP and size into `requests`. This is a direct database write. The queue arrives on Day 3.
   - Responds 200 with `{ "ok": true }`.
6. `server.ts`: `app.set('trust proxy', 1)`, `GET /api/health`, `express.json()` applied only to `/api` routes, listen on `config.port`.

## Do not build yet

Auth, history API, rate limiting, queue, SSE, frontend, application Dockerfiles.

## Acceptance checks

- [ ] `npm run build` and `npm run lint` pass
- [ ] `curl -X POST localhost:3000/api/endpoints` returns an ID and URL
- [ ] GET, POST, PUT and DELETE to the hook URL are all saved (JSON body, form body, plain text, empty body)
- [ ] `SELECT * FROM requests;` shows correct method, query, headers, body and size
- [ ] Unknown or malformed ID returns 404
- [ ] A body over 1 MB returns 413
- [ ] The app fails to start with a clear message if `JWT_SECRET` is missing

## Review guide [owner]

Read and understand: why the raw parser is mounted before `express.json()`, why `trust proxy` matters, what JSONB gives you for headers, and how the 404 and 413 cases happen. Try sending binary data and a very long header with `curl` and see what is stored.

Suggested commit: `feat: backend foundation and catch-all capture`

---

# Day 2: Accounts with bcrypt and JWT

**Goal:** users can register, log in and own endpoints, with a safe history API.

## Build [agent]

1. Install `bcrypt jsonwebtoken cookie-parser express-rate-limit` and the matching `@types` packages. Add `supertest` and its types as dev dependencies.
2. Input validation with zod: email (valid, max 254 chars) and password (10 to 72 characters).
3. `POST /api/auth/register`: bcrypt cost 12, store only the hash, lowercase the email, respond 409 on duplicate email (Postgres error code `23505`).
4. `POST /api/auth/login`: same generic 401 message for wrong email and wrong password. When the email is not found, still run `bcrypt.compare` against a dummy hash so timing looks alike.
5. Token issuing:
   - Access token: `jwt.sign({ sub: userId }, secret, { algorithm: 'HS256', expiresIn: '15m' })`, returned in JSON.
   - Refresh token: 32 random bytes in hex, only its SHA-256 hash stored in `refresh_tokens` (7 days), sent as a cookie with `httpOnly: true`, `sameSite: 'lax'`, `path: '/api/auth'`, `secure: config.cookieSecure`.
6. `POST /api/auth/refresh`: hash the cookie value, find a row that is not revoked and not expired, revoke it, issue a new pair. If a revoked token is presented, revoke all of that user's tokens and return 401.
7. `POST /api/auth/logout`: revoke the current token and clear the cookie.
8. Middleware: `requireAuth` and `optionalAuth`. Always `jwt.verify(..., { algorithms: ['HS256'] })`. Add `userId` to Express's `Request` type with a declaration file.
9. `POST /api/endpoints` now uses `optionalAuth`: logged-in users get `user_id` set and a 30-day expiry, guests get 24 hours.
10. A `loadEndpoint(id, userId?)` helper used by every endpoint route. It returns null (so the route sends 404) when the endpoint is missing, expired, or owned by someone else.
11. Routes: `GET /api/me/endpoints` (requireAuth), `GET /api/endpoints/:id` (includes `owned: boolean`), `GET /api/endpoints/:id/requests` (keyset pagination: `WHERE endpoint_id = $1 AND ($2::bigint IS NULL OR id < $2) ORDER BY id DESC LIMIT $3`, limit capped at 100), `DELETE /api/endpoints/:id/requests`.
12. Rate limits with `express-rate-limit`: login 5 per minute per IP and email, endpoint creation 10 per minute per IP, hook route 60 per minute per IP and endpoint.
13. Central error handler: zod errors become 400, body-too-large becomes 413, everything else is a generic 500 with `{ "error": "internal error" }`.
14. Tests (vitest + supertest, run against the dev Postgres and Redis): register, duplicate email, wrong password, protected route without a token, expired token, refresh rotation, refresh token reuse, and another user's endpoint returning 404.

## Do not build yet

Queue, worker, SSE, frontend, Docker for the app.

## Acceptance checks

- [ ] Register, login, call a protected route, refresh, logout all work with `curl` (use `-c` and `-b` for cookies)
- [ ] After logout, the old refresh token fails
- [ ] Reusing a rotated refresh token revokes the user's other tokens
- [ ] No plaintext password or raw refresh token exists in the database (check with `SELECT`)
- [ ] Guest endpoints still work and last 24 hours; user endpoints last 30 days
- [ ] A different user, and an anonymous caller, get 404 for an owned endpoint
- [ ] Wrong algorithm or tampered tokens are rejected
- [ ] Rate limits return 429
- [ ] `npm test`, `npm run build` and `npm run lint` pass

## Review guide [owner]

Read and understand: what bcrypt cost means and why 72 bytes is the limit, why only a hash of the refresh token is stored, what rotation and reuse detection protect against, why the algorithm is pinned in `jwt.verify`, and why strangers get 404 instead of 403. Decode an access token at jwt.io and see what is inside it.

Suggested commit: `feat: accounts with bcrypt, JWT and refresh token rotation`

---

# Day 3: BullMQ queue, worker and live stream

**Goal:** capture answers fast and never waits for the database. A worker saves requests and publishes live events, and the SSE stream works for guests and owners.

## Build [agent]

1. Install `bullmq`. `queues.ts` creates an ioredis connection with `maxRetriesPerRequest: null` and exports a `capture` queue and a `maintenance` queue.
2. Change the hook route:
   - Cache "endpoint is valid" in Redis as `endpoint:valid:<id>` for 60 seconds, falling back to the database.
   - Add a job named `save` to the `capture` queue with a versioned payload: `{ v: 1, endpointId, method, query, headers, body (truncated to 256 KB), contentType, ip, sizeBytes }`.
   - Job options: `attempts: 5`, `backoff: { type: 'exponential', delay: 1000 }`, `removeOnComplete: 1000`, `removeOnFail: 5000`.
   - Respond 200 immediately.
3. `worker.ts` (second entry point):
   - A `capture` Worker with concurrency 10 calls `saveRequest`, which inserts the row with `RETURNING *` and then trims history to the newest 500 per endpoint.
   - After saving, publish the row as JSON on Redis channel `endpoint:<id>` inside a try/catch. A publish failure is logged and ignored, so a retry never creates a duplicate row. Only the database insert may fail the job.
   - Log failed jobs.
4. A repeatable job on the `maintenance` queue, every 10 minutes, deletes expired endpoints and old or revoked refresh tokens. Check the docs for the installed BullMQ version, since the job scheduler API differs between releases.
5. `POST /api/endpoints/:id/stream-ticket` (requireAuth, owner only): return a JWT signed with `{ sub, eid }`, `audience: 'stream'`, `expiresIn: '60s'`.
6. `GET /api/endpoints/:id/stream`:
    - 404 if the endpoint is missing or expired.
    - If the endpoint is owned, require `?ticket=` to verify (HS256, audience `stream`, `eid` equals the endpoint, `sub` equals the owner), otherwise 404.
    - Headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`, then `flushHeaders()`.
    - Create a dedicated subscriber with `redis.duplicate()`, subscribe to `endpoint:<id>`, write each message as `data: <json>` followed by a blank line.
    - Send a `: ping` comment every 25 seconds. On client close, clear the timer and quit the subscriber.
7. Graceful shutdown in both processes on `SIGTERM` and `SIGINT`: stop accepting connections (`server.close()`), close workers (`worker.close()`), then close Redis and the Postgres pool.
8. Scripts: `dev:worker` (`tsx watch src/worker.ts`) and `start:worker` (`node dist/worker.js`).

## Do not build yet

Frontend, request forwarding, Docker for the app, a separate capture service.

## Acceptance checks

- [ ] With the worker running, requests sent to a hook appear in the database and in an open stream (`curl -N`) within a second
- [ ] Stop the worker, send 20 requests, restart it: all 20 are saved
- [ ] Stop Postgres, send requests, restart it: retries with backoff recover them (or they appear in the failed set after 5 attempts)
- [ ] The hook route still returns 200 quickly while the worker is stopped
- [ ] An owned endpoint's stream fails without a ticket and works with a fresh ticket; an expired ticket fails
- [ ] Closing a stream releases its Redis connection (check `CLIENT LIST` in `redis-cli`)
- [ ] An endpoint never holds more than 500 requests
- [ ] `Ctrl+C` stops both processes cleanly
- [ ] `npm test`, `npm run build` and `npm run lint` pass

## Review guide [owner]

Read and understand: why the queue makes capture faster and more resilient (and what is lost if Redis is down), what `attempts` and `backoff` do, why a worker needs `maxRetriesPerRequest: null`, why each SSE connection gets its own subscriber, and why a short-lived ticket is needed (`EventSource` cannot send an `Authorization` header). Experiment: kill the worker mid-run and inspect the queue in `redis-cli`.

Suggested commit: `feat: BullMQ capture pipeline, worker process and SSE stream`

---

# Day 4: Frontend dashboard and accounts

**Goal:** log in from the browser, create and manage endpoints, and watch requests arrive live.

## Build [agent]

1. Create `frontend/` with Vite (`react-ts` template), add Tailwind following its current Vite guide, and add `react-router-dom`.
2. Vite dev proxy: `/api` and `/hook` forward to `http://localhost:3000`.
3. Typed API client (one file):
   - Access token stored in a module variable (memory only).
   - `api<T>(path, init)` adds the `Authorization` header and `credentials: 'include'`.
   - On a 401, call `refresh()` once and retry once. `refresh()` must share a single in-flight promise so two parallel 401s do not both rotate the token.
4. Auth context: `user`, `login`, `register`, `logout`. On page load call `refresh()` to restore the session.
5. Pages: Home (create an endpoint; guests allowed), Login, Register (inline errors), a protected route component, a header with the user and logout.
6. My endpoints page: list owned endpoints with expiry, open, delete.
7. Endpoint page:
   - Header with the hook URL, a copy button and the expiry.
   - Left: request list (method badge, time, size). Right: tabs for Headers, Query, Body, Raw.
   - Empty state showing a ready-to-copy `curl` command.
   - Clear-history button.
8. Live stream hook:
   - For owned endpoints, `POST` for a ticket and connect with `?ticket=`; guest endpoints connect without it.
   - Tickets last 60 seconds, so on any error close the stream, wait about 2 seconds, request a new ticket and reconnect.
   - After a reconnect, refetch history, and dedupe by request `id`.
9. Body viewer: pretty-print JSON when the content type says JSON, otherwise show plain text in a `<pre>`. Render as text only. Never `dangerouslySetInnerHTML`.
10. Relative timestamps and a usable mobile layout.

## Do not build yet

Docker or Nginx for the frontend, deployment, any new backend features. If a backend change is truly needed, ask first.

## Acceptance checks

- [ ] Guest flow: create an endpoint, `curl` it, the request appears live without a refresh
- [ ] Register, log in, create an owned endpoint, and watch requests arrive live
- [ ] Reloading the page keeps you logged in; logging out ends the session
- [ ] Another account (or a logged-out browser) sees a not-found page for an owned endpoint
- [ ] The live stream recovers after the backend restarts and after the 60-second ticket expires
- [ ] DevTools: no token in `localStorage` or `sessionStorage`
- [ ] A request containing `<script>alert(1)</script>` is displayed as text and does not run
- [ ] `npm run build` and `npm run lint` pass in `frontend/`

## Review guide [owner]

Read and understand: how the refresh flow works end to end, why the shared refresh promise matters, why the token is kept in memory, how the EventSource reconnect and ticket logic works, and why React escapes content by default. Try logging in on two tabs and logging out on one.

Suggested commit: `feat: React dashboard with auth and live request stream`

---

# Day 5: Docker, Nginx and first deploy

**Goal:** the whole stack runs from `docker compose up` locally, then on a Linux VM over plain HTTP. HTTPS comes on Day 6.

## Build [agent]

1. `backend/Dockerfile`: multi-stage (`node:20-alpine`), build then production image with `npm ci --omit=dev`, `USER node`, `CMD ["node", "dist/server.js"]`. One image serves both `api` and `worker`. Add `.dockerignore` (`node_modules`, `dist`, `.env`, `.git`).
2. `nginx/Dockerfile` (build context is the repo root): build the frontend in a Node stage, then copy `dist` into `nginx:1.27-alpine` along with `nginx/default.conf`.
3. `nginx/default.conf`:
   - A regex location for the SSE route `~ ^/api/endpoints/[^/]+/stream$` with `proxy_http_version 1.1`, `proxy_set_header Connection ''`, `proxy_buffering off`, `proxy_cache off`, `proxy_read_timeout 3600s`.
   - `location /api/` and `location /hook/` proxying to `http://api:3000` with `Host`, `X-Real-IP`, `X-Forwarded-For`, `X-Forwarded-Proto`. `/hook/` sets `client_max_body_size 1m`.
   - `location /` serves the SPA with `try_files $uri /index.html`.
4. `docker-compose.yml` with services `api`, `worker` (same image, `command: ['node', 'dist/worker.js']`), `db` (postgres:16-alpine, named volume, migrations mounted into `docker-entrypoint-initdb.d`, a `pg_isready` healthcheck), `redis`, and `web` (builds `nginx/Dockerfile`, publishes only port 80). `api` and `worker` wait for a healthy `db`. All services use `restart: unless-stopped`. Postgres and Redis publish no ports.
5. Update `.env.example` for Compose: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `DATABASE_URL=postgres://...@db:5432/...`, `REDIS_URL=redis://redis:6379`, `JWT_SECRET`, `PORT`, `PUBLIC_URL`, `COOKIE_SECURE=false`.
6. `docs/DEPLOY.md`: a step-by-step runbook for the owner covering creating the VM, security group and billing alert, creating a `deploy` user, key-only SSH, `ufw`, Fail2ban, a 2 GB swap file, installing Docker, cloning the repo, creating `.env`, `docker compose up -d --build`, and verification commands (`ufw status`, `ss -tulpn`).

## Owner tasks [owner]

- Run the stack locally and test at `http://localhost`.
- Follow `docs/DEPLOY.md` to deploy to the VM. Set `PUBLIC_URL=http://<server-ip>` and keep `COOKIE_SECURE=false` until HTTPS is on.
- Send a real webhook (for example a GitHub repository webhook ping) to the VM.

## Do not build yet

HTTPS and Certbot, CI/CD, backups, a registry, Kubernetes.

## Acceptance checks

- [ ] `docker compose up --build -d` brings everything up from a clean checkout; `docker compose ps` shows all services healthy
- [ ] Register, log in, create an endpoint, send a request: it appears live at `http://localhost`
- [ ] Data survives `docker compose down` followed by `up`
- [ ] Live updates arrive instantly through Nginx (not in clumps)
- [ ] `docker compose ps` and `docker ps` show Postgres and Redis with no published ports
- [ ] Stopping `worker` does not break the hook route
- [ ] On the VM: the app works at `http://<server-ip>`, password SSH login is disabled, `ufw` allows only 22 and 80, and only those ports are reachable

## Review guide [owner]

Read and understand: every directive in `default.conf`, why SSE needs buffering off, how the multi-stage Dockerfile keeps the image small, why services use `db` and `redis` as hostnames, and what the healthcheck and `depends_on` do. Practice `docker compose logs -f api worker`, `docker compose exec db psql ...`, `down` versus `down -v`.

Suggested commit: `feat: Docker Compose stack with Nginx and deployment runbook`

---

# Day 6: HTTPS, CI/CD, backups and polish

**Goal:** a secure site that updates itself on `git push`, with backups proven to restore.

## Build [agent]

1. HTTPS with Certbot (webroot method) in Compose:
   - In the port 80 server block add `location /.well-known/acme-challenge/ { root /var/www/certbot; }`.
   - Mount `./certbot/www:/var/www/certbot` and `./certbot/conf:/etc/letsencrypt` into `web`.
   - Add a `certbot` service (`certbot/certbot` image, same volumes, `profiles: [tools]`).
   - Provide the HTTPS server block (`listen 443 ssl`, `fullchain.pem`, `privkey.pem`) as a separate file or clearly marked section, plus an HTTP to HTTPS redirect that keeps the ACME path open. Publish port 443.
   - `docs/HTTPS.md`: ordered steps to get the first certificate on the HTTP-only config (using `--staging` first), then switch to the HTTPS config, plus the renewal cron line.
2. `docker-compose.prod.yml`: same as the full stack but `api` and `worker` use `image: ghcr.io/<lowercase-owner>/webhook-api:latest` and `web` uses `ghcr.io/<lowercase-owner>/webhook-web:latest`.
3. `.github/workflows/deploy.yml` with three jobs:
   - `test`: checkout, Node 20 with npm cache, then `cd backend && npm ci && npm run build && npm test` (only include tests that do not need Postgres and Redis, or add service containers).
   - `publish` (needs `test`): log in to GHCR with `GITHUB_TOKEN`, build and push the backend image and the `nginx/Dockerfile` image. Needs `permissions: packages: write`.
   - `deploy` (needs `publish`): `appleboy/ssh-action` using secrets `VM_HOST`, `VM_USER`, `VM_SSH_KEY`; runs `git pull`, `docker compose -f docker-compose.prod.yml pull`, `up -d`, and `docker image prune -f`.
4. `scripts/backup.sh`: `pg_dump` through `docker compose exec -T db`, gzip into `backups/db_<date>.sql.gz`, delete files older than 7 days. Add `docs/BACKUP.md` with the cron line and the restore command into a scratch database.
5. Add `logging` limits (`json-file`, `max-size: 10m`, `max-file: 3`) to services in the Compose files.
6. `README.md`: what it does, architecture diagram (Mermaid or ASCII), local run steps, deploy overview, curl examples, API table.

## Owner tasks [owner]

- Point a domain (or a free DuckDNS subdomain) at the VM. Follow `docs/HTTPS.md`.
- Set `PUBLIC_URL=https://yourdomain` and `COOKIE_SECURE=true` in the VM's `.env`, restart `api`, and confirm the refresh cookie is `HttpOnly`, `Secure`, `SameSite=Lax`.
- Create a dedicated deploy key (`ssh-keygen -t ed25519`), add the public key to the VM, and add `VM_HOST`, `VM_USER`, `VM_SSH_KEY` as GitHub secrets. Make both GHCR packages public after the first push.
- Install the backup cron job and do one real restore.
- Add a free uptime checker pointed at `/api/health`.
- Break and recover drill: stop the worker, kill the API, use a wrong env var, and fix each using only logs and Compose commands.

## Acceptance checks

- [ ] HTTPS loads with a valid certificate; HTTP redirects to HTTPS
- [ ] Login works over HTTPS with a `Secure` cookie, and live updates still work
- [ ] A push to `main` runs checks, publishes images and updates the live site
- [ ] A backup file exists and a restore into a scratch database succeeded
- [ ] Certificate renewal dry run works (`certbot renew --dry-run`)
- [ ] `README.md` lets a stranger run the project locally
- [ ] No secrets in the repo (`git grep -i secret` and a manual check of `.env.example`)

## Review guide [owner]

Read and understand: how the ACME challenge works, what each job in the workflow does and why `publish` comes before `deploy`, why the VM pulls images instead of building them, and what the backup and restore commands do.

Suggested commit: `feat: HTTPS, CI/CD pipeline, backups and README`

---

# Definition of done

- [ ] Any HTTP method and content type is captured
- [ ] Passwords stored only as bcrypt hashes; refresh tokens only as hashes
- [ ] Captures go through BullMQ and survive a stopped worker
- [ ] Live updates work locally and through Nginx, for guests and owners
- [ ] Rate limits, size caps and expiry are active
- [ ] Postgres and Redis are not exposed publicly
- [ ] HTTPS works and renews; cookies are `Secure`
- [ ] SSH is key-only, the firewall is on, Fail2ban is installed
- [ ] CI/CD deploys on push
- [ ] Backups run and a restore has been tested
- [ ] Billing alert is set and unused cloud resources are deleted

# If time runs short

Cut first: tests in CI (keep the build step), uptime monitoring, the "My endpoints" page and frontend polish, registry-based deploy (build on the VM instead), refresh-token reuse detection (keep plain rotation).

Keep always: Day 5 deployment, the Nginx SSE configuration, auth with bcrypt and JWT, the queue and worker, backups and HTTPS.

# Later ideas (not part of this plan)

Kubernetes (`kind` locally, `k3s` on a VM with at least 2 GB RAM), splitting `/hook` into its own `capture` service, request forwarding with retries and SSRF protection, custom responses per endpoint, search and filtering, WebSockets, Prometheus and Grafana, Terraform.
