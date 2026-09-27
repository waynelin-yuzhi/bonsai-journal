// 問題反饋：使用者回報問題／提供建議、看自己的反饋狀態；管理員收件匣（含內部分析、改狀態、回覆）
import { submitFeedback, adminFeedbackList, adminFeedbackUpdate, feedbackShotUrl } from "../db.js";
import { h, sheet, field, toast, busy, loading, fmtDateTime } from "../ui.js";
import { icon } from "../icons.js";
import { prepareImage } from "../image.js";
import { runningVersion } from "../update.js";
import { isNativeApp, nativeBuild } from "../platform.js";
import { isStandalone } from "../install.js";
import { versionName } from "../apk-update.js";
import { previousPath } from "../router.js";
import { openViewer } from "../viewer.js";

export const KIND = { bug: "問題回報", idea: "優化建議", other: "其他" };
export const STATUS = { new: "已收到", reviewing: "評估中", planned: "已排入開發", done: "已完成", declined: "暫不處理" };
const PLACEHOLDER = {
  bug: "發生了什麼？在哪個畫面、做了什麼動作之後出現？",
  idea: "希望新增或改善什麼？會在什麼情況下用到？",
  other: "想告訴我們的事…",
};

// 自動附上的環境資訊，方便重現問題
function context() {
  const v = runningVersion();
  const prev = previousPath();
  return {
    app_version: v?.version || null,
    platform: isNativeApp() ? `android ${versionName(nativeBuild())}` : isStandalone() ? "pwa" : "web",
    user_agent: navigator.userAgent.slice(0, 300),
    screen: `${innerWidth}×${innerHeight}@${devicePixelRatio}`,
    page: prev ? `#/${prev}` : null,
  };
}

export function openFeedbackForm(kind = "bug", onDone) {
  let current = kind;
  let shot = null;
  const text = h("textarea", { rows: "6", maxlength: "4000" });
  const chips = h("div", { class: "chips wrap" });
  const drawChips = () => {
    chips.replaceChildren(...Object.entries(KIND).map(([k, label]) => h("button", {
      class: "chip" + (current === k ? " active" : ""),
      onclick: () => { current = k; drawChips(); },
    }, label)));
    text.placeholder = PLACEHOLDER[current];
  };
  drawChips();

  const input = h("input", { type: "file", accept: "image/*", class: "hidden" });
  const shotBox = h("div", { class: "fb-shot" });
  const drawShot = () => shotBox.replaceChildren(shot
    ? h("div", { class: "fb-shot-preview" }, [
        h("img", { src: URL.createObjectURL(shot), alt: "截圖" }),
        h("button", { class: "tile-x", "aria-label": "移除截圖", onclick: () => { shot = null; drawShot(); } }, icon("close")),
      ])
    : h("label", { class: "btn btn-sm" }, [icon("image"), "附上截圖（選填）", input]));
  input.addEventListener("change", () => { shot = input.files[0] || null; input.value = ""; drawShot(); });
  drawShot();

  const ctx = context();
  const info = [ctx.app_version && `v${ctx.app_version}`, ctx.platform, ctx.screen].filter(Boolean).join("・");

  sheet("問題反饋", (close) => h("div", {}, [
    field("類型", chips),
    field("內容", text),
    shotBox,
    h("div", { class: "hint" }, `送出時會一併附上：${info}，方便我們找出原因。`),
    h("button", { class: "btn btn-primary btn-block", onclick: async (e) => {
      const btn = e.currentTarget;
      const message = text.value.trim();
      if (message.length < 2) { toast("請寫下問題或建議", "err"); text.focus(); return; }
      btn.disabled = true;
      const b = busy("送出中…");
      try {
        const prepared = shot ? await prepareImage(shot) : null;
        await submitFeedback({ kind: current, message, screenshot: prepared?.full || null, context: ctx });
        close();
        toast("已收到，謝謝你的回饋", "ok");
        onDone?.();
      } catch (err) {
        toast("送出失敗：" + err.message, "err");
        btn.disabled = false;
      } finally {
        b.remove();
      }
    } }, "送出"),
  ]));
  setTimeout(() => text.focus(), 80);
}

const statusTag = (s) => h("span", { class: `tag fb-status s-${s}` }, STATUS[s] || s);

// 設定頁「我的反饋」
export function myFeedbackList(list) {
  return h("div", { class: "fb-list" }, list.map((f) => h("div", { class: "fb-item" }, [
    h("div", { class: "fb-head" }, [
      h("span", { class: "tag" }, KIND[f.kind] || f.kind),
      statusTag(f.status),
      h("span", { class: "fb-date" }, fmtDateTime(f.created_at)),
    ]),
    h("div", { class: "fb-msg" }, f.message),
    f.reply && h("div", { class: "fb-reply" }, [h("span", { class: "k" }, "開發回覆"), h("span", {}, f.reply)]),
  ])));
}

// ---------- 管理員：反饋收件匣 ----------
const REC_CLASS = { 建議做: "go", 可考慮: "maybe", 暫不做: "no", 需要更多資訊: "ask" };
let filter = "open"; // open（未結案）／all／各狀態

export async function renderFeedbackAdmin(el, ctx) {
  el.append(loading());
  const list = await adminFeedbackList();
  if (!ctx.alive()) return;
  const content = h("div");
  el.replaceChildren(content);

  const draw = () => {
    const open = list.filter((f) => !["done", "declined"].includes(f.status));
    const shown = filter === "open" ? open : filter === "all" ? list : list.filter((f) => f.status === filter);
    const chip = (key, label, n) => h("button", {
      class: "chip" + (filter === key ? " active" : ""), onclick: () => { filter = key; draw(); },
    }, `${label} ${n}`);
    content.replaceChildren(
      h("div", { class: "chips" }, [
        chip("open", "未結案", open.length),
        chip("all", "全部", list.length),
        ...Object.entries(STATUS).map(([k, label]) => {
          const n = list.filter((f) => f.status === k).length;
          return n ? chip(k, label, n) : null;
        }),
      ]),
      shown.length
        ? h("div", { class: "fb-list" }, shown.map((f) => adminCard(f, draw)))
        : h("div", { class: "empty" }, list.length ? "這個分類沒有反饋" : "還沒有任何反饋"),
    );
  };
  draw();
}

function adminCard(f, redraw) {
  const a = f.analysis;
  const status = h("select", {}, Object.entries(STATUS).map(([k, label]) => h("option", { value: k }, label)));
  status.value = f.status;
  const reply = h("textarea", { rows: "2", placeholder: "回覆給使用者（選填，對方看得到）" }, f.reply || "");
  const meta = [f.app_version && `v${f.app_version}`, f.platform, f.screen, f.page].filter(Boolean).join("・");

  return h("div", { class: "fb-item admin" }, [
    h("div", { class: "fb-head" }, [
      h("span", { class: "tag" }, KIND[f.kind] || f.kind),
      statusTag(f.status),
      h("span", { class: "fb-date" }, fmtDateTime(f.created_at)),
    ]),
    h("div", { class: "fb-who" }, f.name ? `${f.name}（${f.email}）` : f.email),
    h("div", { class: "fb-msg full" }, f.message),
    f.screenshot_path && h("button", { class: "btn btn-sm", onclick: async () => {
      try { openViewer([{ url: await feedbackShotUrl(f.screenshot_path), label: "截圖" }], 0); }
      catch (err) { toast("讀取截圖失敗：" + err.message, "err"); }
    } }, [icon("image"), "看截圖"]),
    meta && h("div", { class: "fb-meta" }, meta),
    a
      ? h("div", { class: "fb-analysis" }, [
          h("div", { class: "fb-rec-row" }, [
            h("span", { class: `fb-rec ${REC_CLASS[a.recommendation] || ""}` }, a.recommendation || "—"),
            a.priority && h("span", { class: "tag" }, `優先 ${a.priority}`),
            a.effort && h("span", { class: "tag" }, `工作量 ${a.effort}`),
            a.impact && h("span", { class: "tag" }, `影響 ${a.impact}`),
            a.category && h("span", { class: "tag" }, a.category),
          ]),
          a.summary && h("div", { class: "fb-a-summary" }, a.summary),
          a.reasoning && h("div", { class: "fb-a-text" }, a.reasoning),
          a.next_step && h("div", { class: "fb-a-text" }, [h("b", {}, "下一步："), a.next_step]),
          f.analyzed_at && h("div", { class: "fb-date" }, `分析於 ${fmtDateTime(f.analyzed_at)}`),
        ])
      : h("div", { class: "hint" }, "尚未分析"),
    h("div", { class: "fb-controls" }, [
      h("div", { class: "row" }, [field("狀態", status)]),
      reply,
      h("button", { class: "btn btn-primary btn-sm", onclick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          await adminFeedbackUpdate(f.id, status.value, reply.value.trim());
          f.status = status.value;
          f.reply = reply.value.trim() || null;
          toast("已更新", "ok");
          redraw();
        } catch (err) {
          toast("更新失敗：" + err.message, "err");
          btn.disabled = false;
        }
      } }, "儲存"),
    ]),
  ]);
}
