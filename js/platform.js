// 是否在 Android App（Capacitor 外殼）裡執行：外殼會在 User-Agent 加上 BonsaiJournalApp/打包編號
export const isNativeApp = () =>
  /BonsaiJournalApp/.test(navigator.userAgent) || !!window.Capacitor?.isNativePlatform?.();

// 目前安裝的 APK 打包編號（第 N 次打包 = 版本 1.0.N）；舊版外殼沒有帶編號，視為 0；不在 App 裡回傳 null
export function nativeBuild() {
  const m = navigator.userAgent.match(/BonsaiJournalApp(?:\/(\d+))?/);
  if (m) return Number(m[1] || 0);
  return isNativeApp() ? 0 : null;
}

export const WEB_URL = "https://waynelin-yuzhi.github.io/bonsai-journal/";
export const APK_URL = "https://github.com/waynelin-yuzhi/bonsai-journal/releases/latest/download/bonsai-journal.apk";
