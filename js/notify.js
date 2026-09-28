// 到期通知：Android App 用手機本機通知（Capacitor LocalNotifications），不需要伺服器
//   · 每個有提醒的日子排一則通知，在設定的時間跳出（預設早上 8 點），同一天的合併成一則
//   · 打開 App、提醒有變動時重新排程；點通知會打開「提醒」頁
//   · 網頁版與舊版 App 沒有這個功能，打開「提醒」頁一樣看得到到期事項
import { today } from "./ui.js";

const LN = () => window.Capacitor?.Plugins?.LocalNotifications || null;
const KEY = "bj-notify";
const CHANNEL = "reminders";
const TEST_ID = 1;
const MAX_DAYS = 60; // 最多先排 60 個日子，其餘等下次打開 App 再排

export const notifySupported = () => !!LN();

export function notifyPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || "null");
    if (p && typeof p.on === "boolean") return { on: p.on, hour: Number.isInteger(p.hour) ? p.hour : 8, asked: !!p.asked };
  } catch { /* 讀不到就用預設 */ }
  return { on: false, hour: 8, asked: false };
}

function savePrefs(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 存不了就算了 */ }
}

// granted／denied／prompt
export async function notifyPermission() {
  const ln = LN();
  if (!ln) return "unsupported";
  try {
    const { display } = await ln.checkPermissions();
    return display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";
  } catch {
    return "prompt";
  }
}

async function ensureChannel(ln) {
  try {
    await ln.createChannel({
      id: CHANNEL, name: "盆栽提醒", description: "紀錄裡「下次預計」的到期提醒",
      importance: 4, visibility: 1, vibration: true,
    });
  } catch { /* 舊版 Android 沒有通知頻道 */ }
}

// 開啟通知：要系統權限；回傳是否成功
export async function enableNotify(reminders) {
  const ln = LN();
  if (!ln) return false;
  const p = notifyPrefs();
  p.asked = true;
  let granted = false;
  try {
    const { display } = await ln.requestPermissions();
    granted = display === "granted";
  } catch { /* 使用者拒絕或系統不支援 */ }
  p.on = granted;
  savePrefs(p);
  if (granted) {
    await ensureChannel(ln);
    await syncNotifications(reminders);
  }
  return granted;
}

export async function disableNotify() {
  savePrefs({ ...notifyPrefs(), on: false });
  await cancelScheduled();
}

export async function setNotifyHour(hour, reminders) {
  savePrefs({ ...notifyPrefs(), hour });
  await syncNotifications(reminders);
}

// 第一次設定「下次預計日期」時，順便詢問要不要開通知（只問一次）
export async function maybeAskNotify(reminders) {
  const p = notifyPrefs();
  if (!LN() || p.on || p.asked) return;
  if ((await notifyPermission()) === "denied") { savePrefs({ ...p, asked: true }); return; }
  await enableNotify(reminders);
}

async function cancelScheduled() {
  const ln = LN();
  if (!ln) return;
  try {
    const { notifications = [] } = await ln.getPending();
    const ours = notifications.filter((n) => n.id !== TEST_ID);
    if (ours.length) await ln.cancel({ notifications: ours.map((n) => ({ id: n.id })) });
  } catch (err) {
    console.warn("取消通知失敗", err);
  }
}

// 依提醒清單重新排程；reminders 是 db.openReminders() 的結果
// 同時有好幾次更新時依序處理，只排最新的一份，避免互相取消
let running = null;
let queued;
export function syncNotifications(reminders) {
  queued = reminders;
  if (!running) {
    running = (async () => {
      while (queued !== undefined) {
        const list = queued;
        queued = undefined;
        await reschedule(list);
      }
      running = null;
    })();
  }
  return running;
}

async function reschedule(reminders) {
  const ln = LN();
  const p = notifyPrefs();
  if (!ln || !p.on || !reminders) return;
  if ((await notifyPermission()) !== "granted") return;
  await cancelScheduled();

  const byDay = new Map();
  for (const r of reminders) {
    const d = r.next_snoozed_to || r.next_date;
    if (!d || d < today()) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(r);
  }
  const now = Date.now();
  const list = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, items]) => ({ day, items, at: atHour(day, p.hour) }))
    .filter((x) => x.at.getTime() > now + 30 * 1000)
    .slice(0, MAX_DAYS);
  if (!list.length) return;

  await ensureChannel(ln);
  try {
    await ln.schedule({ notifications: list.map(({ day, items, at }) => message(day, items, at)) });
  } catch (err) {
    console.warn("排程通知失敗", err);
  }
}

function atHour(day, hour) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, hour, 0, 0);
}

const label = (r) => {
  const t = r.trees;
  const name = t?.name?.trim() || t?.species?.name || "未命名盆栽";
  return `${name}：${r.next_action || "預計的作業"}`;
};

function message(day, items, at) {
  const lines = items.map(label);
  return {
    id: Number(day.replace(/-/g, "")), // 20261015：一天一則，重排時會覆蓋
    title: items.length === 1 ? "今天的盆栽提醒" : `今天有 ${items.length} 件盆栽提醒`,
    body: items.length === 1 ? lines[0] : `${lines[0]} 等 ${items.length} 件`,
    largeBody: lines.join("\n"),
    channelId: CHANNEL,
    smallIcon: "ic_stat_bonsai",
    iconColor: "#151513",
    schedule: { at: at.toISOString(), allowWhileIdle: true },
    extra: { route: "#/reminders" },
  };
}

// 設定頁「測試通知」：5 秒後跳一則
export async function testNotify() {
  const ln = LN();
  if (!ln) return false;
  await ensureChannel(ln);
  await ln.schedule({ notifications: [{
    id: TEST_ID, title: "Bonsai Journal", body: "通知正常，到期那天會在這個時間提醒你。",
    channelId: CHANNEL, smallIcon: "ic_stat_bonsai", iconColor: "#151513",
    schedule: { at: new Date(Date.now() + 5000).toISOString(), allowWhileIdle: true },
    extra: { route: "#/reminders" },
  }] });
  return true;
}

// 點通知 → 打開提醒頁（App 被通知叫醒時，事件會保留到這裡註冊為止）
export function initNotify() {
  const ln = LN();
  if (!ln) return;
  try {
    ln.addListener("localNotificationActionPerformed", (a) => {
      const route = a?.notification?.extra?.route;
      if (typeof route === "string" && route.startsWith("#/")) location.hash = route;
    });
  } catch (err) {
    console.warn(err);
  }
}

// 登出：清掉這支手機上排好的通知
export async function clearNotifications() {
  await cancelScheduled();
}
