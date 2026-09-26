// Android App 裡的檔案選擇器不會提供相機選項，點照片時先問要「拍照」還是「從相簿選」。
// 一般瀏覽器本身就會提供這兩個選項，維持原本行為。
import { h, sheet } from "./ui.js";
import { isNativeApp } from "./platform.js";
import { icon } from "./icons.js";

export function bindPhotoPicker(trigger, input) {
  if (!isNativeApp()) return;
  trigger.addEventListener("click", (e) => {
    if (e.target === input) return; // 下面 input.click() 冒泡上來的事件，放行才會打開選擇器
    e.preventDefault();
    const open = (camera) => {
      if (camera) input.setAttribute("capture", "environment");
      else input.removeAttribute("capture");
      input.click();
    };
    sheet("加入照片", (close) => h("div", {}, [
      h("button", { class: "btn btn-primary btn-block", onclick: () => { close(); open(true); } }, [icon("camera"), "拍照"]),
      h("button", { class: "btn btn-block", onclick: () => { close(); open(false); } }, [icon("image"), "從相簿選"]),
    ]));
  });
}
