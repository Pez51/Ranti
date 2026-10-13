CREATE TABLE operation_handoffs (
    operation_id uuid PRIMARY KEY REFERENCES operations(id),
    revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
    proposed_by uuid REFERENCES users(id),
    meeting_at timestamptz,
    location text CHECK (length(location) BETWEEN 3 AND 200),
    notes text NOT NULL DEFAULT '' CHECK (length(notes) <= 500),
    agreed_by uuid REFERENCES users(id),
    change_requested boolean NOT NULL DEFAULT false,
    owner_delivered_at timestamptz,
    requester_received_at timestamptz,
    owner_returned_at timestamptz,
    requester_returned_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((revision=0 AND proposed_by IS NULL AND meeting_at IS NULL AND location IS NULL AND agreed_by IS NULL)
        OR (revision>0 AND proposed_by IS NOT NULL AND meeting_at IS NOT NULL AND location IS NOT NULL)),
    CHECK (agreed_by IS NULL OR agreed_by <> proposed_by),
    CHECK ((owner_delivered_at IS NULL AND requester_received_at IS NULL) OR (agreed_by IS NOT NULL AND NOT change_requested)),
    CHECK ((owner_returned_at IS NULL AND requester_returned_at IS NULL) OR (owner_delivered_at IS NOT NULL AND requester_received_at IS NOT NULL))
);
