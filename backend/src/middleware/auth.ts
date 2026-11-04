import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

function bearerToken(header: string | undefined): string | null {
  if (!header?.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length);
}

function verifyAccessToken(token: string): string | null {
  try {
    // Pinning the algorithm stops alg=none and algorithm-confusion attacks.
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

export const requireAuth: RequestHandler = (req, res, next) => {
  const token = bearerToken(req.get('authorization'));
  const userId = token ? verifyAccessToken(token) : null;

  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  req.userId = userId;
  next();
};

// Used where guests are welcome. A missing header means guest; a header that
// is present but invalid is still an error, so an expired session cannot
// quietly fall back to creating guest endpoints.
export const optionalAuth: RequestHandler = (req, res, next) => {
  const header = req.get('authorization');
  if (!header) {
    next();
    return;
  }

  const token = bearerToken(header);
  const userId = token ? verifyAccessToken(token) : null;

  if (!userId) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  req.userId = userId;
  next();
};
