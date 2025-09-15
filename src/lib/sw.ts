export function computeServiceWorkerUrl(baseUrl: string): string {
  const base = (baseUrl || '/').trim();
  const normalized = base.endsWith('/') ? base : base + '/';

  // For root path, always return /sw.js
  if (normalized === '/') return '/sw.js';

  // For other paths, return the path + sw.js
  return `${normalized}sw.js`;
}
