// 雜湊路由：#/trees、#/tree/:id、#/tree/:id/new、#/entry/:id、#/entry/:id/edit…
import { h } from "./ui.js";
import { renderTrees } from "./views/trees.js";
import { renderTree } from "./views/tree.js";
import { renderEntry } from "./views/entry.js";
import { renderEntryForm } from "./views/entry-form.js";
import { renderCompare } from "./views/compare.js";
import { renderRecent } from "./views/recent.js";
import { renderSettings } from "./views/settings.js";

const ID = "([0-9a-f-]{36})";
const routes = [
  { re: /^trees$/, tab: "trees", title: "我的樹", render: renderTrees },
  { re: new RegExp(`^tree/${ID}$`), tab: "trees", parent: () => "#/trees", render: renderTree },
  { re: new RegExp(`^tree/${ID}/new$`), tab: "trees", title: "新增紀錄", noTabs: true, parent: ([id]) => `#/tree/${id}`, render: (el, ctx) => renderEntryForm(el, { ...ctx, mode: "new" }) },
  { re: new RegExp(`^tree/${ID}/compare$`), tab: "trees", title: "前後對比", parent: ([id]) => `#/tree/${id}`, render: renderCompare },
  { re: new RegExp(`^entry/${ID}$`), tab: "trees", title: "紀錄", parent: () => "#/trees", render: renderEntry },
  { re: new RegExp(`^entry/${ID}/edit$`), tab: "trees", title: "編輯紀錄", noTabs: true, parent: ([id]) => `#/entry/${id}`, render: (el, ctx) => renderEntryForm(el, { ...ctx, mode: "edit" }) },
  { re: /^recent$/, tab: "recent", title: "最近紀錄", render: renderRecent },
  { re: /^settings$/, tab: "settings", title: "設定", render: renderSettings },
];

let navCount = 0;       // App 內換頁次數：大於 0 才用 history.back()，否則回上層
let leaveGuard = null;  // 編輯中頁面可設定離開前確認
let current = null;

export function startRouter() {
  window.addEventListener("hashchange", () => { navCount++; handleRoute(); });
  document.getElementById("back-btn").addEventListener("click", () => guarded(() => {
    if (navCount > 0) history.back();
    else location.hash = current?.parentHash || "#/trees";
  }));
  document.querySelectorAll(".tab").forEach((a) => a.addEventListener("click", (e) => {
    if (!leaveGuard) return;
    e.preventDefault();
    guarded(() => { location.hash = a.getAttribute("href"); });
  }));
  if (!location.hash || location.hash === "#/") location.replace("#/trees");
  handleRoute();
}

async function guarded(go) {
  if (await confirmLeave()) go();
}

// 離開目前頁面前確認（編輯中未儲存會詢問）；線上更新重新載入前也會用到
export async function confirmLeave() {
  if (leaveGuard && !(await leaveGuard())) return false;
  leaveGuard = null;
  return true;
}

async function handleRoute() {
  const path = location.hash.replace(/^#\/?/, "");
  let route = routes[0], params = [];
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) { route = r; params = m.slice(1); break; }
  }
  leaveGuard = null;

  const container = h("div", { class: "page" });
  const token = (current = { container, parentHash: route.parent?.(params) });
  const alive = () => current === token;

  document.body.classList.toggle("no-tabs", !!route.noTabs);
  document.getElementById("back-btn").classList.toggle("hidden", !route.parent);
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === route.tab));
  const titleEl = document.getElementById("page-title");
  const actionsEl = document.getElementById("topbar-actions");
  titleEl.textContent = route.title || "";
  actionsEl.replaceChildren();

  const view = document.getElementById("view");
  view.replaceChildren(container);
  view.scrollTop = 0;

  const ctx = {
    params,
    alive,
    setTitle: (t) => { if (alive()) titleEl.textContent = t; },
    setActions: (...nodes) => { if (alive()) actionsEl.replaceChildren(...nodes); },
    setParent: (hash) => { token.parentHash = hash; },
    setLeaveGuard: (fn) => { if (alive()) leaveGuard = fn; },
  };
  try {
    await route.render(container, ctx);
  } catch (err) {
    console.error(err);
    // PGRST116：用 .single() 查不到資料（例如已在別的裝置刪除）
    const msg = err?.code === "PGRST116" ? "找不到這筆資料，可能已經刪除了" : `發生錯誤：${err.message || err}`;
    if (alive()) container.replaceChildren(h("div", { class: "empty" }, [msg, h("div", {}, h("a", { class: "btn", href: "#/trees" }, "回到我的樹"))]));
  }
}
