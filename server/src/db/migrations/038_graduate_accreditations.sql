CREATE TABLE graduate_accreditations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id),
  document_last4 char(4) NOT NULL CHECK (document_last4 ~ '^[0-9]{4}$'),
  status verification_status NOT NULL DEFAULT 'En revisión'
    CHECK (status IN ('En revisión','Pendiente de subsanación','Verificado','Rechazado')),
  reason text,
  correction text,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX graduate_accreditation_queue ON graduate_accreditations(status, updated_at DESC, id);

CREATE TABLE graduate_accreditation_evidence (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  accreditation_id uuid NOT NULL REFERENCES graduate_accreditations(id),
  revision integer NOT NULL CHECK (revision > 0),
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 180),
  bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 5242880),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (accreditation_id, revision)
);

CREATE TABLE graduate_accreditation_events (
  accreditation_id uuid NOT NULL REFERENCES graduate_accreditations(id),
  revision integer NOT NULL CHECK (revision > 0),
  actor_id uuid NOT NULL REFERENCES users(id),
  status verification_status NOT NULL,
  reason text,
  correction text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (accreditation_id, revision)
);
