/**
 * Optional public base path for the Studio.
 *
 * Root-domain production deployments can use no base path. For local/staging
 * environments you can set NEXT_PUBLIC_BASE_PATH=/website-audit (or another
 * single path prefix) without changing application source code.
 *
 * Next.js automatically applies `basePath` to framework-managed navigation
 * such as <Link>. Raw browser requests (fetch, <img src>, etc.) do not get
 * that treatment, so use `withBasePath()` for those URLs.
 */
function normalizeBasePath(value?: string): string {
  const raw = (value ?? '').trim();
  if (!raw || raw === '/') return '';
  const prefixed = raw.startsWith('/') ? raw : `/${raw}`;
  return prefixed.replace(/\/+$/, '');
}

export const APP_BASE_PATH = normalizeBasePath(process.env.NEXT_PUBLIC_BASE_PATH);
export const APP_COOKIE_PATH = APP_BASE_PATH || '/';

export function withBasePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;

  if (!APP_BASE_PATH) return normalized;

  // Avoid accidental double-prefixing when a caller already passes a
  // deployment-aware path.
  if (normalized === APP_BASE_PATH || normalized.startsWith(`${APP_BASE_PATH}/`)) {
    return normalized;
  }

  return `${APP_BASE_PATH}${normalized}`;
}
