import { apiBlob } from '../../lib/api';

export const arcoRights = [
  ['Acceso', 'Acceso', 'Solicitar una copia de mis datos'],
  ['Rectificacion', 'Rectificación', 'Corregir datos inexactos'],
  ['Cancelacion', 'Cancelación', 'Solicitar la eliminación de mis datos'],
  ['Oposicion', 'Oposición', 'Oponerme a un uso específico'],
];
export const reviewStates = ['En revisión', 'Pendiente de subsanación', 'Atendida', 'Parcialmente atendida', 'Rechazada'];
export const isResolved = status => reviewStates.slice(2).includes(status);
export const rightLabel = type => arcoRights.find(right => right[0] === type)?.[1] ?? type;
export const formatDate = value => value ? new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima', dateStyle: 'medium',
}).format(new Date(value.length === 10 ? `${value}T12:00:00-05:00` : value)) : 'Por confirmar';

export async function encodeEvidence(file) {
  if (!file || !file.name) return undefined;
  const limit = file.type === 'application/pdf' ? 5 : 2;
  if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type) || !file.size || file.size > limit * 1024 * 1024) {
    throw new Error('Adjunta un PDF de hasta 5 MB o una imagen JPEG, PNG o WebP de hasta 2 MB.');
  }
  const content = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1]);
    reader.onerror = () => reject(new Error('No se pudo leer el sustento adjunto.'));
    reader.readAsDataURL(file);
  });
  return { name: file.name, type: file.type, content };
}

export async function downloadArco(path, token, name) {
  const blob = await apiBlob(path, { token });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
