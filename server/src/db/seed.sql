-- server/src/db/seed.sql
-- =====================================================================
-- SCRIPT DE DATA SINTÉTICA PARA DESARROLLO (SEED)
-- Contraseña por defecto para todos los usuarios: 123456
-- =====================================================================

DO $$
DECLARE
    estudiante_id UUID; docente_id UUID; egresado_id UUID;
    p1 UUID; p2 UUID; p3 UUID; p4 UUID; p5 UUID; p6 UUID; p7 UUID; p8 UUID; p9 UUID; p10 UUID;
BEGIN
    -- 1. Crear Usuarios Ficticios (Ignora si ya existen)
    INSERT INTO users (display_name, email, password_hash, role, status, academic_condition, reputation_score)
    VALUES
    ('Lucia Torres', 'ltorres@ucsm.edu.pe', '$2b$10$w09aJtB.qS.l10I4tOqDaeGvV.62hQfB4WpL4sQj2P1pWwH2L3aJq', 'Moderador', 'Activa', 'Administrativo', 5.0),
    ('Marcos Ruiz', 'mruiz@ucsm.edu.pe', '$2b$10$w09aJtB.qS.l10I4tOqDaeGvV.62hQfB4WpL4sQj2P1pWwH2L3aJq', 'Soporte', 'Activa', 'Administrativo', 5.0),
    ('Ana Gomez', 'agomez@estudiante.ucsm.edu.pe', '$2b$10$w09aJtB.qS.l10I4tOqDaeGvV.62hQfB4WpL4sQj2P1pWwH2L3aJq', 'Estudiante', 'Activa', 'Matriculado', 4.8),
    ('Dr. Roberto Silva', 'rsilva@ucsm.edu.pe', '$2b$10$w09aJtB.qS.l10I4tOqDaeGvV.62hQfB4WpL4sQj2P1pWwH2L3aJq', 'Docente', 'Activa', 'Activo', 5.0),
    ('Ing. Carla Vega', 'cvega@ucsm.edu.pe', '$2b$10$w09aJtB.qS.l10I4tOqDaeGvV.62hQfB4WpL4sQj2P1pWwH2L3aJq', 'Egresado', 'Activa', 'Egresado', 4.2)
    ON CONFLICT (email) DO NOTHING;

    -- Capturar IDs
    SELECT id INTO estudiante_id FROM users WHERE email = 'agomez@estudiante.ucsm.edu.pe';
    SELECT id INTO docente_id FROM users WHERE email = 'rsilva@ucsm.edu.pe';
    SELECT id INTO egresado_id FROM users WHERE email = 'cvega@ucsm.edu.pe';

    -- 2. Crear Publicaciones (Solo si el estudiante no tiene publicaciones para evitar duplicar el catálogo)
    IF NOT EXISTS (SELECT 1 FROM publications WHERE owner_id = estudiante_id) THEN

        INSERT INTO publications (owner_id, title, description, category, condition, modality, price, status)
        VALUES (estudiante_id, 'Regla T de Aluminio 60cm', 'Perfecta para dibujo técnico en Arquitectura.', 'Materiales', 'Como nuevo', 'Venta', 25.00, 'Activa') RETURNING id INTO p1;

        INSERT INTO publications (owner_id, title, description, category, condition, modality, price, status)
        VALUES (docente_id, 'Libro: Física Universitaria Sears Zemansky', 'Volumen 1. Lo presto por 1 mes.', 'Libros', 'Aceptable', 'Préstamo', 0.00, 'Activa') RETURNING id INTO p2;

        INSERT INTO publications (owner_id, title, description, category, condition, modality, price, status)
        VALUES (egresado_id, 'Kit Componentes Electrónicos Básicos', 'Incluye Protoboard, jumpers y LEDs.', 'Electrónica', 'Como nuevo', 'Venta', 45.00, 'Activa') RETURNING id INTO p3;

        INSERT INTO publications (owner_id, title, description, category, condition, modality, price, guarantee_amount, status)
        VALUES (estudiante_id, 'Laptop Dell Core i5 (Para trabajos)', 'Se alquila por semana en el campus.', 'Tecnología', 'Buen estado', 'Alquiler', 50.00, 300.00, 'Activa') RETURNING id INTO p4;

        INSERT INTO publications (owner_id, title, description, category, condition, modality, price, guarantee_amount, status)
        VALUES (egresado_id, 'Multímetro Digital Auto-rango', 'Equipo de precisión para laboratorios.', 'Electrónica', 'Buen estado', 'Alquiler', 15.00, 100.00, 'Activa') RETURNING id INTO p5;

        INSERT INTO publications (owner_id, title, description, category, condition, modality, price, status)
        VALUES (estudiante_id, 'Libro: Cálculo de Stewart 8va Ed.', 'Excelente para los primeros semestres.', 'Libros', 'Como nuevo', 'Venta', 120.00, 'Activa') RETURNING id INTO p6;

        INSERT INTO publications (owner_id, title, description, category, condition, modality, price, guarantee_amount, status)
        VALUES (docente_id, 'Proyector Epson PowerLite', 'Para exposiciones y sustentaciones de tesis.', 'Tecnología', 'Buen estado', 'Alquiler', 30.00, 150.00, 'Activa') RETURNING id INTO p7;

        INSERT INTO publications (owner_id, title, description, category, condition, modality, price, status)
        VALUES (docente_id, 'Lentes de Realidad Virtual Meta Quest 2', 'Préstamo exclusivo para proyectos de tesis.', 'Tecnología', 'Como nuevo', 'Préstamo', 0.00, 'Activa') RETURNING id INTO p8;

        INSERT INTO publications (owner_id, title, description, category, condition, modality, price, guarantee_amount, status)
        VALUES (egresado_id, 'Cámara Web Logitech C920 HD', 'Exposiciones virtuales o sustentaciones.', 'Tecnología', 'Buen estado', 'Alquiler', 10.00, 50.00, 'Activa') RETURNING id INTO p9;

        INSERT INTO publications (owner_id, title, description, category, condition, modality, price, status)
        VALUES (estudiante_id, 'Tableta Gráfica Wacom Intuos', 'Viene con lápiz y puntas de repuesto.', 'Tecnología', 'Como nuevo', 'Venta', 180.00, 'Activa') RETURNING id INTO p10;

        -- 3. Insertar Imágenes Seguras
        INSERT INTO publication_images (publication_id, image_url, is_primary, position) VALUES 
        (p1, 'https://placehold.co/600x600/e2e8f0/1e293b.png?text=Regla+T', true, 1),
        (p2, 'https://placehold.co/600x600/e2e8f0/1e293b.png?text=Libro+Fisica', true, 1),
        (p3, 'https://placehold.co/600x600/e2e8f0/1e293b.png?text=Kit+Electronico', true, 1),
        (p4, 'https://placehold.co/600x600/e2e8f0/1e293b.png?text=Laptop+Dell', true, 1),
        (p5, 'https://placehold.co/600x600/e2e8f0/1e293b.png?text=Multimetro', true, 1),
        (p6, 'https://placehold.co/600x600/e2e8f0/1e293b.png?text=Libro+Calculo', true, 1),
        (p7, 'https://placehold.co/600x600/e2e8f0/1e293b.png?text=Proyector+Epson', true, 1),
        (p8, 'https://placehold.co/600x600/e2e8f0/1e293b.png?text=Lentes+VR', true, 1),
        (p9, 'https://placehold.co/600x600/e2e8f0/1e293b.png?text=Camara+Web', true, 1),
        (p10, 'https://placehold.co/600x600/e2e8f0/1e293b.png?text=Tableta+Wacom', true, 1);

    END IF;
END $$;