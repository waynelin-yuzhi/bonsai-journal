// 設定：帳號與創作者名稱、樹種與作業項目管理、匯出備份、問題反饋、版本與更新紀錄
import {
  listSpecies, addSpecies, deleteSpecies, listOperationTypes, addOperationType, deleteOperationType,
  currentEmail, signOut, changePassword, exportData, downloadPhoto, getMyProfile, saveMyProfile, creatorNames, myId,
  updateSpecies, myFeedback, amIAdmin,
} from "../db.js";
import { h, loading, toast, busy, confirmDialog, sheet, field, today, sectionTitle, treeTitle } from "../ui.js";
import { icon, enso } from "../icons.js";
import { ANGLE_LABEL, VIGOR_LABEL, CATEGORIES, OP_SCOPES, CATEGORY_LABEL } from "../constants.js";
import { runningVersion, checkForUpdate } from "../update.js";
import { isStandalone, canInstall, isIOS, promptInstall, onInstallChange } from "../install.js";
import { isNativeApp, nativeBuild, WEB_URL, APK_URL } from "../platform.js";
import { checkApkUpdate, versionName } from "../apk-update.js";
import { openFeedbackForm, myFeedbackList } from "./feedback.js";

// 更新紀錄：changelog.json（新的在前）
async function loadChangelog() {
  try {
    const res = await fetch("./changelog.json", { cache: "no-cache" });
    return res.ok ? await res.json() : [];
  } catch {
    return [];
  }
}

export async function renderSettings(el, ctx) {
  el.append(loading());
  const [email, species, opTypes, profile, feedback, admin, changelog] = await Promise.all([
    currentEmail(), listSpecies(), listOperationTypes(), getMyProfile(),
    myFeedback().catch(() => []), amIAdmin(), loadChangelog(),
  ]);
  if (!ctx.alive()) return;
  const refresh = () => { el.replaceChildren(); renderSettings(el, ctx); };

  // ---------- 樹種：依分類列出；自己新增的點一下可以改名、改分類或刪除 ----------
  const speciesInput = h("input", { type: "text", placeholder: "例：紫藤" });
  const speciesCat = h("select", {}, CATEGORIES.map((c) => h("option", { value: c.key }, c.label)));
  const speciesCard = h("div", { class: "card" }, [
    ...CATEGORIES.map((c) => {
      const list = species.filter((s) => s.category === c.key);
      return h("div", { class: "op-group" }, [
        h("div", { class: "subhead" }, c.label),
        list.length
          ? h("div", { class: "chips wrap" }, list.map((s) => s.owner_id
            ? h("button", { class: "chip", onclick: () => openSpeciesForm(s, species, refresh) }, [s.name, icon("edit")])
            : h("span", { class: "chip static sys" }, s.name)))
          : h("div", { class: "hint" }, "（尚無）"),
      ]);
    }),
    h("div", { class: "inline-add" }, [
      speciesCat, speciesInput,
      h("button", { class: "btn btn-primary btn-sm", onclick: async () => {
        const n = speciesInput.value.trim();
        if (!n) return;
        if (species.some((s) => s.name === n)) { toast("已經有這個樹種", "err"); return; }
        try { await addSpecies(n, speciesCat.value); toast("已新增", "ok"); refresh(); } catch (err) { toast("新增失敗：" + err.message, "err"); }
      } }, "新增"),
    ]),
    h("div", { class: "hint" }, "灰色是系統預設；自己新增的點一下可以改名、改分類或刪除。"),
  ]);

  // ---------- 作業項目：共用 → 分類適用 → 樹種專屬 ----------
  const scopes = [
    { key: "common", label: "共用（所有樹種）", match: (o) => !o.species_id && !o.category, add: {} },
    ...OP_SCOPES.map((c) => ({ key: `cat:${c.key}`, label: c.label, match: (o) => o.category === c.key, add: { category: c.key } })),
    ...CATEGORIES.flatMap((c) => species.filter((s) => s.category === c.key))
      .map((s) => ({ key: `sp:${s.id}`, label: s.name, match: (o) => o.species_id === s.id, add: { speciesId: s.id } })),
  ];
  const opsCard = h("div", { class: "card" }, [
    ...scopes.map((g) => {
      const ops = opTypes.filter(g.match);
      if (!ops.length) return null;
      return h("div", { class: "op-group" }, [
        h("div", { class: "subhead" }, g.label),
        h("div", { class: "chips wrap" }, ops.map((o) => h("span", { class: "chip static" + (o.owner_id ? "" : " sys") }, [
          o.name,
          o.owner_id && h("button", { class: "chip-x", "aria-label": "刪除", onclick: async () => {
            try { await deleteOperationType(o.id); refresh(); } catch (err) { toast("刪除失敗：" + err.message, "err"); }
          } }, icon("close")),
        ]))),
      ]);
    }),
    (() => {
      const opt = (g) => h("option", { value: g.key }, g.label);
      const scope = h("select", { "aria-label": "適用範圍" }, [
        opt(scopes[0]),
        h("optgroup", { label: "分類" }, scopes.filter((g) => g.key.startsWith("cat:")).map(opt)),
        h("optgroup", { label: "樹種" }, scopes.filter((g) => g.key.startsWith("sp:")).map(opt)),
      ]);
      const name = h("input", { type: "text", placeholder: "作業名稱" });
      return h("div", { class: "inline-add" }, [
        scope, name,
        h("button", { class: "btn btn-primary btn-sm", onclick: async () => {
          const n = name.value.trim();
          if (!n) return;
          const g = scopes.find((x) => x.key === scope.value);
          try { await addOperationType(n, g.add); toast("已新增", "ok"); refresh(); } catch (err) { toast("新增失敗：" + err.message, "err"); }
        } }, "新增"),
      ]);
    })(),
    h("div", { class: "hint" }, "紀錄時會出現：共用＋這盆盆栽分類的作業＋樹種專屬的作業。「雜木（全部）」花果、落葉、常綠都會出現。"),
  ]);

  el.replaceChildren(
    sectionTitle("帳號", "ACCOUNT"),
    h("div", { class: "card" }, [
      h("div", { class: "account" }, email),
      h("div", { class: "kv-row creator-row" }, [
        h("span", { class: "k" }, "創作者名稱"),
        h("span", {}, profile?.display_name?.trim() || h("span", { class: "muted" }, "尚未設定")),
        h("button", { class: "btn btn-sm", onclick: () => openNameForm(profile?.display_name || "", refresh) }, [icon("edit"), "修改"]),
      ]),
      h("div", { class: "hint" }, "盆栽轉移後，對方的傳承紀錄和時間軸會顯示這個名稱。"),
      h("div", { class: "row-actions" }, [
        h("button", { class: "btn btn-sm", onclick: openPasswordForm }, [icon("key"), "修改密碼"]),
        h("button", { class: "btn btn-sm", onclick: signOut }, [icon("logout"), "登出"]),
      ]),
    ]),
    sectionTitle("樹種", "SPECIES"),
    speciesCard,
    sectionTitle("作業項目", "OPERATIONS"),
    opsCard,
    sectionTitle("資料備份", "BACKUP"),
    h("div", { class: "card" }, isNativeApp()
      // Android App 裡沒辦法下載檔案，請改用瀏覽器開啟網頁版匯出
      ? [h("p", { class: "muted" }, "App 內無法下載檔案。請用 Chrome 打開網頁版，登入後到「設定 → 匯出備份」："), h("p", {}, WEB_URL)]
      : [
          h("p", { class: "muted" }, "把所有盆栽檔案、紀錄和照片原檔打包成一個 ZIP 下載，裡面附一份可用 Excel 開啟的紀錄表。"),
          h("button", { class: "btn btn-primary btn-block", onclick: exportZip }, [icon("download"), "匯出備份"]),
        ]),
    sectionTitle("安裝 App", "INSTALL"),
    installCard(),
    sectionTitle("問題反饋", "FEEDBACK"),
    h("div", { class: "card" }, [
      h("p", { class: "muted" }, "遇到問題，或有想新增、改善的地方，直接告訴我們。每一則都會評估並回覆處理進度。"),
      h("div", { class: "row" }, [
        h("button", { class: "btn", onclick: () => openFeedbackForm("bug", refresh) }, [icon("flag"), "回報問題"]),
        h("button", { class: "btn", onclick: () => openFeedbackForm("idea", refresh) }, [icon("bulb"), "提供建議"]),
      ]),
      feedback.length > 0 && h("div", { class: "subhead" }, `我的反饋 ${feedback.length}`),
      feedback.length > 0 && myFeedbackList(feedback),
      admin && h("a", { class: "btn btn-block", href: "#/admin/feedback" }, [icon("inbox"), "反饋收件匣（管理員）"]),
    ]),
    sectionTitle("版本", "VERSION"),
    versionCard(changelog),
    h("div", { class: "about" }, [enso(), "BONSAI JOURNAL", h("br"), "盆栽創作紀錄 · EST. 2026"]),
  );
}

// ---------- 版本與更新紀錄 ----------
function versionCard(changelog) {
  const v = runningVersion();
  const card = h("div", { class: "card" });
  let all = false;
  const draw = () => {
    const shown = all ? changelog : changelog.slice(0, 3);
    card.replaceChildren(
      h("div", { class: "row-between" }, [
        h("div", {}, [
          h("div", { class: "mono version-now" }, v ? `v${v.version}` : "—"),
          v?.date && h("div", { class: "hint" }, `更新日期 ${v.date.replace(/-/g, ".")}`),
        ]),
        h("button", { class: "btn btn-sm", onclick: () => checkForUpdate({ manual: true }) }, [icon("refresh"), "檢查更新"]),
      ]),
      changelog.length > 0 && h("div", { class: "subhead" }, "更新紀錄"),
      changelog.length > 0 && h("div", { class: "changelog" }, shown.map((c) => h("div", { class: "cl-item" + (c.version === v?.version ? " current" : "") }, [
        h("div", { class: "cl-head" }, [h("span", { class: "mono" }, `v${c.version}`), h("span", { class: "cl-date" }, c.date.replace(/-/g, "."))]),
        h("ul", {}, c.notes.map((n) => h("li", {}, n))),
      ]))),
      changelog.length > 3 && h("button", { class: "btn btn-ghost btn-sm btn-block", onclick: () => { all = !all; draw(); } },
        all ? "收起" : `看全部 ${changelog.length} 次更新`),
    );
  };
  draw();
  return card;
}

// ---------- 安裝 App ----------

function installCard() {
  const card = h("div", { class: "card" });
  const draw = () => {
    if (isNativeApp()) {
      card.replaceChildren(
        h("div", { class: "install-state" }, [icon("check"), `正在使用 Android App ${versionName(nativeBuild())}`]),
        h("button", { class: "btn btn-block", onclick: () => checkApkUpdate({ manual: true }) }, [icon("refresh"), "檢查 App 更新"]),
      );
    } else if (isStandalone()) {
      card.replaceChildren(h("div", { class: "install-state" }, [icon("check"), "已安裝，正在以 App 模式使用"]));
    } else if (canInstall()) {
      card.replaceChildren(
        h("p", { class: "muted" }, "安裝後會出現在手機桌面和 App 列表，開啟時全螢幕、沒有網址列。"),
        h("button", { class: "btn btn-primary btn-block", onclick: promptInstall }, [icon("phone"), "安裝到手機"]),
      );
    } else if (isIOS()) {
      card.replaceChildren(h("p", { class: "muted" }, "iPhone：用 Safari 開啟本頁 → 分享按鈕 →「加入主畫面」。"));
    } else {
      card.replaceChildren(
        h("p", { class: "muted" }, "Android 可以直接下載安裝檔（APK）："),
        h("a", { class: "btn btn-primary btn-block", href: APK_URL }, [icon("phone"), "下載 Android App"]),
        h("p", { class: "hint" }, "或用 Chrome 右上角選單 →「安裝應用程式」。"),
      );
    }
  };
  draw();
  onInstallChange(() => { if (card.isConnected) draw(); });
  return card;
}

// ---------- 編輯自訂樹種 ----------
function openSpeciesForm(sp, species, onDone) {
  const name = h("input", { type: "text", value: sp.name });
  const cat = h("select", {}, CATEGORIES.map((c) => h("option", { value: c.key }, c.label)));
  cat.value = sp.category;
  sheet("編輯樹種", (close) => h("div", {}, [
    field("名稱", name),
    field("分類", cat),
    h("button", { class: "btn btn-primary btn-block", onclick: async (e) => {
      const btn = e.currentTarget;
      const n = name.value.trim();
      if (!n) { toast("請輸入名稱", "err"); return; }
      if (species.some((s) => s.id !== sp.id && s.name === n)) { toast("已經有這個樹種", "err"); return; }
      btn.disabled = true;
      try {
        await updateSpecies(sp.id, { name: n, category: cat.value });
        close();
        toast("已更新", "ok");
        onDone();
      } catch (err) {
        toast("更新失敗：" + err.message, "err");
        btn.disabled = false;
      }
    } }, "儲存"),
    h("div", { class: "danger-zone" }, h("button", { class: "btn btn-ghost-danger btn-sm", onclick: async () => {
      close();
      if (!(await confirmDialog(`刪除樹種「${sp.name}」？`, "使用這個樹種的盆栽會變成「未指定」，它專屬的作業項目也會一起刪除。", "刪除"))) return;
      try { await deleteSpecies(sp.id); toast("已刪除", "ok"); onDone(); } catch (err) { toast("刪除失敗：" + err.message, "err"); }
    } }, "刪除這個樹種")),
  ]));
}

// ---------- 創作者名稱 ----------
function openNameForm(current, onSaved) {
  const input = h("input", { type: "text", maxlength: "40", value: current, placeholder: "例：韋恩、有植 YUZHIPLANT" });
  sheet("創作者名稱", (close) => h("div", {}, [
    field("名稱", input, "最多 40 字。"),
    h("button", { class: "btn btn-primary btn-block", onclick: async (e) => {
      const btn = e.currentTarget;
      const v = input.value.trim();
      if (!v) { toast("請輸入名稱", "err"); input.focus(); return; }
      btn.disabled = true;
      try {
        await saveMyProfile(v);
        close();
        toast("已更新", "ok");
        onSaved();
      } catch (err) {
        toast("更新失敗：" + err.message, "err");
        btn.disabled = false;
      }
    } }, "儲存"),
  ]));
  setTimeout(() => input.focus(), 80);
}

// ---------- 修改密碼 ----------
function openPasswordForm() {
  const pw = h("input", { type: "password", autocomplete: "new-password", placeholder: "至少 8 碼" });
  const pw2 = h("input", { type: "password", autocomplete: "new-password", placeholder: "再輸入一次" });
  sheet("修改密碼", (close) => h("div", {}, [
    field("新密碼", pw),
    field("確認新密碼", pw2),
    h("button", { class: "btn btn-primary btn-block", onclick: async (e) => {
      const btn = e.currentTarget; // await 之後 currentTarget 會變成 null，先存起來
      if (pw.value.length < 8) { toast("密碼至少 8 碼", "err"); return; }
      if (pw.value !== pw2.value) { toast("兩次輸入的密碼不一樣", "err"); return; }
      btn.disabled = true;
      try {
        await changePassword(pw.value);
        close();
        toast("密碼已更新", "ok");
      } catch (err) {
        toast("更新失敗：" + err.message, "err");
        btn.disabled = false;
      }
    } }, "更新密碼"),
  ]));
}

// ---------- 匯出 ZIP ----------
const safe = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, "_").trim() || "未命名";

async function exportZip() {
  const b = busy("讀取資料…");
  try {
    const { default: JSZip } = await import("https://esm.sh/jszip@3.10.1");
    const { trees, entries, photos, species, opTypes, lineage } = await exportData();
    const [names, me, email] = await Promise.all([creatorNames([...entries.map((e) => e.owner_id), ...lineage.map((c) => c.owner_id)]), myId(), currentEmail()]);
    // 備份檔裡自己沒設定名稱就用 Email
    const who = (id) => names[id]?.trim() || (id === me ? email : "未命名創作者");
    const zip = new JSZip();
    const treeById = Object.fromEntries(trees.map((t) => [t.id, t]));
    const entryById = Object.fromEntries(entries.map((e) => [e.id, e]));
    const folder = (t) => safe([t.uid, t.code, treeTitle(t)].filter(Boolean).join("_"));

    // 照片原檔：photos/身分證_編號_名稱/日期_角度_序號.jpg
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
      lineage: lineage.map((c) => ({ ...c, creator: who(c.owner_id) })),
      custom_species: species.filter((s) => s.owner_id),
      custom_operation_types: opTypes.filter((o) => o.owner_id),
    }, null, 2));

    const head = ["身分證", "盆栽名稱", "自訂編號", "分類", "樹種", "作者", "日期", "作業項目", "備註", "下次預計", "預計日期", "樹高cm", "幅寬cm", "幹徑cm", "樹勢", "線材", "用土", "肥料／藥劑", "照片數"];
    const cell = (x) => `"${String(x ?? "").replace(/"/g, '""')}"`;
    const rows = entries.map((e) => {
      const t = treeById[e.tree_id] || {};
      return [
        t.uid, t.name, t.code, CATEGORY_LABEL[t.species_category] || "", t.species_name, who(e.owner_id), e.entry_date, e.operations.join("、"), e.note, e.next_action, e.next_date,
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
    toast(`已匯出 ${trees.length} 盆盆栽、${entries.length} 筆紀錄、${photos.length} 張照片`, "ok");
  } catch (err) {
    console.error(err);
    toast("匯出失敗：" + (err.message || err), "err");
  } finally {
    b.remove();
  }
}
