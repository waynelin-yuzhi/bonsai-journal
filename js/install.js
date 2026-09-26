// 安裝成 App：Android 的 Chrome 會發出 beforeinstallprompt，攔下來改成 App 內的「安裝」按鈕，
// 點了就跳出系統安裝視窗，裝好後會出現在手機桌面和 App 列表。
// iPhone 沒有這個事件，只能用 Safari 分享選單「加入主畫面」，設定頁會顯示說明。
import { h, toast } from "./ui.js";
import { isNativeApp } from "./platform.js";

const DISMISS_KEY = "bj-install-dismissed";
let deferred = null;
const listeners = new Set();

export const isStandalone = () =>
  isNativeApp() || matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
export const canInstall = () => !!deferred;
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

// 安裝狀態改變時通知（設定頁用來更新畫面）
export function onInstallChange(fn) {
  listeners.add(fn);
}
const notify = () => listeners.forEach((fn) => fn());

export function initInstall() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    notify();
    if (!dismissed()) showBanner();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    document.querySelector(".install-banner")?.remove();
    notify();
    toast("已安裝，之後可以從手機桌面開啟", "ok");
  });
}

export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null; // 同一個事件只能跳一次安裝視窗
  document.querySelector(".install-banner")?.remove();
  e.prompt();
  const { outcome } = await e.userChoice;
  notify();
  return outcome === "accepted";
}

function dismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function showBanner() {
  if (isStandalone() || document.querySelector(".install-banner")) return;
  const banner = h("div", { class: "install-banner" }, [
    h("img", { src: "./icons/icon-192.png", alt: "" }),
    h("div", { class: "grow" }, [
      h("b", {}, "安裝成 App"),
      h("div", { class: "sub" }, "從手機桌面直接開啟，全螢幕使用"),
    ]),
    h("button", { class: "btn btn-sm btn-ghost", onclick: () => {
      try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* 無痕模式存不了就算了 */ }
      banner.remove();
    } }, "不用"),
    h("button", { class: "btn btn-sm btn-primary", onclick: promptInstall }, "安裝"),
  ]);
  document.body.append(banner);
}
