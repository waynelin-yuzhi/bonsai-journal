// 線上更新：部署新版（改 version.json）後，App 回到前景或每 30 分鐘檢查一次，
// 發現版本不同就跳出提示，按「立即更新」重新載入最新版。
import { h, toast } from "./ui.js";
import { confirmLeave } from "./router.js";

const INTERVAL = 30 * 60 * 1000;
let running = null;   // 目前執行中的版本（啟動時讀到的 version.json）
let dismissed = null; // 按過「稍後」的版本，這次開啟期間不再提示

async function fetchVersion() {
  const res = await fetch(`./version.json?t=${Date.now()}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`version.json ${res.status}`);
  return res.json();
}

export const runningVersion = () => running;

export async function startUpdateCheck() {
  try {
    running = await fetchVersion();
  } catch {
    return; // 離線或檔案不存在：不影響使用
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") checkForUpdate();
  });
  setInterval(checkForUpdate, INTERVAL);
}

// manual：從設定頁手動檢查時，沒有新版也要告訴使用者
export async function checkForUpdate({ manual = false } = {}) {
  if (!running) {
    if (manual) toast("目前無法檢查更新，請確認網路", "err");
    return;
  }
  let latest;
  try {
    latest = await fetchVersion();
  } catch {
    if (manual) toast("目前無法檢查更新，請確認網路", "err");
    return;
  }
  if (latest.version === running.version) {
    if (manual) toast(`已經是最新版本 v${running.version}`, "ok");
    return;
  }
  if (!manual && latest.version === dismissed) return;
  showBanner(latest);
}

function showBanner(v) {
  document.querySelector(".update-banner")?.remove();
  const banner = h("div", { class: "update-banner", role: "status" }, [
    h("div", { class: "update-text" }, [
      h("b", {}, `有新版本 v${v.version}`),
      ...(v.notes || []).slice(0, 3).map((n) => h("div", { class: "update-note" }, `・${n}`)),
    ]),
    h("div", { class: "update-actions" }, [
      h("button", { class: "btn btn-sm btn-ghost-light", onclick: () => { dismissed = v.version; banner.remove(); } }, "稍後"),
      h("button", { class: "btn btn-sm btn-light", onclick: applyUpdate }, "立即更新"),
    ]),
  ]);
  document.body.append(banner);
}

async function applyUpdate() {
  // 編輯到一半會先詢問，避免照片和內容遺失
  if (!(await confirmLeave())) return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {
    // 清快取失敗也照樣重新載入；Service Worker 是網路優先，仍會拿到新版
  }
  location.reload();
}
