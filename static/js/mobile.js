const state = {
  token: localStorage.getItem("felpos_mobile_token") || "",
  user: null,
  currentOrder: null,
};

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function money(value) {
  return `Q ${Number(value || 0).toFixed(2)}`;
}

function qty(value) {
  const n = Number(value || 0);
  if (Number.isNaN(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function setSession(token, user) {
  state.token = token || "";
  state.user = user || null;
  if (state.token) {
    localStorage.setItem("felpos_mobile_token", state.token);
  } else {
    localStorage.removeItem("felpos_mobile_token");
  }
  document.getElementById("session-user").textContent = state.user
    ? `${state.user.full_name} (${state.user.role})`
    : "Sin sesion";
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Error de servidor" }));
    throw new Error(error.detail || "Error de servidor");
  }
  if (response.headers.get("content-type")?.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function renderOrderInfo() {
  const statusEl = document.getElementById("order-status");
  const metaEl = document.getElementById("order-meta");
  const countBtn = document.getElementById("count-submit-btn");
  const summaryEl = document.getElementById("count-summary");
  const linesEl = document.getElementById("count-lines");
  const dynamicAdjustEl = document.getElementById("dynamic-adjust-status");

  if (!state.user) {
    statusEl.textContent = "Debes iniciar sesion.";
    metaEl.innerHTML = "";
    summaryEl.innerHTML = "";
    linesEl.innerHTML = "";
    countBtn.disabled = true;
    if (dynamicAdjustEl) {
      dynamicAdjustEl.classList.remove("active");
      dynamicAdjustEl.textContent = "Ajuste dinamico: inicia sesion para ver estado.";
    }
    return;
  }

  const order = state.currentOrder;
  if (!order) {
    statusEl.textContent = "No hay orden de conteo abierta. Pide al admin crearla en el sistema principal.";
    metaEl.innerHTML = "";
    summaryEl.innerHTML = "";
    linesEl.innerHTML = "";
    countBtn.disabled = true;
    if (dynamicAdjustEl) {
      dynamicAdjustEl.classList.remove("active");
      dynamicAdjustEl.textContent = "Ajuste dinamico: esperando orden activa.";
    }
    return;
  }

  countBtn.disabled = false;
  statusEl.textContent = "Orden activa y sincronizada.";
  if (dynamicAdjustEl) {
    dynamicAdjustEl.classList.add("active");
    dynamicAdjustEl.textContent =
      "Ajuste dinamico activo: ventas/compras durante conteo se compensan al aplicar.";
  }
  metaEl.innerHTML = `
    <div class="result-box">
      <div><strong>Codigo:</strong> ${escapeHtml(order.order_code || String(order.id))}</div>
      <div><strong>Departamento:</strong> ${escapeHtml(order.department_name || "-")}</div>
      <div><strong>Estado:</strong> <span class="pill">${escapeHtml(order.status || "open")}</span></div>
    </div>
  `;
  summaryEl.innerHTML = `
    <div class="result-box">
      <div><strong>Lineas:</strong> ${order.totals?.total_lines || 0}</div>
      <div><strong>Faltantes:</strong> ${qty(order.totals?.missing_units || 0)}</div>
      <div><strong>Sobrantes:</strong> ${qty(order.totals?.extra_units || 0)}</div>
      <div><strong>Perdida estimada:</strong> ${money(order.totals?.estimated_loss || 0)}</div>
    </div>
  `;

  const sortedItems = [...(order.items || [])]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 12);
  linesEl.innerHTML = sortedItems.length
    ? sortedItems
        .map(
          (item) => `
          <div class="result-box">
            <div><strong>${escapeHtml(item.sku)}</strong> - ${escapeHtml(item.name)}</div>
            <div>Sistema: ${qty(item.system_quantity)} | Fisico: ${qty(item.counted_quantity)}</div>
            <div>Diferencia: ${qty(item.difference_quantity)}</div>
          </div>
        `
        )
        .join("")
    : '<p class="hint">Sin escaneos todavia.</p>';
}

async function refreshOrder() {
  if (!state.user) return;
  try {
    state.currentOrder = await api("/api/stock-count/sessions/current");
  } catch (error) {
    state.currentOrder = null;
    alert(error.message);
  }
  renderOrderInfo();
}

async function lookupPrice(event) {
  event.preventDefault();
  if (!state.user) {
    alert("Inicia sesion primero.");
    return;
  }
  const skuInput = document.getElementById("price-sku");
  const resultEl = document.getElementById("price-result");
  const sku = normalizeSku(skuInput.value);
  if (!sku) return;
  try {
    const product = await api(`/api/products/by-sku/${encodeURIComponent(sku)}`);
    const displayCode = product.barcode || product.sku;
    resultEl.innerHTML = `
      <div class="result-box">
        <div><strong>${escapeHtml(product.name)}</strong></div>
        <div><strong>Codigo de barras:</strong> ${escapeHtml(displayCode)}</div>
        <div><strong>Cuanto cuesta:</strong> ${money(product.price)}</div>
        <div><strong>Existencia actual:</strong> ${qty(product.stock)}</div>
        <div><strong>Departamento:</strong> ${escapeHtml(product.department_name || "Sin departamento")}</div>
      </div>
    `;
    skuInput.value = "";
    skuInput.focus();
  } catch (error) {
    resultEl.innerHTML = `<p class="hint">${escapeHtml(error.message)}</p>`;
  }
}

async function saveCount(event) {
  event.preventDefault();
  if (!state.user) {
    alert("Inicia sesion primero.");
    return;
  }
  if (!state.currentOrder) {
    alert("No hay orden de conteo abierta.");
    return;
  }

  const skuInput = document.getElementById("count-sku");
  const qtyInput = document.getElementById("count-qty");
  const sku = normalizeSku(skuInput.value);
  const countedQty = Number(qtyInput.value || 0);
  if (!sku) {
    alert("Escanea SKU o codigo.");
    return;
  }
  if (!Number.isFinite(countedQty) || countedQty <= 0) {
    alert("Cantidad invalida.");
    return;
  }

  try {
    state.currentOrder = await api(`/api/stock-count/sessions/${state.currentOrder.id}/scan`, {
      method: "POST",
      body: JSON.stringify({
        sku,
        counted_quantity: countedQty,
        replace_quantity: false,
      }),
    });
    renderOrderInfo();
    skuInput.value = "";
    qtyInput.value = "1";
    skuInput.focus();
  } catch (error) {
    alert(error.message);
  }
}

async function login(event) {
  event.preventDefault();
  const form = event.target;
  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: form.username.value.trim(),
        password: form.password.value,
      }),
    });
    setSession(result.access_token, result.user);
    form.password.value = "";
    await refreshOrder();
  } catch (error) {
    alert(error.message);
  }
}

async function loadCurrentUser() {
  if (!state.token) return;
  try {
    const user = await api("/api/auth/me");
    setSession(state.token, user);
    await refreshOrder();
  } catch {
    setSession("", null);
  }
}

function logout() {
  setSession("", null);
  state.currentOrder = null;
  renderOrderInfo();
}

function setup() {
  document.getElementById("login-form").addEventListener("submit", login);
  document.getElementById("logout-btn").addEventListener("click", logout);
  document.getElementById("refresh-order-btn").addEventListener("click", refreshOrder);
  document.getElementById("price-check-form").addEventListener("submit", lookupPrice);
  document.getElementById("count-form").addEventListener("submit", saveCount);
  renderOrderInfo();
  loadCurrentUser().catch(() => {});
}

setup();
