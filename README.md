# Bonsai Journal — 盆栽創作紀錄

記錄真柏、黑松、五葉松等盆栽每一次的修剪、蟠扎、換盆，用**時間軸**和**同角度對比**回顧一件作品完整的創作過程。

手機優先的網頁 App（PWA），可以「加入主畫面」，用起來和一般 App 一樣。

---

## 一、Phase 1 功能

- **我的盆栽**：建立盆栽檔案（樹種、名稱（選填，沒取名就顯示樹種）、自訂編號、來源、取得日期、估計樹齡、盆器、正面設定），枯死或不再追蹤的可以封存
- **分類**：樹種分成 柏／松／雜木（花果、落葉、常綠），內建 24 種常見樹種，可在「設定」自訂
  - 列表第一排篩選 柏／松／雜木；點柏或松再依樹種篩選，點雜木再依花果／落葉／常綠篩選
  - 作業項目可以掛在「共用」「分類」或「樹種」上，紀錄時自動出現對應的作業（例：雜木有摘心、葉刈；花果另有花後修剪、摘果）
- **身分證**：每盆盆栽建立時由系統產生一組終身不變的身分證（`BJ-XXXX-XXXX`），不會重複，轉移給別人也跟著盆栽走
- **傳承與轉移**：一盆盆栽的一生可能經過好幾位創作者（傳承、買賣、贈與）
  - 盆栽頁「轉移給他人」產生 8 碼轉移碼（7 天內有效，對方接收前可作廢），也可以用連結 `…/#/receive/轉移碼` 分享
  - 對方在「我的盆栽 → 接收」輸入轉移碼，盆栽和所有紀錄、照片移到對方名下，接著記錄
  - 「傳承」區塊列出歷任創作者和每一段時期；前任的紀錄保留原作者、唯讀，照片檔也鎖住不能被刪改
  - 有前任紀錄的盆栽不能刪除（只能封存或再轉移），創作者名稱在「設定 → 帳號」設定
- **新增紀錄**
  - 五個固定角度（正面、背面、左側、右側、俯視）加上細節照片，細節照片可以寫說明
  - 拍照時格子裡會淡淡顯示**上次同角度的照片**，方便對齊角度
  - 作業項目用點選的：共用項目＋分類適用的項目＋該樹種的專屬項目，也可以自訂
  - 備註、下次預計（事項＋日期）
  - 整體特徵（樹高、幅寬、幹徑、樹勢 1–5）與用材（線材、用土、肥料／藥劑）
- **時間軸**：每盆盆栽的所有紀錄依日期排列，顯示距離上次幾天；有多位創作者時標出每筆的作者
- **前後對比**：同一角度選兩個日期，拖曳分隔線比較；也可以依時間順序**縮時播放**
- **最近紀錄**：所有盆栽的紀錄依月份排列
- **設定**：創作者名稱、管理樹種（依分類）與作業項目；**匯出備份**（ZIP：照片原檔＋可用 Excel 開的紀錄表（含身分證、作者）＋完整 JSON）
- 照片上傳前會在手機上先壓縮（長邊 2000px，另存 480px 縮圖），節省空間和流量

## 二、技術架構

- **前端**：純靜態檔（HTML／CSS／原生 ES Module），不需要打包，任何靜態空間都能放
- **後端**：Supabase（Postgres＋Auth＋Storage）
  - 每一筆資料都綁定擁有者，以 RLS 權限規則確保每個人只讀寫得到自己的資料；盆栽轉移由資料庫函式處理（`create_transfer`／`preview_transfer`／`accept_transfer`／`cancel_transfer`）
  - 照片放在私人的 `photos` bucket，用有時效的簽名網址讀取

```
index.html              App 外殼＋登入頁
css/styles.css          手機優先樣式
js/
  config.js             ★ 在這裡填 Supabase URL 與 key
  supabase.js           建立 Supabase 連線
  db.js                 所有資料讀寫
  image.js              照片壓縮
  router.js             頁面路由
  ui.js                 DOM、彈窗、日期等小工具
  viewer.js             全螢幕看照片
  constants.js          拍照角度、來源選項
  views/                我的盆栽／單盆盆栽／紀錄表單／紀錄／對比／最近紀錄／設定
supabase/schema.sql     ★ 資料庫結構＋權限＋預設資料，整段執行一次
manifest.webmanifest    PWA 設定
sw.js                   Service Worker
icons/                  App 圖示
```

## 三、部署步驟

### 1. 建立 Supabase 專案

1. 到 [supabase.com](https://supabase.com) 登入 → **New project**
   - Name：`bonsai-journal`
   - Database Password：自己設一組並存好（之後不用給任何人）
   - Region：Northeast Asia (Tokyo)
2. 等專案建立完成（約 1–2 分鐘）
3. 左側 **SQL Editor** → **New query** → 把 `supabase/schema.sql` 整段貼上 → **Run**
   - 看到 `Success. No rows returned` 就完成了
4. 試用期間是**邀請制**：只有 `private.signup_allowlist` 名單內的 Email 可以註冊，其他人按註冊會顯示「目前為邀請制」
   - 加人（SQL Editor）：`insert into private.signup_allowlist (email) values ('someone@example.com');`
   - 自己的帳號：先把 Email 加進名單，再到 **Authentication → Users → Add user → Create new user**（勾選 **Auto Confirm User**）
   - 正式開放註冊：`drop trigger if exists bonsai_signup_allowlist on auth.users;`
5. 登入後可在「設定 → 帳號 → 修改密碼」更換密碼
6. 取得連線資訊（**Project Settings → API Keys**，或專案首頁上方的 **Connect**）：
   - **Project URL**（`https://xxxx.supabase.co`）
   - **Publishable key**（`sb_publishable_…`）
   - ⚠️ `secret` / `service_role` key 和資料庫密碼**不要**放進程式或傳給別人

### 2. 填設定

打開 `js/config.js`，把 Project URL 和 Publishable key 填進去。Publishable key 本來就是公開用的，資料安全由 RLS 把關。

### 3. 部署（GitHub Pages）

1. repo 設為公開（裡面沒有機密；資料由 Supabase RLS 保護）
2. **Settings → Pages** → Source：Deploy from a branch → Branch：`main`、`/ (root)` → Save
3. 網址：https://waynelin-yuzhi.github.io/bonsai-journal/ ，之後 `main` 有更新就會自動重新上線

### 4. 手機使用

- **Android App（APK）**：用手機打開 https://github.com/waynelin-yuzhi/bonsai-journal/releases/latest/download/bonsai-journal.apk 下載安裝
  - 第一次安裝時，Android 會詢問是否允許「安裝不明來源的應用程式」，允許即可
  - App 是開啟線上版的外殼（`android-app/`，Capacitor），一般改版不用重新安裝；只有 `android-app/` 改變時，GitHub Actions 才會重新打包並發佈到 Releases
  - 在 App 裡點照片會先選「拍照」或「從相簿選」；匯出備份需用瀏覽器開網頁版
  - 簽名用 `android-app/keystore/debug.keystore`（測試用金鑰，不是機密）；日後要上架 Google Play 時，改用私人金鑰並存在 GitHub Secrets
- **其他方式**：Chrome 開啟網址時會跳出「安裝成 App」提示；iPhone 用 Safari 分享選單「加入主畫面」

> 本機測試：在專案根目錄執行 `python3 -m http.server 8000`，用 `http://localhost:8000` 開啟。

### 5. 發佈新版本（線上更新）

1. 修改 `version.json`：`version` 改成新版號（例如 `1.0.1`），`date` 改成當天日期，`notes` 寫這次更新的重點（最多顯示 3 條）
2. 合併到 `main`，GitHub Pages 會自動部署
3. 使用者的 App 回到前景，或開著超過 30 分鐘，就會跳出「有新版本」提示，按 **立即更新** 就換成新版
   - 正在編輯紀錄、還沒儲存的話，會先詢問是否放棄，避免照片和內容遺失
   - 按「稍後」這次開啟期間不再提示；也可以在「設定 → 版本 → 檢查更新」手動檢查

## 四、注意事項

- 目前使用的 Supabase 專案：`bonsai-journal`（Pro 組織、東京區域，獨立專案，不和其他 App 共用）
- 一組五角度照片壓縮後約 3–4MB。若改用免費方案：檔案空間 1GB（約 250–300 次完整紀錄），且**連續 7 天沒有使用會自動暫停**
- 定期到「設定 → 匯出備份」下載一份，資料會累積好幾年，備份放在自己手上最安心

## 五、後續規劃

- **Phase 2｜變好用**：相機疊圖對位拍照、個別樹提醒（蟠扎後檢查咬線、換盆後開始施肥）、季節提醒（依樹種與月份，可共同編輯）、照片標註
- **Phase 3｜開放**：開放註冊（Email／Google／LINE 登入）、教室與師生（老師看學生的時間軸、留言指導）、分享連結、後台管理
