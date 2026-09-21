# 2026-09-20 / 09-21 — v2 B1：扩展端登录（最终版：邮箱 + 密码 + 注册确认链接）

## ⚠️ 2026-09-21 更新：验证码方案已替换为"邮箱 + 密码"

Mark 决定不用验证码。现在的流程：**Create account（邮箱 + 密码）→ Supabase 发确认邮件 → 用户点一次链接 →
之后用邮箱 + 密码登录**。点链接之前登录被拒（`email_not_confirmed`），后端也不发试用。

| 变化 | 说明 |
|---|---|
| `core/authClient.js` | `signUp`（`/auth/v1/signup`）、`signIn`（`/auth/v1/token?grant_type=password`）、`resendConfirmation`（`/auth/v1/resend`）；删掉发码 / 验码 |
| `core/session.js` | `signUp` / `signIn` / `resendConfirmation`；刷新、登出规则不变 |
| `MSG.AUTH_*` | `AUTH_SIGN_UP` / `AUTH_SIGN_IN` / `AUTH_RESEND_CONFIRMATION`（替换 `AUTH_SEND_CODE` / `AUTH_VERIFY_CODE`）|
| 设置页 | 邮箱 + 密码两个输入框，"Sign in" / "Create account"；注册后显示"去邮箱点确认链接"+ 重发 |
| 密码 | 至少 8 位、最多 72 位（bcrypt 上限），原样使用不去空格；**只经过后台发给 Supabase 一次，从不存储**（测试里查了整个 storage）|
| Supabase 对"已注册的邮箱再注册"返回和新注册一样的结果（防止被人试探谁注册过）| 界面因此写"去邮箱确认；已有账号直接登录" |

验证：`vitest` 22 个文件 / 218 个测试通过（auth 27 个）；`npm run build` 通过；`tools/e2e_login.py` 真浏览器 21 项通过
（假 Supabase 按"确认邮箱打开"的行为模拟：注册 → 未确认登录被拒 → 点链接 → 登录成功 → 刷新仍登录 → 登出）。

还没做：**忘记密码**（需要一个重置密码的网页）；填 anon key；Supabase 控制台打开 `Confirm email`、设 Site URL。

下面是 09-20 验证码版的原始记录，决策 1 已作废，其余（不引入 supabase-js、不加权限、令牌只在后台、刷新三规则、卡片默认隐藏）仍然成立。

---


后端计划在 `learnwise-backend/dev-notes/planning/BACKEND_PLAN.md`（§8 B1）。本文件只记扩展这一侧。

## 做完了什么

| 文件 | 说明 |
|---|---|
| `JSs/core/authClient.js` | 直接用 fetch 调 Supabase Auth 的 REST（Representational State Transfer）接口：发验证码 `/auth/v1/otp`、验码 `/auth/v1/verify`、换新令牌 `/auth/v1/token?grant_type=refresh_token`、登出 `/auth/v1/logout?scope=local`。错误归类成界面能解释的几种（验证码错误/过期、发信太频繁、网络、服务端……）|
| `JSs/core/session.js` | 会话存在 `chrome.storage.local`（键 `lw_auth_session`），只由后台 service worker 读写；过期前 1 分钟自动刷新 |
| `JSs/core/authConfig.js` | 项目地址 + 公开的 anon key（**key 还没填**）|
| `JSs/core/constants.js` | `STORAGE_KEYS.AUTH_SESSION`、`MSG.AUTH_*` 四个消息 |
| `JSs/background.js` | 处理四个 `MSG.AUTH_*`；**只接受扩展自己页面发来的消息**，网页上的内容脚本调不动 |
| `HTMLs/settingsWindow.html` / `JSs/settingsWindow.js` / `CSSs/settings.css` | 设置页的 Account 卡片：填邮箱 → 收码 → 输码 → 已登录 / 登出；重发有 60 秒冷却 |
| `tests/auth.test.js` | 23 个测试 |
| `tools/e2e_login.py` | 真浏览器端到端检查（需 Python Playwright），15 项 |

## 几个实现上的决定

**1. 用邮件验证码，不用魔法链接，也不用 `chrome.identity`。** 链接会在邮件客户端或普通标签页里打开，
要跳回扩展就得接 `launchWebAuthFlow` + `https://<扩展ID>.chromiumapp.org/` 回调，还要多申请 `identity` 权限。
验证码直接在设置页输入，不需要回调、不需要新权限，同样证明"你能收这个邮箱的信"——这正是
后端"确认邮箱后才发试用"（B2 第七刀）要的。以后接 Google 登录时再用 `launchWebAuthFlow`。

**2. 不引入 supabase-js。** 只用到四个接口，自己写 200 行比引一个库更小、更好测，service worker 里也不多一坨代码。

**3. 不需要新增 manifest 权限。** 实测：扩展已有 `<all_urls>` 的内容脚本，Chrome 因此已给了跨站访问，
后台直接请求 Supabase 不受 CORS（跨源资源共享）限制。**线上 v1 用户更新时不会弹"新权限"提示。**

**4. 令牌只在后台。** 设置页只拿得到 `{ signedIn, email, userId }`。三条容易写错的规则都有测试：
刷新同一时间只发一次（刷新令牌是一次性的，并发刷新可能导致整个会话被作废）；
登出之后才完成的刷新不能把会话"复活"；只有服务器明确拒绝刷新才算登出，断网不登出。

**5. Account 卡片默认隐藏（`FEATURE_ACCOUNTS = false`）。** 线上 v1 承诺"没有服务器"，后端没上线前不能露出登录框。
开发时打开 `settingsWindow.html?accounts=1` 即可看到。

## 验证

- `vitest`：22 个测试文件 / 214 个测试全部通过（原 191 + 新增 23），`npm run build` 通过 —— 在 Mark 电脑的沙盒副本里跑的。
- 弄坏一次：去掉"刷新只发一次" → 对应测试变红；去掉"登出后不复活" → 对应测试变红。
- 真浏览器：Chromium 加载打包后的扩展，连一个本地的假 Supabase，走完 填邮箱 → 错码 → 对码 → 刷新页面仍登录 → 登出，15 项全部通过。
- **没有**对真实 Supabase 项目跑过（anon key 还没填；Supabase 那边的邮件模板也要先改，见下）。

## 还没做

- 填 `authConfig.js` 里的 anon key（Supabase 控制台 → Project Settings → API Keys）。
- **Supabase 邮件模板要显示验证码**：默认的 Magic Link 模板只有链接，要改成包含 `{{ .Token }}`。已写进后端的控制台清单。
- `npm run build` 之后在真 Chrome 里用自己的邮箱走一遍。
- 用户可见的隐私说明（设置页 Privacy 卡片、隐私政策）还写着"没有服务器"——属于后端计划 §7，B5 统一改。
