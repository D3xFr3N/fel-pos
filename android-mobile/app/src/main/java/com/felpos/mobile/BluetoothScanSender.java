package com.felpos.mobile;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

public final class BluetoothScanSender {
    public static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");

    private BluetoothSocket socket;
    private OutputStream outputStream;
    private BufferedReader inputReader;

    public boolean connect(String macAddress) throws Exception {
        disconnect();
        BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
        if (adapter == null) {
            throw new IllegalStateException("Este telefono no tiene Bluetooth.");
        }
        if (!adapter.isEnabled()) {
            throw new IllegalStateException("Activa Bluetooth en el telefono.");
        }
        BluetoothDevice device = adapter.getRemoteDevice(macAddress.trim().toUpperCase());
        BluetoothSocket candidate = device.createRfcommSocketToServiceRecord(SPP_UUID);
        candidate.connect();
        socket = candidate;
        outputStream = socket.getOutputStream();
        inputReader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
        return true;
    }

    public String sendScan(String sku, double quantity) throws Exception {
        if (outputStream == null || inputReader == null) {
            throw new IllegalStateException("Bluetooth no conectado.");
        }
        String line = "SCAN|" + sku + "|" + quantity + "\n";
        outputStream.write(line.getBytes(StandardCharsets.UTF_8));
        outputStream.flush();
        String response = inputReader.readLine();
        return response == null ? "ERR|Sin respuesta del PC" : response;
    }

    public void disconnect() {
        try {
            if (socket != null) {
                socket.close();
            }
        } catch (Exception ignored) {
        }
        socket = null;
        outputStream = null;
        inputReader = null;
    }

    public boolean isConnected() {
        return socket != null && socket.isConnected();
    }
}
