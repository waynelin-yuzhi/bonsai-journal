package com.yuzhiplant.bonsaijournal;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * App 內更新：在 App 裡下載新版 APK（回報下載進度），下載完交給系統的安裝畫面。
 * 只接受本專案 GitHub Releases 的網址；APK 簽名和舊版不同時，系統會拒絕安裝。
 */
@CapacitorPlugin(name = "ApkUpdater")
public class ApkUpdaterPlugin extends Plugin {

    private static final String ALLOWED_PREFIX = "https://github.com/waynelin-yuzhi/bonsai-journal/releases/download/";
    private static final String APK_NAME = "bonsai-journal.apk";

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile boolean downloading = false;

    // 啟動時清掉上次下載的安裝檔
    @Override
    public void load() {
        File[] old = updatesDir().listFiles();
        if (old != null) {
            for (File f : old) {
                //noinspection ResultOfMethodCallIgnored
                f.delete();
            }
        }
    }

    // 是否已允許這個 App「安裝不明應用程式」（Android 8 以上要使用者在設定裡打開一次）
    @PluginMethod
    public void canInstall(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("allowed", installAllowed());
        call.resolve(ret);
    }

    // 打開「安裝不明應用程式」的設定頁（直接到這個 App 的開關）
    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    // 下載並打開系統安裝畫面；下載中會發出 progress 事件 { loaded, total }
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.startsWith(ALLOWED_PREFIX) || !url.endsWith("/" + APK_NAME)) {
            call.reject("更新網址不正確");
            return;
        }
        if (downloading) {
            call.reject("正在下載中");
            return;
        }
        downloading = true;
        executor.execute(() -> {
            try {
                File apk = download(url);
                install(apk);
                call.resolve();
            } catch (Exception e) {
                call.reject("下載失敗：" + e.getMessage(), e);
            } finally {
                downloading = false;
            }
        });
    }

    private boolean installAllowed() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private File updatesDir() {
        return new File(getContext().getCacheDir(), "updates");
    }

    private File download(String url) throws Exception {
        File dir = updatesDir();
        if (!dir.exists() && !dir.mkdirs()) throw new Exception("無法建立暫存資料夾");
        File part = new File(dir, APK_NAME + ".part");
        File out = new File(dir, APK_NAME);

        // GitHub 會轉址到檔案伺服器（都是 https），HttpURLConnection 會自動跟著轉
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(20000);
        conn.setReadTimeout(30000);
        long total;
        long loaded = 0;
        try {
            int code = conn.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) throw new Exception("伺服器回應 " + code);
            total = conn.getContentLengthLong();
            long lastEmit = 0;
            try (InputStream in = conn.getInputStream(); OutputStream os = new FileOutputStream(part)) {
                byte[] buf = new byte[64 * 1024];
                int n;
                while ((n = in.read(buf)) != -1) {
                    os.write(buf, 0, n);
                    loaded += n;
                    long now = System.currentTimeMillis();
                    if (now - lastEmit >= 200) {
                        lastEmit = now;
                        progress(loaded, total);
                    }
                }
            }
        } finally {
            conn.disconnect();
        }
        if (loaded == 0 || (total > 0 && loaded != total)) throw new Exception("檔案下載不完整");
        progress(loaded, total > 0 ? total : loaded);
        if (out.exists() && !out.delete()) throw new Exception("無法覆蓋舊的安裝檔");
        if (!part.renameTo(out)) throw new Exception("無法儲存安裝檔");
        return out;
    }

    private void progress(long loaded, long total) {
        JSObject data = new JSObject();
        data.put("loaded", loaded);
        data.put("total", total);
        notifyListeners("progress", data);
    }

    // 交給系統安裝（同一把金鑰簽名的新版會直接覆蓋，資料保留）
    private void install(File apk) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }
}
