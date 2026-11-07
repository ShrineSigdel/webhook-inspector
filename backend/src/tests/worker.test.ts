import { customAlphabet } from 'nanoid';
import jwt from 'jsonwebtoken';
import { Worker } from 'bullmq';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../app';
import { config } from '../lib/config';
import { pool } from '../lib/db';
import { saveRequest } from '../jobs/saveRequest';
import {
  CAPTURE_QUEUE,
  capture,
  maintenance,
  queueConnection,
  type CaptureJob,
} from '../lib/queues';
import { redis } from '../lib/redis';

const tag = `worker-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const PASSWORD = 'correct-horse-battery';
const newEndpointId = customAlphabet('abcdefghijkmnpqrstuvwxyz23456789', 10);
const endpointIds: string[] = [];

let server: Server;
let baseUrl: string;
let worker: Worker<CaptureJob>;

async function createGuestEndpoint(): Promise<string> {
  const id = newEndpointId();
  await pool.query(
    `INSERT INTO endpoints (id, expires_at) VALUES ($1, now() + interval '1 hour')`,
    [id],
  );
  endpointIds.push(id);
  return id;
}

async function waitFor<T>(check: () => Promise<T | null>, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value !== null) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('timed out waiting for condition');
}

async function subscriberCount(channel: string): Promise<number> {
  const reply = (await redis.pubsub('NUMSUB', channel)) as [string, string];
  return Number(reply[1]);
}

function streamUrl(endpointId: string, ticket?: string): string {
  const url = `${baseUrl}/api/endpoints/${endpointId}/stream`;
  return ticket ? `${url}?ticket=${encodeURIComponent(ticket)}` : url;
}

async function registerAndLogin(name: string) {
  const email = `${tag}-${name}@example.test`;
  const registered = await request(app)
    .post('/api/auth/register')
    .send({ email, password: PASSWORD });
  expect(registered.status).toBe(201);

  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  expect(login.status).toBe(200);

  return {
    userId: registered.body.user.id as string,
    token: login.body.accessToken as string,
  };
}

beforeAll(async () => {
  worker = new Worker<CaptureJob>(
    CAPTURE_QUEUE,
    async (job) => {
      await saveRequest(job.data);
    },
    { connection: queueConnection, concurrency: 10 },
  );

  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await worker.close();
  if (server) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  if (endpointIds.length > 0) {
    await pool.query('DELETE FROM endpoints WHERE id = ANY($1::text[])', [endpointIds]);
  }
  await pool.query('DELETE FROM users WHERE email LIKE $1', [`${tag}-%`]);

  await capture.close();
  await maintenance.close();
  await queueConnection.quit();
  await redis.quit();
  await pool.end();
});

describe('capture pipeline', () => {
  it('returns 200 from the hook, saves via the worker and streams the row live', async () => {
    const endpointId = await createGuestEndpoint();
    const channel = `endpoint:${endpointId}`;
    const controller = new AbortController();

    // Guest endpoints do not need a ticket.
    const response = await fetch(streamUrl(endpointId), { signal: controller.signal });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    // The route flushes headers before subscribing, so wait until Redis sees
    // the subscriber before publishing anything.
    await waitFor(async () => ((await subscriberCount(channel)) > 0 ? true : null));

    const hook = await request(app)
      .post(`/hook/${endpointId}?source=test`)
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer should-be-captured')
      .send({ hello: 'world' });

    expect(hook.status).toBe(200);
    expect(hook.body).toEqual({ ok: true });

    const row = await waitFor(async () => {
      const result = await pool.query<{
        method: string;
        body: string;
        size_bytes: number;
        headers: Record<string, string>;
      }>(
        `SELECT method, body, size_bytes, headers FROM requests
         WHERE endpoint_id = $1 ORDER BY id DESC LIMIT 1`,
        [endpointId],
      );
      return result.rows[0] ?? null;
    });

    expect(row.method).toBe('POST');
    expect(row.body).toBe('{"hello":"world"}');
    expect(row.size_bytes).toBe(Buffer.byteLength('{"hello":"world"}'));
    expect(row.headers.authorization).toBe('Bearer should-be-captured');

    // The hook route caches validity for 60 seconds.
    expect(await redis.get(`endpoint:valid:${endpointId}`)).toBe('1');

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    // The stream starts with a ": connected" comment so proxies flush headers.
    // Read until the actual event arrives instead of assuming it is chunk one.
    const decoder = new TextDecoder();
    let text = '';
    while (!text.includes('data: ')) {
      const chunk = await reader!.read();
      expect(chunk.done).toBe(false);
      text += decoder.decode(chunk.value, { stream: true });
    }

    expect(text).toContain('"body":"{\\"hello\\":\\"world\\"}"');

    // Closing the client must release the dedicated subscriber.
    controller.abort();
    await waitFor(async () => ((await subscriberCount(channel)) === 0 ? true : null));
  }, 15_000);

  it('rejects an over-1MB body before it reaches the queue', async () => {
    const endpointId = await createGuestEndpoint();
    const response = await request(app)
      .post(`/hook/${endpointId}`)
      .set('Content-Type', 'text/plain')
      .send('x'.repeat(1024 * 1024 + 1));

    expect(response.status).toBe(413);
  });
});

describe('stream tickets', () => {
  it('only gives the owner a short-lived, endpoint-scoped ticket', async () => {
    const owner = await registerAndLogin('ticket-owner');
    const other = await registerAndLogin('ticket-other');
    const created = await request(app)
      .post('/api/endpoints')
      .set('Authorization', `Bearer ${owner.token}`);
    expect(created.status).toBe(201);
    endpointIds.push(created.body.id);
    const endpointId = created.body.id as string;

    const anonymous = await request(app).post(`/api/endpoints/${endpointId}/stream-ticket`);
    expect(anonymous.status).toBe(401);

    const stranger = await request(app)
      .post(`/api/endpoints/${endpointId}/stream-ticket`)
      .set('Authorization', `Bearer ${other.token}`);
    expect(stranger.status).toBe(404);

    const guest = await createGuestEndpoint();
    const guestTicket = await request(app)
      .post(`/api/endpoints/${guest}/stream-ticket`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(guestTicket.status).toBe(404);

    const issued = await request(app)
      .post(`/api/endpoints/${endpointId}/stream-ticket`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(issued.status).toBe(200);
    expect(issued.body.expiresIn).toBe(60);

    const payload = jwt.verify(issued.body.ticket, config.jwtSecret, {
      algorithms: ['HS256'],
      audience: 'stream',
    });
    expect(typeof payload).not.toBe('string');
    if (typeof payload !== 'string') {
      expect(payload.sub).toBe(owner.userId);
      expect(payload.eid).toBe(endpointId);
    }
  });

  it('refuses an owned stream without a ticket, with a bad ticket or an expired ticket', async () => {
    const owner = await registerAndLogin('stream-owner');
    const created = await request(app)
      .post('/api/endpoints')
      .set('Authorization', `Bearer ${owner.token}`);
    endpointIds.push(created.body.id);
    const endpointId = created.body.id as string;

    expect((await request(app).get(`/api/endpoints/${endpointId}/stream`)).status).toBe(404);
    expect(
      (await request(app).get(`/api/endpoints/${endpointId}/stream?ticket=not-a-jwt`)).status,
    ).toBe(404);

    const expired = jwt.sign({ sub: owner.userId, eid: endpointId }, config.jwtSecret, {
      algorithm: 'HS256',
      audience: 'stream',
      expiresIn: -1,
    });
    expect(
      (await request(app).get(`/api/endpoints/${endpointId}/stream?ticket=${expired}`)).status,
    ).toBe(404);

    const issued = await request(app)
      .post(`/api/endpoints/${endpointId}/stream-ticket`)
      .set('Authorization', `Bearer ${owner.token}`);
    const controller = new AbortController();
    const response = await fetch(streamUrl(endpointId, issued.body.ticket), {
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    controller.abort();
  });
});

describe('history cap', () => {
  it('keeps only the newest 500 requests per endpoint', async () => {
    const endpointId = await createGuestEndpoint();

    await pool.query(
      `INSERT INTO requests (endpoint_id, method, headers)
       SELECT $1, 'POST', '{}'::jsonb FROM generate_series(1, 505)`,
      [endpointId],
    );

    await saveRequest({
      v: 1,
      endpointId,
      method: 'POST',
      query: { newest: 'yes' },
      headers: { 'x-test': 'cap' },
      body: 'newest',
      contentType: 'text/plain',
      ip: '127.0.0.1',
      sizeBytes: 6,
    });

    const count = await pool.query<{ count: string }>(
      'SELECT count(*) FROM requests WHERE endpoint_id = $1',
      [endpointId],
    );
    expect(Number(count.rows[0].count)).toBe(500);

    const newest = await pool.query<{ body: string }>(
      'SELECT body FROM requests WHERE endpoint_id = $1 ORDER BY id DESC LIMIT 1',
      [endpointId],
    );
    expect(newest.rows[0].body).toBe('newest');
  }, 15_000);
});
