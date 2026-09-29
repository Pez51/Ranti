const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export async function apiRequest(path, { token, headers, ...options } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.error || 'No se pudo completar la solicitud.');
  }
  return body;
}
