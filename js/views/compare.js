// 前後對比：同一角度選兩個日期，拖曳分隔線比較；也可以依時間順序播放（縮時）
import { getTree, treePhotos, signedUrls } from "../db.js";
import { h, loading, fmtDate } from "../ui.js";
import { icon } from "../icons.js";
import { ANGLES } from "../constants.js";

export async function renderCompare(el, ctx) {
  const [treeId] = ctx.params;
  el.append(loading());
  const [tree, photos] = await Promise.all([getTree(treeId), treePhotos(treeId)]);
  if (!ctx.alive()) return;
  ctx.setTitle(`前後對比 · ${tree.name}`);

  const byAngle = Object.fromEntries(ANGLES.map((a) => [a.key, photos.filter((p) => p.angle === a.key)]));
  const usable = ANGLES.filter((a) => byAngle[a.key].length >= 2);

  if (!usable.length) {
    el.replaceChildren(h("div", { class: "empty" }, [
      h("p", {}, "至少要有兩次同角度的照片才能對比。"),
      h("p", { class: "muted" }, "每次紀錄都拍一張「正面」，這裡就會自動排出整個變化過程。"),
      h("a", { class: "btn btn-primary", href: `#/tree/${treeId}/new` }, [icon("plus"), "新增紀錄"]),
    ]));
    return;
  }

  let angle = usable.some((a) => a.key === "front") ? "front" : usable[0].key;
  let a = 0, b = 0;   // 兩張照片在清單中的位置
  let split = 50;     // 分隔線位置（%）
  let timer = null;

  const stage = h("div", { class: "compare-stage" });
  const controls = h("div", { class: "compare-controls" });
  const chips = h("div", { class: "chips" });

  const stop = () => { clearInterval(timer); timer = null; };

  const drawChips = () => chips.replaceChildren(...usable.map((x) => h("button", {
    class: "chip" + (x.key === angle ? " active" : ""),
    onclick: () => { stop(); angle = x.key; reset(); },
  }, `${x.label} ${byAngle[x.key].length}`)));

  const reset = () => {
    const list = byAngle[angle];
    a = 0;
    b = list.length - 1;
    drawChips();
    drawCompare();
  };

  const dateSelect = (value, onChange) => {
    const sel = h("select", {}, byAngle[angle].map((p, i) => h("option", { value: String(i) }, fmtDate(p.entry_date))));
    sel.value = String(value);
    sel.addEventListener("change", () => onChange(+sel.value));
    return sel;
  };

  async function drawCompare() {
    const list = byAngle[angle];
    const pa = list[a], pb = list[b];
    const urls = await signedUrls([pa.path, pb.path]);
    if (!ctx.alive()) return;

    // 下層是較新的 B，上層是較舊的 A，只露出分隔線左邊
    const imgB = h("img", { src: urls[pb.path], alt: "" });
    const imgA = h("img", { src: urls[pa.path], alt: "", class: "top" });
    const line = h("div", { class: "split-line" }, h("span", { class: "split-handle" }, [icon("back"), icon("forward")]));
    const box = h("div", { class: "compare-box" }, [
      imgB, imgA, line,
      h("span", { class: "badge left" }, `A ${fmtDate(pa.entry_date)}`),
      h("span", { class: "badge right" }, `B ${fmtDate(pb.entry_date)}`),
    ]);
    if (pb.width && pb.height) box.style.aspectRatio = `${pb.width} / ${pb.height}`;

    const apply = () => {
      imgA.style.clipPath = `inset(0 ${100 - split}% 0 0)`;
      line.style.left = `${split}%`;
    };
    const move = (e) => {
      const r = box.getBoundingClientRect();
      split = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
      apply();
    };
    box.addEventListener("pointerdown", (e) => { box.setPointerCapture(e.pointerId); move(e); });
    box.addEventListener("pointermove", (e) => { if (box.hasPointerCapture(e.pointerId)) move(e); });
    apply();

    const days = Math.round((Date.parse(pb.entry_date) - Date.parse(pa.entry_date)) / 86400000);
    stage.replaceChildren(box, h("div", { class: "hint center" }, `相隔 ${days} 天・左右拖曳分隔線比較`));
    controls.replaceChildren(
      h("div", { class: "row" }, [
        h("div", { class: "field" }, [h("label", {}, "A（較早）"), dateSelect(a, (i) => { a = i; drawCompare(); })]),
        h("div", { class: "field" }, [h("label", {}, "B（較晚）"), dateSelect(b, (i) => { b = i; drawCompare(); })]),
      ]),
      h("button", { class: "btn btn-block", onclick: play }, [icon("play"), `播放全部 ${list.length} 張（縮時）`]),
    );
  }

  async function play() {
    stop();
    const list = byAngle[angle];
    const urls = await signedUrls(list.map((p) => p.path));
    // 先預載，播放才不會閃
    await Promise.all(list.map((p) => new Promise((res) => { const i = new Image(); i.onload = i.onerror = res; i.src = urls[p.path]; })));
    if (!ctx.alive()) return;

    const img = h("img", { alt: "" });
    const badge = h("span", { class: "badge left" });
    const bar = h("div", { class: "play-bar" });
    const box = h("div", { class: "compare-box playing" }, [img, badge, bar]);
    const last = list[list.length - 1];
    if (last.width && last.height) box.style.aspectRatio = `${last.width} / ${last.height}`;
    stage.replaceChildren(box, h("div", { class: "hint center" }, "點畫面停止"));
    controls.replaceChildren(h("button", { class: "btn btn-block", onclick: () => { stop(); drawCompare(); } }, [icon("stop"), "停止，回到對比"]));
    box.addEventListener("click", () => { stop(); drawCompare(); });

    let i = 0;
    const frame = () => {
      const p = list[i];
      img.src = urls[p.path];
      badge.textContent = fmtDate(p.entry_date);
      bar.style.width = `${((i + 1) / list.length) * 100}%`;
      i = (i + 1) % list.length;
    };
    frame();
    timer = setInterval(() => {
      if (!ctx.alive()) return stop();
      frame();
    }, 900);
  }

  el.replaceChildren(chips, stage, controls);
  reset();
}
