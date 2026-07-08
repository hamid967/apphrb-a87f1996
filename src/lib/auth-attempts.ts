// Client-side failed-attempt tracker used to gate CAPTCHA on /auth and
// /forgot-password. Server-side lockout still lives in `check_login_rate_limit`.

export const CAPTCHA_THRESHOLD = 2;
const PREFIX = "aqari.authFails:";

function key(scope: string) {
  return `${PREFIX}${(scope || "").trim().toLowerCase()}`;
}

export function getFailedAttempts(scope: string): number {
  if (typeof window === "undefined" || !scope) return 0;
  try {
    const n = Number(localStorage.getItem(key(scope)) ?? "0");
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

export function incFailedAttempts(scope: string): number {
  if (typeof window === "undefined" || !scope) return 0;
  const next = getFailedAttempts(scope) + 1;
  try {
    localStorage.setItem(key(scope), String(next));
  } catch {}
  return next;
}

export function resetFailedAttempts(scope: string): void {
  if (typeof window === "undefined" || !scope) return;
  try {
    localStorage.removeItem(key(scope));
  } catch {}
}
