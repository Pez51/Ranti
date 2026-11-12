CREATE TABLE operation_test_refunds (
    operation_id uuid PRIMARY KEY REFERENCES operations(id),
    payment_id uuid NOT NULL UNIQUE REFERENCES operation_finance_payments(id),
    incidence_id uuid NOT NULL UNIQUE REFERENCES incidences(id),
    amount_cents bigint NOT NULL CHECK (amount_cents > 0),
    reference uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    received_at timestamptz
);

ALTER TABLE operation_finance_transfers ADD COLUMN participant_received_at timestamptz
    CHECK (participant_received_at IS NULL OR (status = 'confirmed' AND mechanism = 'simulated'));

ALTER TABLE incidences DROP CONSTRAINT incidences_resolution_action_check;
ALTER TABLE incidences ADD CONSTRAINT incidences_resolution_action_check
    CHECK (resolution_action IN ('record_only','continue_operation','cancel_operation','settle_guarantee','refund_payment'));
