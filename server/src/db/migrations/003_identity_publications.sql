-- Phase 2 identity and publication lifecycle. Existing rows retain their values.
ALTER TABLE users
    ADD COLUMN display_name text,
    ADD COLUMN avatar_url text,
    ADD COLUMN faculty text,
    ADD COLUMN terms_accepted_at timestamptz,
    ADD COLUMN terms_version text,
    ADD COLUMN verified_at timestamptz,
    ADD COLUMN identity_provider text;

CREATE TABLE identity_challenges (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users(id),
    email text NOT NULL CHECK (email = lower(btrim(email)) AND email <> '' AND email !~ '[[:space:]]'),
    purpose text NOT NULL CHECK (btrim(purpose) <> ''),
    provider text NOT NULL CHECK (btrim(provider) <> ''),
    provider_reference text,
    code_hash text,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'sent', 'consumed', 'expired', 'invalidated', 'failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT identity_challenges_consumption_check
        CHECK ((status = 'consumed') = (consumed_at IS NOT NULL))
);

CREATE INDEX identity_challenges_user_status_idx ON identity_challenges (user_id, status);

CREATE TABLE role_requests (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES users(id),
    requested_role user_role NOT NULL DEFAULT 'Estudiante'
        CHECK (requested_role = 'Estudiante'),
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    evidence_ref text NOT NULL
        CHECK (evidence_ref ~ '^https://[^/?#[:space:]]+[^[:space:]]*$'),
    evidence_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
        CHECK (jsonb_typeof(evidence_metadata) = 'object'),
    reviewed_by uuid REFERENCES users(id),
    review_reason text,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT role_requests_decision_check CHECK (
        (status = 'pending' AND reviewed_by IS NULL AND review_reason IS NULL AND reviewed_at IS NULL)
        OR (status IN ('approved', 'rejected') AND reviewed_by IS NOT NULL
            AND review_reason IS NOT NULL AND btrim(review_reason) <> '' AND reviewed_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX role_requests_one_pending_student_per_user_idx
    ON role_requests (user_id) WHERE status = 'pending' AND requested_role = 'Estudiante';

ALTER TABLE publications
    ADD COLUMN risk_policy_version text,
    ADD COLUMN provenance_evidence_ref text,
    ADD COLUMN available_from timestamptz,
    ADD COLUMN available_until timestamptz,
    ADD COLUMN submitted_at timestamptz,
    ADD COLUMN reviewed_by uuid REFERENCES users(id),
    ADD COLUMN review_reason text,
    ADD COLUMN reviewed_at timestamptz,
    ADD COLUMN published_at timestamptz,
    ADD CONSTRAINT publications_availability_window_check
        CHECK ((available_from IS NULL AND available_until IS NULL)
            OR (available_from IS NOT NULL AND available_until IS NOT NULL
                AND available_from < available_until));
