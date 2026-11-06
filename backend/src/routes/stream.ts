import { Router, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../lib/config';
import { pool } from '../lib/db';
import { loadEndpoint } from '../lib/endpoints';
import { requireAuth } from '../middleware/auth';
import { redis } from '../lib/redis';
import { endpointIdSchema } from '../lib/validation';

interface StreamEndpoint {
  id: string;
  user_id: string | null;
}

function verifyStreamTicket(
  ticket: string,
  endpoint: { id: string; user_id: string },
): boolean {
  try {
    // EventSource cannot send an Authorization header, so the owner proves
    // access with a short-lived, endpoint-scoped ticket instead.
    const payload = jwt.verify(ticket, config.jwtSecret, {
      algorithms: ['HS256'],
      audience: 'stream',
    });

    return (
      typeof payload !== 'string' &&
      payload.sub === endpoint.user_id &&
      payload.eid === endpoint.id
    );
  } catch {
    return false;
  }
}

export const streamRouter = Router();

// Long-lived responses keep `server.close()` waiting forever. The HTTP server
// calls this during shutdown so the process can exit promptly.
const openStreams = new Set<Response>();

export function closeAllStreams(): void {
  for (const response of openStreams) {
    response.end();
  }
  openStreams.clear();
}

streamRouter.post('/:id/stream-ticket', requireAuth, async (req, res, next) => {
  try {
    const parsedId = endpointIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      res.status(404).json({ error: 'endpoint not found' });
      return;
    }

    const endpoint = await loadEndpoint(parsedId.data, req.userId);
    // loadEndpoint also returns guest endpoints; a guest endpoint has no owner
    // who could be issued a ticket.
    if (!endpoint || endpoint.user_id === null || endpoint.user_id !== req.userId) {
      res.status(404).json({ error: 'endpoint not found' });
      return;
    }

    const ticket = jwt.sign(
      { sub: endpoint.user_id, eid: endpoint.id },
      config.jwtSecret,
      { algorithm: 'HS256', audience: 'stream', expiresIn: '60s' },
    );

    res.json({ ticket, expiresIn: 60 });
  } catch (error) {
    next(error);
  }
});

streamRouter.get('/:id/stream', async (req, res, next) => {
  try {
    const parsedId = endpointIdSchema.safeParse(req.params.id);
    if (!parsedId.success) {
      res.status(404).json({ error: 'endpoint not found' });
      return;
    }

    // Unlike the history API, this must find owned endpoints without knowing
    // the caller. Ownership is proved by the ticket below.
    const result = await pool.query<StreamEndpoint>(
      'SELECT id, user_id FROM endpoints WHERE id = $1 AND expires_at > now()',
      [parsedId.data],
    );
    const endpoint = result.rows[0];

    if (!endpoint) {
      res.status(404).json({ error: 'endpoint not found' });
      return;
    }

    if (endpoint.user_id !== null) {
      const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : null;
      if (!ticket || !verifyStreamTicket(ticket, { id: endpoint.id, user_id: endpoint.user_id })) {
        res.status(404).json({ error: 'endpoint not found' });
        return;
      }
    }

    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      // Tell Nginx not to buffer or the events arrive in clumps.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    openStreams.add(res);

    // One subscriber per connection: Redis Pub/Sub delivers each message to
    // every subscriber, so a shared one would leak events between clients.
    const subscriber = redis.duplicate();
    const channel = `endpoint:${endpoint.id}`;
    let closed = false;
    let ping: NodeJS.Timeout | null = null;

    const close = async (): Promise<void> => {
      if (closed) {
        return;
      }
      closed = true;
      openStreams.delete(res);
      if (ping) {
        clearInterval(ping);
      }
      try {
        await subscriber.unsubscribe(channel);
      } catch {
        // The connection may already be gone.
      }
      try {
        await subscriber.quit();
      } catch {
        // The client is already gone; the connection may be gone too.
      }
    };

    subscriber.on('error', (error) => {
      console.error(`Stream subscriber error for endpoint ${endpoint.id}:`, error);
    });

    req.on('close', () => {
      void close();
    });

    try {
      await subscriber.subscribe(channel);
    } catch (error) {
      console.error(`Failed to subscribe to endpoint ${endpoint.id}:`, error);
      await close();
      res.end();
      return;
    }

    // The client may have disconnected while subscribe() was in progress.
    if (closed) {
      return;
    }

    subscriber.on('message', (_channel, message) => {
      if (!closed && !res.writableEnded) {
        // message is already the JSON produced by saveRequest.
        res.write(`data: ${message}\n\n`);
      }
    });

    // A comment keeps proxies from closing an idle connection.
    ping = setInterval(() => {
      if (!closed && !res.writableEnded) {
        res.write(': ping\n\n');
      }
    }, 25_000);
  } catch (error) {
    next(error);
  }
});
