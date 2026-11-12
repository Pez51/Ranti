// A single SQL visibility predicate is shared by all lists and aggregates.
// Neither deadlines nor the other participant's submission reveal hidden content.
export const publishedReviewSql=alias=>`(${alias}.publish_after<=clock_timestamp() OR EXISTS(
 SELECT 1 FROM operation_reviews paired WHERE paired.operation_id=${alias}.operation_id AND paired.author_id<>${alias}.author_id))`;
export async function reputationProjection(db,subject,viewer,offset=0){
 const self=subject===viewer;
 const aggregates=(await db.query(`SELECT r.subject_role,count(*)::int AS count,round(avg(r.person_rating),2) AS score
 FROM operation_reviews r WHERE r.subject_id=$1 AND ${publishedReviewSql('r')} GROUP BY r.subject_role`,[subject])).rows;
 const role=key=>{const row=aggregates.find(r=>r.subject_role===key);return {count:row?.count??0,...(!self?{score:row?Number(row.score):null}:{})};};
 const comments=(await db.query(`SELECT r.id,r.subject_role,r.modality,r.person_comment AS comment,r.created_at,r.author_id,u.display_name AS author_name
 FROM operation_reviews r JOIN users u ON u.id=r.author_id
 WHERE r.subject_id=$1 AND $3::boolean AND r.person_comment<>'' AND ${publishedReviewSql('r')} ORDER BY r.created_at DESC,r.id LIMIT 51 OFFSET $2`,[subject,offset,self])).rows;
 return {is_self:self,reputation:{as_owner:role('owner'),as_requester:role('requester')},received_comments:comments.slice(0,50),comments_offset:offset,comments_has_more:comments.length>50};
}
export async function productReviewProjection(db,id,offset=0){
 const aggregate=(await db.query(`SELECT count(*)::int AS count,round(avg(r.product_rating),2) AS score FROM operation_reviews r
 WHERE r.publication_id=$1 AND r.product_rating IS NOT NULL AND ${publishedReviewSql('r')}`,[id])).rows[0];
 const items=(await db.query(`SELECT r.id,r.product_rating AS rating,r.product_comment AS comment,r.modality,r.created_at,u.display_name AS author_name
 FROM operation_reviews r JOIN users u ON u.id=r.author_id WHERE r.publication_id=$1 AND r.product_rating IS NOT NULL AND ${publishedReviewSql('r')}
 ORDER BY r.created_at DESC,r.id LIMIT 21 OFFSET $2`,[id,offset])).rows;
 return {count:aggregate?.count??0,score:aggregate?.count?Number(aggregate.score):null,items:items.slice(0,20),offset,has_more:items.length>20};
}
