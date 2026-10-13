ALTER TABLE publication_images
    DROP CONSTRAINT publication_images_position_check,
    ADD CONSTRAINT publication_images_position_check CHECK (position BETWEEN 0 AND 6);
