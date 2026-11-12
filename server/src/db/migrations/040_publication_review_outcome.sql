ALTER TABLE publications ADD COLUMN review_outcome text
    CHECK (review_outcome IN ('approve','observe','reject'));
