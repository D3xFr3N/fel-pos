package com.felpos.mobile;

import android.annotation.SuppressLint;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

public class MainActivity extends AppCompatActivity {
    private static final String PREFS = "felpos_mobile_prefs";
    private static final String KEY_SERVER_URL = "server_url";

    private EditText editServerUrl;
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        editServerUrl = findViewById(R.id.editServerUrl);
        webView = findViewById(R.id.mobileWebView);
        Button buttonSave = findViewById(R.id.buttonSave);
        Button buttonOpen = findViewById(R.id.buttonOpen);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setBuiltInZoomControls(false);
        webView.setWebViewClient(new WebViewClient());

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        String savedServer = prefs.getString(KEY_SERVER_URL, "");
        if (!savedServer.isEmpty()) {
            editServerUrl.setText(savedServer);
            openMobileUrl(savedServer);
        }

        buttonSave.setOnClickListener(v -> {
            String normalized = normalizeBaseUrl(editServerUrl.getText().toString());
            if (normalized.isEmpty()) {
                Toast.makeText(this, "Ingresa una URL valida.", Toast.LENGTH_SHORT).show();
                return;
            }
            prefs.edit().putString(KEY_SERVER_URL, normalized).apply();
            editServerUrl.setText(normalized);
            Toast.makeText(this, "Servidor guardado.", Toast.LENGTH_SHORT).show();
        });

        buttonOpen.setOnClickListener(v -> {
            String normalized = normalizeBaseUrl(editServerUrl.getText().toString());
            if (normalized.isEmpty()) {
                Toast.makeText(this, "Ingresa una URL valida.", Toast.LENGTH_SHORT).show();
                return;
            }
            prefs.edit().putString(KEY_SERVER_URL, normalized).apply();
            editServerUrl.setText(normalized);
            openMobileUrl(normalized);
        });
    }

    private void openMobileUrl(String baseUrl) {
        String url = baseUrl + "/mobile";
        webView.loadUrl(url);
    }

    private String normalizeBaseUrl(String input) {
        if (input == null) return "";
        String value = input.trim();
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        if (value.isEmpty()) return "";
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            value = "http://" + value;
        }
        return value;
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }
}
