# Deploy guide

This guide has two levels:

- **Level 0:** run the full stack on your own machine.
- **Level 1:** put it on a small Ubuntu VM over plain HTTP.

HTTPS, CI/CD and backup s are not part of this guide. Follow the appendix only
if you want optional extra protection.

> **Run every command from the repository root** — the directory containing
> `docker-compose.yml`. If you run `docker compose` from `backend/`, Compose
> finds the root compose file but reads `backend/.env`, so the containers try
> to connect to `localhost` instead of `db` and `redis`. That causes 500 errors.

---

## Level 0: run it locally

### 1. Create your `.env`

```bash
cp .env.example .env
```

Open `.env` and set:

- `POSTGRES_PASSWORD` to a password of your choice.
- The password inside `DATABASE_URL` to the same value.
- `JWT_SECRET` to the output of `openssl rand -hex 32`.
- Keep `PUBLIC_URL=http://localhost` and `COOKIE_SECURE=false`.

**Why:** Compose reads `.env` to build the database connection and the public
hook URLs.

### 2. Start the stack

```bash
docker compose up -d --build
docker compose ps
```

Wait until `db`, `redis`, `api` and `web` show `healthy`. `worker` shows `Up`
because it has no HTTP healthcheck.

Check that the containers received the Compose values, not the host-only ones:

```bash
docker compose exec api printenv REDIS_URL
# must print: redis://redis:6379
```

**Why:** `--build` creates the images, and `-d` runs everything in the
background. The env check catches the common mistake of starting Compose from
`backend/`.

### 3. Open the app

Go to [http://localhost](http://localhost), create an endpoint, send it a
request, and watch the request arrive live.

### Useful commands

```bash
# Follow API and worker logs
docker compose logs -f api worker

# Open a Postgres shell
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

# Stop everything, but keep the database
docker compose down

# Stop everything and delete the database
docker compose down -v
```

> **Warning:** `docker compose down -v` permanently deletes the Postgres
> volume, including all users, endpoints and captured requests.

---

## Level 1: simple VM deploy

This level uses plain HTTP. Traffic is not encrypted, so use a unique password
rather than one you use elsewhere. Keep `COOKIE_SECURE=false` until HTTPS is
added.

### a. Create the VM and open the right ports

Create an **Ubuntu 24.04** VM with about **2 GB RAM**.

In your cloud firewall or security group:

- Allow **TCP 22** from your own IP.
- Allow **TCP 80** from anywhere.
- Never open **5432** or **6379**.

Set a billing or budget alert.

**Why:** port 80 serves the site, port 22 is for SSH, and the database and Redis
must stay private.

### b. SSH into the VM

```bash
ssh ubuntu@SERVER_IP
```

Use the username your provider created (often `ubuntu`).

**Why:** every command below runs on the VM, not on your laptop.

### c. Install Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Log out and back in, then check:

```bash
docker compose version
```

**Why:** the group change only applies to a new login. The `docker` group is
effectively root, so only add trusted users.

### d. Clone the repository

```bash
git clone REPOSITORY_URL webhook-inspector
cd webhook-inspector
```

Replace `REPOSITORY_URL` with your repository URL.

**Why:** Compose looks for `docker-compose.yml` in the current directory.

### e. Create `.env`

```bash
cp .env.example .env
openssl rand -hex 32
nano .env
```

Set these values:

```dotenv
POSTGRES_USER=hooks
POSTGRES_PASSWORD=<strong password>
POSTGRES_DB=hooks

DATABASE_URL=postgres://hooks:<same password>@db:5432/hooks
REDIS_URL=redis://redis:6379

JWT_SECRET=<the openssl output>
PORT=3000
PUBLIC_URL=http://SERVER_IP
COOKIE_SECURE=false
```

Replace `SERVER_IP` with the VM's public IP. Do not add a trailing slash.

**Why:** `PUBLIC_URL` is used to build every hook link. If it is wrong, copied
links point to the wrong host. Never commit `.env`.

### f. Start the stack

```bash
docker compose up -d --build
docker compose ps
```

Wait until `db`, `redis`, `api` and `web` show `healthy`. `worker` shows `Up`
because it has no HTTP healthcheck.

**Why:** the first start creates the database schema and builds both images.

### g. Test it in the browser

Open `http://SERVER_IP`, create an endpoint, and copy its hook URL. Send it a
request:

```bash
curl -X POST 'http://SERVER_IP/hook/ENDPOINT_ID' \
  -H 'Content-Type: application/json' \
  -d '{"hello":"world"}'
```

The request should appear live on the endpoint page.

**Why:** this checks the whole path from Nginx to the API, queue, worker and
database.

---

## Updating, stopping and starting

Update the code and rebuild:

```bash
cd webhook-inspector
git pull
docker compose up -d --build
```

Stop the app but keep the database:

```bash
docker compose down
```

Start it again:

```bash
docker compose up -d
```

When you are not using the VM, stop it from your cloud console to save money.
**On EC2, a stopped instance gets a new public IP when it starts again unless
you attach an Elastic IP.** If the IP changes, update `PUBLIC_URL` and restart:

```bash
nano .env
docker compose up -d
```

Optional free fix: create a DuckDNS subdomain, point it at the VM, and use
`PUBLIC_URL=http://yourname.duckdns.org`. Update the DuckDNS record whenever the
IP changes.

---

## Must not skip

- **Cloud firewall rules:** allow only 22 and 80; never expose 5432 or 6379.
- **Strong secrets:** change the default database password and generate a real
  `JWT_SECRET`.
- **Billing alert:** set one before leaving the VM running.
- **`.env` is private:** never commit it. Only `.env.example` belongs in Git.

---

## Troubleshooting

| Problem | Likely cause | Fix |
|---|---|---|
| API exits with `Invalid configuration` | Missing or invalid `.env` value | `docker compose logs api`; check that `JWT_SECRET` is at least 32 characters, `PUBLIC_URL` is a full URL, and `DATABASE_URL` is set. |
| API returns 500 and logs show `ECONNREFUSED 127.0.0.1:6379` or `127.0.0.1:5432` | Compose was run from `backend/`, so it loaded `backend/.env` | `cd` to the repository root, then run `docker compose down && docker compose up -d`. Confirm `docker compose exec api printenv REDIS_URL` prints `redis://redis:6379`. |
| Nginx returns `502 Bad Gateway` | The API is not healthy | `docker compose ps` and `docker compose logs api`; wait for the healthcheck or restart the API. |
| `password authentication failed` | `DATABASE_URL` does not match `POSTGRES_PASSWORD`, or the password was changed after the volume was created | Fix `.env`. If the volume already exists with the old password, run `ALTER USER` or `docker compose down -v` (this deletes data). |
| Live updates arrive in clumps | Nginx is buffering the SSE stream | Make sure `nginx/default.conf` has `proxy_buffering off`; rebuild with `docker compose up -d --build web`. |
| Port 80 is already in use | Another web server is running | Find it with `sudo ss -tulpn \| grep :80`; stop it or change the published port. |

---

## Appendix: optional hardening (not required for Level 1)

These steps are recommended before storing real data, but the Level 1 stack
works without them.

### Deploy user and key-only SSH

```bash
sudo adduser deploy
sudo usermod -aG sudo deploy
sudo rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

From your laptop, confirm key login works **before** disabling passwords:

```bash
ssh deploy@SERVER_IP
```

Then, on the VM:

```bash
sudo tee /etc/ssh/sshd_config.d/00-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF

sudo sshd -t
sudo systemctl restart ssh
sudo sshd -T | grep -E 'passwordauthentication|kbdinteractiveauthentication|permitrootlogin'
```

The `00-` prefix matters because sshd uses the first value it reads. A cloud
image may ship `50-cloud-init.conf` that turns password login back on; if the
check still shows `yes`, remove or edit that file.

Keep your current SSH session open while you test a new one. If the new session
fails, use the provider's console to fix the config.

### UFW and Fail2ban

```bash
sudo apt update
sudo apt install -y ufw fail2ban

sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw enable
sudo ufw status verbose
```

Enable the SSH jail:

```bash
sudo tee /etc/fail2ban/jail.local >/dev/null <<'EOF'
[sshd]
enabled = true
EOF

sudo systemctl enable --now fail2ban
sudo fail2ban-client status sshd
```

The cloud firewall is still the main protection. Docker-published ports can
bypass UFW, which is another reason not to publish 5432 or 6379.

### Swap file

A 2 GB swap file helps a small VM survive the first image build.

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h
```
