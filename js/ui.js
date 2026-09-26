// 輕量 UI 工具：DOM 建構、Toast、底部彈窗、進度、日期格式

import { signedUrls } from "./db.js";
import { enso } from "./icons.js";

export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  // 條件式子節點常寫成 `list.length && h(...)`，所以 0 和空字串也略過（數字請先轉字串）
  for (const c of [].concat(children)) {
    if (c == null || c === false || c === 0 || c === "") continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function toast(msg, type = "") {
  const t = h("div", { class: "toast " + type }, msg);
  document.getElementById("toast-root").append(t);
  setTimeout(() => t.remove(), 2600);
}

// 畫面中央的轉圈彈窗，文字可即時更新（例如「上傳照片 2/6」）
export function busy(msg) {
  const text = h("div", { class: "busy-text" }, msg);
  const overlay = h("div", { class: "busy-overlay" }, h("div", { class: "busy-card" }, [h("div", { class: "spinner" }, enso()), text]));
  document.getElementById("modal-root").append(overlay);
  return {
    update(m) { text.textContent = m; },
    remove() { overlay.remove(); },
  };
}

// 底部彈窗。renderBody(close) 回傳 DOM 節點。
export function sheet(title, renderBody) {
  const root = document.getElementById("modal-root");
  const close = () => overlay.remove();
  const body = renderBody(close);
  const sheetEl = h("div", { class: "modal-sheet" }, [h("h3", {}, title), body]);
  const overlay = h("div", { class: "modal-overlay", onclick: (e) => { if (e.target === overlay) close(); } }, sheetEl);
  root.append(overlay);
  return close;
}

export function confirmDialog(title, message, okLabel = "確定") {
  return new Promise((resolve) => {
    sheet(title, (done) =>
      h("div", {}, [
        h("p", { class: "sheet-msg" }, message),
        h("div", { class: "row" }, [
          h("button", { class: "btn btn-block", onclick: () => { done(); resolve(false); } }, "取消"),
          h("button", { class: "btn btn-danger btn-block", onclick: () => { done(); resolve(true); } }, okLabel),
        ]),
      ])
    );
  });
}

export function promptDialog(title, placeholder = "") {
  return new Promise((resolve) => {
    const input = h("input", { type: "text", placeholder });
    sheet(title, (done) => {
      const ok = () => { const v = input.value.trim(); done(); resolve(v || null); };
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") ok(); });
      setTimeout(() => input.focus(), 50);
      return h("div", {}, [
        h("div", { class: "field" }, input),
        h("div", { class: "row" }, [
          h("button", { class: "btn btn-block", onclick: () => { done(); resolve(null); } }, "取消"),
          h("button", { class: "btn btn-primary btn-block", onclick: ok }, "確定"),
        ]),
      ]);
    });
  });
}

// 段落標題：中文明體＋英文小標，例：sectionTitle("照片", "PHOTOS")
export function sectionTitle(zh, en) {
  return h("div", { class: "section-title" }, [h("span", {}, zh), en && h("span", { class: "en" }, en)]);
}

export function field(label, inputEl, hint) {
  return h("div", { class: "field" }, [h("label", {}, label), inputEl, hint && h("div", { class: "hint" }, hint)]);
}

export function loading() {
  return h("div", { class: "empty" }, "載入中…");
}

// ---------- 照片：先放 data-path，再批次換成簽名網址 ----------
export function photoImg(path, attrs = {}) {
  return h("img", { ...attrs, "data-path": path, alt: attrs.alt || "", loading: "lazy", decoding: "async" });
}

export async function hydratePhotos(root) {
  const imgs = [...root.querySelectorAll("img[data-path]")];
  if (!imgs.length) return;
  const urls = await signedUrls(imgs.map((i) => i.dataset.path));
  for (const img of imgs) {
    const u = urls[img.dataset.path];
    if (u) img.src = u;
    img.removeAttribute("data-path");
  }
}

// ---------- 日期 ----------
export const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD（本地時區）

export function fmtDate(d) {
  if (!d) return "";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${y}.${m}.${day}`;
}

export function fmtDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// 創作者顯示名稱：自己沒設定就顯示「你」，別人沒設定顯示「未命名創作者」
export function creatorLabel(id, names, me) {
  const n = (names[id] || "").trim();
  if (id === me) return n ? `${n}（你）` : "你";
  return n || "未命名創作者";
}

export function daysBetween(a, b) {
  const t = (d) => Date.UTC(...d.slice(0, 10).split("-").map((x, i) => (i === 1 ? x - 1 : +x)));
  return Math.round((t(b) - t(a)) / 86400000);
}

// 「2 年 3 個月」
export function durationText(from, to = today()) {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) return "";
  if (months < 1) return `${daysBetween(from, to)} 天`;
  const y = Math.floor(months / 12), m = months % 12;
  return [y && `${y} 年`, m && `${m} 個月`].filter(Boolean).join(" ");
}
