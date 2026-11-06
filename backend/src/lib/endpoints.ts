import { config } from './config';
import { pool } from './db';

export interface EndpointRow {
  id: string;
  user_id: string | null;
  created_at: Date;
  expires_at: Date;
}

export interface EndpointJson {
  id: string;
  url: string;
  createdAt: string;
  expiresAt: string;
  owned: boolean;
}

// One query doubles as the access check: a guest endpoint is readable by
// anyone with the link, an owned endpoint only by its owner. Missing, expired,
// and someone else's endpoint all look the same to the caller (404).
export async function loadEndpoint(
  id: string,
  userId?: string,
): Promise<EndpointRow | null> {
  const result = await pool.query<EndpointRow>(
    `SELECT id, user_id, created_at, expires_at
     FROM endpoints
     WHERE id = $1
       AND expires_at > now()
       AND (user_id IS NULL OR user_id = $2)`,
    [id, userId ?? null],
  );

  return result.rows[0] ?? null;
}

export function toEndpointJson(endpoint: EndpointRow, userId?: string): EndpointJson {
  return {
    id: endpoint.id,
    url: `${config.publicUrl}/hook/${endpoint.id}`,
    createdAt: endpoint.created_at.toISOString(),
    expiresAt: endpoint.expires_at.toISOString(),
    owned: endpoint.user_id !== null && endpoint.user_id === userId,
  };
}
