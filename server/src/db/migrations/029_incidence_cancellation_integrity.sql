ALTER TABLE operations ADD CONSTRAINT incidence_cancellation_actor_check
 CHECK(status<>'Cancelada' OR (cancelled_by IS NOT NULL AND
 (cancelled_by=demandante_id OR (incidence_cancelled_by IS NOT NULL AND cancelled_by=incidence_cancelled_by))));
