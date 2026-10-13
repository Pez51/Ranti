ALTER TABLE conversation_messages
    DROP CONSTRAINT conversation_messages_kind_check,
    DROP CONSTRAINT conversation_message_invitation_check,
    ADD COLUMN event_type text,
    ADD COLUMN event_key text,
    ADD CONSTRAINT conversation_messages_kind_check CHECK (kind IN ('text','calendar_invitation','workflow_event')),
    ADD CONSTRAINT conversation_message_invitation_check CHECK (
      (kind='text' AND operation_id IS NULL AND event_type IS NULL AND event_key IS NULL)
      OR (kind='calendar_invitation' AND operation_id IS NOT NULL AND event_type IS NULL AND event_key IS NULL)
      OR (kind='workflow_event' AND operation_id IS NOT NULL AND event_type IS NOT NULL AND event_key IS NOT NULL)
    );
CREATE UNIQUE INDEX conversation_workflow_event_unique
    ON conversation_messages(operation_id,event_key) WHERE kind='workflow_event';
