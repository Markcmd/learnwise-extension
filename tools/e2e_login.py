"""(Dev tool, needs Python Playwright + Chromium. Run `npm run build` first.)

End-to-end check of the extension's email + password sign-in, in real Chromium.

    python3 tools/e2e_login.py <folder with manifest.json + a fresh dist/>

A local fake of the Supabase Auth API stands in for the real project and
behaves like it with "Confirm email" ON: sign-up creates an UNCONFIRMED user
and returns no session; password sign-in is refused with email_not_confirmed
until the confirmation link is "clicked" (here: the test flips a flag).
The extension's dist/background.js is patched to point at the fake (URL + a
dummy anon key). Nothing here touches the real project.
"""
import json, os, shutil, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

LOG = []                 # (path, headers, body)
USERS = {}               # email -> {"password":..., "confirmed": bool}

class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, obj=None):
        self.send_response(code)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "apikey, content-type, authorization")
        body = b"" if obj is None else json.dumps(obj).encode()
        if body: self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_OPTIONS(self): self._send(204)
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}") if n else {}
        LOG.append((self.path, dict(self.headers), body))
        email = body.get("email")
        if self.path == "/auth/v1/signup":
            if len(body.get("password", "")) < 8:
                return self._send(422, {"code": 422, "error_code": "weak_password", "msg": "Password should be at least 8 characters."})
            USERS.setdefault(email, {"password": body["password"], "confirmed": False})
            return self._send(200, {"id": "u-1", "email": email, "confirmation_sent_at": "2026-09-21T00:00:00Z"})
        if self.path == "/auth/v1/token?grant_type=password":
            u = USERS.get(email)
            if not u or u["password"] != body.get("password"):
                return self._send(400, {"code": 400, "error_code": "invalid_credentials", "msg": "Invalid login credentials"})
            if not u["confirmed"]:
                return self._send(400, {"code": 400, "error_code": "email_not_confirmed", "msg": "Email not confirmed"})
            return self._send(200, {"access_token": "AT-secret", "refresh_token": "RT-secret", "expires_in": 3600,
                                    "user": {"id": "u-1", "email": email}})
        if self.path == "/auth/v1/resend":
            return self._send(200, {})
        if self.path.startswith("/auth/v1/logout"):
            return self._send(204)
        return self._send(404, {"msg": "nope"})

srv = ThreadingHTTPServer(("127.0.0.1", 0), Fake)
PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

src = sys.argv[1] if len(sys.argv) > 1 else "."
work = "/tmp/lw-e2e"; ext = f"{work}/ext-patched"
shutil.rmtree(work, ignore_errors=True)
shutil.copytree(src, ext, ignore=shutil.ignore_patterns("node_modules", ".git", "ecdict_json", "dist-package"))
bg = open(f"{ext}/dist/background.js").read()
assert 'var SUPABASE_ANON_KEY = ""' in bg or "SUPABASE_ANON_KEY" in bg
bg = bg.replace('var SUPABASE_URL = "https://jnhlfsgnbskagurrldad.supabase.co"', f'var SUPABASE_URL = "http://127.0.0.1:{PORT}"')
import re
bg = re.sub(r'var SUPABASE_ANON_KEY = "[^"]*"', 'var SUPABASE_ANON_KEY = "test-anon-key"', bg)
open(f"{ext}/dist/background.js", "w").write(bg)
man = json.load(open(f"{ext}/manifest.json")); assert "host_permissions" not in man, man.get("host_permissions")

ok = []
def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg); ok.append(cond)
    if not cond: raise SystemExit(1)

PW = "correct horse"
shots = f"{work}/shots"; os.makedirs(shots, exist_ok=True)
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(f"{work}/profile", headless=False, channel="chromium",
        args=[f"--disable-extensions-except={ext}", f"--load-extension={ext}", "--headless=new"],
        viewport={"width": 900, "height": 900})
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
    ext_id = sw.url.split("/")[2]
    for pg in list(ctx.pages):
        if "onboarding" in pg.url: pg.close()
    base = f"chrome-extension://{ext_id}/HTMLs/settingsWindow.html"
    page = ctx.new_page()
    status = lambda: page.inner_text("#acctStatus")

    page.goto(base); page.wait_for_timeout(400)
    check(page.locator("#accountCard").is_hidden(), "without ?accounts=1 the Account card stays hidden (live v1 unaffected)")

    page.goto(base + "?accounts=1"); page.wait_for_selector("#acctEmail", state="visible")
    card = page.locator("#accountCard")
    check(card.is_visible(), "?accounts=1 shows the Account card")
    card.screenshot(path=f"{shots}/1-form.png")

    # typo + short password never reach the server
    page.fill("#acctEmail", "mark@"); page.fill("#acctPassword", PW); page.click("#acctSignUp"); page.wait_for_timeout(300)
    check("doesn't look like an email" in status(), "a typo is rejected before any email is sent")
    page.fill("#acctEmail", "Mark@Example.com"); page.fill("#acctPassword", "short"); page.click("#acctSignUp"); page.wait_for_timeout(300)
    check("at least 8 characters" in status(), "a short password is rejected before any email is sent")
    check(not any(x[0] == "/auth/v1/signup" for x in LOG), "…and neither reached the server")

    # create account → confirmation screen
    page.fill("#acctPassword", PW); page.click("#acctSignUp")
    page.wait_for_selector("#acctConfirm", state="visible")
    su = [x for x in LOG if x[0] == "/auth/v1/signup"][-1]
    check(su[2] == {"email": "mark@example.com", "password": PW}, "sign-up sends lower-cased email + password")
    check(su[1].get("apikey") == "test-anon-key", "requests carry the anon key")
    check(page.inner_text("#acctConfirmEmail") == "mark@example.com", "confirm screen names the address the link went to")
    card.screenshot(path=f"{shots}/2-confirm.png")

    page.click("#acctResend"); page.wait_for_timeout(400)
    check([x for x in LOG if x[0] == "/auth/v1/resend"][-1][2] == {"type": "signup", "email": "mark@example.com"}, "resend confirmation email works")

    # sign in BEFORE clicking the link → refused
    page.click("#acctBackToSignIn"); page.wait_for_selector("#acctForm", state="visible")
    check(page.input_value("#acctEmail") == "mark@example.com", "back on the form with the email pre-filled")
    page.fill("#acctPassword", PW); page.click("#acctSignIn"); page.wait_for_timeout(500)
    check("confirm your email first" in status(), "sign-in before confirming is refused with a clear message")
    stored = sw.evaluate("() => new Promise(r => chrome.storage.local.get('lw_auth_session', r))")
    check("lw_auth_session" not in stored, "nothing stored while unconfirmed")

    # user clicks the link in the email
    USERS["mark@example.com"]["confirmed"] = True
    page.click("#acctBackToSignIn"); page.wait_for_selector("#acctForm", state="visible")

    page.fill("#acctPassword", "wrong password"); page.click("#acctSignIn"); page.wait_for_timeout(500)
    check("Wrong email or password" in status(), "a wrong password shows a clear error")

    page.fill("#acctPassword", PW); page.click("#acctSignIn")
    page.wait_for_selector("#acctSignedIn", state="visible")
    check(page.inner_text("#acctWho") == "mark@example.com", "after confirming: signed in as mark@example.com")
    check(page.input_value("#acctPassword") == "", "password field cleared after sign-in")
    card.screenshot(path=f"{shots}/3-signed-in.png")

    all_storage = sw.evaluate("() => new Promise(r => chrome.storage.local.get(null, r))")
    check(all_storage.get("lw_auth_session", {}).get("refreshToken") == "RT-secret", "session saved by the background worker")
    check(PW not in json.dumps(all_storage), "the password is not stored anywhere")
    state = page.evaluate("() => new Promise(r => chrome.runtime.sendMessage({type:'lw_auth_get_state'}, r))")
    check("secret" not in json.dumps(state), f"page only ever sees {state}")

    page.reload(); page.wait_for_selector("#acctSignedIn", state="visible")
    check(True, "still signed in after reloading the page")

    page.click("#acctSignOut"); page.wait_for_selector("#acctForm", state="visible")
    lo = [x for x in LOG if x[0].startswith("/auth/v1/logout")][-1]
    check(lo[1].get("Authorization") == "Bearer AT-secret", "sign-out revoked this device's session on the server")
    stored = sw.evaluate("() => new Promise(r => chrome.storage.local.get('lw_auth_session', r))")
    check("lw_auth_session" not in stored, "tokens removed from storage on sign-out")

    ctx.close()
srv.shutdown()
print(f"\n===== {sum(ok)}/{len(ok)} passed =====")
