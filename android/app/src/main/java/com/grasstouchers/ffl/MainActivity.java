package com.grasstouchers.ffl;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Back (the button or the edge swipe) goes back through the app's screens: it first lets the page close a
    // full-screen player (window.__gtBack), then steps back in the page history, and only leaves the app from the
    // first screen. Without this, Android closes the app on every back.
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView web = getBridge().getWebView();
                web.evaluateJavascript("(window.__gtBack && window.__gtBack()) || ''", result -> {
                    if (result != null && result.contains("handled")) return;
                    if (web.canGoBack()) {
                        web.goBack();
                    } else {
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(true);
                    }
                });
            }
        });
    }
}
