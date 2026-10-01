-- Enum values must commit before migration 006 can use them.
ALTER TYPE operation_status ADD VALUE IF NOT EXISTS 'Rechazada';
ALTER TYPE operation_status ADD VALUE IF NOT EXISTS 'Expirada';
ALTER TYPE operation_status ADD VALUE IF NOT EXISTS 'Cancelación en reversión';
