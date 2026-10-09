const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export async function apiRequest(path, { token, headers, ...options } = {}) {
  // AUTO-INYECCIÓN DEL TOKEN: Si no se pasa manual, lo busca en la memoria
  let finalToken = token;
  if (!finalToken) {
    try {
      const sessionData = JSON.parse(localStorage.getItem('ranti-session'));
      finalToken = sessionData?.token;
    } catch (e) { /* Ignorar si no hay sesión */ }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(finalToken ? { Authorization: `Bearer ${finalToken}` } : {}),
      ...headers,
    },
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body.error === 'string' ? body.error : body.error?.message;
    const error = new Error(message || 'No se pudo completar la solicitud.');
    error.status = response.status;
    error.code = body.code || body.error?.code;
    error.retryable = body.retryable === true;
    throw error;
  }
  return body;
}