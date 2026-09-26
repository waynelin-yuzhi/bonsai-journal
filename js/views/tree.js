// 單棵樹：樹檔資訊 + 時間軸
import { getTree, listEntries, listSpecies, deleteTree } from "../db.js";
import { h, loading, photoImg, hydratePhotos, fmtDate, daysBetween, durationText, confirmDialog, busy, toast, sectionTitle } from "../ui.js";
import { icon, enso } from "../icons.js";
import { ANGLES } from "../constants.js";
import { openTreeForm } from "./trees.js";
import { openViewer } from "../viewer.js";

const ANGLE_ORDER = [...ANGLES.map((a) => a.key), "detail"];

export async function renderTree(el, ctx) {
  const [id] = ctx.params;
  el.replaceChildren(loading());
  const [tree, entries] = await Promise.all([getTree(id), listEntries(id)]);
  if (!ctx.alive()) return;
  ctx.setTitle(tree.name);

  const edit = async () => {
    const species = await listSpecies();
    openTreeForm({ tree, species, onSaved: () => renderTree(el, ctx) });
  };
  ctx.setActions(h("button", { class: "icon-btn", title: "編輯樹檔", "aria-label": "編輯樹檔", onclick: edit }, icon("edit")));

  // 封面：最新一張正面照（沒有就用最新任一張）
  const allPhotos = entries.flatMap((e) => e.photos);
  const cover = allPhotos.find((p) => p.angle === "front") || allPhotos[0];

  const facts = [
    tree.species_name,
    tree.source,
    tree.acquired_on && `${fmtDate(tree.acquired_on)} 取得`,
  ].filter(Boolean);
  const stats = [
    tree.acquired_on && ["培養", durationText(tree.acquired_on) || "—"],
    tree.est_age != null && tree.acquired_on && ["估計樹齡", `約 ${tree.est_age + yearsSince(tree.acquired_on)} 年`],
    ["紀錄", `${entries.length} 次`],
  ].filter(Boolean);

  const header = h("div", { class: "tree-hero" }, [
    cover
      ? h("div", { class: "hero-cover", onclick: () => openViewer([{ path: cover.path, label: fmtDate(entries.find((e) => e.id === cover.entry_id)?.entry_date) }], 0) }, photoImg(cover.path))
      : h("div", { class: "hero-cover empty-cover" }, enso()),
    h("div", { class: "hero-body" }, [
      h("div", { class: "hero-title" }, [tree.name, tree.code && h("span", { class: "code" }, tree.code)]),
      facts.length && h("div", { class: "hero-facts" }, facts.join(" · ")),
      h("div", { class: "hero-stats" }, stats.map(([k, v]) => h("div", {}, [h("div", { class: "v" }, v), h("div", { class: "k" }, k)]))),
      tree.pot && h("div", { class: "hero-line" }, `盆器：${tree.pot}`),
      tree.front_note && h("div", { class: "hero-line" }, `正面：${tree.front_note}`),
      tree.note && h("div", { class: "hero-note" }, tree.note),
      tree.status === "archived" && h("div", { class: "tag muted" }, "已封存"),
    ]),
  ]);

  const tools = h("div", { class: "row tools" }, [
    h("a", { class: "btn", href: `#/tree/${id}/compare` }, [icon("compare"), "前後對比"]),
    h("a", { class: "btn btn-primary", href: `#/tree/${id}/new` }, [icon("plus"), "新增紀錄"]),
  ]);

  const timeline = entries.length
    ? h("div", { class: "timeline" }, entries.map((e, i) => timelineItem(e, entries[i + 1], entries.length - i)))
    : h("div", { class: "empty" }, [
        h("p", {}, "還沒有紀錄。"),
        h("p", { class: "muted" }, "建議先拍一組正面、背面、左、右、俯視的「初始紀錄」，之後才有對照的基準。"),
      ]);

  const danger = h("div", { class: "danger-zone" }, h("button", {
    class: "btn btn-ghost-danger btn-sm",
    onclick: async () => {
      const ok = await confirmDialog("刪除這棵樹？", `「${tree.name}」的 ${entries.length} 筆紀錄和所有照片都會一起刪除，無法復原。`, "刪除");
      if (!ok) return;
      const b = busy("刪除中…");
      try {
        await deleteTree(id);
        toast("已刪除", "ok");
        location.replace("#/trees");
      } catch (err) {
        toast("刪除失敗：" + err.message, "err");
      } finally {
        b.remove();
      }
    },
  }, "刪除這棵樹"));

  el.replaceChildren(header, tools, sectionTitle("時間軸", "TIMELINE"), timeline, danger);
  hydratePhotos(el);
}

function timelineItem(e, prev, no) {
  const gap = prev ? daysBetween(prev.entry_date, e.entry_date) : null;
  const photos = [...e.photos].sort((a, b) => ANGLE_ORDER.indexOf(a.angle) - ANGLE_ORDER.indexOf(b.angle));
  return h("a", { class: "tl-item", href: `#/entry/${e.id}` }, [
    h("div", { class: "tl-dot" }),
    h("div", { class: "tl-card" }, [
      h("div", { class: "tl-head" }, [
        h("span", {}, [h("span", { class: "tl-no" }, `#${String(no).padStart(2, "0")}`), h("span", { class: "tl-date" }, fmtDate(e.entry_date))]),
        gap != null && h("span", { class: "tl-gap" }, gap === 0 ? "同一天" : `距上次 ${gap} 天`),
      ]),
      e.operations.length && h("div", { class: "tags" }, e.operations.map((o) => h("span", { class: "tag" }, o))),
      photos.length && h("div", { class: "tl-thumbs" }, [
        ...photos.slice(0, 5).map((p) => photoImg(p.thumb_path, { class: "thumb" })),
        photos.length > 5 && h("span", { class: "thumb more" }, `+${photos.length - 5}`),
      ]),
      e.note && h("div", { class: "tl-note" }, e.note),
      e.next_action && h("div", { class: "tl-next" }, `下次：${e.next_action}${e.next_date ? `（${fmtDate(e.next_date)}）` : ""}`),
    ]),
  ]);
}

function yearsSince(date) {
  const [y, m, d] = date.split("-").map(Number);
  const now = new Date();
  let years = now.getFullYear() - y;
  if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) years--;
  return Math.max(0, years);
}
