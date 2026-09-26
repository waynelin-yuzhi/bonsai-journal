// 單盆盆栽：檔案資訊 + 時間軸 + 傳承（歷任創作者）與轉移
import {
  getTree, listEntries, listSpecies, deleteTree, myId, treeLineage, creatorNames,
  openTransfer, createTransfer, cancelTransfer, getMyProfile, saveMyProfile,
} from "../db.js";
import {
  h, loading, photoImg, hydratePhotos, fmtDate, fmtDateTime, daysBetween, durationText, confirmDialog, busy, toast,
  sectionTitle, sheet, field, creatorLabel, treeTitle, speciesTag,
} from "../ui.js";
import { icon, enso } from "../icons.js";
import { ANGLES } from "../constants.js";
import { openTreeForm } from "./trees.js";
import { openViewer } from "../viewer.js";
import { WEB_URL } from "../platform.js";

const ANGLE_ORDER = [...ANGLES.map((a) => a.key), "detail"];

export async function renderTree(el, ctx) {
  const [id] = ctx.params;
  el.replaceChildren(loading());
  const [tree, entries, lineage, transfer, me] = await Promise.all([getTree(id), listEntries(id), treeLineage(id), openTransfer(id), myId()]);
  const names = await creatorNames([...lineage.map((c) => c.owner_id), ...entries.map((e) => e.owner_id)]);
  if (!ctx.alive()) return;
  const title = treeTitle(tree);
  ctx.setTitle(title);
  const rerender = () => renderTree(el, ctx);
  // 有前任創作者時，時間軸每筆標出作者
  const multi = lineage.length > 1 || entries.some((e) => e.owner_id !== me);
  const author = (e) => multi && creatorLabel(e.owner_id, names, me);

  const edit = async () => {
    const species = await listSpecies();
    openTreeForm({ tree, species, onSaved: rerender });
  };
  ctx.setActions(h("button", { class: "icon-btn", title: "編輯盆栽檔案", "aria-label": "編輯盆栽檔案", onclick: edit }, icon("edit")));

  // 封面：最新一張正面照（沒有就用最新任一張）
  const allPhotos = entries.flatMap((e) => e.photos);
  const cover = allPhotos.find((p) => p.angle === "front") || allPhotos[0];

  const facts = [
    speciesTag(tree),
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
      h("button", { class: "hero-uid", title: "複製身分證", onclick: () => copyText(tree.uid, "已複製身分證") }, [
        h("span", { class: "k" }, "身分證"), h("span", { class: "v" }, tree.uid), icon("copy"),
      ]),
      h("div", { class: "hero-title" }, [title, tree.code && h("span", { class: "code" }, tree.code)]),
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
    ? h("div", { class: "timeline" }, entries.map((e, i) => timelineItem(e, entries[i + 1], entries.length - i, author(e))))
    : h("div", { class: "empty" }, [
        h("p", {}, "還沒有紀錄。"),
        h("p", { class: "muted" }, "建議先拍一組正面、背面、左、右、俯視的「初始紀錄」，之後才有對照的基準。"),
      ]);

  // ---------- 傳承：每一段時期的創作者 ----------
  const lineageBox = h("div", { class: "lineage" }, lineage.map((c, i) => h("div", { class: "lin-item" + (c.ended_at ? "" : " current") }, [
    h("div", { class: "lin-no" }, String(i + 1).padStart(2, "0")),
    h("div", { class: "lin-body" }, [
      h("div", { class: "lin-name" }, [creatorLabel(c.owner_id, names, me), c.note && h("span", { class: "tag" }, c.note)]),
      h("div", { class: "lin-date" }, `${fmtDate(c.started_at.slice(0, 10))} — ${c.ended_at ? fmtDate(c.ended_at.slice(0, 10)) : "現在"}`),
    ]),
  ])));
  const transferBox = transfer
    ? transferCard(transfer, tree, rerender)
    : h("button", { class: "btn btn-block", onclick: () => openTransferForm(tree, rerender) }, [icon("transfer"), "轉移給他人"]);

  // 有前任創作者的紀錄就不能刪除（只能封存或再轉移），避免傳承紀錄消失
  const othersWrote = entries.some((e) => e.owner_id !== me);
  const removeTree = async () => {
    const ok = await confirmDialog("刪除這盆盆栽？", `「${title}」的 ${entries.length} 筆紀錄和所有照片都會一起刪除，無法復原。`, "刪除");
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
  };
  const danger = othersWrote
    ? h("div", { class: "hint center lock-note" }, "這盆盆栽有前任創作者的紀錄，不能刪除；不再照顧可以在「編輯」裡封存，或轉移給他人。")
    : h("div", { class: "danger-zone" }, h("button", { class: "btn btn-ghost-danger btn-sm", onclick: removeTree }, "刪除這盆盆栽"));

  el.replaceChildren(
    header, tools,
    sectionTitle("時間軸", "TIMELINE"), timeline,
    sectionTitle("傳承", "LINEAGE"), lineageBox, transferBox,
    danger,
  );
  hydratePhotos(el);
}

function timelineItem(e, prev, no, author) {
  const gap = prev ? daysBetween(prev.entry_date, e.entry_date) : null;
  const photos = [...e.photos].sort((a, b) => ANGLE_ORDER.indexOf(a.angle) - ANGLE_ORDER.indexOf(b.angle));
  return h("a", { class: "tl-item", href: `#/entry/${e.id}` }, [
    h("div", { class: "tl-dot" }),
    h("div", { class: "tl-card" }, [
      h("div", { class: "tl-head" }, [
        h("span", {}, [h("span", { class: "tl-no" }, `#${String(no).padStart(2, "0")}`), h("span", { class: "tl-date" }, fmtDate(e.entry_date))]),
        gap != null && h("span", { class: "tl-gap" }, gap === 0 ? "同一天" : `距上次 ${gap} 天`),
      ]),
      author && h("div", { class: "tl-author" }, author),
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

// ---------- 轉移給他人 ----------
const METHODS = ["買賣", "傳承", "贈與"];

async function openTransferForm(tree, onDone) {
  const profile = await getMyProfile().catch(() => null);
  const hasName = !!profile?.display_name?.trim();
  const nameInput = h("input", { type: "text", maxlength: "40", placeholder: "例：韋恩、有植 YUZHIPLANT" });
  let method = null;
  const chips = h("div", { class: "chips wrap" });
  const drawChips = () => chips.replaceChildren(...METHODS.map((m) => h("button", {
    class: "chip" + (method === m ? " active" : ""),
    onclick: () => { method = method === m ? null : m; drawChips(); },
  }, m)));
  drawChips();

  sheet("轉移給他人", (close) => h("div", {}, [
    h("p", { class: "sheet-msg" }, `產生一組轉移碼交給對方。對方在「我的盆栽 → 接收」輸入後，「${treeTitle(tree)}」和所有紀錄、照片會移到對方名下，傳承紀錄會記下你這一段。`),
    !hasName && field("你的創作者名稱", nameInput, "對方的傳承紀錄會顯示這個名稱，之後可以在「設定」修改。"),
    field("方式（選填）", chips),
    h("div", { class: "notice" }, "轉移後你就看不到這盆盆栽了。建議先到「設定 → 匯出備份」留一份在自己手上。轉移碼 7 天內有效，對方接收前都可以作廢。"),
    h("button", { class: "btn btn-primary btn-block", onclick: async (e) => {
      const btn = e.currentTarget;
      const name = nameInput.value.trim();
      if (!hasName && !name) { toast("請輸入你的創作者名稱", "err"); nameInput.focus(); return; }
      btn.disabled = true;
      try {
        if (!hasName) await saveMyProfile(name);
        await createTransfer(tree.id, method);
        close();
        toast("已產生轉移碼", "ok");
        onDone();
      } catch (err) {
        toast("產生失敗：" + err.message, "err");
        btn.disabled = false;
      }
    } }, [icon("transfer"), "產生轉移碼"]),
  ]));
}

function transferCard(t, tree, onDone) {
  const link = `${WEB_URL}#/receive/${t.code}`;
  const text = `盆栽「${treeTitle(tree)}」（${tree.uid}）要轉移給你。\n打開 Bonsai Journal →「我的盆栽」右上角「接收」，輸入轉移碼：${t.code}\n或直接開啟：${link}`;
  return h("div", { class: "transfer-card" }, [
    h("div", { class: "k" }, "轉移碼 · 等待對方接收"),
    h("div", { class: "transfer-code" }, t.code),
    h("div", { class: "hint" }, [t.note && `${t.note} · `, `有效至 ${fmtDateTime(t.expires_at)}`]),
    h("div", { class: "row" }, [
      h("button", { class: "btn", onclick: () => copyText(t.code, "已複製轉移碼") }, [icon("copy"), "複製"]),
      navigator.share
        ? h("button", { class: "btn", onclick: () => navigator.share({ title: "Bonsai Journal 盆栽轉移", text }).catch(() => {}) }, [icon("share"), "分享"])
        : h("button", { class: "btn", onclick: () => copyText(text, "已複製轉移說明") }, [icon("share"), "複製說明"]),
    ]),
    h("button", { class: "btn btn-ghost-danger btn-sm", onclick: async () => {
      if (!(await confirmDialog("作廢轉移碼？", "作廢後對方就不能用這組轉移碼接收了。", "作廢"))) return;
      try {
        await cancelTransfer(tree.id);
        toast("已作廢", "ok");
        onDone();
      } catch (err) {
        toast("作廢失敗：" + err.message, "err");
      }
    } }, "作廢轉移碼"),
  ]);
}

async function copyText(text, msg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg, "ok");
  } catch {
    toast(text);
  }
}
