// 我的樹：作品列表 + 新增／編輯樹檔
import { listTrees, listSpecies, saveTree, addSpecies } from "../db.js";
import { h, sheet, field, loading, toast, photoImg, hydratePhotos, fmtDate, today } from "../ui.js";
import { SOURCES } from "../constants.js";

let filter = "all"; // all / archived / 樹種 id

export async function renderTrees(el, ctx) {
  el.append(loading());
  const [trees, species] = await Promise.all([listTrees(), listSpecies()]);
  if (!ctx.alive()) return;
  const content = h("div");
  el.replaceChildren(
    content,
    h("button", { class: "fab", onclick: () => openTreeForm({ species, onSaved: goTree }) }, "＋ 新增樹")
  );

  const draw = () => {
    const active = trees.filter((t) => t.status === "active");
    const archived = trees.filter((t) => t.status === "archived");
    const usedSpecies = species.filter((s) => active.some((t) => t.species_id === s.id));
    if (filter !== "all" && filter !== "archived" && !usedSpecies.some((s) => s.id === filter)) filter = "all";
    if (filter === "archived" && !archived.length) filter = "all";

    const shown =
      filter === "all" ? active :
      filter === "archived" ? archived :
      active.filter((t) => t.species_id === filter);

    const chip = (key, label) =>
      h("button", { class: "chip" + (filter === key ? " active" : ""), onclick: () => { filter = key; draw(); } }, label);

    const chips = h("div", { class: "chips" }, [
      chip("all", `全部 ${active.length}`),
      ...usedSpecies.map((s) => chip(s.id, s.name)),
      archived.length && chip("archived", `已封存 ${archived.length}`),
    ]);

    const grid = h("div", { class: "tree-grid" }, shown.map(treeCard));
    const empty = !trees.length &&
      h("div", { class: "empty-hero" }, [
        h("div", { class: "empty-icon" }, "🌲"),
        h("div", { class: "empty-title" }, "還沒有樹"),
        h("p", {}, "先建立第一棵樹的樹檔，再幫它拍一組「初始紀錄」。"),
        h("button", { class: "btn btn-primary", onclick: () => openTreeForm({ species, onSaved: goTree }) }, "＋ 建立第一棵樹"),
      ]);

    content.replaceChildren(...(trees.length ? [chips, grid] : [empty]));
    hydratePhotos(content);
  };

  draw();
}

const goTree = (t) => { location.hash = `#/tree/${t.id}`; };

function treeCard(t) {
  const meta = [t.code, t.species_name].filter(Boolean).join(" · ");
  return h("a", { class: "tree-card", href: `#/tree/${t.id}` }, [
    h("div", { class: "tree-cover" }, t.cover_thumb ? photoImg(t.cover_thumb) : h("span", { class: "cover-ph" }, "🌲")),
    h("div", { class: "tree-card-body" }, [
      h("div", { class: "tree-name" }, t.name),
      meta && h("div", { class: "tree-meta" }, meta),
      h("div", { class: "tree-meta" }, t.entry_count
        ? `${t.entry_count} 次紀錄 · ${fmtDate(t.last_entry_date)}`
        : "尚無紀錄"),
    ]),
  ]);
}

// 新增／編輯樹檔（底部彈窗）
export function openTreeForm({ tree = null, species, onSaved }) {
  const v = (x) => x ?? "";
  const name = h("input", { type: "text", value: v(tree?.name), placeholder: "例：山採絲島一號" });
  const code = h("input", { type: "text", value: v(tree?.code), placeholder: "例：JP-001" });

  const NEW = "__new__";
  const speciesSel = h("select", {}, [
    h("option", { value: "" }, "（未指定）"),
    ...species.map((s) => h("option", { value: s.id }, s.name)),
    h("option", { value: NEW }, "＋ 新增樹種…"),
  ]);
  speciesSel.value = tree?.species_id || (species[0]?.id ?? "");
  const newSpecies = h("input", { type: "text", placeholder: "新樹種名稱，例：羅漢松", class: "hidden" });
  speciesSel.addEventListener("change", () => {
    newSpecies.classList.toggle("hidden", speciesSel.value !== NEW);
    if (speciesSel.value === NEW) newSpecies.focus();
  });

  const source = h("select", {}, [h("option", { value: "" }, "（未指定）"), ...SOURCES.map((s) => h("option", { value: s }, s))]);
  source.value = tree?.source || "";
  const acquired = h("input", { type: "date", value: tree?.acquired_on || (tree ? "" : today()) });
  const estAge = h("input", { type: "number", inputmode: "numeric", min: "0", value: v(tree?.est_age), placeholder: "年" });
  const pot = h("input", { type: "text", value: v(tree?.pot), placeholder: "例：常滑 長方盆 24cm" });
  const frontNote = h("input", { type: "text", value: v(tree?.front_note), placeholder: "例：舍利面朝前，主幹向左傾" });
  const note = h("textarea", { rows: "3", placeholder: "取得經過、樹況、創作方向…" }, v(tree?.note));
  const archived = h("input", { type: "checkbox", checked: tree?.status === "archived" });

  sheet(tree ? "編輯樹檔" : "新增樹", (close) => {
    const save = async (e) => {
      const btn = e.currentTarget;
      if (!name.value.trim()) { toast("請輸入名稱", "err"); name.focus(); return; }
      btn.disabled = true;
      try {
        let speciesId = speciesSel.value || null;
        if (speciesId === NEW) {
          const n = newSpecies.value.trim();
          if (!n) { toast("請輸入新樹種名稱", "err"); btn.disabled = false; return; }
          speciesId = (await addSpecies(n)).id;
        }
        const saved = await saveTree({
          ...(tree ? { id: tree.id } : {}),
          name: name.value.trim(),
          code: code.value.trim() || null,
          species_id: speciesId,
          source: source.value || null,
          acquired_on: acquired.value || null,
          est_age: estAge.value === "" ? null : Math.round(+estAge.value),
          pot: pot.value.trim() || null,
          front_note: frontNote.value.trim() || null,
          note: note.value.trim() || null,
          ...(tree ? { status: archived.checked ? "archived" : "active" } : {}),
        });
        close();
        toast(tree ? "已更新" : "已建立", "ok");
        onSaved?.(saved);
      } catch (err) {
        toast("儲存失敗：" + err.message, "err");
        btn.disabled = false;
      }
    };
    return h("div", {}, [
      field("名稱 *", name),
      h("div", { class: "row" }, [field("編號", code), field("樹種", h("div", {}, [speciesSel, newSpecies]))]),
      h("div", { class: "row" }, [field("來源", source), field("取得日期", acquired)]),
      h("div", { class: "row" }, [field("取得時估計樹齡", estAge), field("盆器", pot)]),
      field("正面設定", frontNote),
      field("備註", note),
      tree && h("label", { class: "check-row" }, [archived, h("span", {}, "封存（已送人、已枯死或不再追蹤）")]),
      h("button", { class: "btn btn-primary btn-block", onclick: save }, "儲存"),
    ]);
  });
  if (!tree) setTimeout(() => name.focus(), 80);
}
