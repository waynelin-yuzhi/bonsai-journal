// 單筆紀錄：照片、作業、特徵、用材、備註
import { getEntry, deleteEntry, myId, creatorNames } from "../db.js";
import { h, loading, photoImg, hydratePhotos, fmtDate, confirmDialog, busy, toast, sectionTitle, creatorLabel, treeTitle } from "../ui.js";
import { icon } from "../icons.js";
import { ANGLES, ANGLE_LABEL, VIGOR_LABEL } from "../constants.js";
import { openViewer } from "../viewer.js";

export async function renderEntry(el, ctx) {
  const [id] = ctx.params;
  el.append(loading());
  const [e, me] = await Promise.all([getEntry(id), myId()]);
  // 前任創作者寫的紀錄：顯示作者、唯讀
  const mine = e.owner_id === me;
  const names = mine ? {} : await creatorNames([e.owner_id]);
  if (!ctx.alive()) return;
  const tree = e.trees;
  ctx.setTitle(treeTitle(tree));
  ctx.setParent(`#/tree/${tree.id}`);
  if (mine) ctx.setActions(h("a", { class: "icon-btn", href: `#/entry/${id}/edit`, title: "編輯", "aria-label": "編輯紀錄" }, icon("edit")));

  // 五個角度依序，細節放後面
  const order = ANGLES.map((a) => a.key);
  const angled = e.photos.filter((p) => p.angle !== "detail").sort((a, b) => order.indexOf(a.angle) - order.indexOf(b.angle));
  const details = e.photos.filter((p) => p.angle === "detail");
  const all = [...angled, ...details];
  const items = all.map((p) => ({ path: p.path, label: `${fmtDate(e.entry_date)} ${ANGLE_LABEL[p.angle]}`, caption: p.caption }));
  const view = (p) => () => openViewer(items, all.indexOf(p));

  const facts = [
    e.height_cm != null && ["樹高", `${+e.height_cm} cm`],
    e.width_cm != null && ["幅寬", `${+e.width_cm} cm`],
    e.trunk_cm != null && ["幹徑", `${+e.trunk_cm} cm`],
    e.vigor && ["樹勢", `${e.vigor}・${VIGOR_LABEL[e.vigor]}`],
  ].filter(Boolean);
  const materials = [["線材", e.wire], ["用土", e.soil], ["肥料／藥劑", e.fertilizer]].filter(([, x]) => x);

  el.replaceChildren(...[
    h("div", { class: "entry-head" }, [
      h("div", { class: "entry-date" }, fmtDate(e.entry_date)),
      h("a", { class: "entry-tree", href: `#/tree/${tree.id}` }, [treeTitle(tree), tree.code && ` · ${tree.code}`]),
      !mine && h("div", { class: "entry-author" }, `前任創作者 ${creatorLabel(e.owner_id, names, me)} 的紀錄・唯讀`),
    ]),
    e.operations.length && h("div", { class: "tags big" }, e.operations.map((o) => h("span", { class: "tag" }, o))),

    angled.length && h("div", { class: "photo-grid" }, angled.map((p) =>
      h("button", { class: "photo-cell", onclick: view(p) }, [photoImg(p.thumb_path), h("span", { class: "cell-label" }, ANGLE_LABEL[p.angle])])
    )),
    details.length && sectionTitle("細節", "DETAILS"),
    details.length && h("div", { class: "detail-view" }, details.map((p) =>
      h("button", { class: "detail-view-row", onclick: view(p) }, [photoImg(p.thumb_path, { class: "thumb" }), h("span", {}, p.caption || "（無說明）")])
    )),
    !all.length && h("div", { class: "empty small" }, "這筆紀錄沒有照片"),

    e.note && h("div", { class: "card note" }, e.note),
    e.next_action && h("div", { class: "card next" }, [
      h("div", { class: "k" }, "下次預計"),
      h("div", {}, `${e.next_action}${e.next_date ? `（${fmtDate(e.next_date)}）` : ""}`),
    ]),
    facts.length && h("div", { class: "card facts" }, facts.map(([k, v]) => h("div", {}, [h("div", { class: "v" }, v), h("div", { class: "k" }, k)]))),
    materials.length && h("div", { class: "card kv" }, materials.map(([k, v]) => h("div", { class: "kv-row" }, [h("span", { class: "k" }, k), h("span", {}, v)]))),

    mine && h("div", { class: "danger-zone" }, h("button", {
      class: "btn btn-ghost-danger btn-sm",
      onclick: async () => {
        if (!(await confirmDialog("刪除這筆紀錄？", `${fmtDate(e.entry_date)} 的紀錄和 ${all.length} 張照片會一起刪除，無法復原。`, "刪除"))) return;
        const b = busy("刪除中…");
        try {
          await deleteEntry(id);
          toast("已刪除", "ok");
          location.replace(`#/tree/${tree.id}`);
        } catch (err) {
          toast("刪除失敗：" + err.message, "err");
        } finally {
          b.remove();
        }
      },
    }, "刪除這筆紀錄")),
  ].filter(Boolean));
  hydratePhotos(el);
}
