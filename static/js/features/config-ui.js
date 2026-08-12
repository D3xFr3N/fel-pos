(function (FP) {
  const escapeHtml = FP.escapeHtml;

  FP.wrapConfigSection = function wrapConfigSection(id, title, contentHtml, { open = false } = {}) {
    const esc = typeof escapeHtml === "function" ? escapeHtml : (value) => String(value ?? "");
    return `
      <details class="config-section" data-section="${esc(id)}" ${open ? "open" : ""}>
        <summary class="config-section-summary">${esc(title)}</summary>
        <div class="config-section-body">${contentHtml || ""}</div>
      </details>
    `;
  };
})(window.FelPos = window.FelPos || {});
