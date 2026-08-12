(function (FP) {
  const escapeHtml = FP.escapeHtml;

  FP.wrapConfigSection = function wrapConfigSection(id, title, contentHtml, { open = false } = {}) {
    return `
      <details class="config-section" data-section="${escapeHtml(id)}" ${open ? "open" : ""}>
        <summary class="config-section-summary">${escapeHtml(title)}</summary>
        <div class="config-section-body">${contentHtml}</div>
      </details>
    `;
  };
})(window.FelPos = window.FelPos || {});
