# 🌲 盆栽創作紀錄（暫名）

記錄真柏、黑松、五葉松等盆栽每一次的修剪、蟠扎、換盆，用**時間軸**和**同角度對比**回顧一件作品完整的創作過程。

手機優先的網頁 App（PWA），可以「加入主畫面」，用起來和一般 App 一樣。

---

## 一、Phase 1 功能

- **我的樹**：建立樹檔（名稱、編號、樹種、來源、取得日期、估計樹齡、盆器、正面設定），可依樹種篩選，送人或枯死的樹可以封存
- **新增紀錄**
  - 五個固定角度（正面、背面、左側、右側、俯視）加上細節照片，細節照片可以寫說明
  - 拍照時格子裡會淡淡顯示**上次同角度的照片**，方便對齊角度
  - 作業項目用點選的：共用項目加上該樹種的專屬項目，也可以自訂
  - 備註、下次預計（事項＋日期）
  - 整體特徵（樹高、幅寬、幹徑、樹勢 1–5）與用材（線材、用土、肥料／藥劑）
- **時間軸**：每棵樹的所有紀錄依日期排列，顯示距離上次幾天
- **前後對比**：同一角度選兩個日期，拖曳分隔線比較；也可以依時間順序**縮時播放**
- **最近紀錄**：所有樹的紀錄依月份排列
- **設定**：管理樹種與作業項目；**匯出備份**（ZIP：照片原檔＋可用 Excel 開的紀錄表＋完整 JSON）
- 照片上傳前會在手機上先壓縮（長邊 2000px，另存 480px 縮圖），節省空間和流量

## 二、技術架構

- **前端**：純靜態檔（HTML／CSS／原生 ES Module），不需要打包，任何靜態空間都能放
- **後端**：Supabase（Postgres＋Auth＋Storage）
  - 每一筆資料都綁定擁有者，以 RLS 權限規則確保每個人只讀寫得到自己的資料
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
  views/                我的樹／單棵樹／紀錄表單／紀錄／對比／最近紀錄／設定
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
4. 左側 **Authentication → Users** → **Add user → Create new user**
   - 輸入自己的 Email 和密碼，勾選 **Auto Confirm User** → 建立
5. **Authentication → Sign In / Providers**，把 **Allow new users to sign up** 關掉（試用期間只有自己能登入；要開放時再打開）
6. 取得連線資訊（**Project Settings → API Keys**，或專案首頁上方的 **Connect**）：
   - **Project URL**（`https://xxxx.supabase.co`）
   - **Publishable key**（`sb_publishable_…`）
   - ⚠️ `secret` / `service_role` key 和資料庫密碼**不要**放進程式或傳給別人

### 2. 填設定

打開 `js/config.js`，把 Project URL 和 Publishable key 填進去。Publishable key 本來就是公開用的，資料安全由 RLS 把關。

### 3. 部署到 Cloudflare Pages（HTTPS，手機相機需要）

1. 到 [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 授權 GitHub，選 `bonsai-journal`
3. Framework preset：`None`；Build command：留空；Build output directory：`/`
4. **Save and Deploy**，完成後會拿到一個 `https://bonsai-journal-xxx.pages.dev` 網址
5. 之後每次 `main` 有更新，Cloudflare 會自動重新部署

### 4. 手機使用

用手機瀏覽器打開網址 → 登入 → 分享選單 **加入主畫面**，就會像 App 一樣全螢幕開啟。

> 本機測試：在專案根目錄執行 `python3 -m http.server 8000`，用 `http://localhost:8000` 開啟。

## 四、注意事項

- 目前使用的 Supabase 專案：`bonsai-journal`（Pro 組織、東京區域，獨立專案，不和其他 App 共用）
- 一組五角度照片壓縮後約 3–4MB。若改用免費方案：檔案空間 1GB（約 250–300 次完整紀錄），且**連續 7 天沒有使用會自動暫停**
- 定期到「設定 → 匯出備份」下載一份，資料會累積好幾年，備份放在自己手上最安心

## 五、後續規劃

- **Phase 2｜變好用**：相機疊圖對位拍照、個別樹提醒（蟠扎後檢查咬線、換盆後開始施肥）、季節提醒（依樹種與月份，可共同編輯）、照片標註
- **Phase 3｜開放**：開放註冊（Email／Google／LINE 登入）、教室與師生（老師看學生的時間軸、留言指導）、分享連結、後台管理
