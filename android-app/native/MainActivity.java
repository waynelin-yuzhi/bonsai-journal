package com.yuzhiplant.bonsaijournal;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // App 自己寫的原生外掛（不在 npm 套件裡）要在 super.onCreate 之前註冊
        registerPlugin(ApkUpdaterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
