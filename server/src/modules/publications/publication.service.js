import pool from '../../config/database.js';
import { listPendingPublicationReviews, decidePublicationReview } from './publication-review.service.js';
import { writePublication, submitPublicationDraft } from './publication-write.service.js';
import { attachAvailability } from './publication-availability.js';
import { AppError } from '../../shared/errors/app-error.js';

// 1. Obtener catálogo con filtros dinámicos
export const getPublications = async (queryParams) => {
  const { search, modality, category, condition } = queryParams;
  
  let query = `
    SELECT p.id, p.title, p.status, p.category, p.category_other, p.condition_rating, p.modality, p.rental_unit, p.price, p.guarantee_amount,
           pi.image_url as primary_image
    FROM publications p
    LEFT JOIN publication_images pi ON p.id = pi.publication_id AND pi.is_primary = true
    WHERE p.status = 'Activa'
    AND NOT (p.modality='Venta' AND EXISTS(SELECT 1 FROM reservations r WHERE r.publication_id=p.id
      AND r.status IN ('Bloqueo Provisional','Reservada/Bloqueada','Activa/En uso')))
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

  if (condition) {
    query += ` AND p.condition = $${paramIndex}`;
    params.push(condition);
    paramIndex++;
  }

  query += ` ORDER BY p.created_at DESC`;

  const { rows } = await pool.query(query, params);
  return attachAvailability(pool,rows);
};

// 2. Obtener los detalles completos de un equipo
export const getPublicationById = async (publicationId) => {
  // A. Obtener datos del equipo y del dueño
  const pubQuery = `
    SELECT p.*, u.id as owner_id, u.reputation_score AS owner_reputation_score, u.academic_condition,
      u.display_name AS owner_name,u.avatar_url AS owner_photo,u.operations_count AS owner_operations_count
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
  const imgQuery = `SELECT image_url, is_primary FROM publication_images WHERE publication_id = $1 ORDER BY position`;
  const { rows: imgRows } = await pool.query(imgQuery, [publicationId]);

  const publication = pubRows[0];
  delete publication.provenance_evidence_ref;
  publication.images = imgRows;
  publication.owner={id:publication.owner_id,display_name:publication.owner_name,avatar_url:publication.owner_photo,
    reputation_score:publication.owner_reputation_score,operations_count:publication.owner_operations_count};

  return (await attachAvailability(pool,[publication]))[0];
};

// 3. Crear una nueva publicación (Transacción ACID)
export const createPublication = async (publicationData, userId) => {
  return { message: 'Borrador guardado', publication: await writePublication(pool,userId,null,publicationData) };
};

export const listOwnPublications = async (userId) => {
  const { rows } = await pool.query(`SELECT p.*,COALESCE((SELECT json_agg(image_url ORDER BY position)
    FROM publication_images WHERE publication_id=p.id),'[]'::json) AS images
    FROM publications p WHERE owner_id = $1 ORDER BY created_at DESC`, [userId]);
  return attachAvailability(pool,rows,true);
};

export const updatePublication = async (pubId, data, userId) => {
  return writePublication(pool,userId,pubId,data);
};

// Función reutilizable para estados
export const changeStatus = async (pubId, userId, newStatus) => {
  if (newStatus === 'Pendiente de revisión') return submitPublicationDraft(pool,userId,pubId);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const row=(await client.query('SELECT * FROM publications WHERE id=$1 AND owner_id=$2 FOR UPDATE',[pubId,userId])).rows[0];
    if(!row)throw new AppError({status:404,code:'PUBLICATION_NOT_FOUND',message:'Publicación no encontrada.'});
    if(row.status==='Retirada'||(newStatus==='Pausada'&&row.status!=='Activa')||(newStatus==='Activa'&&row.status!=='Pausada'))throw new AppError({status:409,code:'PUBLICATION_CONFLICT',message:'El estado actual no permite esa acción.'});
    if((await client.query("SELECT id FROM reservations WHERE publication_id=$1 AND status IN ('Bloqueo Provisional','Reservada/Bloqueada','Activa/En uso') LIMIT 1",[pubId])).rowCount)throw new AppError({status:409,code:'PUBLICATION_CONFLICT',message:'Hay una reserva o entrega en curso. Gestiona primero la operación asociada.'});
    await client.query('UPDATE publications SET status=$1 WHERE id=$2',[newStatus,pubId]);
    await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  return (await listOwnPublications(userId)).find(row=>row.id===pubId);
};

export const listPendingReviews = (page, adminId) => listPendingPublicationReviews(pool, adminId, page);

export const decideReview = (pubId, decisionData, adminId) => decidePublicationReview(pool, adminId, pubId, decisionData);
