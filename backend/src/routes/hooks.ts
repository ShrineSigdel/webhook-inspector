import express, { Router } from 'express';
import { pool } from '../db';
import { hookLimiter } from '../middleware/rateLimit';
import { endpointIdSchema } from '../validation';

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
    const endpoint = await pool.query(
      'SELECT id FROM endpoints WHERE id = $1 AND expires_at > now()',
      [parsedId.data],
    );

    if (endpoint.rowCount === 0) {
      res.status(404).json({ error: 'endpoint not found' });
      return;
    }

    // for no request.body conditions, use empty buffer
    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);

    // Postgres TEXT cannot store NUL bytes; replace them instead of failing
    // the whole capture. size_bytes still records the true byte length.
    const body = rawBody.toString('utf8').replaceAll('\u0000', '\uFFFD');

    await pool.query(
      `INSERT INTO requests
         (endpoint_id, method, query, headers, body, content_type, ip, size_bytes)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8)`,
      [
        parsedId.data,
        req.method,
        JSON.stringify(req.query),
        JSON.stringify(req.headers),
        body,
        req.get('content-type') ?? null,
        req.ip ?? null,
        rawBody.byteLength,
      ],
    );

    res.status(200).json({ ok: true });
  } catch (error) {
    next(error);
  }
});
