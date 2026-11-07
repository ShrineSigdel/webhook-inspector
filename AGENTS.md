# Webhook Inspector

A webhook.site-style service. It gives anyone a unique URL, captures every HTTP request sent to it, and shows those requests live in a dashboard. Users can use it as guests, or sign up to keep endpoints for longer.

This is a learning project. The owner wants to understand every line, so prefer simple, readable code over clever abstractions, and explain non-obvious decisions.

## Stack

- Backend: Node.js 20, Express, TypeScript (strict)
- Database: PostgreSQL 16 (JSONB for headers and query)
- Redis: Pub/Sub for live events, rate limiting, BullMQ storage
- Queue: BullMQ (`api` process enqueues, `worker` process consumes)
- Auth: bcrypt, jsonwebtoken (JWT), zod, cookie-parser
- Live updates: Server-Sent Events (SSE)
- Frontend: React + Vite + Tailwind (TypeScript)
- Deployment: Docker Compose, Nginx, Certbot, GitHub Actions, GHCR

The full plan, schema and API are in `PLAN.md`.

## How to work (read this first)

1. **One day at a time.** The user's prompt names exactly one day (for example "Day 2"). Implement only that day. Read the matching section of `PLAN.md` plus its "Reference" section. Do not read ahead or implement later days.
2. **Plan before coding.** Start by replying with the files you will create or change, in what order, and any assumptions or questions. Wait for approval before writing code.
3. **Build in small steps.** After each step, run the relevant check (typecheck, build, test, or a `curl` command) before moving on.
4. **Stay in scope.** Never build features from a later day, even if it looks easy. If today's work needs something from a later day, add a clearly marked stub and say so in the summary.
5. **Do not touch git history.** Do not run `git commit`, `git push`, `git reset`, or change git config. Leave changes in the working tree. The owner reviews, commits and pushes.
6. **Do not edit `PLAN.md` or `AGENTS.md`.** If either is wrong or unclear, say so in your summary instead.
7. **Ask before** adding a dependency that `PLAN.md` doesn't name, changing the database schema, or changing an API route or response shape.
8. **Be honest about verification.** If you could not run something (Docker not running, no VM access, no network), say exactly what was not verified and give the command the owner should run. Never claim a check passed if you did not run it.
9. **Stop at the end of the day's scope.** Give the end-of-day summary below, then wait.

## End-of-day summary format

Finish every day with this, in this order:

1. **Built:** files created or changed, one line each.
2. **Run and test:** exact commands to start everything and test it.
3. **Acceptance checks:** each item from the day's checklist in `PLAN.md` marked passed, failed, or not verified (with the reason).
4. **Read and understand:** 3 to 6 files or functions the owner should read closely, and the concept each one teaches.
5. **Decisions and trade-offs:** anything you chose that the owner might want to change.
6. **Deferred:** stubs, TODOs and anything intentionally left for a later day.
7. **Suggested commit message.**

## Code conventions

- TypeScript `strict: true`. No `any` unless unavoidable; if used, add a short comment why.
- Source in `backend/src/`, one concern per file: `config.ts`, `db.ts`, `redis.ts`, `queues.ts`, `routes/`, `middleware/`, `jobs/`.
- All configuration comes from `config.ts`, which validates environment variables with zod and fails fast on startup. Never read `process.env` anywhere else.
- Use parameterized SQL only (`$1`, `$2`). Never build SQL by string concatenation.
- Validate every external input with zod (request bodies, query params, route params).
- Comments explain why, not what. Keep them short.
- Keep functions small. Prefer plain functions over classes.
- Log with `console.log` and `console.error` for now. Never log passwords, tokens, cookies, or `Authorization` headers.
- Return JSON errors in the shape `{ "error": "message" }`. Never leak stack traces.
- Frontend: function components and hooks, typed API client in one file, Tailwind for styling.

## Theme

The frontend uses a Bruno-inspired dark theme. All colors, radii, fonts and shadows are CSS custom properties in `frontend/src/styles/theme.css`; that file is the single source of truth. Components use tokens via `var(--...)` (for example `bg-[var(--bg-surface)]`); never hardcode colors in component files. Global body, link, focus, selection and scrollbar styles also live in that file. When adding UI, reuse the existing tokens and `frontend/src/lib/styles.ts` class strings instead of introducing new palettes.

## Security rules (non-negotiable)

- Passwords: bcrypt with cost 12. Reject passwords longer than 72 bytes. Never store or log plaintext.
- JWT: HS256 only. Always pass `algorithms: ['HS256']` to `jwt.verify`. Secret from `JWT_SECRET` (at least 32 random bytes). Access tokens last 15 minutes. Put only `sub` (and purpose fields for tickets) in the payload.
- Refresh tokens: random 32 bytes, stored only as a SHA-256 hash, sent in an `httpOnly`, `sameSite: 'lax'`, `path: '/api/auth'` cookie. `secure` comes from `config.cookieSecure`.
- The browser keeps the access token in memory only. Never `localStorage` or `sessionStorage`.
- Captured request content is untrusted. Never execute it. In the UI, render it as text and never use `dangerouslySetInnerHTML`.
- `.env` is never committed. Only `.env.example` is.
- Postgres and Redis must never be published to the host in the full Compose stack. Only the Nginx `web` service publishes ports.
- Strangers asking for someone else's endpoint get a 404, not a 403.

## Commands

Run from `backend/` unless stated.

- `npm run dev`: API with watch (`tsx watch src/server.ts`)
- `npm run dev:worker`: worker with watch (`tsx watch src/worker.ts`)
- `npm run build`: compile with `tsc`
- `npm test`: run tests (vitest)
- `npm run lint`: ESLint
- From the repo root: `docker compose -f docker-compose.dev.yml up -d` starts Postgres and Redis for development.
- Reset the dev database: `docker compose -f docker-compose.dev.yml down -v`, then up again (migrations run on a fresh volume).

## Gotchas to remember

- Mount the `/hook/:id` router before `express.json()`. The hook route uses `express.raw({ type: () => true, limit: '1mb' })` so any content type is captured. With no body, `req.body` is `{}`, so check `Buffer.isBuffer`.
- `app.set('trust proxy', 1)` so `req.ip` and rate limits work behind Nginx.
- Use `nanoid@3`. Newer versions are ESM-only and break a CommonJS setup.
- BullMQ workers need an ioredis connection created with `maxRetriesPerRequest: null`.
- SSE needs `X-Accel-Buffering: no`, a periodic comment ping, and a Redis subscriber per connection that is closed when the client disconnects.
- Files in `docker-entrypoint-initdb.d` only run on an empty database volume.
- Inside Docker, hostnames are `db` and `redis`, not `localhost`.

## Don't

- Don't add Kubernetes, microservices, user roles, OAuth, email sending, or anything else outside `PLAN.md`.
- Don't refactor code from earlier days unless the current day requires it. If you must, say so in the summary.
- Don't add extra abstractions, base classes, or generic frameworks.
- Don't rewrite files wholesale to make small changes.
