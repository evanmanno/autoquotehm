// Market-insights agreement. Bump the version whenever the wording changes in
// a way that matters and everyone is asked to agree again on next sign-in.
// The date and version are stored on the account (Supabase auth user
// metadata), so there is a record of who agreed to what and when.
export const DATA_CONSENT_VERSION = '2026-10-14'

export const consentMeta = () => ({
  data_consent_version: DATA_CONSENT_VERSION,
  data_consent_at: new Date().toISOString(),
})

export const hasDataConsent = (user) =>
  user?.user_metadata?.data_consent_version === DATA_CONSENT_VERSION
