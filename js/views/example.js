// 名木範例：唯讀展示一盆名木的一生（身分證、傳承、時間軸＋當時的照片、資料來源）
import { h, loading, sectionTitle } from "../ui.js";
import { icon, enso } from "../icons.js";
import { loadExample, exampleAsset } from "../examples.js";
import { openViewer } from "../viewer.js";

// 每筆紀錄依 JSON 的順序（由舊到新）。date 可以只有年或年月（1625、1945-08-06）；
// 年代不詳的用 when 顯示文字，year 用來算「距上次幾年」
const fmtWhen = (d) => (d ? d.replace(/-/g, ".") : "");
const yearOf = (d) => +String(d).slice(0, 4);
const whenOf = (e) => e.when || fmtWhen(e.date);
const yearNum = (e) => e.year ?? (e.date ? yearOf(e.date) : null);

export async function renderExample(el, ctx) {
  const [id] = ctx.params;
  el.append(loading());
  const x = await loadExample(id);
  if (!ctx.alive()) return;
  ctx.setTitle(x.name);
  const url = (f) => exampleAsset(id, f);
  const link = (key) => x.sources[key] && h("a", { href: x.sources[key].url, target: "_blank", rel: "noopener" }, x.sources[key].label);
  const credit = (p) => [p.author && `攝影：${p.author}`, p.license].filter(Boolean).join("・");

  // 所有照片依時間排列，點任一張都能左右滑動看整個變化
  const entries = x.entries;
  const photos = entries.flatMap((e) => e.photos.map((p) => ({ ...p, when: p.date ? fmtWhen(p.date) : whenOf(e) })));
  const items = photos.map((p) => ({ url: url(p.file), label: p.when, caption: [p.caption, credit(p)].filter(Boolean).join("　") }));
  const view = (p) => () => openViewer(items, photos.indexOf(p));
  const cover = photos[photos.length - 1];

  const header = h("div", { class: "tree-hero" }, [
    cover
      ? h("div", { class: "hero-cover", onclick: view(cover) }, h("img", { src: url(cover.file), alt: x.name }))
      : h("div", { class: "hero-cover empty-cover" }, enso()),
    h("div", { class: "hero-body" }, [
      h("div", { class: "hero-uid static" }, [h("span", { class: "k" }, "身分證"), h("span", { class: "v" }, x.uid)]),
      h("div", { class: "hero-title" }, [x.name, h("span", { class: "code" }, "名木範例")]),
      h("div", { class: "hero-facts" }, [`${x.category}・${x.species}`, x.subtitle].join(" · ")),
      h("div", { class: "hero-stats" }, (x.stats || [
        ["培育", `${new Date().getFullYear() - yearOf(x.since)} 年`],
        ["紀錄", `${entries.length} 筆`],
        ["傳承", `${x.lineage.length} 段`],
      ]).map(([k, v]) => h("div", {}, [h("div", { class: "v" }, v), h("div", { class: "k" }, k)]))),
      x.statsNote && h("div", { class: "hint" }, x.statsNote),
      x.latin && h("div", { class: "hero-line" }, `學名：${x.latin}`),
      h("div", { class: "hero-line" }, `所在：${x.location}`),
      h("div", { class: "hero-note" }, x.intro),
    ]),
  ]);

  const tools = photos.length > 1
    ? h("div", { class: "row tools" }, [
        h("button", { class: "btn", onclick: () => openViewer(items, 0) }, [icon("play"), `依時間看照片 ${photos.length} 張`]),
      ])
    : !photos.length && x.photoNote && h("div", { class: "notice" }, x.photoNote);

  // 時間軸：新的在上
  const newest = [...entries].reverse();
  const timeline = h("div", { class: "timeline" }, newest.map((e, i) => {
    const prev = newest[i + 1];
    const gap = prev && yearNum(e) && yearNum(prev) ? yearNum(e) - yearNum(prev) : null;
    return h("div", { class: "tl-item" }, [
      h("div", { class: "tl-dot" }),
      h("div", { class: "tl-card" }, [
        h("div", { class: "tl-head" }, [
          h("span", {}, [h("span", { class: "tl-no" }, `#${String(newest.length - i).padStart(2, "0")}`), h("span", { class: "tl-date" }, whenOf(e))]),
          gap > 0 && h("span", { class: "tl-gap" }, `距上次 ${gap} 年`),
        ]),
        e.author && h("div", { class: "tl-author" }, e.author),
        e.tags?.length && h("div", { class: "tags" }, e.tags.map((t) => h("span", { class: "tag" }, t))),
        e.photos.length && h("div", { class: "tl-thumbs" }, e.photos.map((p) => {
          const ph = photos.find((q) => q.file === p.file);
          return h("button", { class: "thumb-btn", onclick: view(ph), "aria-label": "看照片" }, h("img", { class: "thumb", src: url(p.thumb || p.file), alt: "", loading: "lazy" }));
        })),
        e.note && h("div", { class: "tl-note full" }, e.note),
        e.photos.some((p) => p.author) && h("div", { class: "tl-credit" }, e.photos.map(credit).filter(Boolean).join("；")),
        e.sources?.length && h("div", { class: "tl-src" }, e.sources.map(link).filter(Boolean)),
      ]),
    ]);
  }));

  const lineage = h("div", { class: "lineage" }, x.lineage.map((c, i) => h("div", { class: "lin-item" + (c.to ? "" : " current") }, [
    h("div", { class: "lin-no" }, String(i + 1).padStart(2, "0")),
    h("div", { class: "lin-body" }, [
      h("div", { class: "lin-name" }, [c.name, c.note && h("span", { class: "tag" }, c.note)]),
      h("div", { class: "lin-date" }, [[fmtWhen(c.from), c.to ? fmtWhen(c.to) : "現在"].filter(Boolean).join(" — "), c.detail && `・${c.detail}`].filter(Boolean).join("")),
    ]),
  ])));

  el.replaceChildren(...[
    header, tools,
    sectionTitle("時間軸", "TIMELINE"), timeline,
    sectionTitle("傳承", "LINEAGE"), lineage,
    sectionTitle("資料來源", "SOURCES"),
    h("div", { class: "card example-sources" }, [
      ...Object.keys(x.sources).map((k) => h("div", {}, link(k))),
      h("p", { class: "hint" }, "範例內容整理自公開資料，照片依各自的授權標示作者。這是展示用的唯讀範例，不屬於任何使用者。"),
    ]),
  ].filter(Boolean));
}
