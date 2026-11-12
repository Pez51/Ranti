export function peruTime(value) {
  return value ? new Date(value).toLocaleString('es-PE', { timeZone: 'America/Lima' }) : '—';
}

export function peruLocalToIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(value)) return null;
  const date = new Date(`${value}-05:00`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
