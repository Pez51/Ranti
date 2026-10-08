import pool from '../../config/database.js';

// 1. Obtener catálogo con filtros dinámicos
export const getPublications = async (queryParams) => {
  const { search, modality, category } = queryParams;
  
  let query = `
    SELECT p.id, p.title, p.category, p.modality, p.price, p.guarantee_amount, 
           pi.image_url as primary_image
    FROM publications p
    LEFT JOIN publication_images pi ON p.id = pi.publication_id AND pi.is_primary = true
    WHERE p.status = 'Activa'
  `;
  const params = [];
  let paramIndex = 1;

  // Filtro por término de búsqueda (ILIKE para búsqueda insensible a mayúsculas)
  if (search) {
    query += ` AND p.title ILIKE $${paramIndex}`;
    params.push(`%${search}%`);
    paramIndex++;
  }

  // Filtro por modalidad (Venta, Alquiler, Préstamo)
  if (modality) {
    query += ` AND p.modality = $${paramIndex}`;
    params.push(modality);
    paramIndex++;
  }

  // Filtro por Categoría / Facultad
  if (category) {
    query += ` AND p.category = $${paramIndex}`;
    params.push(category);
    paramIndex++;
  }

  query += ` ORDER BY p.created_at DESC`;

  const { rows } = await pool.query(query, params);
  return rows;
};

// 2. Obtener los detalles completos de un equipo
export const getPublicationById = async (publicationId) => {
  // A. Obtener datos del equipo y del dueño
  const pubQuery = `
    SELECT p.*, u.id as owner_id, u.email, u.reputation_score, u.academic_condition
    FROM publications p
    JOIN users u ON p.owner_id = u.id
    WHERE p.id = $1
  `;
  const { rows: pubRows } = await pool.query(pubQuery, [publicationId]);

  if (pubRows.length === 0) {
    const error = new Error('Publicación no encontrada.');
    error.statusCode = 404;
    throw error;
  }

  // B. Obtener galería de imágenes asociadas
  const imgQuery = `SELECT image_url, is_primary FROM publication_images WHERE publication_id = $1`;
  const { rows: imgRows } = await pool.query(imgQuery, [publicationId]);

  const publication = pubRows[0];
  publication.images = imgRows;

  return publication;
};

// 3. Crear una nueva publicación (Transacción ACID)
export const createPublication = async (publicationData, userId) => {
  const { title, description, category, condition, modality, price, guarantee_amount, images } = publicationData;

  const client = await pool.connect();

  try {
    // Iniciar transacción: Todo o nada
    await client.query('BEGIN');

    // A. Insertar la publicación principal
    const insertPubQuery = `
      INSERT INTO publications (owner_id, title, description, category, condition, modality, price, guarantee_amount, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Activa')
      RETURNING *
    `;
    const pubValues = [userId, title, description, category, condition, modality, price || null, guarantee_amount || null];
    const newPub = await client.query(insertPubQuery, pubValues);
    const publicationId = newPub.rows[0].id;

    // B. Insertar las imágenes (Si el arreglo contiene URLs)
    if (images && Array.isArray(images) && images.length > 0) {
      const insertImgQuery = `
        INSERT INTO publication_images (publication_id, image_url, is_primary)
        VALUES ($1, $2, $3)
      `;
      for (let i = 0; i < images.length; i++) {
        // La primera imagen del arreglo siempre será la principal (portada)
        await client.query(insertImgQuery, [publicationId, images[i], i === 0]);
      }
    }

    // Confirmar transacción
    await client.query('COMMIT');

    return {
      message: 'Publicación creada exitosamente',
      publication: newPub.rows[0]
    };

  } catch (error) {
    // Si algo falla, revertimos cualquier inserción previa
    await client.query('ROLLBACK');
    if (!error.statusCode) error.statusCode = 500;
    throw error;
  } finally {
    // Siempre liberar el cliente de vuelta al pool
    client.release();
  }
};

export const listOwnPublications = async (userId) => {
  const { rows } = await pool.query('SELECT * FROM publications WHERE owner_id = $1 ORDER BY created_at DESC', [userId]);
  return rows;
};

export const updatePublication = async (pubId, data, userId) => {
  // Aquí iría tu lógica de UPDATE dinámico
  return { message: 'Publicación actualizada' };
};

// Función reutilizable para estados
export const changeStatus = async (pubId, userId, newStatus) => {
  await pool.query('UPDATE publications SET status = $1 WHERE id = $2 AND owner_id = $3', [newStatus, pubId, userId]);
  return { message: `Publicación cambiada a estado: ${newStatus}` };
};

export const listPendingReviews = async () => {
  const { rows } = await pool.query("SELECT * FROM publications WHERE status = 'En Revisión'");
  return rows;
};

export const decideReview = async (pubId, decisionData) => {
  const { approved } = decisionData;
  const status = approved ? 'Activa' : 'Rechazada';
  await pool.query('UPDATE publications SET status = $1 WHERE id = $2', [status, pubId]);
  return { message: `Decisión tomada: ${status}` };
};