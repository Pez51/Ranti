CREATE TABLE provenance_files (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users(id),
    mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp','application/pdf')),
    byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 5242880),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX provenance_files_owner_idx ON provenance_files(owner_id);
