(function (FP) {
  FP.orderBalanceDue = function orderBalanceDue(order) {
    const total = Number(order?.total_estimate || 0);
    const deposit = Number(order?.deposit_paid || 0);
    if (order?.balance_due != null) return Number(order.balance_due || 0);
    return Math.max(total - deposit, 0);
  };

  FP.orderStatusLabel = function orderStatusLabel(status) {
    const map = {
      draft: "Borrador",
      reserved: "Apartado",
      partial: "Abono parcial",
      ready: "Listo",
      delivered: "Entregado",
      cancelled: "Cancelado",
      sent: "Enviado",
    };
    return map[String(status || "").toLowerCase()] || status || "-";
  };
})(window.FelPos = window.FelPos || {});
