import pool from '../../config/database.js';
import { listPendingPublicationReviews, decidePublicationReview } from './publication-review.service.js';
import { writePublication, submitPublicationDraft } from './publication-write.service.js';
import { attachAvailability } from './publication-availability.js';
import { AppError } from '../../shared/errors/app-error.js';
import { reputationProjection } from '../operations/review-read.js';
import { z } from 'zod';

function publicName(name) {
  const [first, ...other] = (name?.trim() || 'Oferente UCSM').split(/\s+/);
  return [first, ...other.map(part => `${part[0]}.`)].join(' ');
}

// 1. Obtener catálogo con filtros dinámicos
export const getPublications = async (queryParams) => {
  const { search, modality, category, condition, max_price: maxPrice, available_from: from, available_until: until } = queryParams;
  const invalidFilter = () => new AppError({ status: 400, code: 'CATALOG_FILTER_INVALID',
    message: 'Indica un precio máximo válido y, para filtrar por disponibilidad, un período completo.', details: null });
  if (maxPrice !== undefined && (typeof maxPrice !== 'string' || !/^\d{1,8}(?:\.\d{1,2})?$/.test(maxPrice))) throw invalidFilter();
  const day = z.iso.date();
  if ((from !== undefined || until !== undefined) && (!day.safeParse(from).success || !day.safeParse(until).success || from >= until)) throw invalidFilter();
  
  let query = `
    SELECT p.id, p.title, p.status, p.category, p.category_other, p.condition_rating, p.modality, p.rental_unit, p.price, p.guarantee_amount, p.guarantee_required,
           pi.image_url as primary_image
    FROM publications p
    LEFT JOIN publication_images pi ON p.id = pi.publication_id AND pi.is_primary = true
    WHERE p.status = 'Activa'
    AND NOT (p.modality='Venta' AND EXISTS(SELECT 1 FROM reservations r WHERE r.publication_id=p.id
      AND r.status IN ('Bloqueo Provisional','Reservada/Bloqueada','Activa/En uso')))
  `;
  const params = [];
  // Filtro por término de búsqueda (ILIKE para búsqueda insensible a mayúsculas)
  if (search) {
    query += ` AND p.title ILIKE $${params.push(`%${search}%`)}`;
  }
  if (maxPrice !== undefined) {
    query += ` AND COALESCE(p.price,0) <= $${params.push(maxPrice)}::numeric`;
  }
  if (from && until) {
    const start = params.push(`${from}T00:00:00-05:00`);
    const end = params.push(`${until}T00:00:00-05:00`);
    query += ` AND p.modality<>'Venta' AND p.available_from <= $${start}::timestamptz
      AND (p.available_until IS NULL OR p.available_until >= $${end}::timestamptz)
      AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.publication_id=p.id
        AND r.status IN ('Bloqueo Provisional','Reservada/Bloqueada','Activa/En uso')
        AND (r.start_date IS NULL OR (r.status='Activa/En uso' AND r.end_date<=clock_timestamp())
          OR (r.start_date < $${end}::timestamptz AND r.end_date > $${start}::timestamptz)))`;
  }

  // Filtro por modalidad (Venta, Alquiler, Préstamo)
  if (modality) {
    query += ` AND p.modality = $${params.push(modality)}`;
  }

  // Filtro por Categoría / Facultad
  if (category) {
    query += ` AND p.category = $${params.push(category)}`;
  }

  if (condition) {
    query += ` AND p.condition = $${params.push(condition)}`;
  }

  query += ` ORDER BY p.created_at DESC`;

  const { rows } = await pool.query(query, params);
  return attachAvailability(pool,rows);
};

// 2. Obtener los detalles completos de un equipo
export const getPublicationById = async (publicationId) => {
  if (!z.uuid().safeParse(publicationId).success) {
    throw new AppError({status:404,code:'PUBLICATION_NOT_FOUND',message:'Publicación no encontrada.',details:null});
  }
  // A. Obtener datos del equipo y del dueño
  const pubQuery = `
    SELECT p.*, u.id as owner_id, u.academic_condition,
      u.display_name AS owner_name,u.avatar_url AS owner_photo,u.operations_count AS owner_operations_count
    FROM publications p
    JOIN users u ON p.owner_id = u.id
    WHERE p.id = $1 AND p.status='Activa'
  `;
  const { rows: pubRows } = await pool.query(pubQuery, [publicationId]);

  if (pubRows.length === 0) {
    throw new AppError({status:404,code:'PUBLICATION_NOT_FOUND',message:'Publicación no encontrada.',details:null});
  }

  // B. Obtener galería de imágenes asociadas
  const imgQuery = `SELECT image_url, is_primary FROM publication_images WHERE publication_id = $1 ORDER BY position`;
  const { rows: imgRows } = await pool.query(imgQuery, [publicationId]);

  const publication = pubRows[0];
  delete publication.provenance_evidence_ref;
  delete publication.owner_reputation_score;
  delete publication.reviewed_by;
  delete publication.review_reason;
  publication.owner_name=publicName(publication.owner_name);
  publication.images = imgRows;
  publication.owner={id:publication.owner_id,display_name:publication.owner_name,avatar_url:publication.owner_photo,
    operations_count:publication.owner_operations_count};

  return (await attachAvailability(pool,[publication]))[0];
};

export async function getPublicOfferer(id) {
  const missing = () => new AppError({ status: 404, code: 'OFFERER_NOT_FOUND',
    message: 'No se encontró el perfil público de esta publicación.', details: null });
  if (!z.uuid().safeParse(id).success) throw missing();
  const row = (await pool.query(`SELECT u.id,u.display_name,u.academic_condition,u.role,u.created_at,u.operations_count
    FROM publications p JOIN users u ON p.owner_id=u.id
    WHERE p.id=$1 AND p.status='Activa' AND u.status='Activa' AND u.verification_status='Verificado'`, [id])).rows[0];
  if (!row) throw missing();
  const { reputation } = await reputationProjection(pool, row.id, null);
  return { display_name: publicName(row.display_name), academic_condition: row.academic_condition || row.role,
    joined_at: row.created_at, operations_count: row.operations_count, reputation };
}

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
