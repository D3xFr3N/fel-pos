const SERVER_KEY = "felpos_mobile_apk_server_url";

function normalizeServerUrl(url) {
  const value = String(url || "").trim().replace(/\/+$/, "");
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `http://${value}`;
}

function getMobileUrl(baseUrl) {
  const normalized = normalizeServerUrl(baseUrl);
  if (!normalized) return "";
  return `${normalized}/mobile`;
}

function setStatus(message, isError = false) {
  const status = document.getElementById("status");
  if (!status) return;
  status.textContent = message || "";
  status.style.color = isError ? "#ff8f88" : "";
}

function saveServerUrl() {
  const input = document.getElementById("server-url");
  if (!input) return "";
  const normalized = normalizeServerUrl(input.value);
  if (!normalized) {
    setStatus("Ingresa una URL valida del servidor.", true);
    return "";
  }
  localStorage.setItem(SERVER_KEY, normalized);
  input.value = normalized;
  setStatus("Servidor guardado.");
  return normalized;
}

function openMobileApp() {
  const input = document.getElementById("server-url");
  const configCard = document.getElementById("config-card");
  const viewerCard = document.getElementById("viewer-card");
  const frame = document.getElementById("mobile-frame");
  const viewerUrl = document.getElementById("viewer-url");
  if (!input || !configCard || !viewerCard || !frame || !viewerUrl) return;

  const mobileUrl = getMobileUrl(input.value);
  if (!mobileUrl) {
    setStatus("Ingresa una URL valida para abrir la app movil.", true);
    return;
  }

  localStorage.setItem(SERVER_KEY, normalizeServerUrl(input.value));
  frame.src = mobileUrl;
  viewerUrl.textContent = mobileUrl;
  configCard.classList.add("hidden");
  viewerCard.classList.remove("hidden");
}

function showConfig() {
  const configCard = document.getElementById("config-card");
  const viewerCard = document.getElementById("viewer-card");
  const frame = document.getElementById("mobile-frame");
  if (!configCard || !viewerCard || !frame) return;
  frame.removeAttribute("src");
  viewerCard.classList.add("hidden");
  configCard.classList.remove("hidden");
}

function setup() {
  const input = document.getElementById("server-url");
  if (!input) return;
  input.value = localStorage.getItem(SERVER_KEY) || "";

  document.getElementById("save-server-btn")?.addEventListener("click", saveServerUrl);
  document.getElementById("open-mobile-btn")?.addEventListener("click", openMobileApp);
  document.getElementById("change-server-btn")?.addEventListener("click", showConfig);
}

setup();
