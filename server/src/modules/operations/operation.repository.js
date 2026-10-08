import pool from '../../config/database.js';

// Usamos "client" (transaccional) o "pool" (consulta simple) dinámicamente
export const findPublicationForUpdate = async (client, publicationId) => {
  const { rows } = await client.query('SELECT * FROM publications WHERE id = $1 FOR UPDATE', [publicationId]);
  return rows[0];
};

export const checkOverlappingReservations = async (client, publicationId, startDate, endDate) => {
  const query = `
    SELECT id FROM reservations 
    WHERE publication_id = $1 
    AND status IN ('Bloqueo Provisional', 'Reservada/Bloqueada', 'Activa/En uso')
    AND (start_date < $3 AND end_date > $2)
  `;
  const { rows } = await client.query(query, [publicationId, startDate, endDate]);
  return rows.length > 0;
};

export const insertOperation = async (client, opData) => {
  const query = `
    INSERT INTO operations 
    (publication_id, demandante_id, oferente_id, modality, status, start_date, end_date, contract_snapshot, otp_code)
    VALUES ($1, $2, $3, $4, 'Pendiente de pago/garantía', $5, $6, $7, $8)
    RETURNING id, status, otp_code
  `;
  const { rows } = await client.query(query, opData);
  return rows[0];
};

export const insertReservation = async (client, resData) => {
  const query = `
    INSERT INTO reservations (publication_id, operation_id, start_date, end_date)
    VALUES ($1, $2, $3, $4)
  `;
  await client.query(query, resData);
};