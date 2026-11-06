import { Router } from 'express';
import { customAlphabet } from 'nanoid';
import { pool } from '../lib/db';
import { loadEndpoint, toEndpointJson, type EndpointRow } from '../lib/endpoints';
import { optionalAuth, requireAuth } from '../middleware/auth';
import { endpointCreateLimiter } from '../middleware/rateLimit';
import { toRequestJson, type RequestRow } from '../lib/requests';
import { endpointIdSchema, historyQuerySchema } from '../lib/validation';

// The alphabet excludes look-alike characters (l, o, 0, 1).
const newEndpointId = customAlphabet('abcdefghijkmnpqrstuvwxyz23456789', 10);

const ENDPOINT_COLUMNS = 'id, user_id, created_at, expires_at';

export const endpointsRouter = Router();

// Guests get 24 hours, logged-in users 30 days.
endpointsRouter.post('/', optionalAuth, endpointCreateLimiter, async (req, res, next) => {
  try {
    const id = newEndpointId();
    const result = await pool.query<EndpointRow>(
      `INSERT INTO endpoints (id, user_id, expires_at)
       VALUES ($1, $2, now() + $3::interval)
       RETURNING ${ENDPOINT_COLUMNS}`,
      [id, req.userId ?? null, req.userId ? '30 days' : '24 hours'],
    );

    res.status(201).json(toEndpointJson(result.rows[0], req.userId));
  } catch (error) {
    next(error);
  }
});

endpointsRouter.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const parsedId = endpointIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      res.status(404).json({ error: 'endpoint not found' });
      return;
    }

    const endpoint = await loadEndpoint(parsedId.data, req.userId);
    if (!endpoint) {
      res.status(404).json({ error: 'endpoint not found' });
      return;
    }

    res.json(toEndpointJson(endpoint, req.userId));
  } catch (error) {
    next(error);
  }
});

endpointsRouter.get('/:id/requests', optionalAuth, async (req, res, next) => {
  try {
    const parsedId = endpointIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      res.status(404).json({ error: 'endpoint not found' });
      return;
    }

    const endpoint = await loadEndpoint(parsedId.data, req.userId);
    if (!endpoint) {
      res.status(404).json({ error: 'endpoint not found' });
      return;
    }

    const { limit, before } = historyQuerySchema.parse(req.query);

    // Ask for one extra row to know whether another page exists, without a
    // second COUNT query.
    const result = await pool.query<RequestRow>(
      `SELECT id, method, query, headers, body, content_type, ip, size_bytes, created_at
       FROM requests
       WHERE endpoint_id = $1 AND ($2::bigint IS NULL OR id < $2)
       ORDER BY id DESC
       LIMIT $3`,
      [endpoint.id, before ?? null, limit + 1],
    );

    const hasMore = result.rows.length > limit;
    const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
    const last = rows[rows.length - 1];

    res.json({
      requests: rows.map(toRequestJson),
      nextBefore: hasMore && last ? last.id : null,
    });
  } catch (error) {
    next(error);
  }
});

endpointsRouter.delete('/:id/requests', optionalAuth, async (req, res, next) => {
  try {
    const parsedId = endpointIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      res.status(404).json({ error: 'endpoint not found' });
      return;
    }

    const endpoint = await loadEndpoint(parsedId.data, req.userId);
    if (!endpoint) {
      res.status(404).json({ error: 'endpoint not found' });
      return;
    }

    await pool.query('DELETE FROM requests WHERE endpoint_id = $1', [endpoint.id]);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// Mounted at /api/me. Kept next to the other endpoint routes because it is
// the same concern: which endpoints belong to whom.
export const meEndpointsRouter = Router();

meEndpointsRouter.get('/endpoints', requireAuth, async (req, res, next) => {
  try {
    const result = await pool.query<EndpointRow>(
      `SELECT ${ENDPOINT_COLUMNS}
       FROM endpoints
       WHERE user_id = $1 AND expires_at > now()
       ORDER BY created_at DESC`,
      [req.userId],
    );

    res.json({
      endpoints: result.rows.map((row) => toEndpointJson(row, req.userId)),
    });
  } catch (error) {
    next(error);
  }
});
