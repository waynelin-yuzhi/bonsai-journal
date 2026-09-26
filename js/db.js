// 所有資料讀寫集中在這裡
import { supabase } from "./supabase.js";
import { groupOf } from "./constants.js";

const BUCKET = "photos";

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

async function uid() {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error("尚未登入");
  return id;
}

// ---------- 樹種 / 作業項目 ----------
export async function listSpecies() {
  return unwrap(await supabase.from("species").select("*").order("sort").order("created_at"));
}

export async function addSpecies(name, category) {
  return unwrap(await supabase.from("species").insert({ name, category, owner_id: await uid(), sort: 500 }).select().single());
}

export async function updateSpecies(id, fields) {
  return unwrap(await supabase.from("species").update(fields).eq("id", id).select().single());
}

export async function deleteSpecies(id) {
  unwrap(await supabase.from("species").delete().eq("id", id));
}

export async function listOperationTypes() {
  return unwrap(await supabase.from("operation_types").select("*").order("sort").order("created_at"));
}

// scope：{ speciesId } 樹種專屬、{ category } 分類適用、都沒有＝共用
export async function addOperationType(name, { speciesId = null, category = null } = {}) {
  return unwrap(
    await supabase.from("operation_types")
      .insert({ name, species_id: speciesId, category: speciesId ? null : category, owner_id: await uid(), sort: 500 })
      .select().single()
  );
}

export async function deleteOperationType(id) {
  unwrap(await supabase.from("operation_types").delete().eq("id", id));
}

// 某樹種可用的作業：共用 → 分類適用（含雜木）→ 該樹種專屬（名稱去重，保留排序）
export function opsForSpecies(opTypes, speciesId, category) {
  const seen = new Set();
  const cats = category ? [category, groupOf(category)] : [];
  const level = (o) => (o.species_id ? 2 : o.category ? 1 : 0);
  return opTypes
    .filter((o) => (o.species_id ? o.species_id === speciesId : !o.category || cats.includes(o.category)))
    .sort((a, b) => level(a) - level(b) || a.sort - b.sort)
    .filter((o) => (seen.has(o.name) ? false : seen.add(o.name)));
}

// ---------- 盆栽 ----------
export async function listTrees() {
  return unwrap(await supabase.from("tree_overview").select("*").order("created_at", { ascending: false }));
}

export async function getTree(id) {
  return unwrap(await supabase.from("tree_overview").select("*").eq("id", id).single());
}

export async function saveTree(tree) {
  const { id, ...fields } = tree;
  if (id) return unwrap(await supabase.from("trees").update(fields).eq("id", id).select().single());
  return unwrap(await supabase.from("trees").insert(fields).select().single());
}

// 先刪資料、確認真的刪掉了再刪檔案：有其他創作者的紀錄時資料庫會拒絕，照片檔也不會被動到
export async function deleteTree(id) {
  const photos = unwrap(await supabase.from("photos").select("path, thumb_path").eq("tree_id", id));
  const rows = unwrap(await supabase.from("trees").delete().eq("id", id).select("id"));
  if (!rows.length) throw new Error("這盆盆栽有其他創作者的紀錄，不能刪除，可以改成封存");
  await removeFiles(photos.flatMap((p) => [p.path, p.thumb_path])).catch((err) => console.warn(err));
}

// ---------- 紀錄 ----------
const PHOTOS = "photos!photos_entry_id_fkey(*)";
const TREE = "trees!entries_tree_id_fkey(id, uid, name, code, species_id, species(name, category))";

const sortPhotos = (e) => {
  e.photos?.sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at));
  return e;
};

export async function listEntries(treeId) {
  const rows = unwrap(
    await supabase.from("entries").select(`*, ${PHOTOS}`)
      .eq("tree_id", treeId)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
  );
  return rows.map(sortPhotos);
}

export async function getEntry(id) {
  return sortPhotos(unwrap(await supabase.from("entries").select(`*, ${PHOTOS}, ${TREE}`).eq("id", id).single()));
}

export async function recentEntries(limit = 60) {
  const rows = unwrap(
    await supabase.from("entries").select(`*, ${PHOTOS}, ${TREE}`)
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit)
  );
  return rows.map(sortPhotos);
}

export async function saveEntry(entry) {
  const { id, ...fields } = entry;
  if (id) return unwrap(await supabase.from("entries").update(fields).eq("id", id).select().single());
  return unwrap(await supabase.from("entries").insert(fields).select().single());
}

export async function deleteEntry(id) {
  const photos = unwrap(await supabase.from("photos").select("path, thumb_path").eq("entry_id", id));
  const rows = unwrap(await supabase.from("entries").delete().eq("id", id).select("id"));
  if (!rows.length) throw new Error("只能刪除自己寫的紀錄");
  await removeFiles(photos.flatMap((p) => [p.path, p.thumb_path])).catch((err) => console.warn(err));
}

// ---------- 照片 ----------
// 同一盆盆栽的所有照片（含紀錄日期），對比頁與「上次同角度」參考用
export async function treePhotos(treeId) {
  const rows = unwrap(
    await supabase.from("photos").select("*, entries!photos_entry_id_fkey(entry_date)").eq("tree_id", treeId)
  );
  return rows
    .map((p) => ({ ...p, entry_date: p.entries?.entry_date }))
    .sort((a, b) => a.entry_date.localeCompare(b.entry_date) || a.created_at.localeCompare(b.created_at));
}

async function upload(path, blob) {
  unwrap(await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "image/jpeg", cacheControl: "31536000", upsert: false,
  }));
}

// prepared = image.js 的 prepareImage() 結果
export async function uploadPhoto({ treeId, entryId, angle, caption = null, sort = 0, prepared }) {
  const pid = crypto.randomUUID();
  const base = `${await uid()}/${treeId}/${entryId}/${pid}`;
  const path = `${base}.jpg`;
  const thumb_path = `${base}_t.jpg`;
  await upload(path, prepared.full);
  await upload(thumb_path, prepared.thumb);
  try {
    return unwrap(
      await supabase.from("photos").insert({
        id: pid, tree_id: treeId, entry_id: entryId, angle, caption, sort,
        path, thumb_path, width: prepared.width, height: prepared.height,
      }).select().single()
    );
  } catch (err) {
    await removeFiles([path, thumb_path]).catch(() => {});
    throw err;
  }
}

export async function updatePhoto(id, fields) {
  unwrap(await supabase.from("photos").update(fields).eq("id", id));
}

export async function deletePhotos(photos) {
  if (!photos.length) return;
  await removeFiles(photos.flatMap((p) => [p.path, p.thumb_path]));
  unwrap(await supabase.from("photos").delete().in("id", photos.map((p) => p.id)));
}

async function removeFiles(paths) {
  for (let i = 0; i < paths.length; i += 100) {
    unwrap(await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100)));
  }
}

// 私人 bucket 的照片要用簽名網址讀取；快取 50 分鐘（網址本身 1 小時有效）
const urlCache = new Map();

export async function signedUrls(paths) {
  const now = Date.now();
  const need = [...new Set(paths.filter((p) => p && !(urlCache.get(p)?.exp > now)))];
  for (let i = 0; i < need.length; i += 100) {
    const chunk = need.slice(i, i + 100);
    const data = unwrap(await supabase.storage.from(BUCKET).createSignedUrls(chunk, 3600));
    data.forEach((d, k) => {
      if (d.signedUrl) urlCache.set(chunk[k], { url: d.signedUrl, exp: now + 50 * 60 * 1000 });
    });
  }
  return Object.fromEntries(paths.map((p) => [p, urlCache.get(p)?.url]));
}

export async function downloadPhoto(path) {
  return unwrap(await supabase.storage.from(BUCKET).download(path));
}

// ---------- 帳號 ----------
export async function currentEmail() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.email || "";
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function changePassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export const myId = uid;

// ---------- 創作者名稱 ----------
export async function getMyProfile() {
  const id = await uid();
  return unwrap(await supabase.from("profiles").select("*").eq("user_id", id).maybeSingle());
}

export async function saveMyProfile(displayName) {
  const id = await uid();
  unwrap(await supabase.from("profiles").upsert({ user_id: id, display_name: displayName, updated_at: new Date().toISOString() }));
}

// 回傳 { user_id: 名稱 }；看得到的只有自己和自己盆栽的歷任創作者
export async function creatorNames(ids) {
  const list = [...new Set(ids.filter(Boolean))];
  if (!list.length) return {};
  const rows = unwrap(await supabase.from("profiles").select("user_id, display_name").in("user_id", list));
  return Object.fromEntries(rows.map((r) => [r.user_id, r.display_name]));
}

// ---------- 傳承與轉移 ----------
export async function treeLineage(treeId) {
  return unwrap(await supabase.from("tree_custody").select("*").eq("tree_id", treeId).order("started_at"));
}

// 目前還有效、還沒被使用的轉移碼
export async function openTransfer(treeId) {
  const rows = unwrap(
    await supabase.from("tree_transfers").select("*")
      .eq("tree_id", treeId).is("accepted_at", null).is("cancelled_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false }).limit(1)
  );
  return rows[0] || null;
}

export async function createTransfer(treeId, note) {
  return unwrap(await supabase.rpc("create_transfer", { p_tree: treeId, p_note: note || null }));
}

export async function cancelTransfer(treeId) {
  unwrap(await supabase.rpc("cancel_transfer", { p_tree: treeId }));
}

export async function previewTransfer(code) {
  return unwrap(await supabase.rpc("preview_transfer", { p_code: code }));
}

export async function acceptTransfer(code) {
  return unwrap(await supabase.rpc("accept_transfer", { p_code: code }));
}

// ---------- 匯出備份：分頁抓完所有資料（Supabase 單次最多回 1000 筆）----------
async function fetchAll(build) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const rows = unwrap(await build().range(from, from + 999));
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function exportData() {
  const [trees, entries, photos, species, opTypes, lineage] = await Promise.all([
    fetchAll(() => supabase.from("tree_overview").select("*").order("created_at")),
    fetchAll(() => supabase.from("entries").select("*").order("entry_date").order("created_at")),
    fetchAll(() => supabase.from("photos").select("*").order("created_at")),
    listSpecies(),
    listOperationTypes(),
    fetchAll(() => supabase.from("tree_custody").select("*").order("started_at")),
  ]);
  return { trees, entries, photos, species, opTypes, lineage };
}
