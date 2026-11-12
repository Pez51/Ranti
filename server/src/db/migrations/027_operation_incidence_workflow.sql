ALTER TABLE operations ADD COLUMN closed_at timestamptz;
UPDATE operations SET closed_at=updated_at WHERE status='Cerrada';
ALTER TABLE incidences ADD COLUMN revision integer NOT NULL DEFAULT 1 CHECK(revision>0);
ALTER TABLE incidences ADD COLUMN stage_at_report text;
ALTER TABLE incidences ADD COLUMN response_requested_from uuid REFERENCES users(id);
ALTER TABLE incidences ADD COLUMN resolved_by uuid REFERENCES users(id);
ALTER TABLE incidences ADD COLUMN resolved_at timestamptz;
ALTER TABLE incidences ADD COLUMN resolution_action text CHECK(resolution_action IN ('record_only','continue_operation','cancel_operation'));
CREATE INDEX incidences_operation_pending ON incidences(operation_id,status);
CREATE TABLE operation_conversation_links (
 operation_id uuid PRIMARY KEY REFERENCES operations(id),
 conversation_id uuid NOT NULL REFERENCES publication_conversations(id)
);
INSERT INTO operation_conversation_links(operation_id,conversation_id)
 SELECT o.id,c.id FROM operations o JOIN publication_conversations c
 ON c.publication_id=o.publication_id AND c.owner_id=o.oferente_id AND c.requester_id=o.demandante_id;
CREATE TABLE incidence_events (
 id bigserial PRIMARY KEY,
 incidence_id uuid NOT NULL REFERENCES incidences(id),
 actor_id uuid NOT NULL REFERENCES users(id),
 kind text NOT NULL CHECK(kind IN ('opened','reply','review','request_information','resolved','evidence')),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 3000),
 status incidence_status NOT NULL,
 decision text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE incidence_evidence (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 incidence_id uuid NOT NULL REFERENCES incidences(id),
 uploaded_by uuid NOT NULL REFERENCES users(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 180),
 mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp','application/pdf')),
 bytes bytea NOT NULL CHECK(octet_length(bytes) BETWEEN 1 AND 5242880),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE FUNCTION incidence_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Incidence history and evidence are append-only'; END; $$;
CREATE TRIGGER incidence_events_immutable BEFORE UPDATE OR DELETE ON incidence_events
 FOR EACH ROW EXECUTE FUNCTION incidence_append_only();
CREATE TRIGGER incidence_evidence_immutable BEFORE UPDATE OR DELETE ON incidence_evidence
 FOR EACH ROW EXECUTE FUNCTION incidence_append_only();

CREATE FUNCTION guard_operation_incidence_close() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('Cerrada','Cancelada','Rechazada','Expirada')
 AND EXISTS(SELECT 1 FROM incidences WHERE operation_id=NEW.id AND status NOT IN ('Resuelta','Desestimada'))
 THEN RAISE EXCEPTION 'Pending incidence prevents operation closure'; END IF;
 IF NEW.status='Cerrada' AND OLD.status<>'Cerrada' THEN NEW.closed_at:=clock_timestamp();
 ELSE NEW.closed_at:=OLD.closed_at; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER operations_incidence_close_guard BEFORE UPDATE ON operations
 FOR EACH ROW EXECUTE FUNCTION guard_operation_incidence_close();
CREATE FUNCTION guard_incidence_transfer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 PERFORM id FROM operations WHERE id=NEW.operation_id FOR UPDATE;
 IF NEW.status IN ('pending','confirmed') AND EXISTS(SELECT 1 FROM incidences
 WHERE operation_id=NEW.operation_id AND status NOT IN ('Resuelta','Desestimada'))
 THEN RAISE EXCEPTION 'Pending incidence prevents disbursement'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER finance_incidence_transfer_guard BEFORE INSERT OR UPDATE ON operation_finance_transfers
 FOR EACH ROW EXECUTE FUNCTION guard_incidence_transfer();
