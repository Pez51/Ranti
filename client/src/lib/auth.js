const SESSION_KEY = 'ranti-session';

export function getSession() {
  const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;

  try {
    const session = JSON.parse(raw);
    return session?.token && session?.user ? session : null;
  } catch {
    clearSession();
    return null;
  }
}

export function saveSession(session, remember) {
  clearSession(false);
  const storage = remember ? localStorage : sessionStorage;
  storage.setItem(SESSION_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event('ranti-auth-changed'));
}

export function clearSession(notify = true) {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  localStorage.removeItem('token');
  if (notify) window.dispatchEvent(new Event('ranti-auth-changed'));
}
