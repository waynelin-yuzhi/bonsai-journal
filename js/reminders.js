// 提醒共用：到期狀態、完成／延後／復原、分頁上的數字、到期通知同步
import { openReminders, setReminder } from "./db.js";
import { h, sheet, field, toast, today, fmtDate, daysBetween, treeTitle, speciesTag } from "./ui.js";
import { icon } from "./icons.js";
import { syncNotifications } from "./notify.js";

export const dueOf = (r) => r.next_snoozed_to || r.next_date;
export const daysLeft = (r) => daysBetween(today(), dueOf(r));

export function dueText(r) {
  const n = daysLeft(r);
  if (n < 0) return `過期 ${-n} 天`;
  if (n === 0) return "今天";
  if (n === 1) return "明天";
  return `${n} 天後`;
}

export const dueClass = (r) => {
  const n = daysLeft(r);
  return n < 0 ? "overdue" : n === 0 ? "today" : n <= 7 ? "soon" : "later";
};

export const byDue = (a, b) => dueOf(a).localeCompare(dueOf(b)) || a.entry_date.localeCompare(b.entry_date);

// 日期 + N 天／N 個月（YYYY-MM-DD）
export function addDays(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d + n).toLocaleDateString("sv-SE");
}
export function addMonths(date, n) {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(y, m - 1 + n + 1, 0).getDate(); // 1/31 + 1 個月 → 2/28
  return new Date(y, m - 1 + n, Math.min(d, last)).toLocaleDateString("sv-SE");
}

// 預計日期快選：從某一天往後算
export const QUICK_DATES = [
  ["1 週", (d) => addDays(d, 7)],
  ["2 週", (d) => addDays(d, 14)],
  ["1 個月", (d) => addMonths(d, 1)],
  ["2 個月", (d) => addMonths(d, 2)],
  ["3 個月", (d) => addMonths(d, 3)],
];

// ---------- 分頁數字（過期＋今天）與通知同步 ----------
let lastList = null;
export const cachedReminders = () => lastList;

export async function refreshReminders() {
  try {
    lastList = await openReminders();
  } catch (err) {
    console.warn("讀取提醒失敗", err);
    return null;
  }
  const due = lastList.filter((r) => daysLeft(r) <= 0).length;
  const badge = document.querySelector('.tab[data-tab="reminders"] .badge');
  if (badge) {
    badge.textContent = due > 99 ? "99+" : String(due);
    badge.classList.toggle("hidden", !due);
  }
  syncNotifications(lastList).catch((err) => console.warn(err));
  return lastList;
}

export function clearReminderBadge() {
  lastList = null;
  document.querySelector('.tab[data-tab="reminders"] .badge')?.classList.add("hidden");
}

// ---------- 動作 ----------
export async function completeReminder(r, onDone) {
  try {
    await setReminder(r.id, true);
    toast("已完成", "ok");
    refreshReminders();
    onDone?.();
  } catch (err) {
    toast("更新失敗：" + err.message, "err");
  }
}

export async function undoReminder(r, onDone) {
  try {
    await setReminder(r.id, false, r.next_snoozed_to || null);
    toast("已復原", "ok");
    refreshReminders();
    onDone?.();
  } catch (err) {
    toast("更新失敗：" + err.message, "err");
  }
}

// 延後：從今天和原訂日期較晚的那天往後算
export function openSnooze(r, onDone) {
  const base = [today(), dueOf(r)].sort().pop();
  const input = h("input", { type: "date", value: addDays(base, 7), min: today() });
  const options = [
    ["3 天", addDays(base, 3)],
    ["1 週", addDays(base, 7)],
    ["2 週", addDays(base, 14)],
    ["1 個月", addMonths(base, 1)],
  ];
  const chips = h("div", { class: "chips wrap" });
  const drawChips = () => chips.replaceChildren(...options.map(([label, d]) => h("button", {
    class: "chip" + (input.value === d ? " active" : ""),
    onclick: () => { input.value = d; drawChips(); },
  }, label)));
  input.addEventListener("change", drawChips);
  drawChips();

  sheet("延後提醒", (close) => h("div", {}, [
    h("p", { class: "sheet-msg" }, `${treeTitle(r.trees)}：${r.next_action || "預計的作業"}（原訂 ${fmtDate(r.next_date)}）`),
    field("延後到", h("div", {}, [chips, input])),
    h("button", { class: "btn btn-primary btn-block", onclick: async (e) => {
      const btn = e.currentTarget;
      if (!input.value) { toast("請選擇日期", "err"); return; }
      btn.disabled = true;
      try {
        // 延後到原訂日期＝取消延後
        await setReminder(r.id, false, input.value === r.next_date ? null : input.value);
        close();
        toast(`已延後到 ${fmtDate(input.value)}`, "ok");
        refreshReminders();
        onDone?.();
      } catch (err) {
        toast("延後失敗：" + err.message, "err");
        btn.disabled = false;
      }
    } }, "延後"),
  ]));
}

// ---------- 一筆提醒 ----------
// showTree：提醒頁要顯示是哪一盆；盆栽頁不用
export function reminderRow(r, { showTree = true, onChange } = {}) {
  const tree = r.trees;
  const done = !!r.next_done_at;
  const due = dueOf(r);
  const [, m, d] = due.split("-");
  return h("div", { class: `rem-item ${done ? "done" : dueClass(r)}` }, [
    h("div", { class: "rem-date" }, [
      h("div", { class: "rem-md" }, `${m}.${d}`),
      h("div", { class: "rem-left" }, done ? "已完成" : dueText(r)),
    ]),
    h("div", { class: "rem-body" }, [
      showTree && tree && h("a", { class: "rem-tree", href: `#/tree/${r.tree_id}` }, [
        treeTitle(tree), speciesTag(tree) && h("span", { class: "rem-sp" }, speciesTag(tree)),
      ]),
      h("div", { class: "rem-action" }, r.next_action || "預計的作業"),
      h("a", { class: "rem-src", href: `#/entry/${r.id}` }, [
        `${fmtDate(r.entry_date)} 的紀錄`,
        r.next_snoozed_to && !done && ` · 原訂 ${fmtDate(r.next_date)}`,
      ]),
      h("div", { class: "rem-actions" }, done
        ? [h("button", { class: "btn btn-sm", onclick: () => undoReminder(r, onChange) }, [icon("refresh"), "復原"])]
        : [
            h("a", { class: "btn btn-sm btn-primary", href: `#/tree/${r.tree_id}/new` }, [icon("plus"), "記錄"]),
            h("button", { class: "btn btn-sm", onclick: () => completeReminder(r, onChange) }, [icon("check"), "完成"]),
            h("button", { class: "btn btn-sm", onclick: () => openSnooze(r, onChange) }, [icon("clock"), "延後"]),
          ]),
    ]),
  ]);
}
