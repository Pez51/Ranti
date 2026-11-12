ALTER TABLE operation_finance_payments
 DROP CONSTRAINT operation_finance_payments_operation_id_key,
 ADD COLUMN superseded_at timestamptz,
 ADD COLUMN demo_authorization_required boolean NOT NULL DEFAULT false,
 ADD COLUMN failure_reason text CHECK (failure_reason IN ('declined','authorization_rejected','authorization_expired','not_executed')),
 ADD CONSTRAINT finance_only_failed_demo_superseded
  CHECK (superseded_at IS NULL OR (mode = 'simulated' AND status = 'failed')),
 ADD CONSTRAINT finance_demo_authorization_pending
  CHECK (NOT demo_authorization_required OR (mode = 'simulated' AND status = 'pending'));

CREATE UNIQUE INDEX finance_one_current_attempt ON operation_finance_payments(operation_id)
 WHERE superseded_at IS NULL;

CREATE TABLE operation_finance_chargebacks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL UNIQUE REFERENCES operation_finance_payments(id),
 external_reference text NOT NULL UNIQUE,
 amount_cents bigint NOT NULL CHECK (amount_cents > 0),
 evidence_deadline timestamptz,
 evidence text NOT NULL,
 opened_by uuid NOT NULL REFERENCES users(id),
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
 recovery text CHECK (recovery IN ('receivable','authorized_offset')),
 resolution_reference text,
 resolution_evidence text,
 resolved_by uuid REFERENCES users(id),
 resolved_at timestamptz,
 CHECK ((status = 'open') = (resolved_at IS NULL)),
 CHECK ((status = 'lost') = (recovery IS NOT NULL))
);

CREATE TABLE operation_finance_movement_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL REFERENCES operation_finance_payments(id),
 movement_key text NOT NULL CHECK (movement_key IN ('payout','refund','guarantee_refund','guarantee_retention')),
 original_reference text NOT NULL,
 verification_reference text NOT NULL,
 outcome text NOT NULL CHECK (outcome IN ('confirmed','not_executed','unknown')),
 evidence text NOT NULL,
 recorded_by uuid NOT NULL REFERENCES users(id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE (payment_id,movement_key,verification_reference)
);
