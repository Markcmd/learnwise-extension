// =====================================================================
// Auth: email one-time-code sign-in + session refresh (B1, 2026-09-20)
// ---------------------------------------------------------------------
// No network: fetch is a scripted fake. chrome.storage.local is the
// in-memory fake from tests/setup.js.
// =====================================================================
import { describe, it, expect, vi } from "vitest";
import {
  createAuthClient,
  classifyAuthError,
  normalizeEmailInput,
  normalizeCodeInput,
  AUTH_ERROR,
  AuthError,
} from "../JSs/core/authClient.js";
import { createSessionManager, REFRESH_MARGIN_MS } from "../JSs/core/session.js";
import { getLocal } from "../JSs/core/storage.js";
import { STORAGE_KEYS } from "../JSs/core/constants.js";

const URL = "https://example.supabase.co";
const KEY = "anon-key";

function res(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  };
}

function tokenBody({ access = "at1", refresh = "rt1", expiresIn = 3600, email = "mark@example.com" } = {}) {
  return { access_token: access, refresh_token: refresh, expires_in: expiresIn, user: { id: "u-1", email } };
}

/** fetch fake that answers from a queue and records calls */
function scriptedFetch(...responses) {
  const calls = [];
  const fn = vi.fn(async (url, init) => {
    calls.push({ url, init, body: init?.body ? JSON.parse(init.body) : undefined });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (typeof next === "function") return next(url, init);
    return next;
  });
  fn.calls = calls;
  return fn;
}

async function storedSession() {
  const r = await getLocal([STORAGE_KEYS.AUTH_SESSION]);
  return r[STORAGE_KEYS.AUTH_SESSION];
}

describe("input normalization", () => {
  it("normalizes emails and rejects non-emails", () => {
    expect(normalizeEmailInput("  Mark@Example.COM ")).toBe("mark@example.com");
    expect(normalizeEmailInput("not-an-email")).toBeNull();
    expect(normalizeEmailInput("a b@c.com")).toBeNull();
    expect(normalizeEmailInput("")).toBeNull();
  });
  it("accepts 6–10 digit codes, tolerating spaces and dashes", () => {
    expect(normalizeCodeInput(" 123 456 ")).toBe("123456");
    expect(normalizeCodeInput("123-456")).toBe("123456");
    expect(normalizeCodeInput("12345")).toBeNull();
    expect(normalizeCodeInput("abcdef")).toBeNull();
    expect(normalizeCodeInput("12345678901")).toBeNull();
  });
});

describe("classifyAuthError", () => {
  it("rate limits, with retry-after parsed from the message", () => {
    const e = classifyAuthError(429, { error_code: "over_email_send_rate_limit", msg: "For security purposes, you can only request this after 42 seconds." }, "otp");
    expect(e.kind).toBe(AUTH_ERROR.RATE_LIMITED);
    expect(e.retryAfterSec).toBe(42);
  });
  it("wrong or expired code", () => {
    expect(classifyAuthError(403, { error_code: "otp_expired", msg: "Token has expired or is invalid" }, "verify").kind).toBe(AUTH_ERROR.INVALID_CODE);
  });
  it("rejected refresh token → session expired (both body shapes)", () => {
    expect(classifyAuthError(400, { error: "invalid_grant", error_description: "Invalid Refresh Token" }, "refresh").kind).toBe(AUTH_ERROR.SESSION_EXPIRED);
    expect(classifyAuthError(400, { error_code: "refresh_token_already_used" }, "refresh").kind).toBe(AUTH_ERROR.SESSION_EXPIRED);
  });
  it("server errors and unknowns", () => {
    expect(classifyAuthError(502, null, "otp").kind).toBe(AUTH_ERROR.SERVER);
    expect(classifyAuthError(418, {}, "otp").kind).toBe(AUTH_ERROR.UNKNOWN);
  });
});

describe("auth client", () => {
  it("sends the code: POST /auth/v1/otp with apikey, lower-cased email, create_user", async () => {
    const f = scriptedFetch(res(200, {}));
    const c = createAuthClient({ url: URL + "/", anonKey: KEY, fetchImpl: f });
    await expect(c.sendEmailCode(" Mark@Example.com ")).resolves.toEqual({ email: "mark@example.com" });
    expect(f.calls[0].url).toBe(`${URL}/auth/v1/otp`);
    expect(f.calls[0].init.headers.apikey).toBe(KEY);
    expect(f.calls[0].body).toEqual({ email: "mark@example.com", create_user: true });
  });

  it("does not spend a (rate-limited) email on an obvious typo", async () => {
    const f = scriptedFetch();
    const c = createAuthClient({ url: URL, anonKey: KEY, fetchImpl: f });
    await expect(c.sendEmailCode("mark@")).rejects.toMatchObject({ kind: AUTH_ERROR.INVALID_EMAIL });
    expect(f).not.toHaveBeenCalled();
  });

  it("reports not_configured instead of calling out when the key is missing", async () => {
    const f = scriptedFetch();
    const c = createAuthClient({ url: URL, anonKey: "", fetchImpl: f });
    await expect(c.sendEmailCode("mark@example.com")).rejects.toMatchObject({ kind: AUTH_ERROR.NOT_CONFIGURED });
    expect(f).not.toHaveBeenCalled();
  });

  it("verifies the code: POST /auth/v1/verify type=email → session", async () => {
    const f = scriptedFetch(res(200, tokenBody()));
    const c = createAuthClient({ url: URL, anonKey: KEY, fetchImpl: f, now: () => 1_000 });
    const s = await c.verifyEmailCode("mark@example.com", "123 456");
    expect(f.calls[0].url).toBe(`${URL}/auth/v1/verify`);
    expect(f.calls[0].body).toEqual({ type: "email", email: "mark@example.com", token: "123456" });
    expect(s).toEqual({ accessToken: "at1", refreshToken: "rt1", expiresAt: 1_000 + 3_600_000, user: { id: "u-1", email: "mark@example.com" } });
  });

  it("network failure → network error (not a crash)", async () => {
    const f = scriptedFetch(new TypeError("Failed to fetch"));
    const c = createAuthClient({ url: URL, anonKey: KEY, fetchImpl: f });
    await expect(c.sendEmailCode("mark@example.com")).rejects.toMatchObject({ kind: AUTH_ERROR.NETWORK });
  });

  it("sign-out sends the bearer token and only revokes this device", async () => {
    const f = scriptedFetch(res(204));
    const c = createAuthClient({ url: URL, anonKey: KEY, fetchImpl: f });
    await c.signOut("at1");
    expect(f.calls[0].url).toBe(`${URL}/auth/v1/logout?scope=local`);
    expect(f.calls[0].init.headers.Authorization).toBe("Bearer at1");
  });
});

describe("session manager", () => {
  function setup(fetchFn, t = { now: 0 }) {
    const client = createAuthClient({ url: URL, anonKey: KEY, fetchImpl: fetchFn, now: () => t.now });
    return { t, sm: createSessionManager({ client, now: () => t.now }) };
  }

  it("signs in with the code and persists the session (survives a worker restart)", async () => {
    const f = scriptedFetch(res(200, tokenBody()));
    const { sm } = setup(f);
    await expect(sm.getState()).resolves.toEqual({ signedIn: false });
    await expect(sm.signInWithCode("mark@example.com", "123456")).resolves.toMatchObject({ signedIn: true, email: "mark@example.com" });

    // A brand-new manager (= service worker restarted) sees the same session.
    const { sm: sm2 } = setup(scriptedFetch());
    await expect(sm2.getState()).resolves.toEqual({ signedIn: true, email: "mark@example.com", userId: "u-1" });
  });

  it("getState never exposes tokens to the page", async () => {
    const { sm } = setup(scriptedFetch(res(200, tokenBody())));
    await sm.signInWithCode("mark@example.com", "123456");
    const state = await sm.getState();
    expect(JSON.stringify(state)).not.toMatch(/at1|rt1/);
  });

  it("returns the stored token while it is fresh — no network", async () => {
    const f = scriptedFetch(res(200, tokenBody()));
    const { sm, t } = setup(f);
    await sm.signInWithCode("mark@example.com", "123456");
    t.now = 3_600_000 - REFRESH_MARGIN_MS - 1;
    await expect(sm.getAccessToken()).resolves.toBe("at1");
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("refreshes a minute before expiry and stores the rotated tokens", async () => {
    const f = scriptedFetch(res(200, tokenBody()), res(200, tokenBody({ access: "at2", refresh: "rt2" })));
    const { sm, t } = setup(f);
    await sm.signInWithCode("mark@example.com", "123456");
    t.now = 3_600_000 - REFRESH_MARGIN_MS + 1;
    await expect(sm.getAccessToken()).resolves.toBe("at2");
    expect(f.calls[1].url).toBe(`${URL}/auth/v1/token?grant_type=refresh_token`);
    expect(f.calls[1].body).toEqual({ refresh_token: "rt1" });
    expect((await storedSession()).refreshToken).toBe("rt2");
  });

  it("concurrent callers share ONE refresh (rotating tokens must not be spent twice)", async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const f = scriptedFetch(res(200, tokenBody()), async () => {
      await gate;
      return res(200, tokenBody({ access: "at2", refresh: "rt2" }));
    });
    const { sm, t } = setup(f);
    await sm.signInWithCode("mark@example.com", "123456");
    t.now = 3_600_000;
    const all = Promise.all([sm.getAccessToken(), sm.getAccessToken(), sm.getAccessToken()]);
    await Promise.resolve();
    release();
    await expect(all).resolves.toEqual(["at2", "at2", "at2"]);
    expect(f).toHaveBeenCalledTimes(2); // 1 verify + exactly 1 refresh
  });

  it("a rejected refresh token signs the user out", async () => {
    const f = scriptedFetch(res(200, tokenBody()), res(400, { error: "invalid_grant", error_description: "Invalid Refresh Token: Already Used" }));
    const { sm, t } = setup(f);
    await sm.signInWithCode("mark@example.com", "123456");
    t.now = 3_600_000;
    await expect(sm.getAccessToken()).rejects.toMatchObject({ kind: AUTH_ERROR.SESSION_EXPIRED });
    await expect(sm.getState()).resolves.toEqual({ signedIn: false });
  });

  it("a network blip during refresh does NOT sign the user out", async () => {
    const f = scriptedFetch(res(200, tokenBody()), new TypeError("Failed to fetch"));
    const { sm, t } = setup(f);
    await sm.signInWithCode("mark@example.com", "123456");
    t.now = 3_600_000;
    await expect(sm.getAccessToken()).rejects.toMatchObject({ kind: AUTH_ERROR.NETWORK });
    await expect(sm.getState()).resolves.toMatchObject({ signedIn: true });
  });

  it("a refresh that finishes after sign-out does not resurrect the session", async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const f = scriptedFetch(
      res(200, tokenBody()),
      async () => {
        await gate;
        return res(200, tokenBody({ access: "at2", refresh: "rt2" }));
      },
      res(204) // logout
    );
    const { sm, t } = setup(f);
    await sm.signInWithCode("mark@example.com", "123456");
    t.now = 3_600_000;
    const pending = sm.getAccessToken();
    await sm.signOut();
    release();
    await expect(pending).rejects.toBeInstanceOf(AuthError);
    await expect(sm.getState()).resolves.toEqual({ signedIn: false });
    expect(await storedSession()).toBeUndefined();
  });

  it("sign-out clears locally even when the server can't be reached", async () => {
    const f = scriptedFetch(res(200, tokenBody()), new TypeError("offline"));
    const { sm } = setup(f);
    await sm.signInWithCode("mark@example.com", "123456");
    await expect(sm.signOut()).resolves.toEqual({ signedIn: false });
    await expect(sm.getState()).resolves.toEqual({ signedIn: false });
  });

  it("a wrong code stores nothing", async () => {
    const f = scriptedFetch(res(403, { error_code: "otp_expired", msg: "Token has expired or is invalid" }));
    const { sm } = setup(f);
    await expect(sm.signInWithCode("mark@example.com", "000000")).rejects.toMatchObject({ kind: AUTH_ERROR.INVALID_CODE });
    expect(await storedSession()).toBeUndefined();
  });

  it("getAccessToken when signed out → not_signed_in, no network", async () => {
    const f = scriptedFetch();
    const { sm } = setup(f);
    await expect(sm.getAccessToken()).rejects.toMatchObject({ kind: AUTH_ERROR.NOT_SIGNED_IN });
    expect(f).not.toHaveBeenCalled();
  });
});
