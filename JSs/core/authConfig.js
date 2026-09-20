// =====================================================================
// Supabase project the extension signs in against.
// ---------------------------------------------------------------------
// Both values are PUBLIC by design — they ship inside the extension and
// anyone can read them. What protects the data is row-level security and
// the revoked grants in learnwise-backend, not secrecy of this key.
//
// ⚠️ NEVER put the service_role key (or any other secret) here.
//
// SUPABASE_ANON_KEY: Supabase dashboard → Project Settings → API Keys →
// the "anon" / "publishable" key. Until it is filled in, sign-in reports
// "not configured" instead of failing mysteriously.
// =====================================================================
export const SUPABASE_URL = "https://jnhlfsgnbskagurrldad.supabase.co";
export const SUPABASE_ANON_KEY = "";
