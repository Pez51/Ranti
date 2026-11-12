ALTER TABLE operation_finance_quotes ADD CONSTRAINT finance_quote_operation_unique UNIQUE(id,operation_id);
ALTER TABLE operation_finance_payments ADD CONSTRAINT finance_payment_quote_operation_fk
 FOREIGN KEY(quote_id,operation_id) REFERENCES operation_finance_quotes(id,operation_id);
CREATE FUNCTION immutable_finance_quote() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (to_jsonb(NEW)-'accepted_at') IS DISTINCT FROM (to_jsonb(OLD)-'accepted_at')
   OR (OLD.accepted_at IS NOT NULL AND NEW.accepted_at IS DISTINCT FROM OLD.accepted_at) THEN
   RAISE EXCEPTION 'Economic quote snapshots are immutable';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER finance_quote_immutable BEFORE UPDATE ON operation_finance_quotes
 FOR EACH ROW EXECUTE FUNCTION immutable_finance_quote();
