export function handoffProjection(row, operation, viewer) {
  const owner = viewer === operation.oferente_id;
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
  };
}
