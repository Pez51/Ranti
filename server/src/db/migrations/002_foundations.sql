ALTER TABLE audit_logs
    ADD COLUMN request_id uuid,
    ADD COLUMN metadata jsonb NOT NULL DEFAULT '{}';

CREATE FUNCTION reject_audit_log_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit_logs is immutable';
END;
$$;

CREATE TRIGGER audit_logs_immutable
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION reject_audit_log_mutation();

CREATE TABLE outbox_events (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    aggregate_type text NOT NULL,
    aggregate_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb NOT NULL,
    deduplication_key text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'processed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at timestamptz NOT NULL DEFAULT now(),
    locked_at timestamptz,
    locked_by text,
    last_error text,
    processed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX outbox_events_pending_idx ON outbox_events (available_at, created_at, id)
    WHERE status = 'pending';
CREATE INDEX outbox_events_expired_lease_idx ON outbox_events (locked_at, id)
    WHERE status = 'processing';
