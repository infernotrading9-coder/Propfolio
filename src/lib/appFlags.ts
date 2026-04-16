export const BILLING_ENABLED = false;

export const FREE_ACCESS_MODE = !BILLING_ENABLED;

// Billing is free right now, but auth can still use the real identity provider.
export const EMAIL_PASSWORD_USE_NETLIFY_IDENTITY = true;
