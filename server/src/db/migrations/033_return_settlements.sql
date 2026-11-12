CREATE TABLE operation_return_settlements (
    operation_id uuid PRIMARY KEY REFERENCES operations(id),
    reference uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    return_notes text NOT NULL,
    inspection_notes text,
    guarantee_cents bigint NOT NULL CHECK (guarantee_cents >= 0),
    payment_method text NOT NULL,
    proposed_cents bigint CHECK (proposed_cents >= 0),
    decided_cents bigint CHECK (decided_cents >= 0),
    decided_at timestamptz,
    buyer_received_at timestamptz,
    owner_received_at timestamptz,
    CHECK ((inspection_notes IS NULL) = (proposed_cents IS NULL)),
    CHECK ((decided_at IS NULL) = (decided_cents IS NULL)),
    CHECK (decided_at IS NOT NULL OR (buyer_received_at IS NULL AND owner_received_at IS NULL))
);

ALTER TABLE incidences DROP CONSTRAINT incidences_resolution_action_check;
ALTER TABLE incidences ADD CONSTRAINT incidences_resolution_action_check
    CHECK (resolution_action IN ('record_only','continue_operation','cancel_operation','settle_guarantee'));
