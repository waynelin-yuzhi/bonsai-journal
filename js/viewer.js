// 全螢幕看照片：左右滑動或點箭頭切換，點背景關閉
import { h, photoImg, hydratePhotos } from "./ui.js";
import { icon } from "./icons.js";

// items: [{ path, label, caption }]
export function openViewer(items, start = 0) {
  let i = start;
  const img = h("img", { class: "viewer-img", alt: "" });
  const label = h("div", { class: "viewer-label" });
  const counter = h("div", { class: "viewer-counter" });
  const prev = h("button", { class: "viewer-nav prev", "aria-label": "上一張", onclick: (e) => { e.stopPropagation(); go(-1); } }, icon("back"));
  const next = h("button", { class: "viewer-nav next", "aria-label": "下一張", onclick: (e) => { e.stopPropagation(); go(1); } }, icon("forward"));
  const close = () => { overlay.remove(); document.removeEventListener("keydown", onKey); };
  let swiped = false;
  const overlay = h("div", { class: "viewer", onclick: (e) => {
    if (swiped) { swiped = false; return; }
    if (e.target === overlay) close();
  } }, [
    img, label, counter, prev, next,
    h("button", { class: "viewer-close", "aria-label": "關閉", onclick: close }, icon("close")),
  ]);

  async function show() {
    const it = items[i];
    img.removeAttribute("src");
    const tmp = photoImg(it.path);
    const holder = h("div", {}, tmp);
    await hydratePhotos(holder);
    img.src = tmp.src;
    label.replaceChildren(...[it.label && h("b", {}, it.label), it.caption && h("span", {}, it.caption)].filter(Boolean));
    counter.textContent = items.length > 1 ? `${i + 1} / ${items.length}` : "";
    prev.classList.toggle("hidden", i === 0);
    next.classList.toggle("hidden", i === items.length - 1);
  }
  function go(d) {
    const n = i + d;
    if (n < 0 || n >= items.length) return;
    i = n;
    show();
  }
  function onKey(e) {
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  }

  // 滑動切換
  let x0 = null;
  overlay.addEventListener("pointerdown", (e) => { x0 = e.clientX; swiped = false; });
  overlay.addEventListener("pointerup", (e) => {
    if (x0 == null) return;
    const dx = e.clientX - x0;
    x0 = null;
    if (Math.abs(dx) > 50) { swiped = true; go(dx < 0 ? 1 : -1); }
  });

  document.addEventListener("keydown", onKey);
  document.getElementById("modal-root").append(overlay);
  show();
}
