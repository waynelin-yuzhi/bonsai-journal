// 名木範例：資料是 App 內的靜態檔（examples/<id>/data.json＋照片），唯讀、不屬於任何使用者
export const EXAMPLES = [
  { id: "yamaki", uid: "BJ-1625-HRSM", name: "山木五葉松", subtitle: "廣島原爆倖存的盆栽", tag: "松・五葉松", period: "1625 — 今",
    cover: "https://commons.wikimedia.org/wiki/Special:FilePath/Japanese_White_Pine_%27Hiroshima_Survivor%27%2C_30_April_2012.JPG?width=330" },
  { id: "toryu", uid: "BJ-KMRA-TRYN", name: "登龍の舞", subtitle: "木村正彥代表作・內閣總理大臣賞", tag: "柏・真柏", period: "山採・改作", cover: null },
  { id: "kimura-kaisaku", uid: "", name: "木村正彥 改作實技", subtitle: "近代盆栽連載・官方影片 4 部", tag: "柏・真柏", period: "2023–2024", cover: null },
];

export const exampleAsset = (id, file) => `./examples/${id}/${file}`;

export async function loadExample(id) {
  if (!EXAMPLES.some((x) => x.id === id)) throw new Error("找不到這個範例");
  const res = await fetch(exampleAsset(id, "data.json"), { cache: "no-cache" });
  if (!res.ok) throw new Error("找不到這個範例");
  return res.json();
}
