// Derived operational availability, separate from editorial publication status.
// Public responses expose only busy intervals, never participant or meeting data.
export async function attachAvailability(db, publications, ownerView=false) {
  if(!publications.length)return publications;
  const ids=publications.map(row=>row.id);
  const reservations=(await db.query(`SELECT r.publication_id,r.start_date,r.end_date,r.status,o.status AS operation_status
    FROM reservations r JOIN operations o ON o.id=r.operation_id WHERE r.publication_id=ANY($1::uuid[])
    AND r.status IN ('Bloqueo Provisional','Reservada/Bloqueada','Activa/En uso') ORDER BY r.start_date NULLS FIRST`,[ids])).rows;
  const counts=ownerView?(await db.query(`SELECT publication_id,status,count(*)::int AS count FROM operations WHERE publication_id=ANY($1::uuid[]) GROUP BY publication_id,status`,[ids])).rows:[];
  const now=new Date();
  return publications.map(publication=>{
    const busy=reservations.filter(row=>row.publication_id===publication.id);
    const delivered=busy.some(row=>row.status==='Activa/En uso');
    const sale=publication.modality==='Venta';
    const current=busy.some(row=>row.start_date==null||(row.start_date<=now&&now<row.end_date));
    let state=delivered?(sale?'sold':publication.modality==='Alquiler'?'rented':'loaned'):
      sale&&busy.length?'reserved':current?'reserved':busy.length?'future-reservations':'available';
    if(state==='available'&&publication.status!=='Activa')state='unavailable';
    const labels={sold:'Vendido · Entrega confirmada',rented:'Alquilado · En uso',loaned:'Prestado · En uso',reserved:'Reservado · Pendiente de entrega',
      'future-reservations':'Disponible en otros períodos · Tiene reservas',available:'Disponible',unavailable:'No disponible para nuevas solicitudes'};
    return {...publication,availability:{state,label:labels[state],can_request:publication.status==='Activa'&&!(sale&&busy.length),
      intervals:busy.filter(row=>row.start_date).map(row=>({start:row.start_date,end:row.end_date,in_use:row.status==='Activa/En uso'})),
      ...(delivered&&!sale?{return_pending:true}:{})},
      ...(ownerView?{operation_counts:Object.fromEntries(counts.filter(row=>row.publication_id===publication.id).map(row=>[row.status,row.count]))}:{})};
  });
}
