ALTER TABLE operations
    ADD COLUMN payment_expires_at timestamptz,
    ADD COLUMN payment_expired_at timestamptz,
    ADD CONSTRAINT operations_payment_expiry_check CHECK (
        payment_expired_at IS NULL OR
        (status = 'Expirada' AND payment_expires_at IS NOT NULL AND payment_expires_at <= payment_expired_at)
    );

DO $$
DECLARE previous_check text;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO STRICT previous_check
    FROM pg_constraint
    WHERE conrelid = 'operations'::regclass AND conname = 'operations_state_fields_check';
    ALTER TABLE operations DROP CONSTRAINT operations_state_fields_check;
    EXECUTE 'ALTER TABLE operations ADD CONSTRAINT operations_state_fields_check CHECK (' ||
        substring(previous_check from 7) || $clause$
        OR (
            status = 'Expirada' AND payment_expired_at IS NOT NULL
            AND accepted_at IS NOT NULL AND contract_snapshot IS NOT NULL AND otp_code IS NULL
            AND decided_at IS NOT NULL AND decided_by = oferente_id
            AND decision_reason IS NOT NULL AND cancelled_at IS NULL
            AND cancelled_by IS NULL AND cancellation_reason IS NULL
        ))$clause$;
END;
$$;

CREATE INDEX operation_payment_deadlines ON operations(payment_expires_at, id)
    WHERE status IN ('Aceptada','Pendiente de pago/garantía') AND payment_expires_at IS NOT NULL;

CREATE OR REPLACE FUNCTION check_reservation_operation_match() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op operations%ROWTYPE; row_now reservations%ROWTYPE;
BEGIN
    SELECT * INTO row_now FROM reservations WHERE id=NEW.id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO op FROM operations WHERE id=row_now.operation_id;
    IF NOT FOUND OR row_now.publication_id IS DISTINCT FROM op.publication_id
        OR (op.modality='Venta' AND (row_now.start_date IS NOT NULL OR row_now.end_date IS NOT NULL))
        OR (op.modality<>'Venta' AND (row_now.start_date IS DISTINCT FROM op.start_date OR row_now.end_date IS DISTINCT FROM op.end_date))
        OR op.status IN ('Pendiente','Rechazada')
        OR (op.status='Expirada' AND (op.payment_expired_at IS NULL OR row_now.status<>'Disponible'))
        OR (op.status='Cancelada' AND op.accepted_at IS NULL)
    THEN RAISE EXCEPTION 'reservation must match an accepted operation publication and interval'; END IF;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION check_operation_reservation_match() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op_now operations%ROWTYPE; reservation reservations%ROWTYPE;
BEGIN
    SELECT * INTO op_now FROM operations WHERE id=NEW.id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    FOR reservation IN SELECT * FROM reservations WHERE operation_id=op_now.id LOOP
        IF reservation.publication_id IS DISTINCT FROM op_now.publication_id
            OR (op_now.modality='Venta' AND (reservation.start_date IS NOT NULL OR reservation.end_date IS NOT NULL))
            OR (op_now.modality<>'Venta' AND (reservation.start_date IS DISTINCT FROM op_now.start_date OR reservation.end_date IS DISTINCT FROM op_now.end_date))
            OR op_now.status IN ('Pendiente','Rechazada')
            OR (op_now.status='Expirada' AND (op_now.payment_expired_at IS NULL OR reservation.status<>'Disponible'))
            OR (op_now.status='Cancelada' AND op_now.accepted_at IS NULL)
        THEN RAISE EXCEPTION 'operation no longer matches its reservation publication and interval'; END IF;
    END LOOP;
    RETURN NULL;
END;
$$;

ALTER TABLE operation_return_settlements
    ADD COLUMN return_at timestamptz,
    ADD COLUMN return_location text,
    ADD COLUMN return_accessories_confirmed boolean,
    ADD COLUMN inspected_at timestamptz,
    ADD COLUMN inspection_result text CHECK (inspection_result IN ('conforme','danos','faltantes')),
    ADD COLUMN inspection_accessories_confirmed boolean,
    ADD COLUMN notified_at timestamptz,
    ADD COLUMN inspection_due_at timestamptz,
    ADD COLUMN closed_by_silence boolean NOT NULL DEFAULT false,
    ADD CONSTRAINT silence_requires_zero_retention CHECK (
        NOT closed_by_silence OR (decided_at IS NOT NULL AND decided_cents = 0)
    );

CREATE TABLE operation_return_evidence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operation_id uuid NOT NULL REFERENCES operations(id),
    uploaded_by uuid NOT NULL REFERENCES users(id),
    phase text NOT NULL CHECK (phase IN ('return','inspection')),
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 180),
    mime text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
    bytes bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 1 AND 2097152),
    uploaded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX return_evidence_operation ON operation_return_evidence(operation_id, phase, uploaded_at);

ALTER TABLE incidences
    ADD COLUMN occurred_at timestamptz,
    ADD COLUMN movement_reference text CHECK (length(movement_reference) BETWEEN 1 AND 150),
    ADD COLUMN system_generated boolean NOT NULL DEFAULT false,
    ADD COLUMN guarantee_outcome text CHECK (guarantee_outcome IN ('proceeds','dismissed'));

CREATE UNIQUE INDEX one_automatic_overdue_case ON incidences(operation_id)
    WHERE type = 'late_return' AND system_generated;

CREATE OR REPLACE FUNCTION guard_operation_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op operations%ROWTYPE; handoff operation_handoffs%ROWTYPE;
BEGIN
    SELECT * INTO op FROM operations WHERE id=NEW.operation_id FOR UPDATE;
    SELECT * INTO handoff FROM operation_handoffs WHERE operation_id=op.id;
    IF op.status<>'Cerrada' OR op.accepted_at IS NULL OR op.closed_at IS NULL
        OR handoff.owner_delivered_at IS NULL OR handoff.requester_received_at IS NULL
        OR (op.modality<>'Venta' AND (
            handoff.requester_returned_at IS NULL OR
            (handoff.owner_returned_at IS NULL AND NOT EXISTS(
                SELECT 1 FROM operation_return_settlements WHERE operation_id=op.id AND closed_by_silence
            ))
        ))
        OR EXISTS(SELECT 1 FROM incidences WHERE operation_id=op.id AND status NOT IN ('Resuelta','Desestimada'))
    THEN RAISE EXCEPTION 'Only completed closed operations without pending incidences admit reviews'; END IF;
    IF NOT ((NEW.author_id=op.demandante_id AND NEW.subject_id=op.oferente_id AND NEW.subject_role='owner')
        OR (NEW.author_id=op.oferente_id AND NEW.subject_id=op.demandante_id AND NEW.subject_role='requester'))
        OR NEW.publication_id<>op.publication_id OR NEW.modality<>op.modality
    THEN RAISE EXCEPTION 'Review participants and product must match the operation'; END IF;
    RETURN NEW;
END; $$;
