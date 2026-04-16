export const BILLING_ENABLED = false;

export const FREE_ACCESS_MODE = !BILLING_ENABLED;

// Billing is free right now, but auth can still use the real identity provider.
export const EMAIL_PASSWORD_USE_NETLIFY_IDENTITY = true;

// Temporary production auth debugging switch. Turn on when debugging auth/live issues.
export const AUTH_DEBUG_PANEL_ENABLED = false;
