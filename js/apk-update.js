// Android App 外殼更新通知：打開 App 時去 GitHub 查最新的 APK 打包編號，
// 比手機上安裝的新就提示下載（桌面名稱、圖示、權限這類改動要裝新 APK 才會生效）。
import { h, toast } from "./ui.js";
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
    h("button", { class: "btn btn-sm btn-primary", onclick: () => { banner.remove(); downloadApk(); } }, [icon("download"), "下載"]),
  ]);
  document.body.append(banner);
}

// App 會把外部網址交給手機瀏覽器開啟，由瀏覽器下載 APK
export function downloadApk() {
  location.href = APK_URL;
}
