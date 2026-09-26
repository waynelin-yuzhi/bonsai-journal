// 照片上傳前在手機端壓縮：原圖長邊 2000px、縮圖長邊 480px，一律轉成 JPEG
const FULL_MAX = 2000;
const THUMB_MAX = 480;

export async function prepareImage(file) {
  const src = await decode(file);
  try {
    const full = await toJpeg(src, FULL_MAX, 0.85);
    const thumb = await toJpeg(src, THUMB_MAX, 0.8);
    return { full: full.blob, thumb: thumb.blob, width: full.w, height: full.h };
  } finally {
    src.close?.();
  }
}

async function decode(file) {
  if ("createImageBitmap" in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // 部分瀏覽器不支援參數，改用 <img> 解碼
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error("無法讀取這張照片，請改用 JPEG 格式");
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toJpeg(src, max, quality) {
  const sw = src.naturalWidth || src.width;
  const sh = src.naturalHeight || src.height;
  const scale = Math.min(1, max / Math.max(sw, sh));
  const w = Math.round(sw * scale);
  const h = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve({ blob, w, h }) : reject(new Error("照片壓縮失敗"))), "image/jpeg", quality)
  );
}
