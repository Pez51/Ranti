import { apiBlob } from '../../lib/api';

export const graduateEndpoint = '/auth/graduates';
export const graduateStates = ['En revisión', 'Pendiente de subsanación', 'Verificado', 'Rechazado'];
export const graduateMedia = { 'Content-Type': 'application/vnd.ranti.accreditation+json' };
export const graduateStatus = value => value === 'Verificado' ? 'Aprobada' : value === 'Rechazado' ? 'Rechazada' : value;
export const graduateDate = value => new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short',
}).format(new Date(value));

export async function graduateEvidence(file) {
  if (!(file instanceof File) || file.type !== 'application/pdf' || !file.size || file.size > 5 * 1024 * 1024) {
    throw new Error('Adjunta una constancia PDF de hasta 5 MB.');
  }
  const content = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
    reader.onerror = () => reject(new Error('No se pudo leer la constancia.'));
    reader.readAsDataURL(file);
  });
  return { name: file.name, content };
}

export async function downloadGraduateEvidence(path, token, name) {
  const blob = await apiBlob(path, { token });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.append(link);
  link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function returnDestination(from) {
  const path = typeof from?.pathname === 'string' ? from.pathname : '';
  const safe = /^\/(?!\/)/.test(path) && !/[\\\s]/.test(path) && !['/login', '/registro', '/acreditacion'].includes(path);
  return safe ? { pathname: path, search: from.search || '', hash: from.hash || '' } : '/perfil';
}
