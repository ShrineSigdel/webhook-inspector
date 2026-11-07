import express, { Router } from 'express';
import { pool } from '../lib/db';
import { hookLimiter } from '../middleware/rateLimit';
import { CAPTURE_JOB_OPTIONS, capture, type CaptureJob } from '../lib/queues';
import { redis } from '../lib/redis';
import { endpointIdSchema } from '../lib/validation';

// Requests are truncated for the queue, but size_bytes keeps the real size.
const MAX_BODY_BYTES = 256 * 1024;
const VALID_CACHE_SECONDS = 60;

// Goal : Accept any request quickly and hand it to the worker.

export const hooksRouter = Router();

// Capture every content type as a raw buffer. This router is mounted before
// express.json() in app.ts so the JSON parser never consumes the body.
hooksRouter.use(express.raw({ type: () => true, limit: '1mb' }));

hooksRouter.all('/:id', hookLimiter, async (req, res, next) => {
  const parsedId = endpointIdSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(404).json({ error: 'endpoint not found' });
    return;
  }

  try {
    // A busy integration can hit the same endpoint thousands of times, so
    // keep "this endpoint exists" in Redis instead of querying Postgres each
    // time. A deleted endpoint can stay valid here for up to a minute.
    const cacheKey = `endpoint:valid:${parsedId.data}`;
    const cached = await redis.get(cacheKey);

    if (cached !== '1') {
      const endpoint = await pool.query(
        'SELECT id FROM endpoints WHERE id = $1 AND expires_at > now()',
        [parsedId.data],
      );

      if (endpoint.rowCount === 0) {
        res.status(404).json({ error: 'endpoint not found' });
        return;
      }

      await redis.set(cacheKey, '1', 'EX', VALID_CACHE_SECONDS);
    }

    // With no body, express.raw leaves req.body as {}, so check the type.
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    // Postgres TEXT cannot store NUL bytes; replace them instead of failing
    // the whole capture. size_bytes still records the true byte length.
    const body = rawBody
      .subarray(0, MAX_BODY_BYTES)
      .toString('utf8')
      .replaceAll('\u0000', '\uFFFD');

    const job: CaptureJob = {
      v: 1,
      endpointId: parsedId.data,
      method: req.method,
      query: req.query,
      headers: req.headers,
      body,
      contentType: req.get('content-type') ?? null,
      ip: req.ip ?? null,
      sizeBytes: rawBody.byteLength,
    };

    // Enqueue and reply immediately; the worker owns the database write.
    await capture.add('save', job, CAPTURE_JOB_OPTIONS);

    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});
