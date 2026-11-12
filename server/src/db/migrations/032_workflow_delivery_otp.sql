ALTER TABLE operation_handoffs
    ADD COLUMN delivery_otp text CHECK (delivery_otp ~ '^[0-9]{6}$'),
    ADD COLUMN delivery_otp_expires_at timestamptz,
    ADD COLUMN delivery_otp_attempts integer NOT NULL DEFAULT 0 CHECK (delivery_otp_attempts BETWEEN 0 AND 5),
    ADD CHECK ((delivery_otp IS NULL) = (delivery_otp_expires_at IS NULL));
