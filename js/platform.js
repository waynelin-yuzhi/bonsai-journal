// 是否在 Android App（Capacitor 外殼）裡執行：外殼會在 User-Agent 加上 BonsaiJournalApp
export const isNativeApp = () =>
  /BonsaiJournalApp/.test(navigator.userAgent) || !!window.Capacitor?.isNativePlatform?.();

export const WEB_URL = "https://waynelin-yuzhi.github.io/bonsai-journal/";
