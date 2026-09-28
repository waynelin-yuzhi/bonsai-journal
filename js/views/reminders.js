// 提醒：所有盆栽「下次預計」的到期事項，依過期／今天／7 天內／之後分組；最近完成的可以復原
import { doneReminders } from "../db.js";
import { h, loading, sectionTitle } from "../ui.js";
import { icon, enso } from "../icons.js";
import { refreshReminders, reminderRow, daysLeft, byDue } from "../reminders.js";
import { notifySupported, notifyPrefs, notifyPermission, enableNotify } from "../notify.js";
import { isNativeApp } from "../platform.js";
import { checkApkUpdate } from "../apk-update.js";

const GROUPS = [
  { key: "overdue", zh: "已過期", en: "OVERDUE", match: (n) => n < 0 },
  { key: "today", zh: "今天", en: "TODAY", match: (n) => n === 0 },
  { key: "week", zh: "7 天內", en: "THIS WEEK", match: (n) => n > 0 && n <= 7 },
  { key: "later", zh: "之後", en: "LATER", match: (n) => n > 7 },
];

export async function renderReminders(el, ctx) {
  el.append(loading());
  const [open, done, permission] = await Promise.all([refreshReminders(), doneReminders().catch(() => []), notifyPermission()]);
  if (!ctx.alive()) return;
  if (!open) throw new Error("讀取提醒失敗，請確認網路");
  const rerender = () => { el.replaceChildren(); renderReminders(el, ctx); };

  const list = [...open].sort(byDue);
  const sections = GROUPS.flatMap((g) => {
    const items = list.filter((r) => g.match(daysLeft(r)));
    return items.length
      ? [sectionTitle(`${g.zh} ${items.length}`, g.en), h("div", { class: "rem-list" }, items.map((r) => reminderRow(r, { onChange: rerender })))]
      : [];
  });

  const empty = !list.length && h("div", { class: "empty-hero small" }, [
    enso(),
    h("div", { class: "empty-title" }, "目前沒有提醒"),
    h("p", {}, "新增紀錄時填寫「下次預計」和日期，例如蟠扎後檢查咬線、換盆後開始施肥，到期會在這裡提醒。"),
  ]);

  el.replaceChildren(...[
    notifyCard(permission, list, rerender),
    empty,
    ...sections,
    done.length > 0 && h("details", { class: "rem-done" }, [
      h("summary", {}, `最近完成 ${done.length}`),
      h("div", { class: "rem-list" }, done.map((r) => reminderRow(r, { onChange: rerender }))),
    ]),
  ].filter(Boolean));
}

// 到期通知的狀態：Android App 可以開；舊版 App 請更新；網頁版說明
function notifyCard(permission, list, rerender) {
  if (notifySupported()) {
    const p = notifyPrefs();
    if (p.on && permission === "granted") return null;
    if (permission === "denied") {
      return h("div", { class: "notice" }, "通知權限被關閉了。要收到到期通知，請到手機「設定 → 應用程式 → Bonsai Journal → 通知」打開。");
    }
    return h("div", { class: "notice row-between" }, [
      h("span", {}, `到期當天早上 ${p.hour} 點跳通知提醒你`),
      h("button", { class: "btn btn-sm btn-primary", onclick: async () => { await enableNotify(list); rerender(); } }, [icon("bell"), "開啟通知"]),
    ]);
  }
  if (isNativeApp()) {
    return h("div", { class: "notice row-between" }, [
      h("span", {}, "更新 App 後可以收到到期通知"),
      h("button", { class: "btn btn-sm", onclick: () => checkApkUpdate({ manual: true }) }, [icon("refresh"), "檢查更新"]),
    ]);
  }
  return null;
}
