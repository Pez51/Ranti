ALTER TABLE publications
    DROP CONSTRAINT publications_availability_window_check,
    ADD CONSTRAINT publications_availability_window_check CHECK (
        (available_from IS NULL AND available_until IS NULL)
        OR (available_from IS NOT NULL AND (
            (modality='Alquiler' AND available_until IS NULL)
            OR (available_until IS NOT NULL AND available_from < available_until)
        ))
    );
