-- Habilitar extensión para generar UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Creación de ENUMs
CREATE TYPE user_role AS ENUM ('Estudiante', 'Egresado', 'Administrador');
CREATE TYPE user_status AS ENUM ('Pendiente de verificación', 'Activa', 'Suspendida');
CREATE TYPE verification_status AS ENUM ('No verificado', 'En revisión', 'Verificado', 'Rechazado');
CREATE TYPE modality_type AS ENUM ('Venta', 'Alquiler', 'Préstamo');
CREATE TYPE publication_status AS ENUM ('Borrador', 'Pendiente de revisión', 'Activa', 'Pausada', 'Retirada');
CREATE TYPE operation_status AS ENUM ('Pendiente', 'Aceptada', 'Pendiente de pago/garantía', 'Lista para entrega', 'Entregada/Activa', 'Cerrada', 'Cancelada', 'En incidencia');
CREATE TYPE reservation_status AS ENUM ('Bloqueo Provisional', 'Reservada/Bloqueada', 'Activa/En uso', 'Disponible');
CREATE TYPE transaction_type AS ENUM ('Cobro', 'Registro de garantía', 'Liberación', 'Reversión', 'Reembolso');
CREATE TYPE transaction_status AS ENUM ('Iniciada', 'Pendiente', 'Aprobada', 'Rechazada');
CREATE TYPE incidence_status AS ENUM ('Abierta', 'Pendiente de subsanación', 'En revisión', 'Resuelta', 'Desestimada');

-- 1. Usuarios
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role NOT NULL,
    academic_condition VARCHAR(100),
    status user_status DEFAULT 'Pendiente de verificación',
    verification_status verification_status DEFAULT 'No verificado',
    reputation_score DECIMAL(3,2) DEFAULT 0.00,
    operations_count INT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Publicaciones
CREATE TABLE publications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    category VARCHAR(100) NOT NULL,
    condition VARCHAR(50) NOT NULL,
    modality modality_type NOT NULL,
    price DECIMAL(10,2),
    guarantee_amount DECIMAL(10,2),
    status publication_status DEFAULT 'Borrador',
    risk_level INT DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Operaciones
CREATE TABLE operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publication_id UUID NOT NULL REFERENCES publications(id),
    demandante_id UUID NOT NULL REFERENCES users(id),
    oferente_id UUID NOT NULL REFERENCES users(id),
    modality modality_type NOT NULL,
    status operation_status DEFAULT 'Pendiente',
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    contract_snapshot JSONB NOT NULL,
    otp_code VARCHAR(6),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. Reservas (Control de Concurrencia)
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    publication_id UUID NOT NULL REFERENCES publications(id),
    operation_id UUID REFERENCES operations(id),
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    status reservation_status DEFAULT 'Bloqueo Provisional',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. Transacciones (Pagos y Garantías)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    operation_id UUID NOT NULL REFERENCES operations(id),
    type transaction_type NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    status transaction_status DEFAULT 'Iniciada',
    external_reference VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Incidencias
CREATE TABLE incidences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES users(id),
    reported_id UUID REFERENCES users(id),
    operation_id UUID REFERENCES operations(id),
    type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    status incidence_status DEFAULT 'Abierta',
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Bitácora de Auditoría (NIST SP 800-92)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID NOT NULL,
    old_values JSONB,
    new_values JSONB,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);