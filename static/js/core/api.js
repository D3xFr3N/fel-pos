(function (FP) {
  async function ensureDeviceIdentity() {
    const state = FP.state;
    let fingerprint = localStorage.getItem("felpos_device_id") || "";
    let hostname = localStorage.getItem("felpos_device_hostname") || "";

    const waitPywebview = () =>
      new Promise((resolve) => {
        if (window.pywebview?.api) {
          resolve();
          return;
        }
        window.addEventListener("pywebviewready", () => resolve(), { once: true });
        setTimeout(resolve, 1200);
      });

    await waitPywebview();
    if (window.pywebview?.api?.get_device_info) {
      try {
        const info = await window.pywebview.api.get_device_info();
        if (info?.fingerprint) {
          fingerprint = String(info.fingerprint).trim().toUpperCase();
          hostname = String(info.hostname || hostname || "PC").trim();
        }
      } catch (_err) {
        /* keep localStorage fallback */
      }
    }

    if (!fingerprint) {
      const existing = localStorage.getItem("felpos_device_id");
      if (existing) {
        fingerprint = existing;
      } else if (window.crypto?.randomUUID) {
        fingerprint = `WEB-${window.crypto.randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`;
      } else {
        fingerprint = `WEB-${Date.now().toString(16).toUpperCase()}`;
      }
    }
    if (!hostname) {
      hostname = navigator.platform || "navegador";
    }

    localStorage.setItem("felpos_device_id", fingerprint);
    localStorage.setItem("felpos_device_hostname", hostname);
    state.deviceId = fingerprint;
    state.deviceHostname = hostname;
    return { fingerprint, hostname };
  }

  async function api(path, options = {}) {
    const state = FP.state;
    if (!state.deviceId) {
      await ensureDeviceIdentity();
    }
    const headers = { ...(options.headers || {}) };
    const isFormData = options.body instanceof FormData;
    if (!isFormData && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }
    if (state.deviceId) {
      headers["X-FELPOS-Device-Id"] = state.deviceId;
    }
    if (state.deviceHostname) {
      headers["X-FELPOS-Hostname"] = state.deviceHostname;
    }

    const response = await fetch(path, { ...options, headers });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: "Error de servidor" }));
      const detail = error.detail;
      const message =
        typeof detail === "string"
          ? detail
          : Array.isArray(detail)
            ? detail.map((item) => item.msg || JSON.stringify(item)).join("; ")
            : "Error de servidor";

      if (response.status === 401 || (response.status === 403 && /equipo/i.test(message))) {
        if (typeof FP.setSession === "function") {
          FP.setSession("", null);
        } else {
          state.token = "";
          state.user = null;
          localStorage.removeItem("felpos_token");
        }
        if (typeof FP.openLogin === "function") {
          FP.openLogin();
        }
      }
      throw new Error(message);
    }
    if (response.headers.get("content-type")?.includes("application/json")) {
      return response.json();
    }
    return response.text();
  }

  FP.ensureDeviceIdentity = ensureDeviceIdentity;
  FP.api = api;
})(window.FelPos = window.FelPos || {});
