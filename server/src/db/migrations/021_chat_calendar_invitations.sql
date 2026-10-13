ALTER TABLE conversation_messages
    ADD COLUMN kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','calendar_invitation')),
    ADD COLUMN operation_id uuid REFERENCES operations(id),
    ADD CONSTRAINT conversation_message_invitation_check CHECK (
        (kind='text' AND operation_id IS NULL)
        OR (kind='calendar_invitation' AND operation_id IS NOT NULL)
    );
