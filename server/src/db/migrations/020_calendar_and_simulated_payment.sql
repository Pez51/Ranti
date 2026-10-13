CREATE TABLE operation_calendar_availability (
    operation_id uuid NOT NULL REFERENCES operations(id),
    user_id uuid NOT NULL REFERENCES users(id),
    slots timestamptz[] NOT NULL DEFAULT '{}',
    location_preference text NOT NULL DEFAULT 'Dentro de la UCSM — lugar por precisar' CHECK (length(location_preference) BETWEEN 3 AND 200),
    skipped boolean NOT NULL DEFAULT false,
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(operation_id,user_id),
    CHECK (cardinality(slots) <= 336),
    CHECK (NOT skipped OR cardinality(slots)=0)
);
CREATE TABLE operation_payment_simulations (
    operation_id uuid PRIMARY KEY REFERENCES operations(id),
    requester_id uuid NOT NULL REFERENCES users(id),
    amount numeric(10,2) NOT NULL CHECK (amount>=0),
    unit_count integer NOT NULL CHECK (unit_count>0),
    created_at timestamptz NOT NULL DEFAULT now()
);
-- Pilot-only cancellation is allowed when there are no real economic movements.
INSERT INTO operation_transition_rules(from_status,to_status,actor_kind,precondition_key,effect_key) VALUES
    ('Pendiente de pago/garantía','Cancelada','requester','pre_economic','release_reservation'),
    ('Lista para entrega','Cancelada','requester','pre_economic','release_reservation');
