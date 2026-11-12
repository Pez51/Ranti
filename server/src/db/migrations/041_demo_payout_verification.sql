ALTER TABLE user_payment_profiles
    ADD COLUMN payout_status text NOT NULL DEFAULT 'verified_simulation'
        CHECK (payout_status IN ('verified_simulation','pending_simulation','observed_simulation','rejected_simulation'));
