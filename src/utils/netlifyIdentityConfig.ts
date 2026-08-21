export function getNetlifyIdentityApiUrl(): string | undefined {
  const apiUrl = (import.meta as any).env?.VITE_IDENTITY_API_URL;

  // In production, let the widget auto-detect the current site's Identity endpoint.
  // This avoids baking localhost dev URLs into deployed builds.
  if (!(import.meta as any).env?.DEV) {
    return undefined;
  }

  return apiUrl || undefined;
}
