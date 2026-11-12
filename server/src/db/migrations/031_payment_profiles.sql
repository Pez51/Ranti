CREATE TABLE user_payment_profiles (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    buyer_method text CHECK (buyer_method IN ('tarjeta_prueba', 'yape_prueba', 'plin_prueba')),
    payout_destination text CHECK (payout_destination IN ('banco_prueba', 'yape_prueba', 'plin_prueba')),
    accepted_methods text[] NOT NULL DEFAULT '{}',
    CHECK (accepted_methods <@ ARRAY['tarjeta_prueba', 'yape_prueba', 'plin_prueba']),
    CHECK (payout_destination IS NOT NULL OR cardinality(accepted_methods) = 0)
);
