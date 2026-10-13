-- Keep the confirmed listing price separate from the buyer's proposed price.
ALTER TABLE operations ADD COLUMN offered_price numeric(10,2);
ALTER TABLE operations ADD CONSTRAINT operations_offer_price_check CHECK (
    offered_price IS NULL OR (
        modality IN ('Venta', 'Alquiler') AND requested_price IS NOT NULL
        AND offered_price > 0 AND offered_price < requested_price
    )
);

CREATE FUNCTION preserve_operation_offer() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.offered_price IS DISTINCT FROM OLD.offered_price THEN
        RAISE EXCEPTION 'operation offer is immutable; send a new request';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER operations_offer_immutable BEFORE UPDATE ON operations
    FOR EACH ROW EXECUTE FUNCTION preserve_operation_offer();
