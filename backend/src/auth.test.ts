import jwt from 'jsonwebtoken';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { app } from './app';
import { config } from './config';
import { pool } from './db';

// These tests run against the dev database. Every email starts with this tag
// so afterAll can remove only what this run created.
const tag = `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = 'correct-horse-battery';
const guestEndpointIds: string[] = [];

function emailFor(name: string): string {
  return `${tag}-${name}@example.test`;
}

function refreshCookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw : [];
  const match = cookies.find(
    (value): value is string =>
      typeof value === 'string' && value.startsWith('refresh_token='),
  );
  if (!match) {
    throw new Error('refresh cookie missing');
  }
  return match.split(';')[0];
}

async function registerUser(name: string, password = PASSWORD) {
  const email = emailFor(name);
  const res = await request(app).post('/api/auth/register').send({ email, password });
  expect(res.status).toBe(201);
  return { email, id: res.body.user.id as string };
}

async function loginUser(email: string, password = PASSWORD) {
  return request(app).post('/api/auth/login').send({ email, password });
}

async function createEndpoint(accessToken?: string) {
  const req = request(app).post('/api/endpoints');
  if (accessToken) {
    req.set('Authorization', `Bearer ${accessToken}`);
  }
  const res = await req;
  expect(res.status).toBe(201);
  if (!accessToken) {
    guestEndpointIds.push(res.body.id);
  }
  return res;
}

function daysUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000);
}

afterAll(async () => {
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`${tag}-%`]);
  if (guestEndpointIds.length > 0) {
    await pool.query('DELETE FROM endpoints WHERE id = ANY($1::text[])', [guestEndpointIds]);
  }
  await pool.end();
});

describe('auth', () => {
  it('registers a user, lowercases the email and stores only a bcrypt hash', async () => {
    const email = emailFor('Register').toUpperCase();
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: PASSWORD });

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(emailFor('register'));
    expect(res.body).not.toHaveProperty('accessToken');

    const stored = await pool.query<{ email: string; password_hash: string }>(
      'SELECT email, password_hash FROM users WHERE id = $1',
      [res.body.user.id],
    );
    expect(stored.rows[0].email).toBe(emailFor('register'));
    expect(stored.rows[0].password_hash).toMatch(/^\$2[aby]\$12\$/);
    expect(stored.rows[0].password_hash).not.toContain(PASSWORD);
  });

  it('rejects a duplicate email with 409', async () => {
    const { email } = await registerUser('duplicate');
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'another-password' });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'email already registered' });
  });

  it('rejects a password that is too short', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: emailFor('short'), password: 'short' });

    expect(res.status).toBe(400);
  });

  it('uses the same 401 body for a wrong password and an unknown email', async () => {
    const { email } = await registerUser('timing');

    const wrongPassword = await loginUser(email, 'definitely-wrong-password');
    const unknownEmail = await loginUser(emailFor('nobody'), 'definitely-wrong-password');

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
  });

  it('logs in and accepts the access token on a protected route', async () => {
    const { email } = await registerUser('protected');
    const login = await loginUser(email);

    expect(login.status).toBe(200);
    expect(login.body.user.email).toBe(email);
    expect(typeof login.body.accessToken).toBe('string');

    const me = await request(app)
      .get('/api/me/endpoints')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body).toEqual({ endpoints: [] });

    // The refresh token in the database is only a SHA-256 hash.
    const cookie = refreshCookieOf(login);
    const rawToken = cookie.slice('refresh_token='.length);
    const stored = await pool.query<{ token_hash: string }>(
      `SELECT token_hash FROM refresh_tokens
       WHERE user_id = $1 ORDER BY expires_at DESC LIMIT 1`,
      [login.body.user.id],
    );
    expect(stored.rows[0].token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored.rows[0].token_hash).not.toBe(rawToken);
  });

  it('rejects a protected route without a token', async () => {
    const res = await request(app).get('/api/me/endpoints');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('rejects expired, tampered and wrong-algorithm tokens', async () => {
    const { email, id } = await registerUser('tokens');
    const login = await loginUser(email);
    const valid = login.body.accessToken as string;

    const expired = jwt.sign({ sub: id }, config.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: -1,
    });
    const wrongAlgorithm = jwt.sign({ sub: id }, config.jwtSecret, {
      algorithm: 'HS512',
    });
    const [header, payload, signature] = valid.split('.');
    const flipped = payload.endsWith('A') ? 'B' : 'A';
    const tampered = `${header}.${payload.slice(0, -1)}${flipped}.${signature}`;

    for (const token of [expired, wrongAlgorithm, tampered]) {
      const res = await request(app)
        .get('/api/me/endpoints')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    }
  });

  it('rotates refresh tokens and revokes all sessions on reuse', async () => {
    const { email } = await registerUser('rotate');
    const login = await loginUser(email);
    const firstCookie = refreshCookieOf(login);

    const rotated = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', firstCookie);

    expect(rotated.status).toBe(200);
    expect(typeof rotated.body.accessToken).toBe('string');
    const secondCookie = refreshCookieOf(rotated);
    expect(secondCookie).not.toBe(firstCookie);

    // Replaying the rotated token must fail...
    const replay = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', firstCookie);
    expect(replay.status).toBe(401);

    // ...and it must also kill the token that replaced it.
    const afterReuse = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', secondCookie);
    expect(afterReuse.status).toBe(401);
  });

  it('revokes the refresh token on logout', async () => {
    const { email } = await registerUser('logout');
    const login = await loginUser(email);
    const cookie = refreshCookieOf(login);

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', cookie);
    expect(logout.status).toBe(200);
    expect(logout.body).toEqual({ ok: true });

    const refresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', cookie);
    expect(refresh.status).toBe(401);
  });
});

describe('endpoints', () => {
  it('gives guests 24 hours and users 30 days, and hides owned endpoints', async () => {
    const owner = await registerUser('owner');
    const ownerLogin = await loginUser(owner.email);
    const owned = await createEndpoint(ownerLogin.body.accessToken);

    expect(owned.body.owned).toBe(true);
    expect(daysUntil(owned.body.expiresAt)).toBeGreaterThan(29);

    const other = await registerUser('other');
    const otherLogin = await loginUser(other.email);

    const asOwner = await request(app)
      .get(`/api/endpoints/${owned.body.id}`)
      .set('Authorization', `Bearer ${ownerLogin.body.accessToken}`);
    expect(asOwner.status).toBe(200);
    expect(asOwner.body.owned).toBe(true);

    const asOther = await request(app)
      .get(`/api/endpoints/${owned.body.id}`)
      .set('Authorization', `Bearer ${otherLogin.body.accessToken}`);
    expect(asOther.status).toBe(404);

    const asAnonymous = await request(app).get(`/api/endpoints/${owned.body.id}`);
    expect(asAnonymous.status).toBe(404);

    const guest = await createEndpoint();
    expect(guest.body.owned).toBe(false);
    expect(daysUntil(guest.body.expiresAt)).toBeGreaterThan(0.9);
    expect(daysUntil(guest.body.expiresAt)).toBeLessThan(1.1);

    const guestAsAnonymous = await request(app).get(`/api/endpoints/${guest.body.id}`);
    expect(guestAsAnonymous.status).toBe(200);
    expect(guestAsAnonymous.body.owned).toBe(false);
  });

  it('paginates history with a keyset cursor and clears it', async () => {
    const { email } = await registerUser('history');
    const login = await loginUser(email);
    const endpoint = await createEndpoint(login.body.accessToken);
    const auth = { Authorization: `Bearer ${login.body.accessToken}` };

    for (let index = 0; index < 3; index += 1) {
      await pool.query(
        `INSERT INTO requests (endpoint_id, method, headers, body)
         VALUES ($1, 'POST', '{"x":"y"}'::jsonb, $2)`,
        [endpoint.body.id, `body-${index}`],
      );
    }

    const firstPage = await request(app)
      .get(`/api/endpoints/${endpoint.body.id}/requests?limit=2`)
      .set(auth);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.requests).toHaveLength(2);
    expect(firstPage.body.requests[0].body).toBe('body-2');
    expect(firstPage.body.nextBefore).not.toBeNull();

    const secondPage = await request(app)
      .get(
        `/api/endpoints/${endpoint.body.id}/requests?limit=2&before=${firstPage.body.nextBefore}`,
      )
      .set(auth);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.requests).toHaveLength(1);
    expect(secondPage.body.requests[0].body).toBe('body-0');
    expect(secondPage.body.nextBefore).toBeNull();

    const cleared = await request(app)
      .delete(`/api/endpoints/${endpoint.body.id}/requests`)
      .set(auth);
    expect(cleared.status).toBe(200);

    const empty = await request(app)
      .get(`/api/endpoints/${endpoint.body.id}/requests`)
      .set(auth);
    expect(empty.body).toEqual({ requests: [], nextBefore: null });

    const overflow = await request(app)
      .get(`/api/endpoints/${endpoint.body.id}/requests?before=99999999999999999999999`)
      .set(auth);
    expect(overflow.status).toBe(400);
  });

  it('rate limits login after five attempts', async () => {
    const { email } = await registerUser('ratelimit');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await loginUser(email);
      expect(res.status).toBe(200);
    }

    const blocked = await loginUser(email);
    expect(blocked.status).toBe(429);
    expect(blocked.body).toEqual({ error: 'too many requests' });
  });
});
