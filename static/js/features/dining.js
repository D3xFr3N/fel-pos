(function (FP) {
  FP.formatDiningItemStatus = function formatDiningItemStatus(status) {
    const value = String(status || "pending").toLowerCase();
    if (value === "done") return "Listo";
    if (value === "sent") return "En cocina";
    return "Pendiente";
  };

  FP.diningItemStatusPillClass = function diningItemStatusPillClass(status) {
    const value = String(status || "pending").toLowerCase();
    if (value === "done") return "ok";
    if (value === "sent") return "warning";
    return "critical";
  };

  FP.diningPendingCount = function diningPendingCount(check) {
    return (check?.items || []).filter((item) => String(item.status || "pending") === "pending").length;
  };

  FP.buildKitchenSummary = function buildKitchenSummary(check) {
    const pending = FP.diningPendingCount(check);
    const sent = (check?.items || []).filter((item) => item.status === "sent").length;
    const done = (check?.items || []).filter((item) => item.status === "done").length;
    return { pending, sent, done };
  };
})(window.FelPos = window.FelPos || {});
