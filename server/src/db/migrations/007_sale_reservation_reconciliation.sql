-- The runner wraps this file in one transaction. Freeze the rows used by the
-- preflight and backfill so no acceptance or release can race reconciliation.
LOCK TABLE publications, operations, reservations IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
    -- A sale has no interval to disambiguate concurrent commitments. A second
    -- live operation cannot be reconciled safely even if only one has a row.
    IF EXISTS (
        SELECT 1 FROM operations
        WHERE modality = 'Venta'
          AND status IN ('Aceptada', 'Pendiente de pago/garantía', 'Lista para entrega',
            'Entregada/Activa', 'En cierre', 'Pendiente de resolución económica',
            'En incidencia', 'Cancelación en reversión')
        GROUP BY publication_id HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'ambiguous live sale commitments; reconcile before migration 007';
    END IF;

    -- A released row records a real historical transition. Recreating a live
    -- reservation would silently erase that meaning, so require a human fix.
    IF EXISTS (
        SELECT 1 FROM operations o JOIN reservations r ON r.operation_id = o.id
        WHERE o.modality = 'Venta'
          AND o.status IN ('Aceptada', 'Pendiente de pago/garantía', 'Lista para entrega',
            'Entregada/Activa', 'En cierre', 'Pendiente de resolución económica',
            'En incidencia', 'Cancelación en reversión')
          AND r.status = 'Disponible'
    ) THEN
        RAISE EXCEPTION 'live sale has released reservation; reconcile before migration 007';
    END IF;

    IF EXISTS (
        SELECT 1 FROM operations o JOIN reservations r ON r.operation_id = o.id
        WHERE o.modality = 'Venta'
          AND o.status NOT IN ('Aceptada', 'Pendiente de pago/garantía', 'Lista para entrega',
            'Entregada/Activa', 'En cierre', 'Pendiente de resolución económica',
            'En incidencia', 'Cancelación en reversión')
          AND r.status IN ('Bloqueo Provisional', 'Reservada/Bloqueada', 'Activa/En uso')
    ) THEN
        RAISE EXCEPTION 'terminal sale has live reservation; reconcile before migration 007';
    END IF;

    -- A reservation from another operation on the same publication may have a
    -- dated interval. The sale's undated commitment cannot safely coexist.
    IF EXISTS (
        SELECT 1 FROM operations o JOIN reservations r
          ON r.publication_id = o.publication_id AND r.operation_id <> o.id
        WHERE o.modality = 'Venta'
          AND o.status IN ('Aceptada', 'Pendiente de pago/garantía', 'Lista para entrega',
            'Entregada/Activa', 'En cierre', 'Pendiente de resolución económica',
            'En incidencia', 'Cancelación en reversión')
          AND r.status IN ('Bloqueo Provisional', 'Reservada/Bloqueada', 'Activa/En uso')
    ) THEN
        RAISE EXCEPTION 'live sale conflicts with another live reservation; reconcile before migration 007';
    END IF;
END;
$$;

INSERT INTO reservations (publication_id, operation_id, start_date, end_date, status, created_at)
SELECT o.publication_id, o.id, NULL, NULL, 'Reservada/Bloqueada', o.accepted_at
FROM operations o
WHERE o.modality = 'Venta'
  AND o.status IN ('Aceptada', 'Pendiente de pago/garantía', 'Lista para entrega',
    'Entregada/Activa', 'En cierre', 'Pendiente de resolución económica',
    'En incidencia', 'Cancelación en reversión')
  AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.operation_id = o.id);

-- The deferred match triggers in 006 allow operation and reservation rows to
-- move together. Once reserved, the accepted scope must remain fixed even if
-- a transaction would leave the two rows matching again by COMMIT.
CREATE FUNCTION preserve_reserved_operation_scope() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF ROW(NEW.publication_id, NEW.modality, NEW.start_date, NEW.end_date)
       IS DISTINCT FROM
       ROW(OLD.publication_id, OLD.modality, OLD.start_date, OLD.end_date)
       AND EXISTS (SELECT 1 FROM reservations WHERE operation_id = OLD.id) THEN
        RAISE EXCEPTION 'reserved operation scope is immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER operations_reserved_scope_immutable
    BEFORE UPDATE OF publication_id, modality, start_date, end_date ON operations
    FOR EACH ROW EXECUTE FUNCTION preserve_reserved_operation_scope();
