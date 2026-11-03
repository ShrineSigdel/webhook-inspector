import { Router } from 'express';
import { customAlphabet } from 'nanoid';
import { config } from '../config';
import { pool } from '../db';

// The alphabet excludes look-alike characters (l, o, 0, 1).
const newEndpointId = customAlphabet('abcdefghijkmnpqrstuvwxyz23456789', 10);

export const endpointsRouter = Router();

// Guests only for now; auth and owned endpoints arrive on Day 2.
endpointsRouter.post('/', async (_req, res, next) => {
  try {
    const id = newEndpointId();
    const result = await pool.query<{ expires_at: Date }>(
      `INSERT INTO endpoints (id, expires_at)
       VALUES ($1, now() + interval '24 hours')
       RETURNING expires_at`,
      [id],
    );

    res.status(201).json({
      id,
      url: `${config.publicUrl}/hook/${id}`,
      expiresAt: result.rows[0].expires_at.toISOString(),
    });
  } catch (error) {
    next(error);
  }
});
