import { createHash, randomBytes } from 'node:crypto';
import type { Response } from 'express';
import jwt from 'jsonwebtoken';
import { config } from './config';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const REFRESH_COOKIE = 'refresh_token';

// A real bcrypt hash (cost 12) of a throwaway string. Login compares against
// it when the email is unknown, so a missing account and a wrong password
// take about the same time and cannot be told apart by timing.
export const DUMMY_PASSWORD_HASH =
  '$2b$12$v6aLatavefR7sIym7iXJr.wJnnBbJvO1YOGwgo8X.tq9vZy5EQWCK';

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId }, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: ACCESS_TOKEN_TTL,
  });
}

export function generateRefreshToken(): string {
  return randomBytes(32).toString('hex');
}

// Only the hash is stored, so a database leak does not expose usable tokens.
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/auth',
    secure: config.cookieSecure,
    maxAge: REFRESH_TOKEN_TTL_MS,
  });
}

export function clearRefreshCookie(res: Response): void {
  // Clearing must repeat the same path and flags, or the browser keeps it.
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/api/auth',
    secure: config.cookieSecure,
  });
}
