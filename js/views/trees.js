// 我的盆栽：作品列表（依分類篩選）+ 新增／編輯盆栽檔案 + 接收別人轉移的盆栽
import { listTrees, listSpecies, saveTree, addSpecies, previewTransfer, acceptTransfer } from "../db.js";
import { h, sheet, field, loading, toast, busy, photoImg, hydratePhotos, fmtDate, fmtDateTime, today, treeTitle, speciesTag } from "../ui.js";
import { SOURCES, CATEGORIES, GROUPS, groupOf } from "../constants.js";
import { icon, enso } from "../icons.js";

// 篩選：第一排 全部／柏／松／雜木／已封存；第二排 柏、松 選樹種，雜木 選花果／落葉／常綠
let group = "all";
let sub = null;

export async function renderTrees(el, ctx) {
  el.append(loading());
  const [trees, species] = await Promise.all([listTrees(), listSpecies()]);
  if (!ctx.alive()) return;
  ctx.setActions(h("button", { class: "icon-btn labeled", title: "接收別人轉給你的盆栽", onclick: () => openReceive() }, [icon("inbox"), "接收"]));
  const content = h("div");
  el.replaceChildren(
    content,
    h("button", { class: "fab", onclick: () => openTreeForm({ species, onSaved: goTree }) }, [icon("plus"), "新增盆栽"])
  );

  const draw = () => {
    const active = trees.filter((t) => t.status === "active");
    const archived = trees.filter((t) => t.status === "archived");
    const inGroup = (g) => active.filter((t) => groupOf(t.species_category) === g);
    if (GROUPS.includes(group) && !inGroup(group).length) group = "all";
    if (group === "archived" && !archived.length) group = "all";

    // 第二排的選項
    const base = group === "archived" ? archived : GROUPS.includes(group) ? inGroup(group) : active;
    const subs = group === "雜木"
      ? CATEGORIES.filter((c) => c.group === "雜木" && base.some((t) => t.species_category === c.key)).map((c) => [c.key, c.key])
      : group === "柏" || group === "松"
        ? [...new Map(base.map((t) => [t.species_id, t.species_name])).entries()]
        : [];
    if (sub && !subs.some(([k]) => k === sub)) sub = null;
    const shown = sub ? base.filter((t) => (group === "雜木" ? t.species_category : t.species_id) === sub) : base;

    const chip = (active, label, onclick) => h("button", { class: "chip" + (active ? " active" : ""), onclick }, label);
    const pick = (g) => () => { group = g; sub = null; draw(); };
    const row1 = h("div", { class: "chips" }, [
      chip(group === "all", `全部 ${active.length}`, pick("all")),
      ...GROUPS.filter((g) => inGroup(g).length).map((g) => chip(group === g, `${g} ${inGroup(g).length}`, pick(g))),
      archived.length && chip(group === "archived", `已封存 ${archived.length}`, pick("archived")),
    ]);
    const row2 = subs.length > 1 && h("div", { class: "chips sub" }, [
      chip(!sub, `全部${group}`, () => { sub = null; draw(); }),
      ...subs.map(([k, label]) => chip(sub === k, label, () => { sub = k; draw(); })),
    ]);

    const grid = h("div", { class: "tree-grid" }, shown.map(treeCard));
    const empty = !trees.length &&
      h("div", { class: "empty-hero" }, [
        enso(),
        h("div", { class: "empty-title" }, "還沒有盆栽"),
        h("p", {}, "先建立第一盆盆栽的檔案，再幫它拍一組「初始紀錄」。"),
        h("button", { class: "btn btn-primary", onclick: () => openTreeForm({ species, onSaved: goTree }) }, [icon("plus"), "建立第一盆盆栽"]),
        h("button", { class: "btn", onclick: () => openReceive() }, [icon("inbox"), "接收別人轉給你的盆栽"]),
      ]);

    content.replaceChildren(...(trees.length ? [row1, row2, grid].filter(Boolean) : [empty]));
    hydratePhotos(content);
  };

  draw();
}

const goTree = (t) => { location.hash = `#/tree/${t.id}`; };

function treeCard(t) {
  const meta = [speciesTag(t), t.code, t.creator_count > 1 && `${t.creator_count} 代創作者`].filter(Boolean).join(" · ");
  return h("a", { class: "tree-card", href: `#/tree/${t.id}` }, [
    h("div", { class: "tree-cover" }, t.cover_thumb ? photoImg(t.cover_thumb) : h("span", { class: "cover-ph" }, enso())),
    h("div", { class: "tree-card-body" }, [
      h("div", { class: "tree-no" }, t.uid),
      h("div", { class: "tree-name" }, treeTitle(t)),
      meta && h("div", { class: "tree-meta" }, meta),
      h("div", { class: "tree-meta" }, t.entry_count
        ? `${t.entry_count} REC · ${fmtDate(t.last_entry_date)}`
        : "尚無紀錄"),
    ]),
  ]);
}

// 新增／編輯盆栽檔案（底部彈窗）
export function openTreeForm({ tree = null, species, onSaved }) {
  const v = (x) => x ?? "";
  const name = h("input", { type: "text", value: v(tree?.name), placeholder: "例：山採絲島一號；不填就顯示樹種" });
  const code = h("input", { type: "text", value: v(tree?.code), placeholder: "選填，例：JP-001" });

  // 樹種依分類分組；最後一項可以直接新增樹種（要選分類）
  const NEW = "__new__";
  const speciesSel = h("select", {}, [
    h("option", { value: "" }, "（請選擇）"),
    ...CATEGORIES.map((c) => {
      const list = species.filter((s) => s.category === c.key);
      return list.length && h("optgroup", { label: c.label }, list.map((s) => h("option", { value: s.id }, s.name)));
    }),
    h("optgroup", { label: "其他" }, h("option", { value: NEW }, "新增樹種…")),
  ]);
  speciesSel.value = tree?.species_id || "";
  const newSpecies = h("input", { type: "text", placeholder: "新樹種名稱，例：紫藤" });
  const newCategory = h("select", {}, CATEGORIES.map((c) => h("option", { value: c.key }, c.label)));
  const newBox = h("div", { class: "new-species hidden" }, [newCategory, newSpecies]);
  speciesSel.addEventListener("change", () => {
    newBox.classList.toggle("hidden", speciesSel.value !== NEW);
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

  sheet(tree ? "編輯盆栽檔案" : "新增盆栽", (close) => {
    const save = async (e) => {
      const btn = e.currentTarget;
      if (!speciesSel.value && !name.value.trim()) { toast("請選擇樹種，或輸入名稱", "err"); return; }
      btn.disabled = true;
      try {
        let speciesId = speciesSel.value || null;
        if (speciesId === NEW) {
          const n = newSpecies.value.trim();
          if (!n) { toast("請輸入新樹種名稱", "err"); btn.disabled = false; return; }
          const same = species.find((s) => s.name === n);
          speciesId = same ? same.id : (await addSpecies(n, newCategory.value)).id;
        }
        const saved = await saveTree({
          ...(tree ? { id: tree.id } : {}),
          name: name.value.trim() || null,
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
      field("樹種", h("div", {}, [speciesSel, newBox])),
      field("名稱（選填）", name, "這一盆的作品名或暱稱。"),
      tree && field("身分證", h("div", { class: "uid-static" }, tree.uid), "系統產生，終身不變；轉移給別人也會跟著這盆盆栽。"),
      h("div", { class: "row" }, [field("自訂編號", code), field("來源", source)]),
      h("div", { class: "row" }, [field("取得日期", acquired), field("取得時估計樹齡", estAge)]),
      field("盆器", pot),
      field("正面設定", frontNote),
      field("備註", note),
      tree && h("label", { class: "check-row" }, [archived, h("span", {}, "封存（已枯死或不再追蹤；送人請用「轉移給他人」）")]),
      h("button", { class: "btn btn-primary btn-block", onclick: save }, "儲存"),
    ]);
  });
}

// ---------- 接收盆栽：輸入對方給的轉移碼 ----------
const normCode = (v) => {
  const x = v.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 8);
  return x.length > 4 ? `${x.slice(0, 4)}-${x.slice(4)}` : x;
};

export function openReceive(prefill = "") {
  const input = h("input", {
    type: "text", class: "code-input", value: normCode(prefill), placeholder: "XXXX-XXXX",
    autocomplete: "off", autocapitalize: "characters", spellcheck: "false", inputmode: "text", "aria-label": "轉移碼",
  });
  input.addEventListener("input", () => { input.value = normCode(input.value); });
  const result = h("div");

  sheet("接收盆栽", (close) => {
    const check = async (e) => {
      const btn = e.currentTarget;
      const code = normCode(input.value);
      if (code.length !== 9) { toast("轉移碼是 8 碼，例如 7K3Q-M9PX", "err"); input.focus(); return; }
      btn.disabled = true;
      try {
        const p = await previewTransfer(code);
        result.replaceChildren(p ? previewCard(p, code, close) : h("div", { class: "notice err" }, "轉移碼無效、已過期或已經使用過，請跟對方確認。"));
      } catch (err) {
        toast("查詢失敗：" + err.message, "err");
      } finally {
        btn.disabled = false;
      }
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") check({ currentTarget: lookup }); });
    const lookup = h("button", { class: "btn btn-primary btn-block", onclick: check }, "查詢");
    if (input.value.length === 9) setTimeout(() => lookup.click(), 0);
    else setTimeout(() => input.focus(), 80);
    return h("div", {}, [
      h("p", { class: "sheet-msg" }, "輸入原創作者給你的 8 碼轉移碼。接收後，這盆盆栽和前人的紀錄、照片都會到你名下，接著由你記錄。"),
      h("div", { class: "field" }, input),
      lookup,
      result,
    ]);
  });
}

function previewCard(p, code, close) {
  const accept = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    const b = busy("接收中…");
    try {
      const id = await acceptTransfer(code);
      close();
      toast(`已接收「${p.name}」`, "ok");
      location.hash = `#/tree/${id}`;
    } catch (err) {
      toast("接收失敗：" + err.message, "err");
      btn.disabled = false;
    } finally {
      b.remove();
    }
  };
  return h("div", { class: "transfer-preview" }, [
    h("div", { class: "tp-uid" }, p.uid),
    h("div", { class: "tp-name" }, p.name || p.species || "未命名盆栽"),
    h("div", { class: "tp-meta" }, [p.species, `${p.entries} 筆紀錄`].filter(Boolean).join(" · ")),
    h("div", { class: "kv-row" }, [h("span", { class: "k" }, "原創作者"), h("span", {}, p.from)]),
    p.note && h("div", { class: "kv-row" }, [h("span", { class: "k" }, "方式"), h("span", {}, p.note)]),
    h("div", { class: "kv-row" }, [h("span", { class: "k" }, "有效至"), h("span", {}, fmtDateTime(p.expires_at))]),
    h("button", { class: "btn btn-primary btn-block", onclick: accept }, [icon("check"), "接收這盆盆栽"]),
  ]);
}
