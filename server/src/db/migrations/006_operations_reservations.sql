-- Freeze all three inputs before reading historical data. The migration runner
-- owns a transaction; SHARE ROW EXCLUSIVE excludes concurrent INSERT/UPDATE/DELETE.
LOCK TABLE publications, operations, reservations IN SHARE ROW EXCLUSIVE MODE;

-- Historical Pendiente rows have a snapshot but no reliable indication of
-- whether the requester merely asked or the owner accepted. Refuse to guess.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM operations WHERE status IS NULL) THEN
        RAISE EXCEPTION 'operations.status has null legacy rows; reconcile before migration 006';
    END IF;
    IF EXISTS (SELECT 1 FROM reservations WHERE status IS NULL) THEN
        RAISE EXCEPTION 'reservations.status has null legacy rows; reconcile before migration 006';
    END IF;
    IF EXISTS (SELECT 1 FROM operations WHERE status = 'Pendiente') THEN
        RAISE EXCEPTION 'ambiguous legacy Pendiente operations; reconcile before migration 006';
    END IF;
    IF EXISTS (SELECT 1 FROM operations WHERE status IN ('Cancelada', 'Rechazada', 'Expirada', 'Cancelación en reversión')) THEN
        RAISE EXCEPTION 'legacy terminal/reversal operations lack decision metadata; reconcile before migration 006';
    END IF;
    IF EXISTS (SELECT 1 FROM operations WHERE
        (modality = 'Venta' AND (start_date IS NOT NULL OR end_date IS NOT NULL))
        OR (modality <> 'Venta' AND (start_date IS NULL OR end_date IS NULL OR start_date >= end_date))) THEN
        RAISE EXCEPTION 'legacy operations have invalid modality/date pairs; reconcile before migration 006';
    END IF;
    IF EXISTS (SELECT 1 FROM reservations WHERE operation_id IS NULL) THEN
        RAISE EXCEPTION 'legacy reservations have null operation_id; reconcile before migration 006';
    END IF;
    IF EXISTS (SELECT 1 FROM reservations GROUP BY operation_id HAVING count(*) > 1) THEN
        RAISE EXCEPTION 'legacy reservations have duplicate operation_id; reconcile before migration 006';
    END IF;
    IF EXISTS (SELECT 1 FROM reservations r JOIN operations o ON o.id = r.operation_id WHERE
        r.publication_id IS DISTINCT FROM o.publication_id
        OR (o.modality = 'Venta' AND (r.start_date IS NOT NULL OR r.end_date IS NOT NULL))
        OR (o.modality <> 'Venta' AND (r.start_date IS NULL OR r.end_date IS NULL
            OR r.start_date >= r.end_date
            OR r.start_date IS DISTINCT FROM o.start_date OR r.end_date IS DISTINCT FROM o.end_date))) THEN
        RAISE EXCEPTION 'legacy reservation publication/modality/interval mismatch; reconcile before migration 006';
    END IF;
    IF EXISTS (SELECT 1 FROM reservations a JOIN reservations b
        ON a.publication_id = b.publication_id AND a.id < b.id
        WHERE a.status IN ('Bloqueo Provisional', 'Reservada/Bloqueada', 'Activa/En uso')
          AND b.status IN ('Bloqueo Provisional', 'Reservada/Bloqueada', 'Activa/En uso')
          AND ((a.start_date IS NULL AND b.start_date IS NULL)
            OR (a.start_date IS NOT NULL AND b.start_date IS NOT NULL
              AND a.start_date < b.end_date AND b.start_date < a.end_date))) THEN
        RAISE EXCEPTION 'legacy live reservations overlap or double-book a sale; reconcile before migration 006';
    END IF;
END;
$$;

CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE publications ADD COLUMN contract_version bigint NOT NULL DEFAULT 1
    CHECK (contract_version > 0);

CREATE FUNCTION bump_publication_contract_version() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.title, NEW.description, NEW.category, NEW.condition, NEW.modality,
        NEW.price, NEW.guarantee_amount, NEW.available_from, NEW.available_until)
       IS DISTINCT FROM
       ROW(OLD.title, OLD.description, OLD.category, OLD.condition, OLD.modality,
        OLD.price, OLD.guarantee_amount, OLD.available_from, OLD.available_until) THEN
        NEW.contract_version := OLD.contract_version + 1;
    ELSE
        NEW.contract_version := OLD.contract_version;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER publications_contract_version_update
    BEFORE UPDATE ON publications
    FOR EACH ROW EXECUTE FUNCTION bump_publication_contract_version();

ALTER TABLE operations
    ALTER COLUMN contract_snapshot DROP NOT NULL,
    ALTER COLUMN status SET NOT NULL,
    ADD COLUMN requested_price numeric(10,2),
    ADD COLUMN requested_guarantee_amount numeric(10,2),
    ADD COLUMN requested_contract_version bigint,
    ADD COLUMN request_expires_at timestamptz,
    ADD COLUMN accepted_at timestamptz,
    ADD COLUMN decided_at timestamptz,
    ADD COLUMN decided_by uuid REFERENCES users(id),
    ADD COLUMN decision_reason text,
    ADD COLUMN cancelled_at timestamptz,
    ADD COLUMN cancelled_by uuid REFERENCES users(id),
    ADD COLUMN cancellation_reason text;

-- Accepted and later legacy rows were already direct-to-contract transactions.
-- Snapshot economics win when present; current publication economics are the
-- documented fallback because the old snapshot did not require these keys.
UPDATE operations o SET
    requested_price = COALESCE((o.contract_snapshot->>'agreed_price')::numeric,
        (o.contract_snapshot->>'price')::numeric, p.price),
    requested_guarantee_amount = COALESCE((o.contract_snapshot->>'guarantee_amount')::numeric,
        p.guarantee_amount),
    requested_contract_version = p.contract_version,
    request_expires_at = o.created_at + interval '48 hours',
    accepted_at = o.created_at,
    decided_at = o.created_at,
    decided_by = o.oferente_id
FROM publications p WHERE p.id = o.publication_id;

ALTER TABLE operations
    ADD CONSTRAINT operations_requested_version_check CHECK
        (requested_contract_version IS NOT NULL AND requested_contract_version > 0
            AND request_expires_at IS NOT NULL),
    ADD CONSTRAINT operations_requested_economics_check CHECK
        ((requested_price IS NULL OR requested_price >= 0)
            AND (requested_guarantee_amount IS NULL OR requested_guarantee_amount >= 0)),
    ADD CONSTRAINT operations_dates_check CHECK
        ((modality = 'Venta' AND start_date IS NULL AND end_date IS NULL)
            OR (modality <> 'Venta' AND start_date IS NOT NULL AND end_date IS NOT NULL
                AND start_date < end_date)),
    ADD CONSTRAINT operations_decision_reason_check CHECK
        (decision_reason IS NULL OR btrim(decision_reason) <> ''),
    ADD CONSTRAINT operations_cancellation_reason_check CHECK
        (cancellation_reason IS NULL OR btrim(cancellation_reason) <> ''),
    ADD CONSTRAINT operations_state_fields_check CHECK (
        (status = 'Pendiente'
            AND contract_snapshot IS NULL AND otp_code IS NULL
            AND accepted_at IS NULL AND decided_at IS NULL AND decided_by IS NULL
            AND decision_reason IS NULL AND cancelled_at IS NULL AND cancelled_by IS NULL
            AND cancellation_reason IS NULL)
        OR (status = 'Aceptada'
            AND contract_snapshot IS NOT NULL AND accepted_at IS NOT NULL
            AND decided_at IS NOT NULL AND decided_by IS NOT NULL AND decided_by = oferente_id
            AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL)
        OR (status = 'Rechazada'
            AND contract_snapshot IS NULL AND otp_code IS NULL AND accepted_at IS NULL
            AND decided_at IS NOT NULL AND decided_by IS NOT NULL AND decided_by = oferente_id
            AND decision_reason IS NOT NULL AND cancelled_at IS NULL AND cancelled_by IS NULL
            AND cancellation_reason IS NULL)
        OR (status = 'Expirada'
            AND contract_snapshot IS NULL AND otp_code IS NULL AND accepted_at IS NULL
            AND decided_at IS NOT NULL AND decided_by IS NULL
            AND decision_reason IS NOT NULL AND cancelled_at IS NULL AND cancelled_by IS NULL
            AND cancellation_reason IS NULL)
        OR (status = 'Cancelada'
            AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancelled_by = demandante_id
            AND cancellation_reason IS NOT NULL AND (
                (accepted_at IS NULL AND contract_snapshot IS NULL AND otp_code IS NULL
                    AND decided_at IS NULL AND decided_by IS NULL AND decision_reason IS NULL)
                OR (accepted_at IS NOT NULL AND contract_snapshot IS NOT NULL
                    AND decided_at IS NOT NULL AND decided_by IS NOT NULL AND decided_by = oferente_id)))
        OR (status = 'Cancelación en reversión'
            AND accepted_at IS NOT NULL AND contract_snapshot IS NOT NULL
            AND decided_at IS NOT NULL AND decided_by IS NOT NULL AND decided_by = oferente_id
            AND cancelled_at IS NOT NULL AND cancelled_by IS NOT NULL AND cancelled_by = demandante_id
            AND cancellation_reason IS NOT NULL)
        OR (status IN ('Pendiente de pago/garantía', 'Lista para entrega',
            'Entregada/Activa', 'En cierre', 'Pendiente de resolución económica',
            'Cerrada', 'En incidencia')
            AND accepted_at IS NOT NULL AND contract_snapshot IS NOT NULL
            AND decided_at IS NOT NULL AND decided_by IS NOT NULL AND decided_by = oferente_id
            AND cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL)
    ),
    ADD CONSTRAINT operations_id_publication_key UNIQUE (id, publication_id);

CREATE FUNCTION preserve_operation_contract_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.contract_snapshot IS NOT NULL
       AND NEW.contract_snapshot IS DISTINCT FROM OLD.contract_snapshot THEN
        RAISE EXCEPTION 'accepted contract snapshot is immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER operations_contract_snapshot_immutable
    BEFORE UPDATE ON operations
    FOR EACH ROW EXECUTE FUNCTION preserve_operation_contract_snapshot();

ALTER TABLE reservations
    ALTER COLUMN operation_id SET NOT NULL,
    ALTER COLUMN start_date DROP NOT NULL,
    ALTER COLUMN end_date DROP NOT NULL,
    ALTER COLUMN status SET NOT NULL,
    ADD COLUMN released_at timestamptz,
    ADD COLUMN release_reason text;

-- The old schema recorded Disponible but did not record its release event.
UPDATE reservations SET released_at = created_at,
    release_reason = 'legacy_status_backfill' WHERE status = 'Disponible';

ALTER TABLE reservations
    ADD CONSTRAINT reservations_operation_key UNIQUE (operation_id),
    ADD CONSTRAINT reservations_operation_publication_fkey
        FOREIGN KEY (operation_id, publication_id)
        REFERENCES operations (id, publication_id),
    ADD CONSTRAINT reservations_date_pair_check CHECK
        ((start_date IS NULL AND end_date IS NULL)
            OR (start_date IS NOT NULL AND end_date IS NOT NULL AND start_date < end_date)),
    ADD CONSTRAINT reservations_release_check CHECK
        ((status = 'Disponible' AND released_at IS NOT NULL
            AND release_reason IS NOT NULL AND btrim(release_reason) <> '')
            OR (status <> 'Disponible' AND released_at IS NULL AND release_reason IS NULL));

-- A deferred constraint trigger observes the final transaction state, allowing
-- an operation and its reservation to be transitioned in either statement order.
CREATE FUNCTION check_reservation_operation_match() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    op operations%ROWTYPE;
    row_now reservations%ROWTYPE;
BEGIN
    SELECT * INTO row_now FROM reservations WHERE id = NEW.id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO op FROM operations WHERE id = row_now.operation_id;
    IF NOT FOUND OR row_now.publication_id IS DISTINCT FROM op.publication_id
       OR (op.modality = 'Venta' AND (row_now.start_date IS NOT NULL OR row_now.end_date IS NOT NULL))
       OR (op.modality <> 'Venta' AND (row_now.start_date IS DISTINCT FROM op.start_date
            OR row_now.end_date IS DISTINCT FROM op.end_date))
       OR op.status IN ('Pendiente', 'Rechazada', 'Expirada')
       OR (op.status = 'Cancelada' AND op.accepted_at IS NULL) THEN
        RAISE EXCEPTION 'reservation must match an accepted operation publication and interval';
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER reservations_operation_match
    AFTER INSERT OR UPDATE ON reservations
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_reservation_operation_match();

CREATE FUNCTION check_operation_reservation_match() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
    reservation reservations%ROWTYPE;
BEGIN
    FOR reservation IN SELECT * FROM reservations WHERE operation_id = NEW.id LOOP
        IF reservation.publication_id IS DISTINCT FROM NEW.publication_id
           OR (NEW.modality = 'Venta' AND (reservation.start_date IS NOT NULL OR reservation.end_date IS NOT NULL))
           OR (NEW.modality <> 'Venta' AND (reservation.start_date IS DISTINCT FROM NEW.start_date
                OR reservation.end_date IS DISTINCT FROM NEW.end_date))
           OR NEW.status IN ('Pendiente', 'Rechazada', 'Expirada')
           OR (NEW.status = 'Cancelada' AND NEW.accepted_at IS NULL) THEN
            RAISE EXCEPTION 'operation no longer matches its reservation publication and interval';
        END IF;
    END LOOP;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER operations_reservation_match
    AFTER UPDATE OF publication_id, modality, start_date, end_date, status ON operations
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION check_operation_reservation_match();

CREATE UNIQUE INDEX reservations_one_live_sale_per_publication
    ON reservations (publication_id)
    WHERE start_date IS NULL
      AND status IN ('Bloqueo Provisional', 'Reservada/Bloqueada', 'Activa/En uso');

ALTER TABLE reservations ADD CONSTRAINT reservations_live_interval_exclusion
    EXCLUDE USING gist (publication_id WITH =, tstzrange(start_date, end_date, '[)') WITH &&)
    WHERE (start_date IS NOT NULL
       AND status IN ('Bloqueo Provisional', 'Reservada/Bloqueada', 'Activa/En uso'));

CREATE TABLE operation_transition_rules (
    from_status operation_status NOT NULL,
    to_status operation_status NOT NULL,
    actor_kind text NOT NULL CHECK (actor_kind IN ('owner', 'requester', 'system')),
    precondition_key text NOT NULL CHECK (btrim(precondition_key) <> ''),
    effect_key text NOT NULL CHECK (btrim(effect_key) <> ''),
    PRIMARY KEY (from_status, to_status, actor_kind, precondition_key)
);

INSERT INTO operation_transition_rules
    (from_status, to_status, actor_kind, precondition_key, effect_key) VALUES
    ('Pendiente', 'Aceptada', 'owner', 'request_available', 'create_reservation'),
    ('Pendiente', 'Rechazada', 'owner', 'pending_request', 'no_reservation'),
    ('Pendiente', 'Rechazada', 'owner', 'publication_invalidated', 'no_reservation'),
    ('Pendiente', 'Cancelada', 'requester', 'pending_request', 'no_reservation'),
    ('Pendiente', 'Expirada', 'system', 'expired_request', 'no_reservation'),
    ('Aceptada', 'Cancelada', 'requester', 'pre_economic', 'release_reservation'),
    ('Pendiente de pago/garantía', 'Cancelación en reversión', 'requester', 'pre_delivery', 'retain_reservation'),
    ('Lista para entrega', 'Cancelación en reversión', 'requester', 'pre_delivery', 'retain_reservation');
