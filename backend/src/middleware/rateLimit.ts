import type { Request, Response } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

function tooManyRequests(_req: Request, res: Response): void {
  res.status(429).json({ error: 'too many requests' });
}

function emailFromBody(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('email' in body)) {
    return '';
  }
  const { email } = body as { email?: unknown };
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

// Keyed by IP and email: guessing one account's password and trying many
// accounts from one machine both use up the same small budget.
export const loginLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${emailFromBody(req.body)}`,
  handler: tooManyRequests,
});

export const endpointCreateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: tooManyRequests,
});

// A busy integration can legitimately send many hooks, so this is loose. It
// only exists to stop one source from flooding a single endpoint.
export const hookLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? '')}:${req.params.id ?? ''}`,
  handler: tooManyRequests,
});
