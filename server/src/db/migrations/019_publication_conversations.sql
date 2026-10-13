CREATE TABLE publication_conversations (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    publication_id uuid NOT NULL REFERENCES publications(id),
    owner_id uuid NOT NULL REFERENCES users(id),
    requester_id uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (owner_id <> requester_id),
    UNIQUE(publication_id,requester_id)
);
CREATE TABLE conversation_messages (
    id bigserial PRIMARY KEY,
    conversation_id uuid NOT NULL REFERENCES publication_conversations(id),
    sender_id uuid NOT NULL REFERENCES users(id),
    client_id uuid NOT NULL,
    body text NOT NULL CHECK (length(btrim(body)) BETWEEN 1 AND 1000),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(conversation_id,sender_id,client_id)
);
CREATE INDEX conversation_messages_page ON conversation_messages(conversation_id,id DESC);
CREATE INDEX conversations_owner_inbox ON publication_conversations(owner_id,updated_at DESC);
CREATE INDEX conversations_requester_inbox ON publication_conversations(requester_id,updated_at DESC);
