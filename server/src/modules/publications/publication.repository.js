import pool from '../../config/database.js';

// 1. Catálogo con filtros dinámicos (Buscador)
export const getPublications = async (search, modality, category) => {
  let query = `
    SELECT p.id, p.title, p.category, p.modality, p.price, p.guarantee_amount, 
           pi.image_url as primary_image
    FROM publications p
    LEFT JOIN publication_images pi ON p.id = pi.publication_id AND pi.is_primary = true
    WHERE p.status = 'Activa'
  `;
  const params = [];
  let paramIndex = 1;

  if (search) {
    query += ` AND p.title ILIKE $${paramIndex}`;
    params.push(`%${search}%`);
    paramIndex++;
  }
  if (modality) {
    query += ` AND p.modality = $${paramIndex}`;
    params.push(modality);
    paramIndex++;
  }
  if (category) {
    query += ` AND p.category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  query += ` ORDER BY p.created_at DESC`;
  const { rows } = await pool.query(query, params);
  return rows;
};

// 2. Detalle de publicación y dueño
export const getPublicationById = async (publicationId) => {
  const query = `
    SELECT p.*, u.id as owner_id, u.email, u.reputation_score, u.academic_condition
    FROM publications p
    JOIN users u ON p.owner_id = u.id
    WHERE p.id = $1
  `;
  const { rows } = await pool.query(query, [publicationId]);
  return rows[0];
};

// 3. Imágenes de una publicación
export const getPublicationImages = async (publicationId) => {
  const query = `SELECT image_url, is_primary FROM publication_images WHERE publication_id = $1`;
  const { rows } = await pool.query(query, [publicationId]);
  return rows;
};

// 4. Listar publicaciones propias (Mi Panel)
export const listOwnPublications = async (userId) => {
  const { rows } = await pool.query(
    'SELECT * FROM publications WHERE owner_id = $1 ORDER BY created_at DESC', 
    [userId]
  );
  return rows;
};

// 5. Insertar Publicación (Usa "client" inyectado desde el servicio para la transacción ACID)
export const insertPublication = async (client, pubValues) => {
  const query = `
    INSERT INTO publications (owner_id, title, description, category, condition, modality, price, guarantee_amount, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Activa')
    RETURNING *
  `;
  const { rows } = await client.query(query, pubValues);
  return rows[0];
};

// 6. Insertar Imágenes (Usa "client" inyectado para la transacción)
export const insertPublicationImage = async (client, publicationId, imageUrl, isPrimary) => {
  const query = `
    INSERT INTO publication_images (publication_id, image_url, is_primary)
    VALUES ($1, $2, $3)
  `;
  await client.query(query, [publicationId, imageUrl, isPrimary]);
};

// 7. Cambiar estado de publicación (Validando dueño)
export const updatePublicationStatus = async (pubId, userId, newStatus) => {
  const query = 'UPDATE publications SET status = $1 WHERE id = $2 AND owner_id = $3';
  await pool.query(query, [newStatus, pubId, userId]);
};

// 8. Cambiar estado de publicación (Para Administradores)
export const updatePublicationStatusAdmin = async (pubId, newStatus) => {
  const query = 'UPDATE publications SET status = $1 WHERE id = $2';
  await pool.query(query, [newStatus, pubId]);
};

// 9. Listar revisiones pendientes (Panel Admin)
export const listPendingReviews = async () => {
  const { rows } = await pool.query("SELECT * FROM publications WHERE status = 'En Revisión'");
  return rows;
};