/**
 * Public base path for the deployed studio UI.
 *
 * Next.js automatically applies `basePath` to framework-managed navigation
 * such as <Link>. Raw browser requests (fetch, <img src>, etc.) do not get
 * that treatment, so use `withBasePath()` for those URLs.
 */
export const APP_BASE_PATH = '/website-audit';

export function withBasePath(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;

  // Avoid accidental double-prefixing when a caller already passes a
  // deployment-aware path.
  if (normalized === APP_BASE_PATH || normalized.startsWith(`${APP_BASE_PATH}/`)) {
    return normalized;
  }

  return `${APP_BASE_PATH}${normalized}`;
}
