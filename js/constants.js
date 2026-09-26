// 拍照角度：五個固定角度 + 細節
export const ANGLES = [
  { key: "front", label: "正面" },
  { key: "back", label: "背面" },
  { key: "left", label: "左側" },
  { key: "right", label: "右側" },
  { key: "top", label: "俯視" },
];
export const ANGLE_LABEL = { ...Object.fromEntries(ANGLES.map((a) => [a.key, a.label])), detail: "細節" };

export const SOURCES = ["山採", "素材", "扦插", "實生", "嫁接苗", "購入成品", "其他"];

export const VIGOR_LABEL = { 1: "衰弱", 2: "偏弱", 3: "普通", 4: "良好", 5: "旺盛" };
