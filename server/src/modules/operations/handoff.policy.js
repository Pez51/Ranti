import { deliveryWindowEnd, otpAttempts } from './workflow-timing.js';

export function handoffProjection(row, operation, viewer) {
  const owner = viewer === operation.oferente_id;
  const otpRequired = Boolean(operation.contract_snapshot?.workflow_payment);
  const expires = otpRequired && operation.status === 'Lista para entrega' && row?.delivery_otp_expires_at > new Date();
  const remaining = otpRequired ? Math.max(0, otpAttempts() - (expires ? row.delivery_otp_attempts : 0)) : null;
  const liveCode = expires && remaining > 0;
  return {
    revision: row?.revision ?? 0, meeting_at: row?.meeting_at ?? null,
    location: row?.location ?? null, notes: row?.notes ?? '',
    proposed_by_you: row?.proposed_by === viewer,
    agreed: Boolean(row?.agreed_by), change_requested: row?.change_requested ?? false,
    your_delivery_confirmed: Boolean(owner ? row?.owner_delivered_at : row?.requester_received_at),
    other_delivery_confirmed: Boolean(owner ? row?.requester_received_at : row?.owner_delivered_at),
    your_return_confirmed: Boolean(owner ? row?.owner_returned_at : row?.requester_returned_at),
    other_return_confirmed: Boolean(owner ? row?.requester_returned_at : row?.owner_returned_at),
    delivered: Boolean(row?.owner_delivered_at && row?.requester_received_at),
    returned: Boolean(row?.owner_returned_at && row?.requester_returned_at),
    is_owner: owner, simulated: true,
    otp_required: otpRequired,
    delivery_code: !owner && liveCode ? row.delivery_otp : null,
    delivery_code_expires_at: expires ? row.delivery_otp_expires_at : null,
    delivery_attempts_remaining: remaining,
    delivery_locked: Boolean(expires && remaining === 0),
    delivery_window_ends_at: otpRequired ? deliveryWindowEnd(row?.meeting_at, operation.end_date) : null,
    delivered_at: row?.owner_delivered_at && row?.requester_received_at ?
      new Date(Math.max(new Date(row.owner_delivered_at).getTime(), new Date(row.requester_received_at).getTime())) : null,
  };
}
