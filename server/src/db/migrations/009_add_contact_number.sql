-- server/src/db/migrations/009_add_contact_number.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_number VARCHAR(20);