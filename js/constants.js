// 拍照角度：五個固定角度 + 細節
export const ANGLES = [
  { key: "front", label: "正面", en: "FRONT" },
  { key: "back", label: "背面", en: "BACK" },
  { key: "left", label: "左側", en: "LEFT" },
  { key: "right", label: "右側", en: "RIGHT" },
  { key: "top", label: "俯視", en: "TOP" },
];
export const ANGLE_LABEL = { ...Object.fromEntries(ANGLES.map((a) => [a.key, a.label])), detail: "細節" };

export const SOURCES = ["山採", "素材", "扦插", "實生", "嫁接苗", "購入成品", "其他"];

export const VIGOR_LABEL = { 1: "衰弱", 2: "偏弱", 3: "普通", 4: "良好", 5: "旺盛" };

// 分類：柏、松、雜木（花果、落葉、常綠）；樹種的 category 存 key
export const CATEGORIES = [
  { key: "柏", label: "柏", group: "柏" },
  { key: "松", label: "松", group: "松" },
  { key: "花果", label: "雜木・花果", group: "雜木" },
  { key: "落葉", label: "雜木・落葉", group: "雜木" },
  { key: "常綠", label: "雜木・常綠", group: "雜木" },
];
export const GROUPS = ["柏", "松", "雜木"];
export const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));
export const groupOf = (cat) => CATEGORIES.find((c) => c.key === cat)?.group || null;

// 作業項目可以掛在分類上：雜木＝花果、落葉、常綠都適用
export const OP_SCOPES = [
  { key: "柏", label: "柏" },
  { key: "松", label: "松" },
  { key: "雜木", label: "雜木（全部）" },
  { key: "花果", label: "雜木・花果" },
  { key: "落葉", label: "雜木・落葉" },
  { key: "常綠", label: "雜木・常綠" },
];
