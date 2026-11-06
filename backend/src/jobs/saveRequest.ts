import { pool } from '../lib/db';
import type { CaptureJob } from '../lib/queues';
import { redis } from '../lib/redis';
import { toRequestJson, type RequestRow } from '../lib/requests';

const HISTORY_LIMIT = 500;

export async function saveRequest(capture: CaptureJob): Promise<void> {
  // Like the hook route, Postgres TEXT cannot hold NUL bytes.
  const body = capture.body.replaceAll('\u0000', '\uFFFD');

  const result = await pool.query<RequestRow>(
    `INSERT INTO requests
       (endpoint_id, method, query, headers, body, content_type, ip, size_bytes)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6, $7, $8)
     RETURNING *`,
    [
      capture.endpointId,
      capture.method,
      JSON.stringify(capture.query),
      JSON.stringify(capture.headers),
      body,
      capture.contentType,
      capture.ip,
      capture.sizeBytes,
    ],
  );

  const row = result.rows[0];

  // Keep only the newest 500 rows per endpoint. This runs after the insert
  // and is best effort: failing it must not make BullMQ retry the job, or the
  // retry would insert the same request a second time.
  try {
    await pool.query(
      `DELETE FROM requests
       WHERE endpoint_id = $1
         AND id NOT IN (
           SELECT id FROM requests
           WHERE endpoint_id = $1
           ORDER BY id DESC
           LIMIT $2
         )`,
      [capture.endpointId, HISTORY_LIMIT],
    );
  } catch (error) {
    console.error(`Failed to trim history for endpoint ${capture.endpointId}`, error);
  }

  // Live delivery is best effort too. A failed publish is lost, but the row
  // is already saved and must not be inserted again by a retry.
  try {
    await redis.publish(`endpoint:${capture.endpointId}`, JSON.stringify(toRequestJson(row)));
  } catch (error) {
    console.error(`Failed to publish live event for endpoint ${capture.endpointId}`, error);
  }
}
