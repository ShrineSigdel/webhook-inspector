import { pool } from '../lib/db';

export async function cleanup(): Promise<void> {
  // Requests, and refresh tokens, disappear through ON DELETE CASCADE.
  const endpoints = await pool.query(
    'DELETE FROM endpoints WHERE expires_at <= now()',
  );
  const tokens = await pool.query(
    `DELETE FROM refresh_tokens
     WHERE expires_at <= now() OR revoked_at IS NOT NULL`,
  );

  console.log(
    `Maintenance: removed ${endpoints.rowCount ?? 0} expired endpoints and ` +
      `${tokens.rowCount ?? 0} refresh tokens`,
  );
}
