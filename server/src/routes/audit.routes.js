import express from 'express';
import { z } from 'zod';
import pool from '../config/database.js';
import { requireAuth, requireRole, requireVerifiedAccount } from '../middlewares/auth.middleware.js';
import { appendAudit } from '../modules/audit/audit.repository.js';
import { AppError } from '../shared/errors/app-error.js';

const router = express.Router();
const filters = z.strictObject({
  entity: z.string().trim().max(100).optional(),
  action: z.string().trim().max(100).optional(),
  reference: z.uuid().optional(),
  actor: z.uuid().optional(),
  from: z.iso.date().optional(),
  until: z.iso.date().optional(),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

// Display structured decisions and statuses. The raw audit payload stays private.
const displayFields = ['status','reason_code','revision','risk_level','policy_version','amount_cents',
  'decision','outcome','kind','payment_id','quote_id','reference','owner','buyer','guarantee','excess'];
function summarize(values) {
  return Object.fromEntries(displayFields.filter(key => typeof values?.[key] === 'string' ||
    typeof values?.[key] === 'number').map(key => [key, values[key]]));
}

router.use(requireAuth, requireVerifiedAccount, requireRole('Administrador'));
async function auditView(req, res) {
  const parsed = filters.safeParse(req.query);
  if (!parsed.success || (parsed.data.from && parsed.data.until && parsed.data.from > parsed.data.until)) {
    throw new AppError({status:400,code:'AUDIT_FILTER_INVALID',message:'Revisa los filtros y las fechas de la bitácora.',details:null});
  }
  const query = parsed.data;
  const download = req.path === '/export';
  const size = download ? 500 : 20;
  const { rows } = await pool.query(`SELECT a.id,a.actor_id,u.display_name AS actor_name,a.action,a.entity_type,a.entity_id,
    a.timestamp,a.old_values,a.new_values FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id
    WHERE ($1::text IS NULL OR a.entity_type=$1) AND ($2::text IS NULL OR a.action ILIKE '%'||$2||'%')
      AND ($3::uuid IS NULL OR a.entity_id=$3) AND ($4::uuid IS NULL OR a.actor_id=$4)
      AND ($5::date IS NULL OR a.timestamp >= ($5::date::timestamp AT TIME ZONE 'America/Lima'))
      AND ($6::date IS NULL OR a.timestamp < (($6::date+1)::timestamp AT TIME ZONE 'America/Lima'))
    ORDER BY a.timestamp DESC,a.id LIMIT $7 OFFSET $8`,
  [query.entity||null, query.action||null, query.reference||null, query.actor||null, query.from||null, query.until||null, size+1, query.offset]);
  const items = rows.slice(0,size).map(({old_values,new_values,...row}) => ({
    ...row, before:summarize(old_values), after:summarize(new_values),
  }));
  await appendAudit(pool, {actorId:req.user.id,action:download?'audit.exported':'audit.viewed',
    entityType:'admin-audit',entityId:req.user.id,metadata:{count:items.length}});
  res.set('Cache-Control','private, no-store');
  if (download) res.attachment('ranti-bitacora.json');
  res.json({items,offset:query.offset,has_more:rows.length>size});
}
router.get('/', auditView);
router.get('/export', auditView);
export default router;
