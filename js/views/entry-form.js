// 新增／編輯紀錄：日期、五個角度＋細節照片、作業項目、備註、下次預計、整體特徵與用材
import {
  getTree, getEntry, listOperationTypes, opsForSpecies, addOperationType, treePhotos,
  saveEntry, uploadPhoto, updatePhoto, deletePhotos,
} from "../db.js";
import { h, field, loading, toast, busy, confirmDialog, promptDialog, photoImg, hydratePhotos, fmtDate, today, sectionTitle } from "../ui.js";
import { ANGLES, VIGOR_LABEL } from "../constants.js";
import { prepareImage } from "../image.js";
import { bindPhotoPicker } from "../picker.js";
import { icon } from "../icons.js";

export async function renderEntryForm(el, ctx) {
  const isEdit = ctx.mode === "edit";
  el.append(loading());

  let entry = null, treeId;
  if (isEdit) {
    entry = await getEntry(ctx.params[0]);
    treeId = entry.tree_id;
  } else {
    treeId = ctx.params[0];
  }
  const [tree, opTypes, history] = await Promise.all([getTree(treeId), listOperationTypes(), treePhotos(treeId)]);
  if (!ctx.alive()) return;
  ctx.setTitle(isEdit ? `編輯紀錄 · ${tree.name}` : `新增紀錄 · ${tree.name}`);

  // ---------- 狀態 ----------
  let dirty = false;
  const touch = () => { dirty = true; };
  const existing = entry?.photos || [];
  // 每個角度：existing（已上傳）/ prepared（待上傳）/ remove（待刪除的舊照）
  const slots = Object.fromEntries(ANGLES.map((a) => [a.key, {
    existing: existing.find((p) => p.angle === a.key) || null, prepared: null, preview: null, remove: null,
  }]));
  const details = existing.filter((p) => p.angle === "detail")
    .map((p) => ({ existing: p, caption: p.caption || "", origCaption: p.caption || "" }));
  const removedDetails = [];
  const selectedOps = new Set(entry?.operations || []);

  // 「上次同角度」參考照：這筆紀錄以外、日期最近的同角度照片
  const refFor = (angle) => {
    const list = history.filter((p) => p.angle === angle && p.entry_id !== entry?.id);
    return list[list.length - 1] || null;
  };

  // ---------- 基本 ----------
  const date = h("input", { type: "date", value: entry?.entry_date || today(), onchange: touch });

  // ---------- 照片：五個角度 ----------
  const angleGrid = h("div", { class: "angle-grid" });
  const drawAngles = () => {
    angleGrid.replaceChildren(...ANGLES.map((a) => angleTile(a)));
    hydratePhotos(angleGrid);
  };
  const angleTile = (a) => {
    const s = slots[a.key];
    const input = h("input", { type: "file", accept: "image/*", class: "hidden" });
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      tile.classList.add("working");
      try {
        const prepared = await prepareImage(file);
        if (s.preview) URL.revokeObjectURL(s.preview);
        if (s.existing) { s.remove = s.existing; s.existing = null; }
        s.prepared = prepared;
        s.preview = URL.createObjectURL(prepared.thumb);
        touch();
      } catch (err) {
        toast(err.message, "err");
      }
      drawAngles();
    });
    const clear = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (s.prepared) {
        URL.revokeObjectURL(s.preview);
        s.prepared = s.preview = null;
      } else if (s.existing) {
        s.remove = s.existing;
        s.existing = null;
      }
      touch();
      drawAngles();
    };

    const ref = refFor(a.key);
    let body;
    const x = () => h("button", { class: "tile-x", "aria-label": "移除照片", onclick: clear }, icon("close"));
    if (s.prepared) body = [h("img", { src: s.preview, alt: a.label }), x()];
    else if (s.existing) body = [photoImg(s.existing.thumb_path, { alt: a.label }), x()];
    else if (ref) body = [photoImg(ref.thumb_path, { class: "ref", alt: "" }), h("span", { class: "tile-plus" }, icon("plus")), h("span", { class: "tile-ref" }, `上次 ${fmtDate(ref.entry_date).slice(5)}`)];
    else body = [h("span", { class: "tile-plus" }, icon("plus"))];

    const tile = h("label", { class: "angle-tile" + (s.prepared || s.existing ? " filled" : "") }, [
      ...body, h("span", { class: "tile-label" }, [h("b", {}, a.en), h("span", {}, a.label)]), input,
    ]);
    bindPhotoPicker(tile, input);
    return tile;
  };
  drawAngles();

  // ---------- 照片：細節 ----------
  const detailList = h("div", { class: "detail-list" });
  const drawDetails = () => {
    detailList.replaceChildren(...details.map((d, i) => {
      const cap = h("input", { type: "text", value: d.caption, placeholder: "說明，例：第一枝咬線處" });
      cap.addEventListener("input", () => { d.caption = cap.value; touch(); });
      return h("div", { class: "detail-row" }, [
        d.prepared ? h("img", { src: d.preview, class: "thumb" }) : photoImg(d.existing.thumb_path, { class: "thumb" }),
        cap,
        h("button", { class: "icon-btn dark", "aria-label": "移除", onclick: () => {
          const [x] = details.splice(i, 1);
          if (x.existing) removedDetails.push(x.existing);
          if (x.preview) URL.revokeObjectURL(x.preview);
          touch();
          drawDetails();
        } }, icon("close")),
      ]);
    }));
    hydratePhotos(detailList);
  };
  const detailInput = h("input", { type: "file", accept: "image/*", multiple: true, class: "hidden" });
  detailInput.addEventListener("change", async () => {
    const files = [...detailInput.files];
    detailInput.value = "";
    if (!files.length) return;
    const b = busy("處理照片…");
    for (const [k, f] of files.entries()) {
      b.update(`處理照片 ${k + 1}/${files.length}`);
      try {
        const prepared = await prepareImage(f);
        details.push({ prepared, preview: URL.createObjectURL(prepared.thumb), caption: "" });
        touch();
      } catch (err) {
        toast(err.message, "err");
      }
    }
    b.remove();
    drawDetails();
  });
  drawDetails();

  // ---------- 作業項目 ----------
  const opsBox = h("div", { class: "chips wrap" });
  let available = opsForSpecies(opTypes, tree.species_id);
  const drawOps = () => {
    // 舊紀錄裡有、但現在清單沒有的作業也要顯示，避免編輯時被默默拿掉
    const names = [...available.map((o) => o.name), ...[...selectedOps].filter((n) => !available.some((o) => o.name === n))];
    opsBox.replaceChildren(
      ...names.map((n) => h("button", {
        class: "chip" + (selectedOps.has(n) ? " active" : ""),
        onclick: () => { selectedOps.has(n) ? selectedOps.delete(n) : selectedOps.add(n); touch(); drawOps(); },
      }, n)),
      h("button", { class: "chip add", onclick: async () => {
        const n = await promptDialog("新增作業項目", "例：換土表、剪根");
        if (!n) return;
        if (!available.some((o) => o.name === n)) {
          try {
            const op = await addOperationType(n, tree.species_id || null);
            opTypes.push(op);
            available = opsForSpecies(opTypes, tree.species_id);
          } catch (err) {
            toast("新增失敗：" + err.message, "err");
            return;
          }
        }
        selectedOps.add(n);
        touch();
        drawOps();
      } }, [icon("plus"), "自訂"]),
    );
  };
  drawOps();

  // ---------- 文字欄位 ----------
  const v = (x) => x ?? "";
  const on = { oninput: touch };
  const note = h("textarea", { rows: "4", placeholder: "當下的想法、老師的建議、這次為什麼這樣處理…", ...on }, v(entry?.note));
  const nextAction = h("input", { type: "text", value: v(entry?.next_action), placeholder: "例：檢查咬線、開始施肥", ...on });
  const nextDate = h("input", { type: "date", value: v(entry?.next_date), onchange: touch });
  const num = (val, ph) => h("input", { type: "number", inputmode: "decimal", step: "0.1", min: "0", value: v(val), placeholder: ph, ...on });
  const height = num(entry?.height_cm, "cm");
  const width = num(entry?.width_cm, "cm");
  const trunk = num(entry?.trunk_cm, "cm");
  const wire = h("input", { type: "text", value: v(entry?.wire), placeholder: "例：1.5mm、2.0mm 鋁線", ...on });
  const soil = h("input", { type: "text", value: v(entry?.soil), placeholder: "例：赤玉 5：鹿沼 3：日向 2", ...on });
  const fertilizer = h("input", { type: "text", value: v(entry?.fertilizer), placeholder: "例：玉肥 6 顆", ...on });

  let vigor = entry?.vigor || null;
  const vigorBox = h("div", { class: "vigor" });
  const drawVigor = () => {
    vigorBox.replaceChildren(...[1, 2, 3, 4, 5].map((n) => h("button", {
      class: "vigor-btn" + (vigor === n ? " active" : ""),
      onclick: () => { vigor = vigor === n ? null : n; touch(); drawVigor(); },
    }, [h("b", {}, String(n)), h("small", {}, VIGOR_LABEL[n])])));
  };
  drawVigor();

  const hasMore = entry && [entry.height_cm, entry.width_cm, entry.trunk_cm, entry.vigor, entry.wire, entry.soil, entry.fertilizer].some((x) => x != null && x !== "");
  const more = h("details", { class: "card more", open: hasMore }, [
    h("summary", {}, "整體特徵與用材"),
    h("div", { class: "row" }, [field("樹高", height), field("幅寬", width), field("幹徑", trunk)]),
    field("樹勢", vigorBox),
    field("線材", wire),
    field("用土", soil),
    field("肥料／藥劑", fertilizer),
  ]);

  // ---------- 儲存 ----------
  const numOrNull = (i) => (i.value === "" ? null : +i.value);
  const txt = (i) => i.value.trim() || null;
  let savedId = entry?.id || null;

  const save = async () => {
    if (!date.value) { toast("請選擇日期", "err"); return; }
    const b = busy("儲存紀錄…");
    try {
      const saved = await saveEntry({
        ...(savedId ? { id: savedId } : { tree_id: treeId }),
        entry_date: date.value,
        operations: [...selectedOps],
        note: txt(note),
        next_action: txt(nextAction),
        next_date: nextDate.value || null,
        height_cm: numOrNull(height),
        width_cm: numOrNull(width),
        trunk_cm: numOrNull(trunk),
        vigor,
        wire: txt(wire),
        soil: txt(soil),
        fertilizer: txt(fertilizer),
      });
      savedId = saved.id; // 萬一照片上傳中途失敗，重按儲存會更新同一筆，不會重複建立

      // 先刪被換掉／移除的舊照
      const toRemove = [...Object.values(slots).map((s) => s.remove).filter(Boolean), ...removedDetails];
      if (toRemove.length) {
        b.update("移除舊照片…");
        await deletePhotos(toRemove);
        Object.values(slots).forEach((s) => { s.remove = null; });
        removedDetails.length = 0;
      }

      // 上傳新照片（每傳完一張就記進狀態，失敗重試時不會重傳）
      const uploads = [
        ...ANGLES.map((a, i) => ({ s: slots[a.key], angle: a.key, sort: i })).filter((x) => x.s.prepared),
        ...details.map((d, i) => ({ s: d, angle: "detail", sort: 10 + i })).filter((x) => x.s.prepared),
      ];
      for (const [k, u] of uploads.entries()) {
        b.update(`上傳照片 ${k + 1}/${uploads.length}`);
        const photo = await uploadPhoto({
          treeId, entryId: savedId, angle: u.angle, sort: u.sort,
          caption: u.angle === "detail" ? (u.s.caption.trim() || null) : null,
          prepared: u.s.prepared,
        });
        URL.revokeObjectURL(u.s.preview);
        Object.assign(u.s, { existing: photo, prepared: null, preview: null, origCaption: photo.caption || "" });
      }

      // 更新細節照說明與排序
      for (const [i, d] of details.entries()) {
        const cap = d.caption.trim();
        if (d.existing && (cap !== (d.origCaption || "") || d.existing.sort !== 10 + i)) {
          await updatePhoto(d.existing.id, { caption: cap || null, sort: 10 + i });
          d.origCaption = cap;
          d.existing.sort = 10 + i;
        }
      }

      dirty = false;
      toast("已儲存", "ok");
      location.replace(`#/entry/${savedId}`);
    } catch (err) {
      console.error(err);
      toast("儲存失敗：" + (err.message || err), "err");
    } finally {
      b.remove();
    }
  };

  ctx.setLeaveGuard(async () => !dirty || confirmDialog("放棄編輯？", "這筆紀錄還沒儲存，離開後輸入的內容和照片會遺失。", "放棄"));

  el.replaceChildren(
    h("div", { class: "card" }, [field("日期", date)]),
    sectionTitle("照片", "PHOTOS"),
    h("div", { class: "card" }, [
      angleGrid,
      h("div", { class: "hint" }, "淡色的是上次同角度的照片，拍照時盡量對齊，時間軸才比得出變化。"),
      h("div", { class: "subhead" }, "細節"),
      detailList,
      (() => {
        const btn = h("label", { class: "btn btn-sm btn-outline" }, [icon("plus"), "加細節照片", detailInput]);
        bindPhotoPicker(btn, detailInput);
        return btn;
      })(),
    ]),
    sectionTitle("做了哪些事", "WORK"),
    h("div", { class: "card" }, opsBox),
    sectionTitle("備註", "NOTES"),
    h("div", { class: "card" }, [
      note,
      h("div", { class: "row" }, [field("下次預計", nextAction), field("預計日期", nextDate)]),
    ]),
    more,
    h("div", { class: "save-bar" }, h("button", { class: "btn btn-primary btn-block", onclick: save }, "儲存紀錄")),
  );
}
