package com.felpos.mobile;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public final class FelPosApiClient {
    private final String baseUrl;
    private String token = "";

    public FelPosApiClient(String baseUrl) {
        this.baseUrl = normalizeBaseUrl(baseUrl);
    }

    public void setToken(String token) {
        this.token = token == null ? "" : token;
    }

    public String getToken() {
        return token;
    }

    public JSONObject login(String username, String password) throws Exception {
        JSONObject body = new JSONObject();
        body.put("username", username);
        body.put("password", password);
        JSONObject response = request("POST", "/api/auth/login", body, false);
        token = response.optString("access_token", "");
        return response;
    }

    public JSONObject getCurrentOrder() throws Exception {
        JSONObject response = request("GET", "/api/stock-count/sessions/current", null, true);
        return response;
    }

    public JSONObject scanItem(int sessionId, String sku, double quantity) throws Exception {
        JSONObject body = new JSONObject();
        body.put("sku", sku);
        body.put("counted_quantity", quantity);
        body.put("replace_quantity", false);
        return request("POST", "/api/stock-count/sessions/" + sessionId + "/scan", body, true);
    }

    public JSONObject lookupProduct(String sku) throws Exception {
        return request("GET", "/api/products/by-sku/" + urlEncode(sku), null, true);
    }

    private JSONObject request(String method, String path, JSONObject body, boolean auth) throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
        connection.setRequestMethod(method);
        connection.setConnectTimeout(12000);
        connection.setReadTimeout(15000);
        connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
        if (auth && !token.isEmpty()) {
            connection.setRequestProperty("Authorization", "Bearer " + token);
        }
        if (body != null) {
            connection.setDoOutput(true);
            byte[] payload = body.toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream stream = connection.getOutputStream()) {
                stream.write(payload);
            }
        }

        int code = connection.getResponseCode();
        String responseText = readStream(code >= 400 ? connection.getErrorStream() : connection.getInputStream());
        if (code >= 400) {
            String detail = responseText;
            try {
                JSONObject error = new JSONObject(responseText);
                detail = error.optString("detail", responseText);
            } catch (Exception ignored) {
            }
            throw new ApiException(code, detail);
        }
        if (responseText == null || responseText.isEmpty() || "null".equalsIgnoreCase(responseText.trim())) {
            return null;
        }
        return new JSONObject(responseText);
    }

    private static String readStream(java.io.InputStream stream) throws Exception {
        if (stream == null) {
            return "";
        }
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                builder.append(line);
            }
        }
        return builder.toString();
    }

    private static String normalizeBaseUrl(String input) {
        if (input == null) {
            return "";
        }
        String value = input.trim();
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        if (value.isEmpty()) {
            return "";
        }
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            value = "http://" + value;
        }
        return value;
    }

    private static String urlEncode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    public static class ApiException extends Exception {
        private final int statusCode;

        public ApiException(int statusCode, String message) {
            super(message);
            this.statusCode = statusCode;
        }

        public int getStatusCode() {
            return statusCode;
        }
    }
}
