// 介面圖示：統一 24×24、1.6 線寬、方角線條（不使用 emoji）
const PATHS = {
  tree: '<path d="M5 18.5h14M6.6 18.5l1.1 2.8h8.6l1.1-2.8"/><path d="M12 18.5c-.7-2.1 1.7-3 .8-4.8-.7-1.3-2.9-1.4-2.4-3.3.3-1.1 1.5-1.6 2.3-1.9"/><path d="M12.6 13.9c1.3-.4 2.4-.8 3.2-1.6M10.6 10.6c-.9-.2-1.8 0-2.6.5"/><rect x="8.4" y="6.4" width="8.2" height="2.6" rx="1.3"/><rect x="4.4" y="10.2" width="5.4" height="2.2" rx="1.1"/><rect x="14.4" y="11.2" width="5.4" height="2.2" rx="1.1"/>',
  timeline: '<path d="M7 3v18"/><rect x="5.5" y="4.5" width="3" height="3" fill="currentColor"/><rect x="5.5" y="10.5" width="3" height="3"/><rect x="5.5" y="16.5" width="3" height="3"/><path d="M11.5 6h8.5M11.5 12h6M11.5 18h8"/>',
  settings: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/><rect x="7" y="5" width="3" height="3" fill="currentColor"/><rect x="14" y="10.5" width="3" height="3" fill="currentColor"/><rect x="9.5" y="16" width="3" height="3" fill="currentColor"/>',
  back: '<path d="M15 4.5 7.5 12l7.5 7.5"/>',
  forward: '<path d="M9 4.5 16.5 12 9 19.5"/>',
  plus: '<path d="M12 4.5v15M4.5 12h15"/>',
  edit: '<path d="M4.5 19.5 5.6 15 15.8 4.8l3.4 3.4L9 18.4z"/><path d="M13.6 7l3.4 3.4"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  compare: '<rect x="3.5" y="4.5" width="17" height="15"/><path d="M12 2.5v19"/><path d="M8.5 10 6.5 12l2 2M15.5 10l2 2-2 2"/>',
  play: '<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>',
  stop: '<rect x="7" y="7" width="10" height="10" fill="currentColor"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  camera: '<rect x="3" y="7" width="18" height="13"/><circle cx="12" cy="13.5" r="3.6"/><path d="M8.2 7 9.8 4.5h4.4L15.8 7"/>',
  image: '<rect x="3.5" y="4.5" width="17" height="15"/><path d="M3.5 16.5l5-5 4 4 2.6-2.6 5.4 5.4"/><rect x="14.5" y="7.5" width="2.6" height="2.6"/>',
  check: '<path d="M5 12.5 9.5 17 19 7"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19"/><path d="M12 7v7M9.2 11.4 12 14.2l2.8-2.8"/>',
  logout: '<path d="M10 4.5H4.5v15H10M14 8l4 4-4 4M18 12H9"/>',
  key: '<circle cx="8" cy="12" r="3.5"/><path d="M11.5 12H20M17 12v3M20 12v2.5"/>',
  refresh: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M17.5 3.5v4h-4"/>',
};

const ENSO = "M29.9 87.8 L28.3 87.1 L26.8 86.4 L25.3 85.5 L23.8 84.6 L22.4 83.6 L21.1 82.5 L19.8 81.4 L18.5 80.3 L17.2 79.1 L16.0 77.8 L14.8 76.5 L13.8 75.1 L12.8 73.7 L11.9 72.2 L11.0 70.7 L10.2 69.1 L9.4 67.6 L8.7 65.9 L8.2 64.3 L7.7 62.6 L7.3 60.9 L7.0 59.2 L6.8 57.4 L6.7 55.7 L6.6 54.0 L6.7 52.2 L6.9 50.5 L7.1 48.8 L7.3 47.1 L7.7 45.4 L8.0 43.8 L8.4 42.1 L8.8 40.5 L9.2 38.9 L9.7 37.3 L10.2 35.7 L10.7 34.1 L11.2 32.5 L11.9 30.9 L12.5 29.4 L13.3 27.8 L14.1 26.3 L15.0 24.9 L15.9 23.4 L17.0 22.1 L18.1 20.8 L19.3 19.5 L20.5 18.4 L21.8 17.2 L23.2 16.2 L24.6 15.2 L26.0 14.2 L27.4 13.3 L28.9 12.5 L30.4 11.7 L31.9 10.9 L33.5 10.1 L35.0 9.4 L36.6 8.8 L38.2 8.2 L39.9 7.7 L41.5 7.2 L43.2 6.8 L44.9 6.5 L46.7 6.3 L48.4 6.3 L50.1 6.3 L51.9 6.4 L53.6 6.6 L55.3 7.0 L57.0 7.4 L58.6 7.9 L60.2 8.5 L61.8 9.1 L63.3 9.8 L64.8 10.6 L66.3 11.3 L67.8 12.1 L69.3 12.9 L70.7 13.8 L72.1 14.6 L73.5 15.5 L74.8 16.5 L76.2 17.4 L77.5 18.5 L78.8 19.5 L80.0 20.7 L81.1 21.9 L82.2 23.1 L83.3 24.4 L84.2 25.8 L85.1 27.2 L85.9 28.6 L86.7 30.1 L87.4 31.6 L88.0 33.1 L88.6 34.7 L89.1 36.2 L89.6 37.8 L90.1 39.4 L90.5 41.0 L90.9 42.6 L91.3 44.2 L91.6 45.8 L91.9 47.4 L92.1 49.1 L92.2 50.8 L92.3 52.4 L92.3 54.1 L92.2 55.8 L92.0 57.5 L91.6 59.2 L91.2 60.8 L90.7 62.4 L90.1 64.0 L89.4 65.5 L88.6 67.0 L87.7 68.4 L86.8 69.8 L85.8 71.1 L84.8 72.5 L83.7 73.7 L82.6 74.9 L81.5 76.1 L80.4 77.3 L79.3 78.5 L78.1 79.6 L76.9 80.6 L75.6 81.6 L74.3 82.6 L73.0 83.5 L71.6 84.4 L70.2 85.2 L68.8 85.9 L67.3 86.5 L65.8 87.1 L64.3 87.5 L62.7 87.9 L61.2 88.2 L59.6 88.5 L59.4 87.9 L61.0 87.5 L62.5 87.2 L63.9 86.7 L65.4 86.1 L66.8 85.5 L68.2 84.8 L69.6 84.1 L70.9 83.2 L72.2 82.3 L73.4 81.4 L74.6 80.4 L75.7 79.3 L76.8 78.2 L77.9 77.1 L78.9 76.0 L79.9 74.8 L80.9 73.6 L81.9 72.4 L82.8 71.2 L83.7 69.9 L84.6 68.6 L85.4 67.3 L86.1 65.9 L86.8 64.5 L87.4 63.0 L87.9 61.5 L88.3 60.0 L88.6 58.5 L88.8 56.9 L88.9 55.4 L89.0 53.8 L88.9 52.3 L88.7 50.7 L88.5 49.2 L88.2 47.7 L87.9 46.2 L87.5 44.7 L87.1 43.2 L86.7 41.8 L86.2 40.4 L85.8 39.0 L85.3 37.6 L84.7 36.2 L84.1 34.8 L83.5 33.5 L82.9 32.2 L82.2 30.9 L81.4 29.6 L80.5 28.4 L79.6 27.2 L78.7 26.1 L77.7 25.0 L76.6 24.0 L75.5 23.0 L74.4 22.1 L73.2 21.2 L72.0 20.3 L70.7 19.6 L69.5 18.8 L68.2 18.1 L67.0 17.4 L65.7 16.7 L64.4 16.0 L63.1 15.3 L61.7 14.7 L60.3 14.1 L59.0 13.6 L57.5 13.1 L56.1 12.6 L54.6 12.3 L53.1 12.0 L51.6 11.8 L50.1 11.7 L48.6 11.7 L47.1 11.9 L45.6 12.1 L44.1 12.4 L42.6 12.7 L41.2 13.2 L39.8 13.7 L38.4 14.3 L37.0 14.9 L35.7 15.5 L34.4 16.2 L33.1 16.9 L31.8 17.7 L30.6 18.4 L29.3 19.2 L28.1 20.1 L27.0 21.0 L25.8 21.9 L24.7 22.9 L23.7 23.9 L22.7 25.0 L21.8 26.2 L20.9 27.3 L20.2 28.6 L19.4 29.9 L18.8 31.2 L18.2 32.5 L17.7 33.8 L17.2 35.2 L16.8 36.6 L16.4 37.9 L16.0 39.3 L15.7 40.7 L15.4 42.0 L15.1 43.4 L14.8 44.8 L14.5 46.2 L14.2 47.6 L14.0 49.0 L13.9 50.4 L13.7 51.9 L13.7 53.3 L13.7 54.8 L13.8 56.2 L14.0 57.7 L14.3 59.1 L14.6 60.5 L15.1 61.9 L15.6 63.3 L16.2 64.6 L16.8 65.9 L17.6 67.2 L18.3 68.4 L19.1 69.6 L20.0 70.8 L20.8 72.0 L21.6 73.2 L22.4 74.5 L23.2 75.7 L24.1 76.9 L25.1 78.0 L26.1 79.2 L27.1 80.3 L28.2 81.3 L29.4 82.3 L30.6 83.3 L31.9 84.1 Z";

// 回傳 <span class="ico"><svg/></span>，顏色跟著文字色（currentColor）
export function icon(name, cls = "") {
  const span = document.createElement("span");
  span.className = "ico" + (cls ? " " + cls : "");
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="square" stroke-linejoin="miter">${PATHS[name] || ""}</svg>`;
  return span;
}

// 圓相（ensō）：Logo、空狀態、載入中都用它
export function enso(cls = "") {
  const span = document.createElement("span");
  span.className = "enso" + (cls ? " " + cls : "");
  span.setAttribute("aria-hidden", "true");
  span.innerHTML = `<svg viewBox="0 0 100 100"><path fill="currentColor" d="${ENSO}"/></svg>`;
  return span;
}

// 把 HTML 裡的 <i data-icon="…"> 與 <i data-enso> 換成圖示
export function hydrateIcons(root = document) {
  root.querySelectorAll("i[data-icon]").forEach((el) => el.replaceWith(icon(el.dataset.icon, el.className)));
  root.querySelectorAll("i[data-enso]").forEach((el) => el.replaceWith(enso(el.className)));
}
