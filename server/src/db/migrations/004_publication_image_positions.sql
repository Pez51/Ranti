-- Preserve the previous deterministic display order for legacy galleries.
-- A legacy gallery above four images fails this migration atomically rather
-- than silently deleting data; it must be corrected before retrying.
ALTER TABLE publication_images ADD COLUMN position integer;

WITH ordered AS (
    SELECT id, row_number() OVER (
        PARTITION BY publication_id
        ORDER BY is_primary DESC NULLS LAST, created_at, id
    ) - 1 AS position
    FROM publication_images
)
UPDATE publication_images AS image
SET position = ordered.position
FROM ordered
WHERE image.id = ordered.id;

ALTER TABLE publication_images
    ALTER COLUMN position SET NOT NULL,
    ADD CONSTRAINT publication_images_position_check CHECK (position BETWEEN 0 AND 3),
    ADD CONSTRAINT publication_images_publication_position_key UNIQUE (publication_id, position);
