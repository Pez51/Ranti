CREATE TABLE operation_reviews (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
 operation_id uuid NOT NULL REFERENCES operations(id),
 author_id uuid NOT NULL REFERENCES users(id),
 subject_id uuid NOT NULL REFERENCES users(id),
 subject_role text NOT NULL CHECK(subject_role IN ('owner','requester')),
 publication_id uuid NOT NULL REFERENCES publications(id),
 modality modality_type NOT NULL,
 person_rating smallint NOT NULL CHECK(person_rating BETWEEN 1 AND 5),
 person_comment text NOT NULL DEFAULT '' CHECK(length(person_comment)<=1000),
 product_rating smallint CHECK(product_rating BETWEEN 1 AND 5),
 product_comment text NOT NULL DEFAULT '' CHECK(length(product_comment)<=1000),
 publish_after timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(operation_id,author_id),
 CHECK(author_id<>subject_id),
 CHECK(product_rating IS NOT NULL OR product_comment=''),
 CHECK(subject_role='owner' OR (product_rating IS NULL AND product_comment=''))
);
CREATE INDEX reviews_subject_role ON operation_reviews(subject_id,subject_role);
CREATE INDEX reviews_product ON operation_reviews(publication_id) WHERE product_rating IS NOT NULL;
CREATE FUNCTION guard_operation_review() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE op operations%ROWTYPE; handoff operation_handoffs%ROWTYPE;
BEGIN
 SELECT * INTO op FROM operations WHERE id=NEW.operation_id FOR UPDATE;
 SELECT * INTO handoff FROM operation_handoffs WHERE operation_id=op.id;
 IF op.status<>'Cerrada' OR op.accepted_at IS NULL OR op.closed_at IS NULL
 OR handoff.owner_delivered_at IS NULL OR handoff.requester_received_at IS NULL
 OR (op.modality<>'Venta' AND (handoff.owner_returned_at IS NULL OR handoff.requester_returned_at IS NULL))
 OR EXISTS(SELECT 1 FROM incidences WHERE operation_id=op.id AND status NOT IN ('Resuelta','Desestimada'))
 THEN RAISE EXCEPTION 'Only completed closed operations without pending incidences admit reviews'; END IF;
 IF NOT ((NEW.author_id=op.demandante_id AND NEW.subject_id=op.oferente_id AND NEW.subject_role='owner')
 OR (NEW.author_id=op.oferente_id AND NEW.subject_id=op.demandante_id AND NEW.subject_role='requester'))
 OR NEW.publication_id<>op.publication_id OR NEW.modality<>op.modality
 THEN RAISE EXCEPTION 'Review participants and product must match the operation'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER operation_reviews_guard BEFORE INSERT ON operation_reviews
 FOR EACH ROW EXECUTE FUNCTION guard_operation_review();
CREATE TRIGGER operation_reviews_immutable BEFORE UPDATE OR DELETE ON operation_reviews
 FOR EACH ROW EXECUTE FUNCTION incidence_append_only();
