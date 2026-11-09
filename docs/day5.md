# Day 5: Docker, Nginx and the Compose stack

This document explains the code and configuration added on Day 5. It covers
how the API, worker, database, Redis and frontend are packaged and connected.

The deployment runbook (`docs/DEPLOY.md`) is intentionally not repeated here.

## Goal

Before Day 5 the API, worker and frontend were started separately, with
Postgres and Redis running from `docker-compose.dev.yml`.

After Day 5 one command starts the whole stack:

```bash
docker compose up --build -d
```

Nginx becomes the only public entry point on port 80. Postgres and Redis stay
on the private Compose network.

## Files added

| File | Purpose |
|---|---|
| `backend/Dockerfile` | Multi-stage image for both `api` and `worker` |
| `backend/.dockerignore` | Keeps backend build context small and clean |
| `.dockerignore` | Keeps the root build context clean for the Nginx image |
| `nginx/Dockerfile` | Builds the frontend and packages it with Nginx |
| `nginx/default.conf` | Proxies `/api` and `/hook`, streams SSE, serves the SPA |
| `docker-compose.yml` | Defines and connects the five services |
| `.env.example` | Documents the values Compose needs |

## Where the env and Docker files belong

The files in `backend/` and the repository root are not duplicates. Docker uses
a different build context for each image, and the two run modes need different
hostnames.

| File | Belongs to | Used when |
|---|---|---|
| `backend/Dockerfile` | backend build context | building `api` and `worker` |
| `backend/.dockerignore` | backend build context | building `api` and `worker` |
| `nginx/Dockerfile` | repository-root build context | building `web` |
| `.dockerignore` | repository-root build context | building `web` |
| `backend/.env` | backend process, run from `backend/` | `npm run dev`, `npm test` |
| `backend/.env.example` | template for `backend/.env` | local backend development |
| `.env` | Compose variable interpolation | `docker compose ...` |
| `.env.example` | template for `.env` | running the Compose stack |
| `docker-compose.yml` | full stack | `api`, `worker`, `db`, `redis`, `web` |
| `docker-compose.dev.yml` | development dependencies | Postgres and Redis for `npm run dev` |

The two env files contain different addresses on purpose:

- `backend/.env` uses `localhost:5432` and `localhost:6379`, because the
  backend runs directly on the host. `PUBLIC_URL` points at Vite on port 5173.
- `.env` uses `db:5432` and `redis:6379`, because the API and worker run inside
  containers. Compose publishes the site on port 80, so `PUBLIC_URL` points
  there.

Copying one file over the other would break both cases: the host cannot resolve
the Compose hostname `db`, and a container cannot reach the host through
`localhost`. Both real `.env` files are gitignored; only the examples are
committed.

Always run `docker compose` from the repository root. If you run it from
`backend/`, Compose loads `backend/.env` and the containers try to reach
`localhost` instead of the `db` and `redis` services.

## 1. Backend image

`backend/Dockerfile` has two stages.

### Build stage

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build
```

The manifests are copied before the source so Docker can reuse the
`npm ci` layer when only TypeScript files change. TypeScript, ESLint, Vitest
and the `@types` packages are installed here, but they never reach the final
image.

### Runtime stage

```dockerfile
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
USER node
```

Key points:

- `npm ci --omit=dev` installs only runtime dependencies.
- Only `dist/` is copied from the build stage. The TypeScript source never
  ships.
- The process runs as the unprivileged `node` user.
- `bcrypt` works on Alpine without a compiler because its package ships a
  `linux-x64/bcrypt.musl.node` prebuild. `node-gyp-build` selects it at
  install time.
- The same image serves both processes. Compose overrides the command for the
  worker:

  ```yaml
  command: ['node', 'dist/worker.js']
  ```

- Migrations are not baked into the image. They are mounted from the host into
  the Postgres container, so a schema change does not require rebuilding the
  application image.

## 2. `.dockerignore` files

Docker only reads the `.dockerignore` at the root of the build context.

- `backend/.dockerignore` applies when the context is `./backend`. It excludes
  `node_modules`, `dist`, `.env`, `.git` and logs.
- The root `.dockerignore` applies to the Nginx build, whose context is the
  repository root. It excludes every `node_modules` and `dist` directory plus
  `.env` and `.git`.

The root file matters because `nginx/Dockerfile` contains:

```dockerfile
COPY frontend/ ./
```

Without the ignore file, that line would copy the host's
`frontend/node_modules` into the image and could overwrite the dependencies
installed by `npm ci` inside the build stage.

## 3. Nginx image

`nginx/Dockerfile` also has two stages:

1. A Node 20 stage installs the frontend dependencies and runs
   `npm run build`.
2. The final `nginx:1.27-alpine` stage copies `nginx/default.conf` and the
   built `dist/` directory.

The final image contains no Node runtime, no frontend source and no
`node_modules`. It only serves static files and proxies API requests.

## 4. Nginx configuration

`nginx/default.conf` defines one HTTP server on port 80.

### SSE route

```nginx
location ~ ^/api/endpoints/[^/]+/stream$ {
    proxy_pass http://api:3000;

    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 3600s;
}
```

Why each directive is needed:

- The regex location matches only the SSE route. Regex locations are checked
  before prefix locations, so this route does not inherit `/api/` settings.
- `proxy_http_version 1.1` and `proxy_set_header Connection ''` keep the
  connection open instead of treating it as a normal short request.
- `proxy_buffering off` and `proxy_cache off` stop Nginx from holding events
  and delivering them in clumps.
- `proxy_read_timeout 3600s` allows a stream to stay open for an hour. The
  backend also sends a `: ping` comment every 25 seconds.
- The forwarded headers preserve the real client IP and protocol.
- The backend additionally sends `X-Accel-Buffering: no`, which tells Nginx
  not to buffer this response even if a broader default changes later.

The backend sends `: connected` immediately after the headers. That guarantees
the browser's `EventSource` fires `onopen` before the first real webhook
arrives.

### API and hook routes

```nginx
location /api/ {
    proxy_pass http://api:3000;
    ...
}

location /hook/ {
    proxy_pass http://api:3000;
    ...
    client_max_body_size 1m;
}
```

`proxy_pass http://api:3000;` has no URI part, so Nginx forwards the original
path unchanged. `/api/health` reaches the API as `/api/health`, and
`/hook/<id>` reaches it as `/hook/<id>`.

The `/hook/` location sets `client_max_body_size 1m`, matching the Express
`express.raw({ limit: '1mb' })` limit. A larger body is rejected by Nginx with
413 before Node reads it.

The forwarded headers connect to the backend's existing configuration:

```ts
app.set('trust proxy', 1)
```

With that setting, Express reads the real client address from
`X-Forwarded-For`. This keeps `req.ip` and the IP-based rate limits correct
behind Nginx.

### SPA fallback

```nginx
location / {
    try_files $uri /index.html;
}
```

React Router routes such as `/endpoints/abc` have no matching file on disk.
The fallback serves `index.html` and lets the client router handle the path.
Real assets under `/assets/` are served directly.

## 5. Compose stack

`docker-compose.yml` defines five services.

### Shared backend definition

The `x-backend` anchor avoids duplicating environment variables:

```yaml
x-backend: &backend
  build: ./backend
  image: webhook-inspector-api
  restart: unless-stopped
  environment:
    DATABASE_URL: ${DATABASE_URL}
    REDIS_URL: ${REDIS_URL}
    JWT_SECRET: ${JWT_SECRET}
    PORT: ${PORT:-3000}
    PUBLIC_URL: ${PUBLIC_URL}
    COOKIE_SECURE: ${COOKIE_SECURE:-false}
    NODE_ENV: production
```

`api` and `worker` merge this definition with `<<: *backend`. The worker only
adds its command. This keeps the two processes on exactly the same image and
configuration.

### `db`

- Uses `postgres:16-alpine`.
- Stores data in the named volume `pgdata`.
- Mounts `./backend/migrations` into `/docker-entrypoint-initdb.d`.
- Has a `pg_isready` healthcheck.
- Publishes no host ports.

The `$$` in the healthcheck escapes Compose interpolation:

```yaml
test: ['CMD-SHELL', 'pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"']
```

Compose turns `$$` into a single `$`, and the shell inside the container expands
the real values.

Migrations only run when the volume is empty. They do not run again on every
start.

### `redis`

- Uses `redis:7-alpine`.
- Has a `redis-cli ping` healthcheck.
- Publishes no host ports.

Redis holds the BullMQ queues, the endpoint-validity cache and the Pub/Sub
channels for SSE.

### `api`

- Builds the backend image.
- Waits for healthy `db` and `redis`.
- Has a healthcheck against `http://127.0.0.1:3000/api/health`.
- Restarts unless explicitly stopped.

### `worker`

- Uses the same image as `api`.
- Runs `node dist/worker.js`.
- Waits for healthy `db` and `redis`.
- Has no healthcheck because it exposes no HTTP endpoint; the running process
  itself is the liveness signal.

### `web`

- Builds `nginx/Dockerfile` with the repository root as context.
- Publishes only `80:80`.
- Waits for a healthy `api`.
- Has a healthcheck against the SPA root.

This is the only service with a published port. `db` and `redis` are reachable
only by other containers on the Compose network.

### Persistence

`docker compose down` removes containers but keeps the named `pgdata` volume.
`docker compose up` starts against the same data. `docker compose down -v`
deletes the volume and therefore the database.

### Project name isolation

The two Compose files use different project names:

- `docker-compose.yml` uses `webhook-inspector`.
- `docker-compose.dev.yml` uses `webhook-inspector-dev`.

Without this, both would default to the repository directory name and running
one would replace the other's `db` and `redis` containers. With separate names
they can run at the same time:

```bash
# Full stack, no host ports for db/redis
docker compose up -d --build

# Development-only Postgres and Redis, published on 5432 and 6379
docker compose -f docker-compose.dev.yml up -d
```

That is useful when you want to run the backend with `npm run dev` against the
published dev database while the full stack stays up.

## 6. `.env.example`

Compose reads the root `.env` file when substituting `${...}` values. The
example file documents every required value:

| Variable | Used by | Notes |
|---|---|---|
| `POSTGRES_USER` | `db` | Database role |
| `POSTGRES_PASSWORD` | `db` | Database password |
| `POSTGRES_DB` | `db` | Database name |
| `DATABASE_URL` | `api`, `worker` | Must match the three values above and use `db` as host |
| `REDIS_URL` | `api`, `worker` | Uses `redis` as host inside Compose |
| `JWT_SECRET` | `api`, `worker` | At least 32 characters |
| `PORT` | `api` | Keep at `3000`; Nginx proxies to `api:3000` |
| `PUBLIC_URL` | `api` | Base URL used to build hook links |
| `COOKIE_SECURE` | `api` | `false` on HTTP, `true` only after HTTPS |

Hostnames inside Compose are service names, not `localhost`:

```text
db:5432
redis:6379
api:3000
```

The root `.env` is gitignored. Only `.env.example` is committed.

## 7. Request flow after Day 5

```text
Browser
  |
  v
web (Nginx, port 80)
  |-- /api/*  ----------------------> api:3000
  |-- /api/endpoints/:id/stream ----> api:3000 (unbuffered SSE)
  |
  v
index.html + static assets

External webhook
  |
  v
web (Nginx, port 80)
  |-- /hook/:id --------------------> api:3000
                                        |
                                        v
                                   Redis capture queue
                                        |
                                        v
                                     worker
                                        |
                                        v
                                    PostgreSQL
                                        |
                                        v
                              Redis channel endpoint:<id>
                                        |
                                        v
                              api SSE connections
                                        |
                                        v
                                     Browser
```

The API and worker never expose host ports. All public traffic enters through
Nginx.

## 8. What was verified

- Backend `npm run build`, `npm run lint` and `npm test` (17 tests).
- Frontend `npm run build` and `npm run lint`.
- `docker compose config` validates.
- A fresh Compose project starts with an empty volume and creates all four
  tables from `001_init.sql`.
- Nginx serves the frontend, static assets and SPA deep links.
- Guest and owned endpoints capture requests and stream events through Nginx.
- Register, login, refresh cookie and stream ticket work through Nginx.
- Anonymous callers receive 404 for an owned endpoint.
- Stopping `worker` still returns 200 from the hook route; queued requests are
  saved after the worker restarts.
- Data survives `docker compose down` followed by `up`.
- A body over 1 MB returns 413 from Nginx.
- Malformed and unknown hook IDs return 404.
- In the full stack, only `web` publishes a host port; Postgres and Redis do
  not. (`docker-compose.dev.yml` intentionally publishes 5432 and 6379 for
  host-side development.)

Not verified here: the VM, firewall, SSH hardening and actual cloud deployment.

## 9. Decisions and trade-offs

- **Root `.dockerignore` added.** The Nginx build context is the repository
  root. Without this file, host `node_modules` would be copied into the image.
- **Extra healthchecks added.** The plan only required one for Postgres. Redis,
  API and Nginx also have healthchecks so startup ordering and
  `docker compose ps` are useful. The worker has none because it has no HTTP
  endpoint.
- **One backend image.** Building once and overriding the command keeps the API
  and worker versions in lockstep.
- **No HTTPS yet.** Nginx listens on plain HTTP and `COOKIE_SECURE` stays
  `false`. Certbot and port 443 belong to Day 6.
- **No image registry yet.** Compose builds locally. GHCR and
  `docker-compose.prod.yml` belong to Day 6.
- **No logging limits yet.** `json-file` rotation is a Day 6 item.
- **`PORT` is assumed to be 3000.** Nginx and the API healthcheck use that
  address. The env example says not to change it without also changing Nginx.

## 10. Files worth reading closely

1. `backend/Dockerfile` — multi-stage builds and why dev dependencies do not
   belong in the runtime image.
2. `nginx/Dockerfile` — building static assets in one stage and serving them
   from a minimal image in the next.
3. `nginx/default.conf` — proxy headers, the SSE-specific location and the SPA
   fallback.
4. `docker-compose.yml` — service discovery, healthchecks, `depends_on`, the
   shared backend anchor and the single published port.
5. `.dockerignore` — how Docker selects the ignore file from the build context.
6. `.env.example` — which values Compose interpolates and how they reach each
   container.
