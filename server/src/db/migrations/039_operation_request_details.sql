ALTER TABLE operations
    ADD COLUMN request_message text CHECK (length(request_message) BETWEEN 1 AND 500),
    ADD COLUMN requested_meeting_at timestamptz,
    ADD COLUMN requested_meeting_location text CHECK (length(requested_meeting_location) BETWEEN 3 AND 200),
    ADD CONSTRAINT request_meeting_fields_together
        CHECK ((requested_meeting_at IS NULL) = (requested_meeting_location IS NULL));
