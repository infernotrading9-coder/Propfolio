export function extractErrorMessage(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error;

  if (error instanceof Error) {
    return error.message || String(error);
  }

  if (typeof error === 'object') {
    const message =
      (error as any)?.message ||
      (error as any)?.description ||
      (error as any)?.error ||
      (error as any)?.error_description ||
      '';

    if (typeof message === 'string' && message.trim()) {
      return message;
    }

    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  return String(error);
}

export function getFriendlyGoogleAuthError(error?: unknown): string {
  const message = extractErrorMessage(error);

  if (!message) {
    return 'Google authentication failed. Please try again.';
  }

  if (/popup|closed by user|closed window|cancel|canceled|cancelled/i.test(message)) {
    return 'Google sign-in was canceled before it finished.';
  }

  if (/failed to fetch|networkerror|network request failed|load failed|fetch/i.test(message)) {
    return 'Google authentication failed because the auth service could not be reached. This can happen if the site, VPN, firewall, or browser is blocking Netlify Identity.';
  }

  if (/cors|origin|redirect[_ -]?uri|callback/i.test(message)) {
    return 'Google authentication failed because the site URL or OAuth callback configuration does not match the current domain.';
  }

  if (/suspended/i.test(message)) {
    return 'Google authentication failed because the underlying Netlify account is suspended.';
  }

  return `Google authentication failed: ${message}`;
}
