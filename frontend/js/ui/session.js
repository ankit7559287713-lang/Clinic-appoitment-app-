// Demo "login": the active role lives in sessionStorage, so each browser tab
// can act as a different role (useful for the cross-tab conflict demo).
const KEY = 'clinicbook.session';

export function getSession() {
  try { return JSON.parse(sessionStorage.getItem(KEY)) || null; } catch { return null; }
}
export function setSession(session) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(session));
    return true;
  } catch {
    return false;
  }
}
export function updateSession(patch) {
  const s = getSession();
  if (s) setSession({ ...s, ...patch });
}
export function clearSession() {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
}
