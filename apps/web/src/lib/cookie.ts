const COOKIE_NAME = 'tbdff_session';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function setSessionCookie() {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE_NAME}=1; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
}

export function clearSessionCookie() {
  document.cookie = `${COOKIE_NAME}=; Path=/; Max-Age=0; SameSite=Lax`;
}
