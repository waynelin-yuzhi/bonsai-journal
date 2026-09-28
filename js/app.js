import { isConfigured } from "./config.js";
import { supabase } from "./supabase.js";
import { startRouter } from "./router.js";
import { toast } from "./ui.js";
import { startUpdateCheck } from "./update.js";
import { startApkUpdateCheck } from "./apk-update.js";
import { initInstall } from "./install.js";
import { hydrateIcons } from "./icons.js";
import { refreshReminders, clearReminderBadge } from "./reminders.js";
import { initNotify, clearNotifications } from "./notify.js";

hydrateIcons();

// 要在頁面一開始就監聽，Chrome 的安裝事件可能很早就發出
initInstall();

const authScreen = document.getElementById("auth-screen");
const app = document.getElementById("app");
const authMsg = document.getElementById("auth-msg");

let routerStarted = false;
let lastReminderCheck = 0;

// 更新提醒數字與到期通知（登入、回到 App 時；短時間內不重複查）
function checkReminders(minGap) {
  if (Date.now() - lastReminderCheck < minGap) return;
  lastReminderCheck = Date.now();
  refreshReminders();
}

function showApp() {
  authScreen.classList.add("hidden");
  app.classList.remove("hidden");
  if (!routerStarted) { startRouter(); routerStarted = true; }
  checkReminders(5 * 1000);
}
function showAuth() {
  app.classList.add("hidden");
  authScreen.classList.remove("hidden");
}

async function init() {
  if (!isConfigured()) {
    showAuth();
    authMsg.innerHTML = "尚未設定 Supabase。<br>請在 <code>js/config.js</code> 填入專案 URL 與 key。";
    document.getElementById("auth-login").disabled = true;
    document.getElementById("auth-signup").disabled = true;
    return;
  }

  const { data } = await supabase.auth.getSession();
  if (data.session) showApp();
  else showAuth();

  supabase.auth.onAuthStateChange((event, session) => {
    if (session) showApp();
    else showAuth();
    // 登出：清掉分頁數字和這支手機上排好的通知
    if (event === "SIGNED_OUT") { clearReminderBadge(); clearNotifications(); }
  });
}

// ---- 登入 / 註冊 ----
const emailEl = document.getElementById("auth-email");
const pwEl = document.getElementById("auth-password");

document.getElementById("auth-login").addEventListener("click", async () => {
  authMsg.textContent = "";
  const { error } = await supabase.auth.signInWithPassword({ email: emailEl.value.trim(), password: pwEl.value });
  if (error) authMsg.textContent = "登入失敗：" + error.message;
});

document.getElementById("auth-signup").addEventListener("click", async () => {
  authMsg.textContent = "";
  if (pwEl.value.length < 6) { authMsg.textContent = "密碼至少 6 碼"; return; }
  const { data, error } = await supabase.auth.signUp({ email: emailEl.value.trim(), password: pwEl.value });
  if (error) {
    // 試用期間資料庫只允許名單內的 Email 註冊（見 schema.sql「邀請制」）
    authMsg.textContent = /database error saving new user|signups not allowed/i.test(error.message)
      ? "目前為邀請制，尚未開放註冊"
      : "註冊失敗：" + error.message;
    return;
  }
  if (data.session) toast("註冊成功", "ok");
  else authMsg.textContent = "註冊成功，請到信箱點驗證連結後再登入。";
});

pwEl.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("auth-login").click(); });

// ---- PWA Service Worker ----
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

// 提醒：點通知打開提醒頁；回到 App 時更新到期數字與通知（最多 1 分鐘一次）
initNotify();
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && !app.classList.contains("hidden")) checkReminders(60 * 1000);
});

init();
startUpdateCheck();
startApkUpdateCheck();
