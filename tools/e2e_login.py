"""(Dev tool, needs Python Playwright + Chromium. Run `npm run build` first.)

End-to-end check of the extension's email-code sign-in, in real Chromium.

A local fake of the Supabase Auth API stands in for the real project; it sends
CORS headers like Supabase does. The extension's dist/background.js is patched
to point at it (URL + a dummy anon key). Nothing here touches the real project.
"""
import json, os, re, shutil, sys, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

LOG = []          # (path, headers, body)
CORS = {"on": True}

class Fake(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _cors(self):
        if CORS["on"]:
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "apikey, content-type, authorization, x-client-info")
            self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
    def _send(self, code, obj=None):
        self.send_response(code); self._cors()
        body = b"" if obj is None else json.dumps(obj).encode()
        if body: self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_OPTIONS(self): self._send(204)
    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}") if n else {}
        LOG.append((self.path, dict(self.headers), body))
        if self.path == "/auth/v1/otp":
            return self._send(200, {})
        if self.path == "/auth/v1/verify":
            if body.get("token") == "123456":
                return self._send(200, {"access_token": "AT-secret", "refresh_token": "RT-secret", "expires_in": 3600,
                                        "user": {"id": "u-1", "email": body.get("email")}})
            return self._send(403, {"code": 403, "error_code": "otp_expired", "msg": "Token has expired or is invalid"})
        if self.path.startswith("/auth/v1/logout"):
            return self._send(204)
        return self._send(404, {"msg": "nope"})

srv = ThreadingHTTPServer(("127.0.0.1", 0), Fake)
PORT = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()

# usage: python3 tools/e2e_login.py <folder with manifest.json + a fresh dist/>
src = sys.argv[1] if len(sys.argv) > 1 else "."
work = "/tmp/lw-e2e"; ext = f"{work}/ext-patched"
shutil.rmtree(work, ignore_errors=True); shutil.copytree(src, ext, ignore=shutil.ignore_patterns("node_modules", ".git", "ecdict_json", "dist-package"))
bg = open(f"{ext}/dist/background.js").read()
bg = bg.replace('var SUPABASE_URL = "https://jnhlfsgnbskagurrldad.supabase.co"', f'var SUPABASE_URL = "http://127.0.0.1:{PORT}"')
bg = bg.replace('var SUPABASE_ANON_KEY = ""', 'var SUPABASE_ANON_KEY = "test-anon-key"')
open(f"{ext}/dist/background.js", "w").write(bg)
# the manifest the store ships has NO host_permissions — keep it that way for this test
man = json.load(open(f"{ext}/manifest.json")); assert "host_permissions" not in man, man.get("host_permissions")

ok = []
def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg); ok.append(cond)
    if not cond: raise SystemExit(1)

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

    page.goto(base); page.wait_for_timeout(400)
    check(page.locator("#accountCard").is_hidden(), "without ?accounts=1 the Account card stays hidden (live v1 unaffected)")

    page.goto(base + "?accounts=1"); page.wait_for_selector("#acctEmail", state="visible")
    card = page.locator("#accountCard")
    check(card.is_visible(), "?accounts=1 shows the Account card")
    card.screenshot(path=f"{shots}/1-email.png")

    page.fill("#acctEmail", "mark@"); page.click("#acctSendCode"); page.wait_for_timeout(300)
    check("doesn't look like an email" in page.inner_text("#acctStatus"), "a typo is rejected before any email is sent")
    check(not any(pth == "/auth/v1/otp" for pth, _, _ in LOG), "…and no request reached the server")

    page.fill("#acctEmail", "Mark@Example.com"); page.click("#acctSendCode")
    page.wait_for_selector("#acctCodeForm", state="visible")
    otp = [x for x in LOG if x[0] == "/auth/v1/otp"][-1]
    check(otp[2] == {"email": "mark@example.com", "create_user": True}, f"otp request body = {otp[2]}")
    check(otp[1].get("apikey") == "test-anon-key", "otp request carries the anon key")
    check(page.inner_text("#acctEmailShown") == "mark@example.com", "code step shows the address the code went to")
    check(page.locator("#acctResend").is_disabled(), "resend is on cooldown right after sending")
    card.screenshot(path=f"{shots}/2-code.png")

    page.fill("#acctCode", "000000"); page.click("#acctVerify"); page.wait_for_timeout(500)
    check("wrong or has expired" in page.inner_text("#acctStatus"), "a wrong code shows a clear error")

    page.fill("#acctCode", "123 456"); page.click("#acctVerify")
    page.wait_for_selector("#acctSignedIn", state="visible")
    check(page.inner_text("#acctWho") == "mark@example.com", "signed in as mark@example.com")
    card.screenshot(path=f"{shots}/3-signed-in.png")

    stored = sw.evaluate("() => new Promise(r => chrome.storage.local.get('lw_auth_session', r))")
    check(stored.get("lw_auth_session", {}).get("refreshToken") == "RT-secret", "session saved by the background worker")
    state = page.evaluate("() => new Promise(r => chrome.runtime.sendMessage({type:'lw_auth_get_state'}, r))")
    check("secret" not in json.dumps(state), f"page only ever sees {state}")

    page.reload(); page.wait_for_selector("#acctSignedIn", state="visible")
    check(True, "still signed in after reloading the page")

    page.click("#acctSignOut"); page.wait_for_selector("#acctEmailForm", state="visible")
    lo = [x for x in LOG if x[0].startswith("/auth/v1/logout")][-1]
    check(lo[1].get("Authorization") == "Bearer AT-secret", "sign-out revoked this device's session on the server")
    stored = sw.evaluate("() => new Promise(r => chrome.storage.local.get('lw_auth_session', r))")
    check("lw_auth_session" not in stored, "tokens removed from storage on sign-out")

    ctx.close()
srv.shutdown()
print(f"\n===== {sum(ok)}/{len(ok)} passed =====")
