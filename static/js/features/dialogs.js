(function (FP) {
  function ensureDialog(id, builder) {
    let dialog = document.getElementById(id);
    if (dialog) return dialog;
    dialog = builder();
    document.body.appendChild(dialog);
    return dialog;
  }

  function buildConfirmDialog() {
    const dialog = document.createElement("dialog");
    dialog.id = "app-confirm-dialog";
    dialog.className = "app-modal-dialog";
    dialog.innerHTML = `
      <form method="dialog" id="app-confirm-form">
        <h3 id="app-confirm-title">Confirmar</h3>
        <p id="app-confirm-message" class="app-modal-message"></p>
        <div class="dialog-actions">
          <button type="button" class="btn ghost" id="app-confirm-cancel">Cancelar</button>
          <button type="submit" class="btn primary" id="app-confirm-ok" value="ok">Confirmar</button>
        </div>
      </form>
    `;
    return dialog;
  }

  function buildPromptDialog() {
    const dialog = document.createElement("dialog");
    dialog.id = "app-prompt-dialog";
    dialog.className = "app-modal-dialog";
    dialog.innerHTML = `
      <form method="dialog" id="app-prompt-form">
        <h3 id="app-prompt-title">Ingresar valor</h3>
        <p id="app-prompt-message" class="app-modal-message"></p>
        <label>
          <span id="app-prompt-label">Valor</span>
          <input id="app-prompt-input" type="text" autocomplete="off" required>
        </label>
        <div class="dialog-actions">
          <button type="button" class="btn ghost" id="app-prompt-cancel">Cancelar</button>
          <button type="submit" class="btn primary" id="app-prompt-ok">Aceptar</button>
        </div>
      </form>
    `;
    return dialog;
  }

  function buildAlertDialog() {
    const dialog = document.createElement("dialog");
    dialog.id = "app-alert-dialog";
    dialog.className = "app-modal-dialog";
    dialog.innerHTML = `
      <form method="dialog" id="app-alert-form">
        <h3 id="app-alert-title">Aviso</h3>
        <p id="app-alert-message" class="app-modal-message"></p>
        <div class="dialog-actions">
          <button type="submit" class="btn primary" id="app-alert-ok">Entendido</button>
        </div>
      </form>
    `;
    return dialog;
  }

  FP.showAppAlert = function showAppAlert(message, { title = "Aviso" } = {}) {
    return new Promise((resolve) => {
      const dialog = ensureDialog("app-alert-dialog", buildAlertDialog);
      const titleEl = document.getElementById("app-alert-title");
      const msgEl = document.getElementById("app-alert-message");
      const form = document.getElementById("app-alert-form");
      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message || "";
      const onClose = () => {
        dialog.removeEventListener("close", onClose);
        resolve();
      };
      dialog.addEventListener("close", onClose);
      form?.addEventListener(
        "submit",
        (event) => {
          event.preventDefault();
          dialog.close();
        },
        { once: true }
      );
      if (!dialog.open) dialog.showModal();
    });
  };

  FP.showAppConfirm = function showAppConfirm(message, { title = "Confirmar", confirmLabel = "Confirmar", cancelLabel = "Cancelar", danger = false } = {}) {
    return new Promise((resolve) => {
      const dialog = ensureDialog("app-confirm-dialog", buildConfirmDialog);
      const titleEl = document.getElementById("app-confirm-title");
      const msgEl = document.getElementById("app-confirm-message");
      const okBtn = document.getElementById("app-confirm-ok");
      const cancelBtn = document.getElementById("app-confirm-cancel");
      const form = document.getElementById("app-confirm-form");
      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message || "";
      if (okBtn) {
        okBtn.textContent = confirmLabel;
        okBtn.className = danger ? "btn danger" : "btn primary";
      }
      if (cancelBtn) cancelBtn.textContent = cancelLabel;

      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        dialog.close();
        resolve(value);
      };

      cancelBtn.onclick = () => finish(false);
      form.onsubmit = (event) => {
        event.preventDefault();
        finish(true);
      };
      dialog.oncancel = (event) => {
        event.preventDefault();
        finish(false);
      };
      if (!dialog.open) dialog.showModal();
      setTimeout(() => okBtn?.focus(), 0);
    });
  };

  function buildChoiceDialog() {
    const dialog = document.createElement("dialog");
    dialog.id = "app-choice-dialog";
    dialog.className = "app-modal-dialog";
    dialog.innerHTML = `
      <form method="dialog" id="app-choice-form">
        <h3 id="app-choice-title">Elegir</h3>
        <p id="app-choice-message" class="app-modal-message"></p>
        <div class="dialog-actions app-choice-actions">
          <button type="button" class="btn ghost" id="app-choice-secondary"></button>
          <button type="button" class="btn primary" id="app-choice-primary"></button>
        </div>
      </form>
    `;
    return dialog;
  }

  FP.showAppChoice = function showAppChoice(
    message,
    {
      title = "Elegir",
      primaryLabel = "Aceptar",
      secondaryLabel = "Cancelar",
      primaryValue = "primary",
      secondaryValue = "secondary",
      allowDismiss = true,
    } = {}
  ) {
    return new Promise((resolve) => {
      const dialog = ensureDialog("app-choice-dialog", buildChoiceDialog);
      const titleEl = document.getElementById("app-choice-title");
      const msgEl = document.getElementById("app-choice-message");
      const primaryBtn = document.getElementById("app-choice-primary");
      const secondaryBtn = document.getElementById("app-choice-secondary");
      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message || "";
      if (primaryBtn) primaryBtn.textContent = primaryLabel;
      if (secondaryBtn) secondaryBtn.textContent = secondaryLabel;

      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        dialog.close();
        resolve(value);
      };

      primaryBtn.onclick = () => finish(primaryValue);
      secondaryBtn.onclick = () => finish(secondaryValue);
      dialog.oncancel = (event) => {
        event.preventDefault();
        if (allowDismiss) finish(null);
      };
      if (!dialog.open) dialog.showModal();
      setTimeout(() => primaryBtn?.focus(), 0);
    });
  };

  FP.showAppPrompt = function showAppPrompt(message, { title = "Ingresar", label = "Valor", defaultValue = "", inputMode = "text", placeholder = "" } = {}) {
    return new Promise((resolve) => {
      const dialog = ensureDialog("app-prompt-dialog", buildPromptDialog);
      const titleEl = document.getElementById("app-prompt-title");
      const msgEl = document.getElementById("app-prompt-message");
      const labelEl = document.getElementById("app-prompt-label");
      const input = document.getElementById("app-prompt-input");
      const cancelBtn = document.getElementById("app-prompt-cancel");
      const form = document.getElementById("app-prompt-form");
      if (titleEl) titleEl.textContent = title;
      if (msgEl) msgEl.textContent = message || "";
      if (labelEl) labelEl.textContent = label;
      if (input) {
        input.value = defaultValue == null ? "" : String(defaultValue);
        input.inputMode = inputMode;
        input.placeholder = placeholder;
      }

      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        dialog.close();
        resolve(value);
      };

      cancelBtn.onclick = () => finish(null);
      form.onsubmit = (event) => {
        event.preventDefault();
        finish(input?.value ?? "");
      };
      dialog.oncancel = (event) => {
        event.preventDefault();
        finish(null);
      };
      if (!dialog.open) dialog.showModal();
      setTimeout(() => {
        input?.focus();
        input?.select();
      }, 0);
    });
  };

  FP.buildWhatsAppSaleMessage = function buildWhatsAppSaleMessage(sale, companyName = "") {
    if (!sale) return "";
    const lines = [];
    if (companyName) lines.push(String(companyName).trim());
    lines.push(`Ticket #${sale.id}`);
    lines.push(`Cliente: ${sale.customer_name || "CONSUMIDOR FINAL"}`);
    lines.push(`NIT: ${sale.customer_nit || "CF"}`);
    lines.push("---");
    (sale.items || []).slice(0, 12).forEach((item) => {
      lines.push(`${item.product_name} x ${item.quantity} = Q ${Number(item.total || 0).toFixed(2)}`);
    });
    if ((sale.items || []).length > 12) lines.push("...");
    lines.push("---");
    const discount = Number(sale.cart_discount_amount || 0);
    if (discount > 0) lines.push(`Descuento: -Q ${discount.toFixed(2)}`);
    lines.push(`TOTAL: Q ${Number(sale.total || 0).toFixed(2)}`);
    lines.push(`Pago: ${sale.payment_method || "-"}`);
    if (sale.fel?.serie && sale.fel?.numero) {
      lines.push(`FEL: ${sale.fel.serie}-${sale.fel.numero}`);
    }
    return lines.join("\n");
  };

  FP.normalizeWhatsAppPhone = function normalizeWhatsAppPhone(raw) {
    const digits = String(raw || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.length === 8) return `502${digits}`;
    if (digits.startsWith("502") && digits.length >= 11) return digits;
    return digits;
  };

  FP.openWhatsAppShare = function openWhatsAppShare(phone, message) {
    const cleaned = FP.normalizeWhatsAppPhone(phone);
    const text = encodeURIComponent(message || "");
    const url = cleaned
      ? `https://wa.me/${cleaned}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(url, "_blank", "noopener,noreferrer");
    return url;
  };
})(window.FelPos = window.FelPos || {});
