// =====================================================================
// Session manager — keeps the signed-in session in chrome.storage.local
// ---------------------------------------------------------------------
// Runs in the background service worker only. The settings page never
// touches tokens; it asks the worker over runtime messages (MSG.AUTH_*).
//
// Survives service-worker restarts: the session lives in storage, not in
// memory. The access token is short-lived (~1h); getAccessToken() refreshes
// it on demand, a minute before expiry.
//
// Three rules that are easy to get wrong:
//   1. ONE refresh at a time. Refresh tokens rotate; two parallel refreshes
//      with the same token can get the session revoked. Concurrent callers
//      share the in-flight promise.
//   2. A refresh that finishes AFTER sign-out must not resurrect the session.
//      We only save the refreshed session if storage still holds the token
//      we refreshed from.
//   3. Only a REJECTED refresh signs the user out. A network blip keeps the
//      session so the user isn't logged out by a flaky connection.
// =====================================================================
import { getLocal, setLocal, removeLocal } from "./storage.js";
import { STORAGE_KEYS } from "./constants.js";
import { AuthError, AUTH_ERROR } from "./authClient.js";

export const REFRESH_MARGIN_MS = 60 * 1000;

/**
 * @param {{client: ReturnType<import("./authClient.js").createAuthClient>, now?: () => number}} deps
 */
export function createSessionManager({ client, now = Date.now }) {
  let inflight = null; // shared refresh promise (rule 1)

  async function read() {
    const res = await getLocal([STORAGE_KEYS.AUTH_SESSION]);
    const s = res[STORAGE_KEYS.AUTH_SESSION];
    return s && s.accessToken && s.refreshToken ? s : null;
  }

  async function write(session) {
    await setLocal({ [STORAGE_KEYS.AUTH_SESSION]: session });
  }

  async function clear() {
    await removeLocal(STORAGE_KEYS.AUTH_SESSION);
  }

  function refreshOnce(current) {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const fresh = await client.refresh(current.refreshToken);
        const stored = await read();
        // rule 2: signed out (or replaced by a new sign-in) while we were refreshing
        if (!stored || stored.refreshToken !== current.refreshToken) {
          throw new AuthError(AUTH_ERROR.NOT_SIGNED_IN, "session changed during refresh");
        }
        // Keep the known email if the refresh response omitted the user.
        if (!fresh.user?.email && current.user?.email) fresh.user = { ...fresh.user, email: current.user.email };
        await write(fresh);
        return fresh;
      } catch (e) {
        if (e instanceof AuthError && e.kind === AUTH_ERROR.SESSION_EXPIRED) {
          // rule 3: the server rejected the refresh token → really signed out.
          const stored = await read();
          if (stored && stored.refreshToken === current.refreshToken) await clear();
        }
        throw e;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  return {
    /** What the settings page may see — never the tokens. */
    async getState() {
      const s = await read();
      return s ? { signedIn: true, email: s.user?.email ?? null, userId: s.user?.id ?? null } : { signedIn: false };
    },

    async sendCode(email) {
      return client.sendEmailCode(email);
    },

    async signInWithCode(email, code) {
      const session = await client.verifyEmailCode(email, code);
      await write(session);
      return { signedIn: true, email: session.user?.email ?? null, userId: session.user?.id ?? null };
    },

    /**
     * A valid access token for calling the LearnWise backend, refreshed if it
     * expires within REFRESH_MARGIN_MS. Throws AuthError(NOT_SIGNED_IN |
     * SESSION_EXPIRED | NETWORK | …).
     */
    async getAccessToken() {
      const s = await read();
      if (!s) throw new AuthError(AUTH_ERROR.NOT_SIGNED_IN, "not signed in");
      if (s.expiresAt - now() > REFRESH_MARGIN_MS) return s.accessToken;
      const fresh = await refreshOnce(s);
      return fresh.accessToken;
    },

    /** Sign out locally ALWAYS; revoking on the server is best-effort. */
    async signOut() {
      const s = await read();
      await clear();
      if (s) {
        try {
          await client.signOut(s.accessToken);
        } catch (_e) {
          /* offline / already expired — the local sign-out is what matters */
        }
      }
      return { signedIn: false };
    },
  };
}
