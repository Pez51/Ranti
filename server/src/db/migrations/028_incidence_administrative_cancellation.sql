-- Preserve requester-only cancellation, with a separately attributed admin decision.
ALTER TABLE operations ADD COLUMN incidence_cancelled_by uuid REFERENCES users(id);
DO $$
DECLARE previous_definition text; next_definition text;
BEGIN
 SELECT pg_get_constraintdef(oid) INTO previous_definition FROM pg_constraint
 WHERE conrelid='operations'::regclass AND conname='operations_state_fields_check';
 next_definition:=replace(previous_definition,'cancelled_by = demandante_id',
  '(cancelled_by = demandante_id OR cancelled_by = incidence_cancelled_by)');
 IF previous_definition IS NULL OR next_definition=previous_definition THEN
  RAISE EXCEPTION 'Unexpected cancellation constraint; manual review required';
 END IF;
 ALTER TABLE operations DROP CONSTRAINT operations_state_fields_check;
 EXECUTE 'ALTER TABLE operations ADD CONSTRAINT operations_state_fields_check '||next_definition;
END; $$;
