CREATE TABLE publication_photos (
    id uuid PRIMARY KEY,
    owner_id uuid NOT NULL REFERENCES users(id),
    mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX publication_photos_owner_idx ON publication_photos(owner_id);
