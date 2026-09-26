// 最近紀錄：所有樹的紀錄依日期排列，按月份分組
import { recentEntries } from "../db.js";
import { h, loading, photoImg, hydratePhotos, fmtDate, sectionTitle } from "../ui.js";
import { enso } from "../icons.js";

export async function renderRecent(el, ctx) {
  el.append(loading());
  const entries = await recentEntries();
  if (!ctx.alive()) return;

  if (!entries.length) {
    el.replaceChildren(h("div", { class: "empty" }, "還沒有任何紀錄"));
    return;
  }

  const groups = new Map();
  for (const e of entries) {
    const [y, m] = e.entry_date.split("-");
    const key = `${y}.${m}|${y} 年 ${+m} 月`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  el.replaceChildren(...[...groups].flatMap(([key, list]) => [
    sectionTitle(key.split("|")[1], key.split("|")[0]),
    ...list.map((e) => {
      const cover = e.photos.find((p) => p.angle === "front") || e.photos[0];
      return h("a", { class: "list-item", href: `#/entry/${e.id}` }, [
        cover ? photoImg(cover.thumb_path, { class: "thumb" }) : h("span", { class: "thumb ph" }, enso()),
        h("div", { class: "grow" }, [
          h("div", { class: "title" }, e.trees?.name || ""),
          h("div", { class: "sub" }, [fmtDate(e.entry_date), e.photos.length > 0 && ` · ${e.photos.length} 張照片`]),
          e.operations.length && h("div", { class: "tags" }, e.operations.map((o) => h("span", { class: "tag" }, o))),
        ]),
      ]);
    }),
  ]));
  hydratePhotos(el);
}
