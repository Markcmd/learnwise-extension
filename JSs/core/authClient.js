// =====================================================================
// Auth client — email one-time-code sign-in against Supabase Auth
// ---------------------------------------------------------------------
// Talks to the Supabase Auth REST endpoints directly with fetch() — no
// supabase-js dependency (smaller bundle, no remote code, nothing new in
// the service worker but a few HTTP calls).
//
// Why a CODE and not a magic LINK: a link opens in the user's mail client
// / a normal tab, outside the extension, and would need a redirect back
// into the extension (chrome.identity + a chromiumapp.org callback). A
// 6-digit code is typed straight into the settings page, needs no redirect
// and no extra permission, and still proves the user owns the inbox —
// which is the whole point (see learnwise-backend decision 2026-09-20:
// trials are only issued once the email is confirmed).
//
// Pure except for the injected `fetchImpl`, so it is unit-testable in Node.
// =====================================================================

/** Error kinds the UI knows how to explain. */
export const AUTH_ERROR = {
  NOT_CONFIGURED: "not_configured",
  INVALID_EMAIL: "invalid_email",
  INVALID_CODE: "invalid_code", // wrong or expired — Supabase does not tell them apart
  RATE_LIMITED: "rate_limited",
  SIGNUP_DISABLED: "signup_disabled",
  SESSION_EXPIRED: "session_expired", // refresh token rejected → must sign in again
  NOT_SIGNED_IN: "not_signed_in",
  NETWORK: "network",
  SERVER: "server",
  UNKNOWN: "unknown",
};

export class AuthError extends Error {
  /**
   * @param {string} kind one of AUTH_ERROR
   * @param {string} message developer-facing detail (never shown verbatim)
   * @param {{status?: number, code?: string, retryAfterSec?: number}} [extra]
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = "AuthError";
    this.kind = kind;
    this.status = extra.status;
    this.code = extra.code;
    this.retryAfterSec = extra.retryAfterSec;
  }
}

const REQUEST_TIMEOUT_MS = 15000;

// Deliberately loose: the server is the real validator. This only catches
// obvious typos before we spend one of the (rate-limited) emails.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Trim + lowercase an email the user typed; null if it can't be an email. */
export function normalizeEmailInput(raw) {
  const s = String(raw ?? "").trim().toLowerCase();
  return EMAIL_RE.test(s) && s.length <= 254 ? s : null;
}

/** Strip spaces/dashes from a pasted code; null unless 6–10 digits. */
export function normalizeCodeInput(raw) {
  const s = String(raw ?? "").replace(/[\s-]/g, "");
  return /^\d{6,10}$/.test(s) ? s : null;
}

/**
 * Turn a Supabase Auth token response into our session shape.
 * @returns {{accessToken:string, refreshToken:string, expiresAt:number, user:{id:string, email:string|null}}}
 */
export function toSession(json, nowMs) {
  if (!json || !json.access_token || !json.refresh_token) {
    throw new AuthError(AUTH_ERROR.SERVER, "token response missing access_token / refresh_token");
  }
  const expiresAt =
    typeof json.expires_at === "number"
      ? json.expires_at * 1000
      : nowMs + (Number(json.expires_in) || 3600) * 1000;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt,
    user: { id: json.user?.id ?? null, email: json.user?.email ?? null },
  };
}

/**
 * Classify a failed Supabase Auth response. Supabase has used two error
 * body shapes over time — `{code, error_code, msg}` and
 * `{error, error_description}` — so we read both.
 */
export function classifyAuthError(status, body, context) {
  const code = String(body?.error_code || body?.error || "").toLowerCase();
  const msg = String(body?.msg || body?.error_description || body?.message || "");
  const extra = { status, code };

  const retry = /after (\d+) seconds?/i.exec(msg);
  if (status === 429 || code.startsWith("over_") || /rate limit/i.test(msg)) {
    return new AuthError(AUTH_ERROR.RATE_LIMITED, msg || "rate limited", {
      ...extra,
      retryAfterSec: retry ? Number(retry[1]) : undefined,
    });
  }
  if (context === "refresh" && (status === 400 || status === 401 || status === 403 || status === 404)) {
    // invalid_grant, refresh_token_not_found, refresh_token_already_used,
    // session_not_found, session_expired … all mean "sign in again".
    return new AuthError(AUTH_ERROR.SESSION_EXPIRED, msg || code || "refresh rejected", extra);
  }
  if (code === "otp_expired" || (context === "verify" && (status === 400 || status === 401 || status === 403))) {
    return new AuthError(AUTH_ERROR.INVALID_CODE, msg || "invalid or expired code", extra);
  }
  if (code === "email_address_invalid" || code === "validation_failed" || /invalid.*email|email.*invalid/i.test(msg)) {
    return new AuthError(AUTH_ERROR.INVALID_EMAIL, msg || "invalid email", extra);
  }
  if (code === "signup_disabled" || code === "otp_disabled" || /signups? not allowed/i.test(msg)) {
    return new AuthError(AUTH_ERROR.SIGNUP_DISABLED, msg || "sign-up disabled", extra);
  }
  if (status >= 500) return new AuthError(AUTH_ERROR.SERVER, msg || `HTTP ${status}`, extra);
  return new AuthError(AUTH_ERROR.UNKNOWN, msg || `HTTP ${status}`, extra);
}

/**
 * @param {{url:string, anonKey:string, fetchImpl?:Function, now?:()=>number, timeoutMs?:number}} cfg
 */
export function createAuthClient({ url, anonKey, fetchImpl, now = Date.now, timeoutMs = REQUEST_TIMEOUT_MS }) {
  const doFetch = fetchImpl || ((...a) => globalThis.fetch(...a));
  const base = String(url || "").replace(/\/+$/, "");

  function assertConfigured() {
    if (!base || !anonKey) {
      throw new AuthError(AUTH_ERROR.NOT_CONFIGURED, "SUPABASE_URL / SUPABASE_ANON_KEY not set in core/authConfig.js");
    }
  }

  async function call(path, { body, accessToken, context }) {
    assertConfigured();
    const headers = { apikey: anonKey, "Content-Type": "application/json" };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
    let res;
    try {
      res = await doFetch(`${base}${path}`, {
        method: "POST",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctrl?.signal,
      });
    } catch (e) {
      throw new AuthError(AUTH_ERROR.NETWORK, String(e?.message || e));
    } finally {
      if (timer) clearTimeout(timer);
    }

    let json = null;
    const text = await res.text().catch(() => "");
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!res.ok) throw classifyAuthError(res.status, json, context);
    return json;
  }

  return {
    /** Ask Supabase to email a one-time code. Creates the account on first use. */
    async sendEmailCode(rawEmail) {
      const email = normalizeEmailInput(rawEmail);
      if (!email) throw new AuthError(AUTH_ERROR.INVALID_EMAIL, "not an email address");
      await call("/auth/v1/otp", { body: { email, create_user: true }, context: "otp" });
      return { email };
    },

    /** Exchange the emailed code for a session. This is what confirms the email. */
    async verifyEmailCode(rawEmail, rawCode) {
      const email = normalizeEmailInput(rawEmail);
      if (!email) throw new AuthError(AUTH_ERROR.INVALID_EMAIL, "not an email address");
      const token = normalizeCodeInput(rawCode);
      if (!token) throw new AuthError(AUTH_ERROR.INVALID_CODE, "code must be 6–10 digits");
      const json = await call("/auth/v1/verify", { body: { type: "email", email, token }, context: "verify" });
      return toSession(json, now());
    },

    /** Trade a refresh token for a fresh session (refresh tokens rotate). */
    async refresh(refreshToken) {
      if (!refreshToken) throw new AuthError(AUTH_ERROR.NOT_SIGNED_IN, "no refresh token");
      const json = await call("/auth/v1/token?grant_type=refresh_token", {
        body: { refresh_token: refreshToken },
        context: "refresh",
      });
      return toSession(json, now());
    },

    /** Revoke this device's session on the server (other devices stay signed in). */
    async signOut(accessToken) {
      if (!accessToken) return;
      await call("/auth/v1/logout?scope=local", { accessToken, context: "logout" });
    },
  };
}
