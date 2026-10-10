-- server/src/db/migrations/008_add_roles.sql

-- Se usa COMMIT; por si el gestor de migraciones envuelve todo en una transacción 
-- (PostgreSQL requiere que ALTER TYPE se ejecute fuera de un bloque transaccional).
COMMIT;

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Moderador';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Soporte';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Docente';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'Egresado';