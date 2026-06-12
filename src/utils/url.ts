// Safely join base URL with path segment
export function joinUrl(base: string, pathSegment: string): string {
  // Remove trailing slash from base
  const cleanBase = base.replace(/\/+$/, '');
  // Remove leading slash from path
  const cleanPath = pathSegment.replace(/^\/+/, '');

  return `${cleanBase}/${cleanPath}`;
}
