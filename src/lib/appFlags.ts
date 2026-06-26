export const BILLING_ENABLED = false;

export const FREE_ACCESS_MODE = !BILLING_ENABLED;

// Billing is free right now, but auth can still use the real identity provider.
export const EMAIL_PASSWORD_USE_NETLIFY_IDENTITY = true;

const browserAuthDebugEnabled = (() => {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('authDebug') === '1') return true;
    return window.localStorage.getItem('propfolio_auth_debug') === '1';
  } catch {
    return false;
  }
})();

// Temporary production auth debugging switch. Turn on when debugging auth/live issues.
export const AUTH_DEBUG_PANEL_ENABLED = browserAuthDebugEnabled;
