package com.felpos.mobile;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.mlkit.vision.barcode.BarcodeScanner;
import com.google.mlkit.vision.barcode.BarcodeScannerOptions;
import com.google.mlkit.vision.barcode.BarcodeScanning;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.common.InputImage;

import org.json.JSONObject;

import java.net.URI;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class InventoryScannerActivity extends AppCompatActivity {
    public static final String EXTRA_SERVER_URL = "server_url";
    public static final String EXTRA_USERNAME = "username";
    public static final String EXTRA_PASSWORD = "password";
    public static final String EXTRA_TOKEN = "token";
    public static final String EXTRA_CONNECTION_MODE = "connection_mode";
    public static final String EXTRA_PC_MAC = "pc_mac";

    private static final long SCAN_COOLDOWN_MS = 1200L;

    private PreviewView previewView;
    private TextView textOrderStatus;
    private TextView textConnectionMode;
    private TextView textHint;
    private TextView textLastScan;
    private EditText editQuantity;

    private FelPosApiClient apiClient;
    private BluetoothScanSender bluetoothSender;
    private TcpBridgeClient tcpBridgeClient;
    private BarcodeScanner barcodeScanner;
    private ExecutorService cameraExecutor;
    private Handler mainHandler;

    private String connectionMode = "wifi";
    private String pcMac = "";
    private String serverUrl = "";
    private int currentSessionId = -1;
    private String currentOrderCode = "";
    private long lastScanAt = 0L;
    private final AtomicBoolean processingScan = new AtomicBoolean(false);

    private final ActivityResultLauncher<String> cameraPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
                if (granted) {
                    startCamera();
                } else {
                    Toast.makeText(this, R.string.permission_camera_required, Toast.LENGTH_LONG).show();
                    finish();
                }
            });

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_inventory_scanner);
        setTitle(R.string.scanner_title);

        previewView = findViewById(R.id.previewView);
        textOrderStatus = findViewById(R.id.textOrderStatus);
        textConnectionMode = findViewById(R.id.textConnectionMode);
        textHint = findViewById(R.id.textHint);
        textLastScan = findViewById(R.id.textLastScan);
        editQuantity = findViewById(R.id.editQuantity);

        mainHandler = new Handler(Looper.getMainLooper());
        cameraExecutor = Executors.newSingleThreadExecutor();
        bluetoothSender = new BluetoothScanSender();
        tcpBridgeClient = new TcpBridgeClient();

        serverUrl = getIntent().getStringExtra(EXTRA_SERVER_URL);
        connectionMode = getIntent().getStringExtra(EXTRA_CONNECTION_MODE);
        pcMac = getIntent().getStringExtra(EXTRA_PC_MAC);
        if (connectionMode == null) {
            connectionMode = "wifi";
        }
        if (pcMac == null) {
            pcMac = "";
        }

        apiClient = new FelPosApiClient(serverUrl);
        String token = getIntent().getStringExtra(EXTRA_TOKEN);
        if (token != null && !token.isEmpty()) {
            apiClient.setToken(token);
        }

        textConnectionMode.setText("wifi".equals(connectionMode)
                ? getString(R.string.mode_wifi)
                : getString(R.string.mode_bluetooth));

        BarcodeScannerOptions options = new BarcodeScannerOptions.Builder()
                .setBarcodeFormats(
                        Barcode.FORMAT_ALL_FORMATS
                )
                .build();
        barcodeScanner = BarcodeScanning.getClient(options);

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            startCamera();
        } else {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA);
        }

        refreshOrderAsync();
        if ("bluetooth".equals(connectionMode)) {
            connectBridgeAsync();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        bluetoothSender.disconnect();
        tcpBridgeClient.disconnect();
        if (barcodeScanner != null) {
            barcodeScanner.close();
        }
        if (cameraExecutor != null) {
            cameraExecutor.shutdownNow();
        }
    }

    private void startCamera() {
        ListenableFuture<ProcessCameraProvider> providerFuture = ProcessCameraProvider.getInstance(this);
        providerFuture.addListener(() -> {
            try {
                ProcessCameraProvider provider = providerFuture.get();
                bindCamera(provider);
            } catch (Exception exc) {
                mainHandler.post(() ->
                        Toast.makeText(this, "No se pudo iniciar camara: " + exc.getMessage(), Toast.LENGTH_LONG).show()
                );
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void bindCamera(@NonNull ProcessCameraProvider provider) {
        provider.unbindAll();
        Preview preview = new Preview.Builder().build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());

        ImageAnalysis analysis = new ImageAnalysis.Builder()
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .build();
        analysis.setAnalyzer(cameraExecutor, imageProxy -> {
            if (processingScan.get()) {
                imageProxy.close();
                return;
            }
            if (imageProxy.getImage() == null) {
                imageProxy.close();
                return;
            }
            InputImage image = InputImage.fromMediaImage(
                    imageProxy.getImage(),
                    imageProxy.getImageInfo().getRotationDegrees()
            );
            barcodeScanner.process(image)
                    .addOnSuccessListener(barcodes -> {
                        for (Barcode barcode : barcodes) {
                            String raw = barcode.getRawValue();
                            if (raw != null && !raw.trim().isEmpty()) {
                                handleDetectedCode(raw.trim());
                                break;
                            }
                        }
                    })
                    .addOnCompleteListener(task -> imageProxy.close());
        });

        provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis);
    }

    private void handleDetectedCode(String code) {
        long now = System.currentTimeMillis();
        if (now - lastScanAt < SCAN_COOLDOWN_MS) {
            return;
        }
        if (!processingScan.compareAndSet(false, true)) {
            return;
        }
        lastScanAt = now;

        double quantity = parseQuantity();
        String normalized = code.trim().toUpperCase();
        mainHandler.post(() -> textHint.setText("Procesando: " + normalized));

        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                if ("wifi".equals(connectionMode)) {
                    submitWifiScan(normalized, quantity);
                } else {
                    submitBridgeScan(normalized, quantity);
                }
                vibrateSuccess();
            } catch (Exception exc) {
                mainHandler.post(() -> {
                    textLastScan.setText("Error: " + exc.getMessage());
                    Toast.makeText(this, exc.getMessage(), Toast.LENGTH_SHORT).show();
                });
                vibrateError();
            } finally {
                processingScan.set(false);
                mainHandler.post(() -> textHint.setText(getString(R.string.scanner_waiting)));
            }
        });
    }

    private void submitWifiScan(String sku, double quantity) throws Exception {
        ensureLoggedIn();
        JSONObject order = apiClient.getCurrentOrder();
        if (order == null || order.optInt("id", 0) <= 0) {
            throw new Exception("No hay orden de conteo activa.");
        }
        int sessionId = order.getInt("id");
        JSONObject result = apiClient.scanItem(sessionId, sku, quantity);
        updateOrderUi(result, sku);
    }

    private void submitBridgeScan(String sku, double quantity) throws Exception {
        String response;
        if (bluetoothSender.isConnected()) {
            response = bluetoothSender.sendScan(sku, quantity);
        } else if (tcpBridgeClient.isConnected()) {
            response = tcpBridgeClient.sendScan(sku, quantity);
        } else {
            connectBridgeBlocking();
            if (bluetoothSender.isConnected()) {
                response = bluetoothSender.sendScan(sku, quantity);
            } else if (tcpBridgeClient.isConnected()) {
                response = tcpBridgeClient.sendScan(sku, quantity);
            } else {
                throw new Exception("No se pudo conectar al PC por Bluetooth ni puente TCP.");
            }
        }
        parseBridgeResponse(response, sku);
        refreshOrderAsync();
    }

    private void parseBridgeResponse(String response, String sku) throws Exception {
        if (response == null || response.isEmpty()) {
            throw new Exception("Respuesta vacia del PC.");
        }
        String[] parts = response.split("\\|", 4);
        if (parts.length >= 2 && "OK".equalsIgnoreCase(parts[0])) {
            String name = parts.length > 1 ? parts[1] : sku;
            String counted = parts.length > 2 ? parts[2] : "?";
            mainHandler.post(() ->
                    textLastScan.setText(getString(R.string.scanner_last_scan, name + " (fisico " + counted + ")"))
            );
            return;
        }
        String message = parts.length > 1 ? parts[1] : response;
        throw new Exception(message);
    }

    private void updateOrderUi(JSONObject order, String sku) throws Exception {
        currentSessionId = order.optInt("id", currentSessionId);
        currentOrderCode = order.optString("order_code", currentOrderCode);
        JSONObject matched = null;
        if (order.has("items")) {
            for (int i = 0; i < order.getJSONArray("items").length(); i++) {
                JSONObject item = order.getJSONArray("items").getJSONObject(i);
                String itemSku = item.optString("sku", "").toUpperCase();
                if (itemSku.equals(sku)) {
                    matched = item;
                    break;
                }
            }
        }
        JSONObject finalMatched = matched;
        mainHandler.post(() -> {
            textOrderStatus.setText(getString(R.string.scanner_order_active, currentOrderCode));
            if (finalMatched != null) {
                textLastScan.setText(getString(
                        R.string.scanner_last_scan,
                        finalMatched.optString("name", sku) + " (fisico " + finalMatched.optDouble("counted_quantity", 0) + ")"
                ));
            } else {
                textLastScan.setText(getString(R.string.scanner_last_scan, sku));
            }
        });
    }

    private void refreshOrderAsync() {
        if (!"wifi".equals(connectionMode) && apiClient.getToken().isEmpty()) {
            return;
        }
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                if (apiClient.getToken().isEmpty()) {
                    ensureLoggedIn();
                }
                JSONObject order = apiClient.getCurrentOrder();
                if (order != null && order.optInt("id", 0) > 0) {
                    currentSessionId = order.getInt("id");
                    currentOrderCode = order.optString("order_code", String.valueOf(currentSessionId));
                    mainHandler.post(() ->
                            textOrderStatus.setText(getString(R.string.scanner_order_active, currentOrderCode))
                    );
                } else {
                    mainHandler.post(() -> textOrderStatus.setText(getString(R.string.scanner_order_none)));
                }
            } catch (Exception ignored) {
                mainHandler.post(() -> textOrderStatus.setText(getString(R.string.scanner_order_none)));
            }
        });
    }

    private void connectBridgeAsync() {
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                connectBridgeBlocking();
                mainHandler.post(() ->
                        Toast.makeText(this, "Conectado al PC.", Toast.LENGTH_SHORT).show()
                );
            } catch (Exception exc) {
                mainHandler.post(() ->
                        Toast.makeText(this, "Puente PC: " + exc.getMessage(), Toast.LENGTH_LONG).show()
                );
            }
        });
    }

    private void connectBridgeBlocking() throws Exception {
        if (pcMac != null && !pcMac.trim().isEmpty()) {
            try {
                bluetoothSender.connect(pcMac.trim());
                return;
            } catch (Exception btError) {
                // Fallback TCP below.
            }
        }
        String host = extractHost(serverUrl);
        if (host.isEmpty()) {
            throw new Exception("Configura URL del servidor o MAC Bluetooth de la PC.");
        }
        tcpBridgeClient.connect(host, 18765);
    }

    private void ensureLoggedIn() throws Exception {
        if (!apiClient.getToken().isEmpty()) {
            return;
        }
        String username = getIntent().getStringExtra(EXTRA_USERNAME);
        String password = getIntent().getStringExtra(EXTRA_PASSWORD);
        if (username == null || password == null || username.isEmpty()) {
            throw new Exception("Inicia sesion desde la pantalla principal.");
        }
        apiClient.login(username, password);
    }

    private double parseQuantity() {
        try {
            double value = Double.parseDouble(editQuantity.getText().toString().trim());
            return value > 0 ? value : 1.0;
        } catch (Exception ignored) {
            return 1.0;
        }
    }

    private static String extractHost(String baseUrl) {
        try {
            URI uri = URI.create(baseUrl);
            return uri.getHost() == null ? "" : uri.getHost();
        } catch (Exception exc) {
            return "";
        }
    }

    private void vibrateSuccess() {
        Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator == null) {
            return;
        }
        vibrator.vibrate(VibrationEffect.createOneShot(60, VibrationEffect.DEFAULT_AMPLITUDE));
    }

    private void vibrateError() {
        Vibrator vibrator = (Vibrator) getSystemService(VIBRATOR_SERVICE);
        if (vibrator == null) {
            return;
        }
        vibrator.vibrate(VibrationEffect.createOneShot(180, VibrationEffect.DEFAULT_AMPLITUDE));
    }
}
