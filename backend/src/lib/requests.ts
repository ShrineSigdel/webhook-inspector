// Shared by the history API and the live stream so both send the same shape.
export interface RequestRow {
  id: string;
  method: string;
  query: unknown;
  headers: unknown;
  body: string | null;
  content_type: string | null;
  ip: string | null;
  size_bytes: number;
  created_at: Date;
}

export function toRequestJson(row: RequestRow) {
  return {
    id: row.id,
    method: row.method,
    query: row.query,
    headers: row.headers,
    body: row.body,
    contentType: row.content_type,
    ip: row.ip,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at.toISOString(),
  };
}
