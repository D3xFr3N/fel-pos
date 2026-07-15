package com.felpos.mobile;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

public final class TcpBridgeClient {
    private Socket socket;
    private OutputStream outputStream;
    private BufferedReader inputReader;

    public void connect(String host, int port) throws Exception {
        disconnect();
        Socket candidate = new Socket();
        candidate.connect(new InetSocketAddress(host, port), 8000);
        socket = candidate;
        outputStream = socket.getOutputStream();
        inputReader = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
    }

    public String sendScan(String sku, double quantity) throws Exception {
        if (outputStream == null || inputReader == null) {
            throw new IllegalStateException("Puente TCP no conectado.");
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
