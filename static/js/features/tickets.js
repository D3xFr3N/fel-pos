(function (FP) {
  FP.createTicketId = function createTicketId() {
    return `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  };

  FP.cloneCartLines = function cloneCartLines(cart) {
    return (cart || []).map((line) => ({ ...line }));
  };

  FP.ticketHasContent = function ticketHasContent(ticket) {
    if (!ticket) return false;
    return (
      (ticket.cart && ticket.cart.length > 0) ||
      Number(ticket.cartDiscount || 0) > 0 ||
      (ticket.customerNit && ticket.customerNit !== "CF") ||
      (ticket.customerName && ticket.customerName !== "CONSUMIDOR FINAL")
    );
  };
})(window.FelPos = window.FelPos || {});
