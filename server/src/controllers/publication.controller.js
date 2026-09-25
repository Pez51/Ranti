import pool from '../config/database.js';

// Obtener todas las publicaciones (Catálogo Público con Filtros)
export const getPublications = async (req, res) => {
  try {
    const { search, modality, faculty } = req.query;
    
    let query = `
      SELECT p.id, p.title, p.faculty_category, p.modality, p.price, p.guarantee_amount, 
             pi.image_url as primary_image
      FROM publications p
      LEFT JOIN publication_images pi ON p.id = pi.publication_id AND pi.is_primary = true
      WHERE p.status = 'Activa'
    `;
    const params = [];
    let paramIndex = 1;

    // Filtro por término de búsqueda (ILIKE para ignorar mayúsculas/minúsculas)
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

    // Filtro por Facultad / Categoría
    if (faculty) {
      query += ` AND p.faculty_category = $${paramIndex}`;
      params.push(faculty);
      paramIndex++;
    }

    query += ` ORDER BY p.created_at DESC`;

    const { rows } = await pool.query(query, params);
    res.status(200).json(rows);
  } catch (error) {
    console.error('Error obteniendo publicaciones:', error);
    res.status(500).json({ error: 'Error al obtener el catalogo de equipos.' });
  }
};

// Obtener detalle de una publicación específica
export const getPublicationById = async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Obtener datos del equipo y del dueño
    const pubQuery = `
      SELECT p.*, u.id as owner_id, u.email, u.reputation_score, u.academic_condition
      FROM publications p
      JOIN users u ON p.owner_id = u.id
      WHERE p.id = $1
    `;
    const { rows: pubRows } = await pool.query(pubQuery, [id]);

    if (pubRows.length === 0) {
      return res.status(404).json({ error: 'Publicacion no encontrada.' });
    }

    // 2. Obtener galería de imágenes asociadas
    const imgQuery = `SELECT image_url, is_primary FROM publication_images WHERE publication_id = $1`;
    const { rows: imgRows } = await pool.query(imgQuery, [id]);

    const publication = pubRows[0];
    publication.images = imgRows;

    res.status(200).json(publication);
  } catch (error) {
    console.error('Error obteniendo detalle de publicacion:', error);
    res.status(500).json({ error: 'Error al cargar los detalles del equipo.' });
  }
};

// Crear una nueva publicación (Ruta Protegida)
export const createPublication = async (req, res) => {
  const { title, description, category, condition, modality, price, guarantee_amount, images } = req.body;
  // req.user viene del middleware de autenticación (auth.middleware.js)
  const owner_id = req.user.id; 

  const client = await pool.connect();

  try {
    // Iniciar transacción SQL para garantizar que todo se guarde (o nada si hay error)
    await client.query('BEGIN');

    // 1. Insertar la publicación principal
    const insertPubQuery = `
      INSERT INTO publications (owner_id, title, description, faculty_category, condition, modality, price, guarantee_amount, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Activa')
      RETURNING *
    `;
    const pubValues = [owner_id, title, description, category, condition, modality, price, guarantee_amount];
    const newPub = await client.query(insertPubQuery, pubValues);
    const publicationId = newPub.rows[0].id;

    // 2. Insertar las imágenes (si el frontend envía un arreglo de URLs)
    if (images && images.length > 0) {
      const insertImgQuery = `
        INSERT INTO publication_images (publication_id, image_url, is_primary)
        VALUES ($1, $2, $3)
      `;
      for (let i = 0; i < images.length; i++) {
        // La primera imagen del arreglo se marca como principal (portada)
        await client.query(insertImgQuery, [publicationId, images[i], i === 0]);
      }
    }

    // Confirmar transacción (Commit)
    await client.query('COMMIT');

    res.status(201).json({
      message: 'Publicación creada exitosamente',
      publication: newPub.rows[0]
    });
  } catch (error) {
    // Revertir cambios en caso de error (Rollback)
    await client.query('ROLLBACK');
    console.error('Error creando publicación:', error);
    res.status(500).json({ error: 'Error al crear la publicación en la base de datos.' });
  } finally {
    // Liberar la conexión al pool
    client.release();
  }
};