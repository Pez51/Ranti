CREATE TABLE operation_finance_quotes (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 operation_id uuid NOT NULL REFERENCES operations(id),
 requester_id uuid NOT NULL REFERENCES users(id),
 method text NOT NULL,
 mode text NOT NULL CHECK(mode IN ('simulated','culqi_sandbox')),
 terms_key text NOT NULL,
 tariff_version text NOT NULL,
 tariff_snapshot jsonb NOT NULL,
 economics jsonb NOT NULL,
 public_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL,
 accepted_at timestamptz,
 CHECK(expires_at>created_at)
);
CREATE INDEX finance_quotes_operation ON operation_finance_quotes(operation_id,created_at DESC);
CREATE TABLE operation_finance_payments (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 operation_id uuid NOT NULL UNIQUE REFERENCES operations(id),
 quote_id uuid NOT NULL UNIQUE REFERENCES operation_finance_quotes(id),
 mode text NOT NULL CHECK(mode IN ('simulated','culqi_sandbox')),
 status text NOT NULL CHECK(status IN ('pending','failed','simulated_succeeded','sandbox_succeeded')),
 idempotency_key uuid NOT NULL UNIQUE,
 provider_reference text UNIQUE,
 confirmed_at timestamptz,
 reconciliation jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((status IN ('simulated_succeeded','sandbox_succeeded'))=(confirmed_at IS NOT NULL))
);
CREATE TABLE operation_finance_events (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 payment_id uuid NOT NULL REFERENCES operation_finance_payments(id),
 event_key text NOT NULL UNIQUE,
 kind text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE operation_finance_losses (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 payment_id uuid NOT NULL REFERENCES operation_finance_payments(id),
 kind text NOT NULL CHECK(kind IN ('refund_cost','chargeback_cost')),
 amount_cents bigint NOT NULL CHECK(amount_cents>=0 AND amount_cents<=9999999999),
 reference text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE operation_finance_transfers (
 operation_id uuid PRIMARY KEY REFERENCES operations(id),
 status text NOT NULL DEFAULT 'not_enabled' CHECK(status IN ('not_enabled','blocked','pending','confirmed')),
 mechanism text,
 external_reference text UNIQUE,
 confirmed_at timestamptz,
 CHECK((status='confirmed')=(confirmed_at IS NOT NULL)),
 CHECK(status<>'confirmed' OR (external_reference IS NOT NULL AND mechanism IS NOT NULL))
);
