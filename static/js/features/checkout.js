(function (FP) {
  const money = FP.money;

  FP.isFelEnabledInConfig = function isFelEnabledInConfig(config) {
    return Boolean(config?.fel_enabled) && String(config?.fel_mode || "") !== "disabled";
  };

  FP.buildSaleSuccessMessage = function buildSaleSuccessMessage(sale, suffix = "", config = null) {
    const hasFelPayload = Boolean(sale?.fel);
    const felEnabled = FP.isFelEnabledInConfig(config) || hasFelPayload;
    const felPending = felEnabled && sale.fel && String(sale.fel.status || "").toLowerCase() === "pending";
    const felFailed =
      felEnabled &&
      sale.fel &&
      ["error", "failed", "rejected"].includes(String(sale.fel.status || "").toLowerCase());
    const reference = felPending
      ? `Ticket #${sale.id}. Venta registrada, FEL pendiente de certificacion`
      : felFailed
        ? `Ticket #${sale.id}. Venta registrada, FEL con error (revisa pendientes)`
        : felEnabled && sale.fel
          ? `FEL ${sale.fel.serie}-${sale.fel.numero}`
          : `Ticket #${sale.id}`;
    const discount = Number(sale.cart_discount_amount || 0);
    const discountPart = discount > 0 ? ` Descuento: ${money(discount)}.` : "";
    const received = Number(sale.cash_received || 0);
    const change = Number(sale.change_amount || 0);
    const tenderPart =
      received > 0 ? ` Recibido: ${money(received)}. Cambio: ${money(change)}.` : "";
    return `Venta registrada. ${reference}.${discountPart}${tenderPart}${suffix ? ` ${suffix}` : ""}`;
  };

  FP.buildCheckoutStatusSuffix = function buildCheckoutStatusSuffix({ printTicket, printResult, drawerResult }) {
    const parts = [];
    if (printTicket) {
      if (!printResult) {
        parts.push("No se pudo confirmar la impresion.");
      } else if (printResult.printed) {
        parts.push("Ticket impreso.");
        if (printResult.drawer_opened === false || printResult.drawer_error) {
          parts.push("Cajon con problema: usa Reintentar cajon en la barra roja.");
        }
      } else {
        parts.push("Ticket NO impreso: usa Reintentar ticket en la barra roja.");
      }
    } else if (drawerResult) {
      if (drawerResult.drawer_opened) {
        parts.push("Cajon abierto.");
      } else {
        parts.push("Cajon no abrio: puedes reintentarlo desde Caja.");
      }
    }
    return parts.length ? ` ${parts.join(" ")}` : "";
  };
})(window.FelPos = window.FelPos || {});
