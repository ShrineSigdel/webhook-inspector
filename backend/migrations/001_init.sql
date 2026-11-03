CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

CREATE TABLE endpoints (
  id         TEXT PRIMARY KEY,
  user_id    UUID REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE requests (
  id           BIGSERIAL PRIMARY KEY,
  endpoint_id  TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
  method       TEXT NOT NULL,
  query        JSONB NOT NULL DEFAULT '{}',
  headers      JSONB NOT NULL,
  body         TEXT,
  content_type TEXT,
  ip           TEXT,
  size_bytes   INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_requests_endpoint ON requests (endpoint_id, id DESC);
CREATE INDEX idx_endpoints_user ON endpoints (user_id);
