import { apiBlob } from '../../lib/api';

export async function downloadEvidence(path, token, name) {
  const file = await apiBlob(path, { token });
  const url = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
