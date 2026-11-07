import bcrypt from 'bcrypt';
import { Router } from 'express';
import {
  DUMMY_PASSWORD_HASH,
  REFRESH_COOKIE,
  clearRefreshCookie,
  generateRefreshToken,
  hashRefreshToken,
  setRefreshCookie,
  signAccessToken,
} from '../lib/auth';
import { pool } from '../lib/db';
import { loginLimiter } from '../middleware/rateLimit';
import { loginBodySchema, registerBodySchema } from '../lib/validation';

const BCRYPT_COST = 12;

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  email: string;
  revoked_at: Date | null;
  expired: boolean;
}

export const authRouter = Router();

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

// Read the refresh token from the request cookies.
// Returns null if the cookie is invalid.
function readRefreshCookie(cookies: unknown): string | null {
  if (typeof cookies !== 'object' || cookies === null) {
    return null;
  }
  const value = (cookies as Record<string, unknown>)[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function issueRefreshToken(userId: string): Promise<string> {
  const token = generateRefreshToken();
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + interval '7 days')`,
    [userId, hashRefreshToken(token)],
  );
  return token;
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const { email, password } = registerBodySchema.parse(req.body);
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    try {
      const result = await pool.query<Pick<UserRow, 'id' | 'email'>>(
        `INSERT INTO users (email, password_hash)
         VALUES ($1, $2)
         RETURNING id, email`,
        [email, passwordHash],
      );

      res.status(201).json({ user: result.rows[0] });
    } catch (error) {
      if (isUniqueViolation(error)) {
        res.status(409).json({ error: 'email already registered' });
        return;
      }
      throw error;
    }
  } catch (error) {
    next(error);
  }
});

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginBodySchema.parse(req.body);

    const result = await pool.query<UserRow>(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email],
    );
    const user = result.rows[0];

    // Always run a compare, even for an unknown email, so both failures cost
    // the same. The response stays identical too.
    const matches = await bcrypt.compare(password, user?.password_hash ?? DUMMY_PASSWORD_HASH);

    if (!user || !matches) {
      res.status(401).json({ error: 'invalid email or password' });
      return;
    }

    const refreshToken = await issueRefreshToken(user.id);
    setRefreshCookie(res, refreshToken);
    res.json({
      accessToken: signAccessToken(user.id),
      user: { id: user.id, email: user.email },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const token = readRefreshCookie(req.cookies);
    if (!token) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    const result = await pool.query<RefreshTokenRow>(
      `SELECT rt.id, rt.user_id, u.email, rt.revoked_at, (rt.expires_at <= now()) AS expired
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1`,
      [hashRefreshToken(token)],
    );
    const row = result.rows[0];

    if (!row) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    if (row.revoked_at) {
      // A token that was already rotated is being replayed. Assume it was
      // stolen and end every active session for that user.
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = now()
         WHERE user_id = $1 AND revoked_at IS NULL`,
        [row.user_id],
      );
      clearRefreshCookie(res);
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    if (row.expired) {
      clearRefreshCookie(res);
      res.status(401).json({ error: 'unauthorized' });
      return;
    }

    // Rotate: the old token dies, a new one takes its place.
    await pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [row.id]);
    const newToken = await issueRefreshToken(row.user_id);

    setRefreshCookie(res, newToken);
    // The frontend keeps access tokens in memory only, so a page reload has no
    // user details until refresh tells it who the session belongs to.
    res.json({
      accessToken: signAccessToken(row.user_id),
      user: { id: row.user_id, email: row.email },
    });
  } catch (error) {
    next(error);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const token = readRefreshCookie(req.cookies);
    if (token) {
      await pool.query(
        `UPDATE refresh_tokens SET revoked_at = now()
         WHERE token_hash = $1 AND revoked_at IS NULL`,
        [hashRefreshToken(token)],
      );
    }

    clearRefreshCookie(res);
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});
