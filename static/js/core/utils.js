(function (FP) {
  const money = (value) => `Q ${Number(value || 0).toFixed(2)}`;

  const formatQuantity = (value) => {
    const numeric = Number(value || 0);
    if (Number.isNaN(numeric)) return "0";
    return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(2).replace(/\.?0+$/, "");
  };

  const formatSignedQuantity = (value) => {
    const numeric = Number(value || 0);
    const formatted = formatQuantity(Math.abs(numeric));
    if (numeric > 0) return `+${formatted}`;
    if (numeric < 0) return `-${formatted}`;
    return "0";
  };

  const escapeHtml = (value) =>
    String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  function parseAppDate(value) {
    if (value == null || value === "") return null;
    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }
    if (typeof value === "number") {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    const raw = String(value).trim();
    if (!raw) return null;

    let normalized = raw;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw)) {
      normalized = `${raw}Z`;
    } else if (/^\d{4}-\d{2}-\d{2}[ ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(raw)) {
      normalized = `${raw.replace(" ", "T")}Z`;
    }

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatAppDateTime(value) {
    const parsed = parseAppDate(value);
    if (!parsed) return "-";
    return parsed.toLocaleString("es-GT", { timeZone: "America/Guatemala" });
  }

  function createClientRequestId() {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID();
    }
    return `req-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  FP.money = money;
  FP.formatQuantity = formatQuantity;
  FP.formatSignedQuantity = formatSignedQuantity;
  FP.escapeHtml = escapeHtml;
  FP.parseAppDate = parseAppDate;
  FP.formatAppDateTime = formatAppDateTime;
  FP.createClientRequestId = createClientRequestId;
})(window.FelPos = window.FelPos || {});
