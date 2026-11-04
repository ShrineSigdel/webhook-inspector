import { z } from 'zod';

// The endpoint alphabet excludes look-alike characters (l, o, 0, 1).
export const endpointIdSchema = z.string().regex(/^[a-km-np-z2-9]{10}$/);

const email = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(z.email().max(254));

// bcrypt only reads the first 72 bytes and silently ignores the rest, so a
// longer password would be partly ignored. Reject it instead.
export const passwordSchema = z
  .string()
  .min(10, 'password must be at least 10 characters')
  .max(72, 'password must be at most 72 characters')
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= 72,
    'password must be at most 72 bytes',
  );

export const registerBodySchema = z.object({
  email,
  password: passwordSchema,
});

export const loginBodySchema = registerBodySchema;

// GET /history?limit=20&before=1050
export const historyQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  // Keyset cursor: only requests with a smaller (older) id are returned.
  // The range check stops an oversized cursor from overflowing BIGINT in SQL.
  before: z
    .string()
    .regex(/^\d+$/)
    .refine(
      (value) => BigInt(value) <= 9223372036854775807n,
      'before is out of range',
    )
    .optional(),
});
