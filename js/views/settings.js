// 設定：帳號、樹種與作業項目管理、匯出備份
import {
  listSpecies, addSpecies, deleteSpecies, listOperationTypes, addOperationType, deleteOperationType,
  currentEmail, signOut, exportData, downloadPhoto,
} from "../db.js";
import { h, loading, toast, busy, confirmDialog, today } from "../ui.js";
import { ANGLE_LABEL, VIGOR_LABEL } from "../constants.js";

export async function renderSettings(el, ctx) {
  el.append(loading());
  const [email, species, opTypes] = await Promise.all([currentEmail(), listSpecies(), listOperationTypes()]);
  if (!ctx.alive()) return;
  const refresh = () => { el.replaceChildren(); renderSettings(el, ctx); };

  // ---------- 樹種 ----------
  const speciesInput = h("input", { type: "text", placeholder: "例：羅漢松、杜松" });
  const speciesCard = h("div", { class: "card" }, [
    h("div", { class: "chips wrap" }, species.map((s) => h("span", { class: "chip static" + (s.owner_id ? "" : " sys") }, [
      s.name,
      s.owner_id && h("button", { class: "chip-x", "aria-label": "刪除", onclick: async () => {
        if (!(await confirmDialog(`刪除樹種「${s.name}」？`, "使用這個樹種的樹會變成「未指定」，它專屬的作業項目也會一起刪除。", "刪除"))) return;
        try { await deleteSpecies(s.id); refresh(); } catch (err) { toast("刪除失敗：" + err.message, "err"); }
      } }, "✕"),
    ]))),
    h("div", { class: "inline-add" }, [
      speciesInput,
      h("button", { class: "btn btn-primary btn-sm", onclick: async () => {
        const n = speciesInput.value.trim();
        if (!n) return;
        if (species.some((s) => s.name === n)) { toast("已經有這個樹種", "err"); return; }
        try { await addSpecies(n); toast("已新增", "ok"); refresh(); } catch (err) { toast("新增失敗：" + err.message, "err"); }
      } }, "新增"),
    ]),
    h("div", { class: "hint" }, "灰色是系統預設，不能刪除。"),
  ]);

  // ---------- 作業項目 ----------
  const groups = [{ id: null, name: "共用（所有樹種）" }, ...species.map((s) => ({ id: s.id, name: s.name }))];
  const opsCard = h("div", { class: "card" }, [
    ...groups.map((g) => {
      const ops = opTypes.filter((o) => (o.species_id || null) === g.id);
      if (!ops.length) return null;
      return h("div", { class: "op-group" }, [
        h("div", { class: "subhead" }, g.name),
        h("div", { class: "chips wrap" }, ops.map((o) => h("span", { class: "chip static" + (o.owner_id ? "" : " sys") }, [
          o.name,
          o.owner_id && h("button", { class: "chip-x", "aria-label": "刪除", onclick: async () => {
            try { await deleteOperationType(o.id); refresh(); } catch (err) { toast("刪除失敗：" + err.message, "err"); }
          } }, "✕"),
        ]))),
      ]);
    }),
    (() => {
      const scope = h("select", {}, groups.map((g) => h("option", { value: g.id || "" }, g.id ? g.name : "共用")));
      const name = h("input", { type: "text", placeholder: "作業名稱" });
      return h("div", { class: "inline-add" }, [
        scope, name,
        h("button", { class: "btn btn-primary btn-sm", onclick: async () => {
          const n = name.value.trim();
          if (!n) return;
          try { await addOperationType(n, scope.value || null); toast("已新增", "ok"); refresh(); } catch (err) { toast("新增失敗：" + err.message, "err"); }
        } }, "新增"),
      ]);
    })(),
  ]);

  el.replaceChildren(
    h("div", { class: "section-title" }, "帳號"),
    h("div", { class: "card row-between" }, [
      h("span", {}, email),
      h("button", { class: "btn btn-sm", onclick: signOut }, "登出"),
    ]),
    h("div", { class: "section-title" }, "樹種"),
    speciesCard,
    h("div", { class: "section-title" }, "作業項目"),
    opsCard,
    h("div", { class: "section-title" }, "資料備份"),
    h("div", { class: "card" }, [
      h("p", { class: "muted" }, "把所有樹檔、紀錄和照片原檔打包成一個 ZIP 下載，裡面附一份可用 Excel 開啟的紀錄表。"),
      h("button", { class: "btn btn-primary btn-block", onclick: exportZip }, "⬇ 匯出備份"),
    ]),
    h("div", { class: "about" }, "盆栽創作紀錄 · Phase 1"),
  );
}

// ---------- 匯出 ZIP ----------
const safe = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, "_").trim() || "未命名";

async function exportZip() {
  const b = busy("讀取資料…");
  try {
    const { default: JSZip } = await import("https://esm.sh/jszip@3.10.1");
    const { trees, entries, photos, species, opTypes } = await exportData();
    const zip = new JSZip();
    const treeById = Object.fromEntries(trees.map((t) => [t.id, t]));
    const entryById = Object.fromEntries(entries.map((e) => [e.id, e]));
    const folder = (t) => safe([t.code, t.name].filter(Boolean).join("_"));

    // 照片原檔：photos/樹/日期_角度_序號.jpg
    const files = {};
    const counter = {};
    for (const [i, p] of photos.entries()) {
      b.update(`下載照片 ${i + 1}/${photos.length}`);
      const t = treeById[p.tree_id], e = entryById[p.entry_id];
      if (!t || !e) continue;
      const base = `${e.entry_date}_${ANGLE_LABEL[p.angle]}`;
      counter[`${t.id}/${base}`] = (counter[`${t.id}/${base}`] || 0) + 1;
      const n = counter[`${t.id}/${base}`];
      const file = `photos/${folder(t)}/${base}${n > 1 ? `_${n}` : ""}.jpg`;
      zip.file(file, await downloadPhoto(p.path));
      files[p.id] = file;
    }

    b.update("整理紀錄…");
    zip.file("data.json", JSON.stringify({
      exported_at: new Date().toISOString(),
      trees, entries,
      photos: photos.map((p) => ({ ...p, file: files[p.id] || null })),
      custom_species: species.filter((s) => s.owner_id),
      custom_operation_types: opTypes.filter((o) => o.owner_id),
    }, null, 2));

    const head = ["樹名", "編號", "樹種", "日期", "作業項目", "備註", "下次預計", "預計日期", "樹高cm", "幅寬cm", "幹徑cm", "樹勢", "線材", "用土", "肥料／藥劑", "照片數"];
    const cell = (x) => `"${String(x ?? "").replace(/"/g, '""')}"`;
    const rows = entries.map((e) => {
      const t = treeById[e.tree_id] || {};
      return [
        t.name, t.code, t.species_name, e.entry_date, e.operations.join("、"), e.note, e.next_action, e.next_date,
        e.height_cm, e.width_cm, e.trunk_cm, e.vigor ? `${e.vigor} ${VIGOR_LABEL[e.vigor]}` : "",
        e.wire, e.soil, e.fertilizer, photos.filter((p) => p.entry_id === e.id).length,
      ].map(cell).join(",");
    });
    zip.file("紀錄.csv", "﻿" + [head.map(cell).join(","), ...rows].join("\r\n"));

    b.update("壓縮中…");
    const blob = await zip.generateAsync({ type: "blob" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `bonsai-backup-${today().replace(/-/g, "")}.zip` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    toast(`已匯出 ${trees.length} 棵樹、${entries.length} 筆紀錄、${photos.length} 張照片`, "ok");
  } catch (err) {
    console.error(err);
    toast("匯出失敗：" + (err.message || err), "err");
  } finally {
    b.remove();
  }
}
