// 名木範例：資料是 App 內的靜態檔（examples/<id>/data.json＋照片），唯讀、不屬於任何使用者
export const EXAMPLES = [
  { id: "yamaki", uid: "BJ-1625-HRSM", name: "山木五葉松", subtitle: "廣島原爆倖存的盆栽", tag: "松・五葉松", since: "1625", cover: null },
];

export const exampleAsset = (id, file) => `./examples/${id}/${file}`;

export async function loadExample(id) {
  if (!EXAMPLES.some((x) => x.id === id)) throw new Error("找不到這個範例");
  const res = await fetch(exampleAsset(id, "data.json"), { cache: "no-cache" });
  if (!res.ok) throw new Error("找不到這個範例");
  return res.json();
}
