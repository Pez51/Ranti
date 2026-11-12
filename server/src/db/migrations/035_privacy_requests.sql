ALTER TABLE arco_requests
  ADD COLUMN submission_id uuid,
  ADD COLUMN submission_hash text,
  ADD COLUMN data_scope text,
  ADD COLUMN identity_confirmed_at timestamptz,
  ADD COLUMN due_date date,
  ADD COLUMN retention_reason text,
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD CONSTRAINT arco_request_submission_unique UNIQUE (user_id, submission_id);

CREATE INDEX arco_request_owner_date ON arco_requests(user_id, created_at DESC, id);
CREATE INDEX arco_request_review_date ON arco_requests(status, updated_at DESC, id);

CREATE TABLE arco_evidence (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id uuid NOT NULL REFERENCES arco_requests(id),
  revision integer NOT NULL CHECK (revision > 0),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 180),
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 5242880),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (request_id, revision)
);

CREATE TABLE arco_request_events (
  request_id uuid NOT NULL REFERENCES arco_requests(id),
  revision integer NOT NULL CHECK (revision > 0),
  actor_id uuid NOT NULL REFERENCES users(id),
  status arco_status NOT NULL,
  reason text,
  retention_reason text,
  due_date date,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (request_id, revision)
);
