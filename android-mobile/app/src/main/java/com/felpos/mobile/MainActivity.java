package com.felpos.mobile;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {
    private static final String PREFS = "felpos_mobile_prefs";
    private static final String KEY_SERVER_URL = "server_url";
    private static final String KEY_USERNAME = "username";
    private static final String KEY_PASSWORD = "password";
    private static final String KEY_TOKEN = "token";
    private static final String KEY_CONNECTION_MODE = "connection_mode";
    private static final String KEY_PC_MAC = "pc_mac";

    private EditText editServerUrl;
    private EditText editUsername;
    private EditText editPassword;
    private EditText editPcMac;
    private Spinner spinnerConnectionMode;
    private WebView webView;
    private boolean openedFromDeepLink = false;

    private final ActivityResultLauncher<String[]> bluetoothPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestMultiplePermissions(), result -> openScannerActivity());

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        editServerUrl = findViewById(R.id.editServerUrl);
        editUsername = findViewById(R.id.editUsername);
        editPassword = findViewById(R.id.editPassword);
        editPcMac = findViewById(R.id.editPcMac);
        spinnerConnectionMode = findViewById(R.id.spinnerConnectionMode);
        webView = findViewById(R.id.mobileWebView);
        Button buttonSave = findViewById(R.id.buttonSave);
        Button buttonOpen = findViewById(R.id.buttonOpen);
        Button buttonOpenScanner = findViewById(R.id.buttonOpenScanner);

        ArrayAdapter<String> modeAdapter = new ArrayAdapter<>(
                this,
                android.R.layout.simple_spinner_item,
                new String[]{getString(R.string.mode_wifi), getString(R.string.mode_bluetooth)}
        );
        modeAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerConnectionMode.setAdapter(modeAdapter);
        spinnerConnectionMode.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                editPcMac.setVisibility(position == 1 ? View.VISIBLE : View.GONE);
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
            }
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setBuiltInZoomControls(false);
        webView.setWebViewClient(new WebViewClient());

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        editServerUrl.setText(prefs.getString(KEY_SERVER_URL, ""));
        editUsername.setText(prefs.getString(KEY_USERNAME, ""));
        editPassword.setText(prefs.getString(KEY_PASSWORD, ""));
        editPcMac.setText(prefs.getString(KEY_PC_MAC, ""));
        String savedMode = prefs.getString(KEY_CONNECTION_MODE, "wifi");
        spinnerConnectionMode.setSelection("bluetooth".equals(savedMode) ? 1 : 0);

        handleConnectIntent(getIntent());

        if (!openedFromDeepLink) {
            String savedServer = prefs.getString(KEY_SERVER_URL, "");
            if (!savedServer.isEmpty()) {
                openMobileUrl(savedServer);
            }
        }

        buttonSave.setOnClickListener(v -> saveSettings(true));
        buttonOpen.setOnClickListener(v -> {
            String normalized = saveSettings(false);
            if (normalized.isEmpty()) {
                Toast.makeText(this, "Ingresa una URL valida.", Toast.LENGTH_SHORT).show();
                return;
            }
            openMobileUrl(normalized);
        });
        buttonOpenScanner.setOnClickListener(v -> {
            String normalized = saveSettings(false);
            if (normalized.isEmpty()) {
                Toast.makeText(this, "Ingresa una URL valida.", Toast.LENGTH_SHORT).show();
                return;
            }
            loginAndOpenScanner(normalized, () -> {
                if (spinnerConnectionMode.getSelectedItemPosition() == 1) {
                    requestBluetoothPermissionsAndOpen();
                } else {
                    openScannerActivity();
                }
            });
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleConnectIntent(intent);
    }

    private void handleConnectIntent(Intent intent) {
        if (intent == null) return;
        Uri data = intent.getData();
        if (data == null) return;
        if (!"felpos".equalsIgnoreCase(data.getScheme())) return;
        if (!"connect".equalsIgnoreCase(data.getHost())) return;

        openedFromDeepLink = true;
        String server = data.getQueryParameter("server");
        if (server == null || server.trim().isEmpty()) {
            String host = data.getQueryParameter("host");
            String port = data.getQueryParameter("port");
            if (host != null && !host.trim().isEmpty()) {
                StringBuilder built = new StringBuilder("http://").append(host.trim());
                if (port != null && !port.trim().isEmpty()) {
                    built.append(":").append(port.trim());
                }
                server = built.toString();
            }
        }

        String username = data.getQueryParameter("user");
        if (username == null) {
            username = data.getQueryParameter("username");
        }

        String normalized = normalizeBaseUrl(server);
        if (!normalized.isEmpty()) {
            editServerUrl.setText(normalized);
            getSharedPreferences(PREFS, MODE_PRIVATE)
                    .edit()
                    .putString(KEY_SERVER_URL, normalized)
                    .apply();
        }

        if (username != null && !username.trim().isEmpty()) {
            editUsername.setText(username.trim());
        }

        // Pedir contraseña en pantalla (no viene en el QR por seguridad).
        editPassword.setText("");
        editPassword.requestFocus();

        Toast.makeText(this, "Servidor listo. Escribe usuario y contraseña.", Toast.LENGTH_LONG).show();
    }

    private String saveSettings(boolean showToast) {
        String normalized = normalizeBaseUrl(editServerUrl.getText().toString());
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        prefs.edit()
                .putString(KEY_SERVER_URL, normalized)
                .putString(KEY_USERNAME, editUsername.getText().toString().trim())
                .putString(KEY_PASSWORD, editPassword.getText().toString())
                .putString(KEY_PC_MAC, editPcMac.getText().toString().trim())
                .putString(
                        KEY_CONNECTION_MODE,
                        spinnerConnectionMode.getSelectedItemPosition() == 1 ? "bluetooth" : "wifi"
                )
                .apply();
        editServerUrl.setText(normalized);
        if (showToast) {
            Toast.makeText(this, "Configuracion guardada.", Toast.LENGTH_SHORT).show();
        }
        return normalized;
    }

    private void requestBluetoothPermissionsAndOpen() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            List<String> needed = new ArrayList<>();
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_CONNECT);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_SCAN);
            }
            if (!needed.isEmpty()) {
                bluetoothPermissionLauncher.launch(needed.toArray(new String[0]));
                return;
            }
        }
        openScannerActivity();
    }

    private void loginAndOpenScanner(String baseUrl, Runnable onSuccess) {
        String username = editUsername.getText().toString().trim();
        String password = editPassword.getText().toString();
        if (username.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, "Ingresa usuario y clave.", Toast.LENGTH_SHORT).show();
            return;
        }
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                FelPosApiClient client = new FelPosApiClient(baseUrl);
                JSONObject login = client.login(username, password);
                String token = login.optString("access_token", "");
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_TOKEN, token).apply();
                runOnUiThread(onSuccess);
            } catch (Exception exc) {
                String detail = exc.getMessage() == null ? "error de red" : exc.getMessage();
                String tip = detail.toLowerCase().contains("failed to connect")
                        || detail.toLowerCase().contains("econnrefused")
                        || detail.toLowerCase().contains("timed out")
                        || detail.toLowerCase().contains("unreachable")
                        ? " Revisa: 1) misma WiFi 2) URL http://IP-DEL-PC:8000 3) FEL POS abierto 4) firewall del PC."
                        : "";
                runOnUiThread(() ->
                        Toast.makeText(this, "Login fallo: " + detail + tip, Toast.LENGTH_LONG).show()
                );
            }
        });
    }

    private void openScannerActivity() {
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        Intent intent = new Intent(this, InventoryScannerActivity.class);
        intent.putExtra(InventoryScannerActivity.EXTRA_SERVER_URL, prefs.getString(KEY_SERVER_URL, ""));
        intent.putExtra(InventoryScannerActivity.EXTRA_USERNAME, prefs.getString(KEY_USERNAME, ""));
        intent.putExtra(InventoryScannerActivity.EXTRA_PASSWORD, prefs.getString(KEY_PASSWORD, ""));
        intent.putExtra(InventoryScannerActivity.EXTRA_TOKEN, prefs.getString(KEY_TOKEN, ""));
        intent.putExtra(InventoryScannerActivity.EXTRA_CONNECTION_MODE, prefs.getString(KEY_CONNECTION_MODE, "wifi"));
        intent.putExtra(InventoryScannerActivity.EXTRA_PC_MAC, prefs.getString(KEY_PC_MAC, ""));
        startActivity(intent);
    }

    private void openMobileUrl(String baseUrl) {
        webView.loadUrl(baseUrl + "/mobile");
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
