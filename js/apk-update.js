// Android App 外殼更新通知：打開 App 時去 GitHub 查最新的 APK 打包編號，
// 比手機上安裝的新就提示更新（桌面名稱、圖示、權限這類改動要裝新 APK 才會生效）。
//   · 新版外殼（有 ApkUpdater 原生外掛）：在 App 裡下載、顯示進度，下載完直接跳出系統安裝畫面
//   · 舊版外殼：交給手機瀏覽器下載 APK
import { h, toast, sheet } from "./ui.js";
import { icon } from "./icons.js";
import { nativeBuild, APK_URL } from "./platform.js";

const RELEASE_API = "https://api.github.com/repos/waynelin-yuzhi/bonsai-journal/releases/latest";
const CHECK_EVERY = 6 * 60 * 60 * 1000; // GitHub 未登入的 API 有次數限制，自動檢查最多 6 小時一次
const LAST_KEY = "bj-apk-last-check";
const SKIP_KEY = "bj-apk-dismissed";

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* 存不了就算了 */ } },
};

export const versionName = (build) => `1.0.${build}`;

async function latestBuild() {
  const res = await fetch(RELEASE_API, { cache: "no-store", headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`GitHub ${res.status}`);
  const data = await res.json();
  const n = Number(/android-(\d+)/.exec(data.tag_name || "")?.[1]);
  if (!n) throw new Error("找不到版本資訊");
  return n;
}

export function startApkUpdateCheck() {
  if (nativeBuild() == null) return;
  const auto = () => {
    if (Date.now() - Number(store.get(LAST_KEY) || 0) < CHECK_EVERY) return;
    checkApkUpdate();
  };
  auto();
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") auto(); });
}

// manual：從設定頁手動檢查，沒有新版也要回報；按過「稍後」的版本也會再提示
export async function checkApkUpdate({ manual = false } = {}) {
  const installed = nativeBuild();
  if (installed == null) return null;
  let latest;
  try {
    latest = await latestBuild();
    store.set(LAST_KEY, String(Date.now()));
  } catch {
    if (manual) toast("目前無法檢查 App 更新，請確認網路", "err");
    return null;
  }
  if (latest > installed) {
    if (manual || store.get(SKIP_KEY) !== String(latest)) showBanner(latest);
  } else if (manual) {
    toast(`App 已是最新版 ${versionName(installed)}`, "ok");
  }
  return latest;
}

function showBanner(latest) {
  document.querySelector(".apk-banner")?.remove();
  const banner = h("div", { class: "install-banner apk-banner", role: "status" }, [
    h("img", { src: "./icons/icon-192.png", alt: "" }),
    h("div", { class: "grow" }, [
      h("b", {}, `有新版 App ${versionName(latest)}`),
      h("div", { class: "sub" }, "下載後直接安裝，會覆蓋舊版，資料不受影響"),
    ]),
    h("button", { class: "btn btn-sm btn-ghost", onclick: () => { store.set(SKIP_KEY, String(latest)); banner.remove(); } }, "稍後"),
    h("button", { class: "btn btn-sm btn-primary", onclick: () => { banner.remove(); downloadApk(latest); } }, [icon("download"), "更新"]),
  ]);
  document.body.append(banner);
}

const updater = () => window.Capacitor?.Plugins?.ApkUpdater || null;
export const inAppUpdate = () => !!updater();
const releaseApk = (build) => `https://github.com/waynelin-yuzhi/bonsai-journal/releases/download/android-${build}/bonsai-journal.apk`;

// 更新 App：新版外殼在 App 裡下載安裝；舊版外殼（或 App 內更新失敗）交給手機瀏覽器下載
export async function downloadApk(latest) {
  const up = updater();
  if (!up || !latest) { location.href = APK_URL; return; }
  try {
    if (!(await up.canInstall()).allowed && !(await allowInstall(up))) return;
    await downloadWithProgress(up, latest);
  } catch (err) {
    console.warn("App 內更新失敗", err);
    toast("App 內更新沒有成功，改用瀏覽器下載", "err");
    setTimeout(() => { location.href = APK_URL; }, 1500);
  }
}

// 第一次在 App 內更新：Android 要先允許這個 App「安裝不明應用程式」，從設定回來後自動繼續
function allowInstall(up) {
  return new Promise((resolve) => {
    sheet("允許 App 安裝更新", (close) => h("div", {}, [
      h("p", { class: "sheet-msg" }, "第一次在 App 裡更新，Android 需要你允許 Bonsai Journal 安裝更新。按「前往設定」打開「允許安裝」的開關，再回到 App 就會自動開始下載。之後更新都不用再設定。"),
      h("div", { class: "row" }, [
        h("button", { class: "btn btn-block", onclick: () => { close(); resolve(false); } }, "取消"),
        h("button", { class: "btn btn-primary btn-block", onclick: async () => {
          close();
          const back = new Promise((r) => {
            const on = () => { if (document.visibilityState === "visible") { document.removeEventListener("visibilitychange", on); r(); } };
            document.addEventListener("visibilitychange", on);
          });
          await up.openInstallSettings();
          await back;
          const { allowed } = await up.canInstall();
          if (!allowed) toast("還沒允許安裝，之後可以再按一次更新", "err");
          resolve(allowed);
        } }, "前往設定"),
      ]),
    ]));
  });
}

// 下載進度視窗；下載完成後系統會跳出安裝畫面
async function downloadWithProgress(up, latest) {
  const fill = h("div", { class: "dl-fill" });
  const text = h("div", { class: "dl-text" }, "準備下載…");
  const overlay = h("div", { class: "busy-overlay" }, h("div", { class: "busy-card dl-card" }, [
    h("div", { class: "dl-title" }, `下載新版 App ${versionName(latest)}`),
    h("div", { class: "dl-bar" }, fill),
    text,
  ]));
  document.getElementById("modal-root").append(overlay);
  const mb = (n) => (n / 1048576).toFixed(1);
  const listener = up.addListener("progress", ({ loaded, total }) => {
    const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
    fill.style.width = `${pct}%`;
    text.textContent = total > 0 ? `${mb(loaded)} / ${mb(total)} MB` : `${mb(loaded)} MB`;
  });
  try {
    await up.downloadAndInstall({ url: releaseApk(latest) });
    fill.style.width = "100%";
    text.textContent = "下載完成，請在系統畫面按「安裝」";
    setTimeout(() => overlay.remove(), 4000);
  } catch (err) {
    overlay.remove();
    throw err;
  } finally {
    Promise.resolve(listener).then((l) => l?.remove?.()).catch(() => {});
  }
}
