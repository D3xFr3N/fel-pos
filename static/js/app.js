const SALE_INACTIVITY_SECONDS_STORAGE_KEY = "felpos_sale_inactivity_seconds";
const SALE_INACTIVITY_SECONDS_DEFAULT = 60;
const SALE_INACTIVITY_SECONDS_MIN = 15;
const SALE_INACTIVITY_SECONDS_MAX = 600;
const ADMIN_MONITOR_REFRESH_MS = 15000;

function getConfiguredSaleInactivitySeconds() {
  const raw = Number(localStorage.getItem(SALE_INACTIVITY_SECONDS_STORAGE_KEY) || SALE_INACTIVITY_SECONDS_DEFAULT);
  if (!Number.isFinite(raw)) return SALE_INACTIVITY_SECONDS_DEFAULT;
  const rounded = Math.round(raw);
  return Math.min(SALE_INACTIVITY_SECONDS_MAX, Math.max(SALE_INACTIVITY_SECONDS_MIN, rounded));
}

const state = {
  products: [],
  suppliers: [],
  departments: [],
  purchaseOrders: [],
  cart: [],
  sales: [],
  orders: [],
  users: [],
  backups: [],
  config: null,
  receiptPrinterConfig: null,
  labelPrinterConfig: null,
  systemConfig: null,
  notificationConfig: null,
  scannerBridgeConfig: null,
  licenseConfig: null,
  runtimeConfig: { nit_lookup_configured: false },
  currentCash: null,
  selectedSaleId: null,
  selectedSale: null,
  editingProductId: null,
  editingSupplierId: null,
  editingDepartmentId: null,
  stockEntryProductId: null,
  barcodeLabelProductId: null,
  purchaseOrderLines: [],
  autoPurchaseLines: [],
  autoPurchaseIncludeWarning: true,
  postLoginFundAdded: false,
  showLowStockOnly: false,
  lowStockProducts: [],
  lowStockReport: [],
  stockCountCurrent: null,
  stockCountSessions: [],
  salePasswordRequiredPerSale: false,
  saleSessionUnlocked: false,
  saleSessionInactivityMs: getConfiguredSaleInactivitySeconds() * 1000,
  saleSessionAutoLockTimerId: null,
  salePasswordPromptDismissed: false,
  salePasswordAutoOpenPending: false,
  adminCashMonitor: {
    sessions: [],
    updatedAt: null,
    error: null,
  },
  adminCashMonitorTimerId: null,
  appVersion: null,
  updateInfo: null,
  customers: [],
  promotions: [],
  schoolPackages: [],
  reports: null,
  systemAlerts: [],
  auditLogs: [],
  pendingFelSales: [],
  branches: [],
  selectedCustomerId: null,
  editingCustomerId: null,
  businessProfile: "abarrotes",
  user: null,
  token: localStorage.getItem("felpos_token") || "",
};

const DEFAULT_RECEIPT_PRINTER_CONFIG = {
  printer_name: "",
  default_printer: "",
  available_printers: [],
  active_printer: "",
  print_on_checkout: true,
  open_drawer_on_checkout: true,
  chars_per_line: 48,
  bottom_feed_lines: 8,
  encoding: "cp850",
  platform_supported: true,
  header_line_1: "",
  header_line_2: "",
  header_line_3: "",
  show_company_nit: true,
  show_address: false,
  center_header: false,
  footer_message: "Gracias por su compra",
  footer_extra: "",
  ticket_label: "TICKET #{id}",
  separator_char: "-",
  show_customer: true,
  show_date: true,
  show_subtotal: true,
  show_tax: true,
  show_payments: true,
  show_fel: true,
  show_wholesale_savings: true,
  show_item_detail: true,
  preview_text: "",
};

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
const CODE39_PATTERNS = {
  "0": "nnnwwnwnn",
  "1": "wnnwnnnnw",
  "2": "nnwwnnnnw",
  "3": "wnwwnnnnn",
  "4": "nnnwwnnnw",
  "5": "wnnwwnnnn",
  "6": "nnwwwnnnn",
  "7": "nnnwnnwnw",
  "8": "wnnwnnwnn",
  "9": "nnwwnnwnn",
  A: "wnnnnwnnw",
  B: "nnwnnwnnw",
  C: "wnwnnwnnn",
  D: "nnnnwwnnw",
  E: "wnnnwwnnn",
  F: "nnwnwwnnn",
  G: "nnnnnwwnw",
  H: "wnnnnwwnn",
  I: "nnwnnwwnn",
  J: "nnnnwwwnn",
  K: "wnnnnnnww",
  L: "nnwnnnnww",
  M: "wnwnnnnwn",
  N: "nnnnwnnww",
  O: "wnnnwnnwn",
  P: "nnwnwnnwn",
  Q: "nnnnnnwww",
  R: "wnnnnnwwn",
  S: "nnwnnnwwn",
  T: "nnnnwnwwn",
  U: "wwnnnnnnw",
  V: "nwwnnnnnw",
  W: "wwwnnnnnn",
  X: "nwnnwnnnw",
  Y: "wwnnwnnnn",
  Z: "nwwnwnnnn",
  "-": "nwnnnnwnw",
  ".": "wwnnnnwnn",
  " ": "nwwnnnwnn",
  $: "nwnwnwnnn",
  "/": "nwnwnnnwn",
  "+": "nwnnnwnwn",
  "%": "nnnwnwnwn",
  "*": "nwnnwnwnn",
};
const CODE39_ALLOWED_REGEX = /^[0-9A-Z .\-$\/+%]+$/;

function normalizeBarcodeValue(value) {
  return String(value || "").trim().toUpperCase();
}

function isCode39Encodable(value) {
  return CODE39_ALLOWED_REGEX.test(value);
}

function getProductBarcodeValue(product) {
  if (!product) return "";
  return normalizeBarcodeValue(product.barcode || product.sku || "");
}

function getStoredBarcodeValue(product) {
  if (!product) return "";
  return normalizeBarcodeValue(product.barcode || "");
}

function getLabelPrintCode(product) {
  const barcode = getStoredBarcodeValue(product);
  if (barcode) return barcode;
  return normalizeBarcodeValue(product?.sku || "");
}

function sanitizeCode39Value(value) {
  const normalized = normalizeBarcodeValue(value);
  if (!normalized) return "";
  if (isCode39Encodable(normalized)) return normalized;
  // Reemplaza caracteres no soportados (ej. _) para poder imprimir etiquetas.
  const cleaned = normalized.replace(/[^0-9A-Z .\-$\/+%]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return isCode39Encodable(cleaned) ? cleaned : "";
}

function buildCode39Svg(value, options = {}) {
  const codeValue = normalizeBarcodeValue(value);
  if (!codeValue) {
    throw new Error("Codigo de barras vacio.");
  }
  if (!isCode39Encodable(codeValue)) {
    throw new Error(
      "Codigo invalido para etiqueta. Usa letras A-Z, numeros y simbolos (- . espacio $ / + %)."
    );
  }
  const narrow = Math.max(1, Number(options.narrow || 2));
  const wide = Math.max(narrow + 1, Number(options.wide || 5));
  const quiet = Math.max(narrow * 4, Number(options.quiet || 12));
  const barHeight = Math.max(24, Number(options.barHeight || 52));
  const fontSize = Math.max(10, Number(options.fontSize || 12));
  const payload = `*${codeValue}*`;
  let x = quiet;
  let bars = "";
  for (let i = 0; i < payload.length; i += 1) {
    const char = payload[i];
    const pattern = CODE39_PATTERNS[char];
    if (!pattern) {
      throw new Error(`Caracter no soportado en codigo de barras: ${char}`);
    }
    for (let j = 0; j < pattern.length; j += 1) {
      const width = pattern[j] === "w" ? wide : narrow;
      const isBar = j % 2 === 0;
      if (isBar) {
        bars += `<rect x="${x}" y="0" width="${width}" height="${barHeight}" fill="#111"></rect>`;
      }
      x += width;
    }
    if (i < payload.length - 1) {
      x += narrow; // inter-character gap
    }
  }
  const totalWidth = x + quiet;
  const textY = barHeight + fontSize + 2;
  const totalHeight = textY + 3;
  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" preserveAspectRatio="xMidYMid meet">
      <rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#fff"></rect>
      ${bars}
      <text x="${totalWidth / 2}" y="${textY}" text-anchor="middle" font-family="Consolas, 'Courier New', monospace" font-size="${fontSize}" fill="#111">${escapeHtml(
    codeValue
  )}</text>
    </svg>
  `;
}
const normalizeNit = (value) => {
  const raw = (value || "").trim().toUpperCase();
  const compact = raw.replace(/[\/\-\s]/g, "");
  if (!compact || compact === "CF") return "CF";
  return compact;
};
const expectedNitCheckDigit = (body) => {
  let weightedSum = 0;
  for (let i = 0; i < body.length; i += 1) {
    const digit = Number(body[i]);
    const weight = body.length + 1 - (i + 1);
    weightedSum += digit * weight;
  }
  const checkValue = (11 - (weightedSum % 11)) % 11;
  return checkValue === 10 ? "K" : String(checkValue);
};
const isValidNit = (nit) => {
  if (nit === "CF") return true;
  if (!nit || nit.length < 2 || nit.length > 13) return false;
  if (!/^[0-9K]+$/.test(nit)) return false;
  if ((nit.match(/K/g) || []).length > 1) return false;
  if (nit.includes("K") && !nit.endsWith("K")) return false;

  const body = nit.slice(0, -1);
  const verifier = nit.slice(-1);
  if (!/^[0-9]+$/.test(body)) return false;
  return expectedNitCheckDigit(body) === verifier;
};

const BUSINESS_PROFILE_COPY = {
  abarrotes: {
    appTitle: "FEL POS Guatemala",
    brandTitle: "FEL POS",
    companySubtitleDefault: "Punto de venta con factura electronica",
    tabs: {
      products: "Productos",
      inventory: "Dashboard inventario",
      stockCount: "Conteo fisico",
      orders: "Ordenes",
      purchases: "Compras",
    },
    placeholders: {
      productSearch: "Buscar producto o SKU...",
    },
    buttons: {
      newProduct: "Nuevo producto",
      lowStock: "Bajo inventario",
      showAllProducts: "Ver todos",
      stockCountNewSession: "Nueva orden conteo",
      newOrder: "Nueva orden",
    },
    labels: {
      newProductDialog: "Nuevo producto",
      editProductDialogPrefix: "Editar producto",
    },
  },
  farmacia: {
    appTitle: "FEL POS Farmacia",
    brandTitle: "FEL POS Farmacia",
    companySubtitleDefault: "Sistema de farmacia con ventas e inventario",
    tabs: {
      products: "Medicamentos",
      inventory: "Control inventario",
      stockCount: "Conteo farmacia",
      orders: "Pedidos",
      purchases: "Compras",
    },
    placeholders: {
      productSearch: "Buscar medicamento, producto o SKU...",
    },
    buttons: {
      newProduct: "Nuevo medicamento",
      lowStock: "Stock critico",
      showAllProducts: "Ver catalogo",
      stockCountNewSession: "Nueva orden farmacia",
      newOrder: "Nuevo pedido",
    },
    labels: {
      newProductDialog: "Nuevo medicamento",
      editProductDialogPrefix: "Editar medicamento",
    },
  },
  libreria: {
    appTitle: "FEL POS Libreria Escolar",
    brandTitle: "FEL POS Libreria Escolar",
    companySubtitleDefault: "Sistema de libreria y utiles escolares",
    tabs: {
      products: "Utiles escolares",
      inventory: "Control inventario",
      stockCount: "Conteo de utiles",
      orders: "Apartados",
      purchases: "Compras",
    },
    placeholders: {
      productSearch: "Buscar cuaderno, lapiz, mochila o SKU...",
    },
    buttons: {
      newProduct: "Nuevo util escolar",
      lowStock: "Inventario bajo",
      showAllProducts: "Ver catalogo",
      stockCountNewSession: "Nueva orden utiles",
      newOrder: "Nuevo apartado",
    },
    labels: {
      newProductDialog: "Nuevo util escolar",
      editProductDialogPrefix: "Editar util escolar",
    },
    schoolFields: {
      title: "Datos utiles escolares",
      category: "Categoria escolar",
      grade: "Grado",
      brand: "Marca",
      variant: "Modelo / color / tamano",
      detailColumn: "Detalle escolar",
      emptyDetail: "Sin detalle escolar",
    },
  },
  ferreteria: {
    appTitle: "FEL POS Ferreteria",
    brandTitle: "FEL POS Ferreteria",
    companySubtitleDefault: "Punto de venta para ferreteria y materiales",
    tabs: {
      products: "Materiales",
      inventory: "Control inventario",
      stockCount: "Conteo ferreteria",
      orders: "Pedidos",
      purchases: "Compras",
    },
    placeholders: {
      productSearch: "Buscar tornillo, pintura, herramienta o SKU...",
    },
    buttons: {
      newProduct: "Nuevo material",
      lowStock: "Stock critico",
      showAllProducts: "Ver catalogo",
      stockCountNewSession: "Nueva orden ferreteria",
      newOrder: "Nuevo pedido",
    },
    labels: {
      newProductDialog: "Nuevo material",
      editProductDialogPrefix: "Editar material",
    },
  },
  restaurante: {
    appTitle: "FEL POS Restaurante",
    brandTitle: "FEL POS Restaurante",
    companySubtitleDefault: "Sistema de restaurante con comandas y ventas",
    tabs: {
      products: "Menu",
      inventory: "Inventario cocina",
      stockCount: "Conteo insumos",
      orders: "Comandas",
      purchases: "Compras insumos",
    },
    placeholders: {
      productSearch: "Buscar platillo, bebida o SKU...",
    },
    buttons: {
      newProduct: "Nuevo platillo",
      lowStock: "Insumos bajos",
      showAllProducts: "Ver menu",
      stockCountNewSession: "Nueva orden insumos",
      newOrder: "Nueva comanda",
    },
    labels: {
      newProductDialog: "Nuevo platillo",
      editProductDialogPrefix: "Editar platillo",
    },
  },
  boutique: {
    appTitle: "FEL POS Boutique",
    brandTitle: "FEL POS Boutique",
    companySubtitleDefault: "Punto de venta para boutique y moda",
    tabs: {
      products: "Prendas",
      inventory: "Control inventario",
      stockCount: "Conteo boutique",
      orders: "Apartados",
      purchases: "Compras",
    },
    placeholders: {
      productSearch: "Buscar prenda, talla, marca o SKU...",
    },
    buttons: {
      newProduct: "Nueva prenda",
      lowStock: "Inventario bajo",
      showAllProducts: "Ver catalogo",
      stockCountNewSession: "Nueva orden boutique",
      newOrder: "Nuevo apartado",
    },
    labels: {
      newProductDialog: "Nueva prenda",
      editProductDialogPrefix: "Editar prenda",
    },
    extraFields: {
      title: "Datos de prenda",
      category: "Categoria",
      grade: "Talla",
      brand: "Marca",
      variant: "Color / estilo",
      detailColumn: "Detalle prenda",
      emptyDetail: "Sin detalle de prenda",
    },
  },
};

function getActiveBusinessProfile() {
  const candidate = String(state.businessProfile || state.config?.business_profile || "abarrotes").toLowerCase();
  if (candidate in BUSINESS_PROFILE_COPY) return candidate;
  return "abarrotes";
}

function getBusinessProfileCopy() {
  return BUSINESS_PROFILE_COPY[getActiveBusinessProfile()] || BUSINESS_PROFILE_COPY.abarrotes;
}

function isSchoolSuppliesProfile() {
  return getActiveBusinessProfile() === "libreria";
}

function hasProductExtraFields() {
  return ["libreria", "boutique"].includes(getActiveBusinessProfile());
}

function getProductExtraFieldsCopy() {
  const profile = getBusinessProfileCopy();
  return profile.extraFields || profile.schoolFields || {};
}

function formatProductExtraDetail(product) {
  return [
    product.school_category,
    product.school_grade,
    product.school_brand,
    product.school_variant,
  ]
    .filter(Boolean)
    .join(" · ");
}

function syncProductSchoolFieldsUi() {
  const section = document.getElementById("product-school-fields");
  if (!section) return;

  const visible = hasProductExtraFields();
  section.hidden = !visible;

  const labels = getProductExtraFieldsCopy();
  const titleEl = document.getElementById("product-school-fields-title");
  const categoryEl = document.getElementById("product-school-category-label");
  const gradeEl = document.getElementById("product-school-grade-label");
  const brandEl = document.getElementById("product-school-brand-label");
  const variantEl = document.getElementById("product-school-variant-label");

  if (titleEl) titleEl.textContent = labels.title || "Datos adicionales";
  if (categoryEl) categoryEl.textContent = labels.category || "Categoria";
  if (gradeEl) gradeEl.textContent = labels.grade || "Detalle 1";
  if (brandEl) brandEl.textContent = labels.brand || "Marca";
  if (variantEl) variantEl.textContent = labels.variant || "Variante";
}

function applyBusinessProfileUi() {
  const profile = getBusinessProfileCopy();
  document.title = profile.appTitle;
  const brandTitleEl = document.querySelector(".brand h1");
  if (brandTitleEl) {
    brandTitleEl.textContent = profile.brandTitle;
  }
  const companyNameEl = document.getElementById("company-name");
  if (companyNameEl && !state.config) {
    companyNameEl.textContent = profile.companySubtitleDefault;
  }

  const tabLabelMap = {
    products: profile.tabs.products,
    inventory: profile.tabs.inventory,
    "stock-count": profile.tabs.stockCount,
    orders: profile.tabs.orders,
    purchases: profile.tabs.purchases,
  };
  Object.entries(tabLabelMap).forEach(([tab, label]) => {
    const el = document.querySelector(`.tab[data-tab="${tab}"]`);
    if (el && label) {
      el.textContent = label;
    }
  });

  const productSearchEl = document.getElementById("product-search");
  if (productSearchEl && profile.placeholders.productSearch) {
    productSearchEl.placeholder = profile.placeholders.productSearch;
  }

  const newProductBtn = document.getElementById("new-product-btn");
  if (newProductBtn && profile.buttons.newProduct) newProductBtn.textContent = profile.buttons.newProduct;
  const lowStockBtn = document.getElementById("show-low-stock-btn");
  if (lowStockBtn && profile.buttons.lowStock) lowStockBtn.textContent = profile.buttons.lowStock;
  const showAllBtn = document.getElementById("show-all-products-btn");
  if (showAllBtn && profile.buttons.showAllProducts) showAllBtn.textContent = profile.buttons.showAllProducts;
  const stockCountNewBtn = document.getElementById("stock-count-new-session-btn");
  if (stockCountNewBtn && profile.buttons.stockCountNewSession) {
    stockCountNewBtn.textContent = profile.buttons.stockCountNewSession;
  }
  const newOrderBtn = document.getElementById("new-order-btn");
  if (newOrderBtn && profile.buttons.newOrder) newOrderBtn.textContent = profile.buttons.newOrder;
  syncProductSchoolFieldsUi();
}

function setSession(token, user) {
  clearSaleSessionAutoLockTimer();
  clearAdminCashMonitorTimer();
  state.token = token || "";
  state.user = user || null;
  if (!state.user) {
    state.config = null;
  }
  state.saleSessionUnlocked = false;
  state.adminCashMonitor = {
    sessions: [],
    updatedAt: null,
    error: null,
  };
  if (token) {
    localStorage.setItem("felpos_token", token);
  } else {
    localStorage.removeItem("felpos_token");
  }
  document.getElementById("session-user").textContent = state.user
    ? `${state.user.full_name} (${state.user.role})`
    : "Sin sesion";
  const mobileQrButton = document.getElementById("open-mobile-qr-btn");
  if (mobileQrButton) {
    mobileQrButton.disabled = !state.user;
  }
  applyBusinessProfileUi();
  applyRoleVisibility();
  renderCashOwnerIndicator();
  renderSaleSessionIndicator();
}

function applyRoleVisibility() {
  const tabButtons = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll("main .panel");
  const posTabButton = document.querySelector('.tab[data-tab="pos"]');
  const posPanel = document.getElementById("tab-pos");
  const mobileQrButton = document.getElementById("open-mobile-qr-btn");
  const generateCriticalPurchaseBtn = document.getElementById("generate-critical-purchase-btn");
  const isAdmin = state.user?.role === "admin";

  if (isAdmin) {
    tabButtons.forEach((tab) => {
      tab.style.display = "";
    });
    panels.forEach((panel) => {
      panel.style.display = "";
    });
    if (mobileQrButton) {
      mobileQrButton.style.display = "";
    }
  } else {
    tabButtons.forEach((tab) => {
      const allow = tab.dataset.tab === "pos";
      tab.style.display = allow ? "inline-block" : "none";
      if (!allow) {
        tab.classList.remove("active");
      }
    });
    panels.forEach((panel) => {
      const allow = panel.id === "tab-pos";
      panel.style.display = allow ? "" : "none";
      if (!allow) {
        panel.classList.remove("active");
      }
    });
    posTabButton?.classList.add("active");
    posPanel?.classList.add("active");
    if (mobileQrButton) {
      mobileQrButton.style.display = "none";
    }
  }

  if (generateCriticalPurchaseBtn) {
    generateCriticalPurchaseBtn.style.display = isAdmin ? "inline-block" : "none";
  }
}

function openLogin() {
  switchToPosTab();
  setLoginAdminMode(false);
  const loginExtras = document.getElementById("login-extra-options");
  if (loginExtras) loginExtras.hidden = true;
  const loginForm = document.getElementById("login-form");
  if (loginForm) {
    loginForm.reset();
    setLoginAdminMode(false);
  }
  const dialog = document.getElementById("login-dialog");
  if (!dialog.open) {
    dialog.showModal();
  }
  const passwordInput = loginForm?.querySelector('input[name="password"]');
  if (passwordInput) {
    setTimeout(() => passwordInput.focus(), 0);
  }
}

function closeLogin() {
  const dialog = document.getElementById("login-dialog");
  if (dialog.open) {
    dialog.close();
  }
}

function mustChangePassword() {
  return Number(state.user?.must_change_password) === 1;
}

function openPasswordChangeDialog() {
  const dialog = document.getElementById("password-change-dialog");
  const form = document.getElementById("password-change-form");
  if (form) form.reset();
  if (dialog && !dialog.open) {
    dialog.showModal();
  }
  document.getElementById("password-change-current")?.focus();
}

function closePasswordChangeDialog() {
  document.getElementById("password-change-dialog")?.close();
}

async function continueAfterLogin() {
  await loadData();
  if (isAdminUser()) {
    state.postLoginFundAdded = !state.currentCash || isCurrentCashOwnedByLoggedUser();
    if (state.currentCash && !isCurrentCashOwnedByLoggedUser()) {
      openPostLoginDialog();
      return;
    }
    enterAppAfterLogin();
    return;
  }
  state.postLoginFundAdded = false;
  if (state.currentCash && canUseCurrentCash()) {
    state.postLoginFundAdded = true;
    enterAppAfterLogin();
    return;
  }
  openPostLoginDialog();
}

function switchToPosTab() {
  document.querySelector('.tab[data-tab="pos"]')?.click();
}

function isAdminUser() {
  return state.user?.role === "admin";
}

function enterAppAfterLogin({ lockSaleSession = false } = {}) {
  switchToPosTab();
  if (lockSaleSession && isCashierSaleLockEnabled()) {
    lockSaleSessionForNextSale();
    return;
  }
  // Tras login / fondo, entrar directo a vender sin pedir clave otra vez.
  state.saleSessionUnlocked = true;
  state.salePasswordPromptDismissed = false;
  closeSalePasswordDialog();
  clearSaleSessionAutoLockTimer();
  renderSaleSessionIndicator();
  focusProductSearch();
}

function setLoginAdminMode(enabled) {
  const adminFields = document.getElementById("login-admin-fields");
  const adminUserInput = document.getElementById("login-admin-username");
  const modeHint = document.getElementById("login-mode-hint");
  const modeCheckbox = document.getElementById("login-admin-mode");
  const loginExtras = document.getElementById("login-extra-options");
  const showAdminBtn = document.getElementById("show-admin-login-btn");
  const passwordInput = document.querySelector('#login-form input[name="password"]');
  const isEnabled = Boolean(enabled);
  if (loginExtras) loginExtras.hidden = !isEnabled;
  if (adminFields) adminFields.hidden = !isEnabled;
  if (showAdminBtn) showAdminBtn.hidden = isEnabled;
  if (adminUserInput) {
    adminUserInput.required = isEnabled;
    if (!isEnabled) {
      adminUserInput.value = "";
    } else if (!adminUserInput.value.trim()) {
      adminUserInput.value = "admin";
    }
  }
  if (modeCheckbox) modeCheckbox.checked = isEnabled;
  if (modeHint) {
    modeHint.textContent = isEnabled
      ? "Modo admin activo: ingresa usuario y clave."
      : "Admin: marca la opcion y usa usuario + clave.";
  }
  if (passwordInput) {
    passwordInput.placeholder = isEnabled ? "Ingresa tu clave de admin" : "Ingresa tu clave de cajero";
  }
  if (isEnabled) {
    setTimeout(() => (adminUserInput || passwordInput)?.focus(), 0);
  }
}

function isCashierSaleLockEnabled() {
  return state.salePasswordRequiredPerSale && state.user?.role === "user";
}

function isSaleSessionUnlocked() {
  if (!isCashierSaleLockEnabled()) return true;
  return Boolean(state.saleSessionUnlocked);
}

function resetSaleCustomerDefaults() {
  const nitInput = document.getElementById("customer-nit");
  const nameInput = document.getElementById("customer-name");
  if (nitInput) nitInput.value = "CF";
  if (nameInput) nameInput.value = "CONSUMIDOR FINAL";
}

function lockSaleSessionForNextSale() {
  if (!isCashierSaleLockEnabled()) return;
  clearSaleSessionAutoLockTimer();
  state.saleSessionUnlocked = false;
  state.salePasswordPromptDismissed = false;
  closeSalePasswordDialog();
  renderSaleSessionIndicator();
  showSalePasswordGate();
}

function focusProductSearch() {
  const searchInput = document.getElementById("product-search");
  if (!searchInput || searchInput.disabled) return;
  setTimeout(() => {
    searchInput.focus();
    if (typeof searchInput.select === "function") {
      searchInput.select();
    }
  }, 0);
}

function shouldAutoPromptSalePassword() {
  return (
    isCashierSaleLockEnabled() &&
    !state.saleSessionUnlocked &&
    Boolean(state.currentCash) &&
    canUseCurrentCash() &&
    !state.salePasswordPromptDismissed
  );
}

function closeSalePasswordDialog() {
  const dialog = document.getElementById("sale-password-dialog");
  if (dialog?.open) {
    dialog.close();
  }
}

function showSalePasswordGate() {
  if (!isCashierSaleLockEnabled()) return;
  if (!state.currentCash || !canUseCurrentCash()) return;
  if (state.saleSessionUnlocked) return;
  state.salePasswordPromptDismissed = false;
  renderSaleSessionIndicator();
  const dialog = document.getElementById("sale-password-dialog");
  if (dialog?.open || state.salePasswordAutoOpenPending) return;
  state.salePasswordAutoOpenPending = true;
  setTimeout(() => {
    state.salePasswordAutoOpenPending = false;
    if (!isCashierSaleLockEnabled() || state.saleSessionUnlocked) return;
    if (!state.currentCash || !canUseCurrentCash()) return;
    void openSaleSessionWithPassword();
  }, 0);
}

function maybeAutoOpenSalePasswordDialog() {
  if (!shouldAutoPromptSalePassword()) return;
  showSalePasswordGate();
}

function getSaleInactivitySeconds() {
  const seconds = Number(state.saleSessionInactivityMs || 0) / 1000;
  if (!Number.isFinite(seconds) || seconds <= 0) return SALE_INACTIVITY_SECONDS_DEFAULT;
  return Math.round(seconds);
}

function setSaleInactivitySeconds(seconds) {
  const normalized = Math.min(
    SALE_INACTIVITY_SECONDS_MAX,
    Math.max(SALE_INACTIVITY_SECONDS_MIN, Math.round(Number(seconds || 0)))
  );
  state.saleSessionInactivityMs = normalized * 1000;
  localStorage.setItem(SALE_INACTIVITY_SECONDS_STORAGE_KEY, String(normalized));
  if (state.saleSessionUnlocked) {
    resetSaleSessionAutoLockTimer();
  }
  return normalized;
}

function clearAdminCashMonitorTimer() {
  if (state.adminCashMonitorTimerId) {
    clearInterval(state.adminCashMonitorTimerId);
    state.adminCashMonitorTimerId = null;
  }
}

function summarizeCashMonitor(session, movements = []) {
  const openingAmount = Number(session?.opening_amount || 0);
  const expectedAmount = Number(session?.expected_amount || 0);
  let salesCashTotal = 0;
  let returnsCashTotal = 0;
  let manualIncomeTotal = 0;
  let manualExpenseTotal = 0;
  let lastSaleAt = null;
  const saleIds = new Set();

  (movements || []).forEach((movement) => {
    const amount = Number(movement?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const isSaleMovement = Number(movement?.sale_id || 0) > 0;
    if (isSaleMovement) {
      if (movement.movement_type === "sale" || movement.movement_type === "income") {
        salesCashTotal += amount;
        saleIds.add(Number(movement.sale_id));
        if (!lastSaleAt || new Date(movement.created_at) > new Date(lastSaleAt)) {
          lastSaleAt = movement.created_at;
        }
      } else if (movement.movement_type === "expense") {
        returnsCashTotal += amount;
      }
      return;
    }

    if (movement.movement_type === "income") {
      manualIncomeTotal += amount;
    } else if (movement.movement_type === "expense") {
      manualExpenseTotal += amount;
    }
  });

  const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
  return {
    openingAmount: round2(openingAmount),
    expectedAmount: round2(expectedAmount),
    salesCount: saleIds.size,
    salesCashTotal: round2(salesCashTotal),
    returnsCashTotal: round2(returnsCashTotal),
    netSalesCash: round2(salesCashTotal - returnsCashTotal),
    manualIncomeTotal: round2(manualIncomeTotal),
    manualExpenseTotal: round2(manualExpenseTotal),
    lastSaleAt,
  };
}

async function refreshAdminCashMonitorData() {
  if (state.user?.role !== "admin") return;
  try {
    const openSessions = await api("/api/cash/sessions/open");
    const sessions = [];
    for (const session of openSessions || []) {
      const movements = await api(`/api/cash/sessions/${session.id}/movements`);
      sessions.push({
        session,
        movements,
        metrics: summarizeCashMonitor(session, movements),
      });
    }
    state.adminCashMonitor = {
      sessions,
      updatedAt: new Date().toISOString(),
      error: null,
    };
  } catch (error) {
    state.adminCashMonitor = {
      sessions: [],
      updatedAt: new Date().toISOString(),
      error: error?.message || "No se pudo actualizar monitor de caja.",
    };
  }
}

function clearSaleSessionAutoLockTimer() {
  if (state.saleSessionAutoLockTimerId) {
    clearTimeout(state.saleSessionAutoLockTimerId);
    state.saleSessionAutoLockTimerId = null;
  }
}

function resetSaleSessionAutoLockTimer() {
  if (!isCashierSaleLockEnabled() || !state.saleSessionUnlocked) {
    clearSaleSessionAutoLockTimer();
    return;
  }
  clearSaleSessionAutoLockTimer();
  state.saleSessionAutoLockTimerId = setTimeout(() => {
    state.saleSessionAutoLockTimerId = null;
    if (!isCashierSaleLockEnabled() || !state.saleSessionUnlocked) return;
    state.saleSessionUnlocked = false;
    state.salePasswordPromptDismissed = false;
    document.getElementById("cash-checkout-dialog")?.close();
    document.getElementById("mixed-checkout-dialog")?.close();
    renderSaleSessionIndicator();
    showSalePasswordGate();
  }, Number(state.saleSessionInactivityMs || 60000));
}

function isLocalHostName(host) {
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function getDefaultMobileHost() {
  const currentHost = window.location.hostname || "";
  if (currentHost && !isLocalHostName(currentHost)) {
    return currentHost;
  }
  return localStorage.getItem("felpos_mobile_host") || "";
}

function buildMobileAppUrl(hostInput) {
  const protocol = window.location.protocol || "http:";
  const rawHost = String(hostInput || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
  if (!rawHost) return "";

  const port = window.location.port || "";
  const includePort =
    port &&
    !((protocol === "http:" && port === "80") || (protocol === "https:" && port === "443"));

  const serverBase = `${protocol}//${rawHost}${includePort ? `:${port}` : ""}`;
  // Pagina puente: abre la APK (felpos://) y deja listo el servidor para login.
  return `${serverBase}/mobile/open-app?server=${encodeURIComponent(serverBase)}`;
}

function setMobileQrStatus(message, isError = false) {
  const statusEl = document.getElementById("mobile-qr-detect-status");
  if (!statusEl) return;
  statusEl.textContent = message || "";
  statusEl.style.color = isError ? "#ff8f88" : "";
}

function extractIpv4FromCandidate(candidateText) {
  const match = String(candidateText || "").match(/(\d{1,3}(?:\.\d{1,3}){3})/);
  if (!match) return null;
  return match[1];
}

function isPrivateIpv4(ip) {
  const parts = String(ip || "")
    .split(".")
    .map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

async function detectLocalIp() {
  const currentHost = window.location.hostname || "";
  if (currentHost && !isLocalHostName(currentHost)) {
    return currentHost;
  }

  try {
    const result = await api("/api/system/lan-ip");
    if (result?.detected && result?.ip) {
      return result.ip;
    }
  } catch {
    // Fall through to browser detection.
  }

  const RTCPeer = window.RTCPeerConnection || window.webkitRTCPeerConnection;
  if (!RTCPeer) {
    throw new Error("No se pudo detectar IP automaticamente. Ingresala manualmente.");
  }

  return await new Promise((resolve) => {
    const pc = new RTCPeer({ iceServers: [] });
    const ips = new Set();
    let resolved = false;

    const finish = () => {
      if (resolved) return;
      resolved = true;
      try {
        pc.close();
      } catch {}
      const candidates = Array.from(ips);
      const privateIp = candidates.find((ip) => isPrivateIpv4(ip));
      resolve(privateIp || candidates[0] || null);
    };

    pc.onicecandidate = (event) => {
      if (event?.candidate?.candidate) {
        const ip = extractIpv4FromCandidate(event.candidate.candidate);
        if (ip) ips.add(ip);
      } else {
        finish();
      }
    };

    pc.createDataChannel("felpos-ip");
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer))
      .catch(() => finish());

    setTimeout(finish, 2500);
  });
}

async function detectMobileQrHost() {
  const hostInput = document.getElementById("mobile-qr-host");
  if (!hostInput) return;
  setMobileQrStatus("Detectando IP local...");
  try {
    const detectedHost = await detectLocalIp();
    if (!detectedHost) {
      setMobileQrStatus("No se pudo detectar IP automaticamente. Ingresala manualmente.", true);
      return;
    }
    hostInput.value = detectedHost;
    localStorage.setItem("felpos_mobile_host", detectedHost);
    renderMobileQr();
    setMobileQrStatus(`IP detectada: ${detectedHost}`);
  } catch (error) {
    setMobileQrStatus(error?.message || "No fue posible detectar IP automaticamente.", true);
  }
}

function renderMobileQr() {
  const hostInput = document.getElementById("mobile-qr-host");
  const urlEl = document.getElementById("mobile-qr-url");
  const imgEl = document.getElementById("mobile-qr-image");
  if (!hostInput || !urlEl || !imgEl) return;

  const mobileUrl = buildMobileAppUrl(hostInput.value);
  if (!mobileUrl) {
    urlEl.textContent = "-";
    imgEl.removeAttribute("src");
    setMobileQrStatus("");
    return;
  }
  urlEl.textContent = mobileUrl;
  imgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
    mobileUrl
  )}`;
}

function openMobileQrDialog() {
  if (!state.user) {
    alert("Primero inicia sesion para usar el QR de la app movil.");
    return;
  }
  const dialog = document.getElementById("mobile-qr-dialog");
  const hostInput = document.getElementById("mobile-qr-host");
  if (!dialog || !hostInput) return;
  const rememberedHost = getDefaultMobileHost();
  if (!hostInput.value.trim()) {
    hostInput.value = rememberedHost;
  }
  setMobileQrStatus("");
  renderMobileQr();
  dialog.showModal();
  hostInput.focus();

  const activeHost = hostInput.value.trim();
  const shouldAutoDetect = !activeHost || isLocalHostName(activeHost);
  if (shouldAutoDetect) {
    detectMobileQrHost();
  }
}

async function copyMobileQrUrl() {
  const hostInput = document.getElementById("mobile-qr-host");
  if (!hostInput) return;
  const mobileUrl = buildMobileAppUrl(hostInput.value);
  if (!mobileUrl) {
    alert("Ingresa una IP valida para generar URL.");
    return;
  }
  try {
    await navigator.clipboard.writeText(mobileUrl);
    alert("URL movil copiada.");
  } catch {
    alert(`No se pudo copiar automaticamente. URL: ${mobileUrl}`);
  }
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const isFormData = options.body instanceof FormData;
  if (!isFormData && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (state.token) {
    headers.Authorization = `Bearer ${state.token}`;
  }

  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Error de servidor" }));
    if (response.status === 401) {
      setSession("", null);
      openLogin();
    }
    throw new Error(error.detail || "Error de servidor");
  }
  if (response.headers.get("content-type")?.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function calcTotals(cart) {
  let subtotal = 0;
  let taxTotal = 0;
  cart.forEach((line) => {
    const unitPrice = getEffectiveUnitPrice(line);
    const lineSubtotal = unitPrice * line.quantity;
    const lineTax = lineSubtotal * line.tax_rate;
    subtotal += lineSubtotal;
    taxTotal += lineTax;
  });
  const rawSubtotal = Math.round(subtotal * 100) / 100;
  const rawTax = Math.round(taxTotal * 100) / 100;
  const cartDiscount = Math.min(
    Math.round(Number(document.getElementById("cart-discount-input")?.value || 0) * 100) / 100,
    rawSubtotal
  );
  const adjustedSubtotal = Math.round((rawSubtotal - cartDiscount) * 100) / 100;
  const ratio = rawSubtotal > 0 ? adjustedSubtotal / rawSubtotal : 1;
  const adjustedTax = Math.round(rawTax * ratio * 100) / 100;
  return {
    subtotal: adjustedSubtotal,
    taxTotal: adjustedTax,
    total: Math.round((adjustedSubtotal + adjustedTax) * 100) / 100,
    cartDiscount,
    rawSubtotal,
  };
}

function getEffectiveUnitPrice(line) {
  if (
    line.wholesale_enabled &&
    line.wholesale_min_qty > 0 &&
    line.quantity >= line.wholesale_min_qty &&
    line.wholesale_discount_pct > 0
  ) {
    return Math.round((line.base_price * (1 - line.wholesale_discount_pct / 100)) * 100) / 100;
  }
  return line.base_price;
}

function getWholesaleHint(product) {
  if (!product.wholesale_enabled || product.wholesale_min_qty <= 0 || product.wholesale_discount_pct <= 0) {
    return "";
  }
  const discountUnitPrice = Math.round((product.price * (1 - product.wholesale_discount_pct / 100)) * 100) / 100;
  return `Mayoreo: desde ${product.wholesale_min_qty} uds (-${product.wholesale_discount_pct}%) ${money(discountUnitPrice)}`;
}

function getSupplierNameById(supplierId) {
  const supplier = state.suppliers.find((item) => item.id === supplierId);
  return supplier ? supplier.name : "Sin proveedor";
}

function getDepartmentNameById(departmentId) {
  const department = state.departments.find((item) => item.id === departmentId);
  return department ? department.name : "Sin departamento";
}

function populateSupplierSelect(selectElement, selectedSupplierId = null) {
  if (!selectElement) return;
  selectElement.innerHTML = `
    <option value="">Selecciona proveedor</option>
    ${state.suppliers
      .map((supplier) => `<option value="${supplier.id}">${supplier.name}</option>`)
      .join("")}
  `;
  if (selectedSupplierId) {
    selectElement.value = String(selectedSupplierId);
  }
}

function populateDepartmentSelect(selectElement, selectedDepartmentId = null) {
  if (!selectElement) return;
  selectElement.innerHTML = `
    <option value="">Sin departamento</option>
    ${state.departments
      .map((department) => `<option value="${department.id}">${department.name}</option>`)
      .join("")}
  `;
  if (selectedDepartmentId) {
    selectElement.value = String(selectedDepartmentId);
  }
}

function populatePosDepartmentFilter() {
  const select = document.getElementById("pos-department-filter");
  if (!select) return;
  const currentValue = select.value || "";
  select.innerHTML = `
    <option value="">Todos los departamentos</option>
    ${state.departments
      .map((department) => `<option value="${department.id}">${department.name}</option>`)
      .join("")}
  `;
  if (currentValue && state.departments.some((department) => String(department.id) === currentValue)) {
    select.value = currentValue;
  }
}

function getSelectedPosDepartmentId() {
  const departmentFilter = document.getElementById("pos-department-filter");
  return Number(departmentFilter?.value || 0);
}

function renderPosDepartmentChips() {
  const chipsContainer = document.getElementById("pos-department-chips");
  const departmentFilter = document.getElementById("pos-department-filter");
  if (!chipsContainer || !departmentFilter) return;

  const selectedDepartmentId = getSelectedPosDepartmentId();
  chipsContainer.innerHTML = `
    <button type="button" class="department-chip ${selectedDepartmentId ? "" : "active"}" data-department-id="">
      Todos
    </button>
    ${state.departments
      .map(
        (department) => `
      <button
        type="button"
        class="department-chip ${selectedDepartmentId === Number(department.id) ? "active" : ""}"
        data-department-id="${department.id}"
      >
        ${department.name}
      </button>
    `
      )
      .join("")}
  `;

  chipsContainer.querySelectorAll(".department-chip").forEach((button) => {
    button.addEventListener("click", () => {
      departmentFilter.value = button.dataset.departmentId || "";
      renderPosDepartmentChips();
      renderProducts();
    });
  });
}

function renderProducts() {
  const grid = document.getElementById("product-grid");
  if (!grid) return;
  if (!isSaleSessionUnlocked()) {
    grid.innerHTML =
      '<div class="empty">Venta bloqueada. Ingresa tu clave en la ventana emergente.</div>';
    return;
  }
  const searchInput = document.getElementById("product-search");
  const term = (searchInput?.value || "").trim().toLowerCase();
  const selectedDepartmentId = getSelectedPosDepartmentId();
  const items = state.products.filter((product) => {
    const barcodeValue = getProductBarcodeValue(product).toLowerCase();
    const schoolSearchBlob = [
      product.school_category,
      product.school_grade,
      product.school_brand,
      product.school_variant,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const matchesText =
      !term ||
      product.name.toLowerCase().includes(term) ||
      product.sku.toLowerCase().includes(term) ||
      barcodeValue.includes(term) ||
      (product.department_name || "").toLowerCase().includes(term) ||
      schoolSearchBlob.includes(term);
    const matchesDepartment = !selectedDepartmentId || Number(product.department_id || 0) === selectedDepartmentId;
    return matchesText && matchesDepartment;
  });

  if (!items.length) {
    grid.innerHTML = '<div class="empty">No hay productos.</div>';
    return;
  }

  grid.innerHTML = items
    .map(
      (product) => `
    <article class="product-card ${
      product.tracks_inventory !== 0 && Number(product.stock || 0) <= 0 ? "out-of-stock" : ""
    }" data-id="${product.id}">
      <h3>${product.name}</h3>
      <p>${getProductBarcodeValue(product)} · ${product.department_name || "Sin departamento"} · ${
        product.tracks_inventory === 0 ? "Sin control de inventario" : `Stock: ${product.stock}`
      }</p>
      ${
        hasProductExtraFields()
          ? `<p>${formatProductExtraDetail(product) || getProductExtraFieldsCopy().emptyDetail || "Sin detalle"}</p>`
          : ""
      }
      ${getWholesaleHint(product) ? `<p>${getWholesaleHint(product)}</p>` : ""}
      <strong>${money(product.price)}</strong>
    </article>
  `
    )
    .join("");

  grid.querySelectorAll(".product-card").forEach((card) => {
    const product = state.products.find((item) => item.id === Number(card.dataset.id));
    if (!product || (product.tracks_inventory !== 0 && Number(product.stock || 0) <= 0)) {
      return;
    }
    card.addEventListener("click", () => addToCart(Number(card.dataset.id)));
  });
}

function renderCart() {
  const container = document.getElementById("cart-items");
  state.cart = state.cart
    .map((line) => {
      const product = state.products.find((item) => item.id === line.id);
      const tracksInventory = product?.tracks_inventory !== 0;
      const availableStock = Number(product?.stock || 0);
      const normalizedQty = Number(line.quantity || 0);
      if (!Number.isFinite(normalizedQty) || normalizedQty <= 0) return null;
      if (tracksInventory && availableStock <= 0) return null;
      return {
        ...line,
        quantity: tracksInventory ? Math.min(normalizedQty, availableStock) : normalizedQty,
      };
    })
    .filter(Boolean);

  if (!state.cart.length) {
    container.innerHTML = '<div class="empty">Agrega productos al ticket.</div>';
  } else {
    const productById = new Map(state.products.map((product) => [product.id, product]));
    container.innerHTML = state.cart
      .map((line) => {
        const product = productById.get(line.id);
        const tracksInventory = product?.tracks_inventory !== 0;
        const availableStock = Number(product?.stock || 0);
        const maxReached = tracksInventory && line.quantity >= availableStock;
        return `
      <div class="cart-line">
        <div>
          <strong>${line.name}</strong>
          <small>${money(getEffectiveUnitPrice(line))} c/u · IVA ${(line.tax_rate * 100).toFixed(0)}%</small>
          <small>${
            tracksInventory ? `Disponible: ${formatQuantity(availableStock)}` : "Sin control de inventario"
          }</small>
          ${
            line.wholesale_enabled && line.wholesale_min_qty > 0 && line.wholesale_discount_pct > 0
              ? `<small>Mayoreo: ${line.wholesale_min_qty}+ uds (-${line.wholesale_discount_pct}%)</small>`
              : ""
          }
        </div>
        <div class="qty-controls">
          <button data-action="dec" data-id="${line.id}">-</button>
          <span>${line.quantity}</span>
          <button data-action="inc" data-id="${line.id}" ${maxReached ? "disabled" : ""}>+</button>
        </div>
      </div>
    `
      })
      .join("");

    container.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        const id = Number(button.dataset.id);
        const line = state.cart.find((item) => item.id === id);
        if (!line) return;
        if (button.dataset.action === "inc") {
          const product = state.products.find((item) => item.id === id);
          const tracksInventory = product?.tracks_inventory !== 0;
          const availableStock = Number(product?.stock || 0);
          const currentQty = Number(line.quantity || 0);
          if (tracksInventory && currentQty >= availableStock) {
            alert(`No puedes vender mas de ${formatQuantity(availableStock)} unidades de ${line.name}.`);
            return;
          }
          line.quantity = currentQty + 1;
        }
        if (button.dataset.action === "dec") {
          const currentQty = Number(line.quantity || 0);
          line.quantity = currentQty - 1;
        }
        state.cart = state.cart.filter((item) => item.quantity > 0);
        renderCart();
      });
    });
  }
  renderTotals();
}

function renderTotals() {
  const totals = calcTotals(state.cart);
  const discountAmount = Number(totals.cartDiscount || 0);
  document.getElementById("subtotal").textContent = money(totals.subtotal);
  const discountEl = document.getElementById("cart-discount-display");
  if (discountEl) discountEl.textContent = money(discountAmount);
  document.getElementById("tax-total").textContent = money(totals.taxTotal);
  document.getElementById("grand-total").textContent = money(totals.total);

  const discountRow = document.getElementById("totals-discount-row");
  const discountPanel = document.getElementById("discount-panel");
  const discountBadge = document.getElementById("discount-badge");
  const hasDiscount = discountAmount > 0;
  discountRow?.classList.toggle("is-active", hasDiscount);
  discountPanel?.classList.toggle("is-active", hasDiscount);
  if (discountBadge) {
    discountBadge.textContent = hasDiscount ? `Ahorro ${money(discountAmount)}` : "Sin descuento";
  }

  const input = document.getElementById("cart-discount-input");
  const currentValue = Math.round(Number(input?.value || 0) * 100) / 100;
  document.querySelectorAll(".discount-chip[data-discount]").forEach((chip) => {
    const chipValue = Math.round(Number(chip.dataset.discount || 0) * 100) / 100;
    chip.classList.toggle("is-selected", hasDiscount && chipValue === currentValue && chipValue > 0);
  });
}

function formatPaymentMethodLabel(method) {
  const labels = {
    efectivo: "Efectivo",
    tarjeta: "Tarjeta",
    transferencia: "Transferencia",
    credito: "Credito",
    mixto: "Pago mixto",
  };
  return labels[method] || method;
}

function formatSalePayments(sale) {
  const payments = sale.payments || [];
  if (!payments.length) {
    return formatPaymentMethodLabel(sale.payment_method || "efectivo");
  }
  if (sale.payment_method === "mixto" || payments.length > 1) {
    return payments
      .map((line) => `${formatPaymentMethodLabel(line.payment_method)} ${money(line.amount)}`)
      .join(" + ");
  }
  return formatPaymentMethodLabel(payments[0].payment_method);
}

function closeCurrentSaleDraft() {
  if (state.cart.length) {
    const confirmed = confirm("Se cerrara la venta actual y se limpiara el ticket. Deseas continuar?");
    if (!confirmed) return;
  }
  state.cart = [];
  const cashDialog = document.getElementById("cash-checkout-dialog");
  if (cashDialog?.open) {
    cashDialog.close();
  }
  const mixedDialog = document.getElementById("mixed-checkout-dialog");
  if (mixedDialog?.open) {
    mixedDialog.close();
  }
  resetSaleCustomerDefaults();
  renderCart();
  if (isCashierSaleLockEnabled() && state.saleSessionUnlocked) {
    resetSaleSessionAutoLockTimer();
    renderSaleSessionIndicator();
  }
}

function updateCashCheckoutChange() {
  const changeEl = document.getElementById("cash-checkout-change");
  if (!changeEl) return;
  const totals = calcTotals(state.cart);
  const cashReceived = Number(document.getElementById("cash-checkout-received")?.value || 0);
  const change = Math.round((cashReceived - totals.total) * 100) / 100;
  changeEl.textContent = money(change > 0 ? change : 0);
}

function openCashCheckoutDialog() {
  const paymentMethod = document.getElementById("payment-method")?.value || "efectivo";
  if (paymentMethod === "mixto") {
    openMixedCheckoutDialog();
    return;
  }
  const dialog = document.getElementById("cash-checkout-dialog");
  const totalEl = document.getElementById("cash-checkout-total");
  const receivedInput = document.getElementById("cash-checkout-received");
  const printModeEl = document.getElementById("cash-checkout-print-mode");
  if (!dialog || !totalEl || !receivedInput) return;
  if (!ensureCashOwnership("cobrar")) return;

  const totals = calcTotals(state.cart);
  totalEl.textContent = money(totals.total);
  if (printModeEl) {
    printModeEl.textContent = "Captura efectivo (F12). Cobro final: F1 imprime, F2 no imprime.";
  }
  receivedInput.value = totals.total.toFixed(2);
  updateCashCheckoutChange();
  dialog.showModal();
  setTimeout(() => receivedInput.focus(), 0);
}

function updateMixedCheckoutAmounts() {
  const totals = calcTotals(state.cart);
  const total = totals.total;
  const cashAmount = Math.round(Number(document.getElementById("mixed-cash-amount")?.value || 0) * 100) / 100;
  const otherAmount = Math.round(Math.max(total - cashAmount, 0) * 100) / 100;
  const otherEl = document.getElementById("mixed-other-amount");
  if (otherEl) otherEl.textContent = money(otherAmount);

  const cashReceived = Number(document.getElementById("mixed-cash-received")?.value || 0);
  const change = Math.round((cashReceived - cashAmount) * 100) / 100;
  const changeEl = document.getElementById("mixed-cash-change");
  if (changeEl) changeEl.textContent = money(change > 0 ? change : 0);
}

function openMixedCheckoutDialog() {
  const dialog = document.getElementById("mixed-checkout-dialog");
  const totalEl = document.getElementById("mixed-checkout-total");
  const cashAmountInput = document.getElementById("mixed-cash-amount");
  const cashReceivedInput = document.getElementById("mixed-cash-received");
  if (!dialog || !totalEl || !cashAmountInput || !cashReceivedInput) return;
  if (!ensureCashOwnership("cobrar")) return;

  const totals = calcTotals(state.cart);
  totalEl.textContent = money(totals.total);
  const suggestedCash = Math.round(totals.total * 0.5 * 100) / 100;
  cashAmountInput.value = suggestedCash.toFixed(2);
  cashReceivedInput.value = suggestedCash.toFixed(2);
  document.getElementById("mixed-other-method").value = "tarjeta";
  updateMixedCheckoutAmounts();
  dialog.showModal();
  setTimeout(() => cashAmountInput.focus(), 0);
}

function buildMixedPaymentsFromDialog() {
  const totals = calcTotals(state.cart);
  const total = totals.total;
  const cashAmount = Math.round(Number(document.getElementById("mixed-cash-amount")?.value || 0) * 100) / 100;
  const otherMethod = document.getElementById("mixed-other-method")?.value || "tarjeta";
  const otherAmount = Math.round((total - cashAmount) * 100) / 100;

  if (cashAmount <= 0 || otherAmount <= 0) {
    throw new Error("El pago mixto debe tener monto en efectivo y en el otro metodo.");
  }
  if (Math.abs(cashAmount + otherAmount - total) > 0.01) {
    throw new Error("Los montos deben sumar exactamente el total de la venta.");
  }

  return [
    { payment_method: "efectivo", amount: cashAmount },
    { payment_method: otherMethod, amount: otherAmount },
  ];
}

async function finalizeMixedCheckout(printTicket = true) {
  const totals = calcTotals(state.cart);
  let payments;
  try {
    payments = buildMixedPaymentsFromDialog();
  } catch (error) {
    alert(error.message);
    return false;
  }

  const cashAmount = payments.find((line) => line.payment_method === "efectivo")?.amount || 0;
  const cashReceived = Number(document.getElementById("mixed-cash-received")?.value || 0);
  if (cashReceived < cashAmount) {
    const missing = Math.round((cashAmount - cashReceived) * 100) / 100;
    alert(`Efectivo insuficiente para la parte en efectivo. Faltan ${money(missing)}.`);
    return false;
  }

  const success = await processCheckout("mixto", cashReceived, printTicket, payments);
  if (success) {
    document.getElementById("mixed-checkout-dialog")?.close();
  }
  return success;
}

async function addToCart(productId) {
  const unlocked = await ensureSaleSessionUnlocked();
  if (!unlocked) return;
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  const tracksInventory = product.tracks_inventory !== 0;
  const availableStock = Number(product.stock || 0);
  if (tracksInventory && availableStock <= 0) {
    alert(`Producto sin existencia: ${product.name}.`);
    return;
  }
  const existing = state.cart.find((item) => item.id === productId);
  if (existing) {
    if (tracksInventory && existing.quantity >= availableStock) {
      alert(`No puedes vender mas de ${formatQuantity(availableStock)} unidades de ${product.name}.`);
      return;
    }
    existing.quantity += 1;
  } else {
    state.cart.push({
      id: product.id,
      name: product.name,
      base_price: product.price,
      tax_rate: product.tax_rate,
      wholesale_enabled: product.wholesale_enabled === 1,
      wholesale_min_qty: Number(product.wholesale_min_qty || 0),
      wholesale_discount_pct: Number(product.wholesale_discount_pct || 0),
      quantity: 1,
    });
  }
  renderCart();
}

function findProductsByExactCode(rawCode) {
  const raw = String(rawCode || "").trim();
  if (!raw) return [];
  const term = raw.toLowerCase();
  const normalized = normalizeBarcodeValue(raw);
  return state.products.filter((product) => {
    const sku = String(product.sku || "").trim().toLowerCase();
    const barcode = normalizeBarcodeValue(product.barcode || "");
    const skuNormalized = normalizeBarcodeValue(product.sku || "");
    return sku === term || barcode === normalized || skuNormalized === normalized;
  });
}

async function addProductFromSearchEnter() {
  const searchInput = document.getElementById("product-search");
  if (!searchInput || searchInput.disabled) return;
  const raw = (searchInput.value || "").trim();
  if (!raw) return;

  let matches = findProductsByExactCode(raw);
  if (!matches.length) {
    const term = raw.toLowerCase();
    const selectedDepartmentId = getSelectedPosDepartmentId();
    matches = state.products.filter((product) => {
      const barcodeValue = getProductBarcodeValue(product).toLowerCase();
      const matchesText =
        product.name.toLowerCase().includes(term) ||
        String(product.sku || "")
          .toLowerCase()
          .includes(term) ||
        barcodeValue.includes(term);
      const matchesDepartment =
        !selectedDepartmentId || Number(product.department_id || 0) === selectedDepartmentId;
      return matchesText && matchesDepartment;
    });
  }

  if (!matches.length) {
    alert(`No se encontro producto con codigo: ${raw}`);
    searchInput.select();
    return;
  }
  if (matches.length > 1) {
    alert(`Hay ${matches.length} coincidencias. Escribe el codigo exacto o elige el producto en la lista.`);
    renderProducts();
    return;
  }

  await addToCart(matches[0].id);
  searchInput.value = "";
  renderProducts();
  searchInput.focus();
}

function syncProductInventoryFields() {
  const form = document.getElementById("product-form");
  if (!form?.tracks_inventory) return;
  const enabled = form.tracks_inventory.checked;
  form.stock.disabled = !enabled;
  form.min_stock.disabled = !enabled;
  document.getElementById("product-stock-label")?.classList.toggle("disabled", !enabled);
  document.getElementById("product-min-stock-label")?.classList.toggle("disabled", !enabled);
}

function openProductEditor(productId = null) {
  const productDialog = document.getElementById("product-dialog");
  const title = document.getElementById("product-dialog-title");
  const form = document.getElementById("product-form");
  const supplierSelect = document.getElementById("product-supplier-select");
  const departmentSelect = document.getElementById("product-department-select");
  populateSupplierSelect(supplierSelect);
  populateDepartmentSelect(departmentSelect);
  syncProductSchoolFieldsUi();
  syncProductBarcodeGenerateButton();

  state.editingProductId = productId;
  const profileCopy = getBusinessProfileCopy();
  if (!productId) {
    title.textContent = profileCopy.labels.newProductDialog || "Nuevo producto";
    form.reset();
    form.barcode.value = "";
    form.description.value = "";
    form.tax_rate.value = "12";
    form.tracks_inventory.checked = true;
    form.wholesale_enabled.checked = false;
    form.wholesale_min_qty.value = "0";
    form.wholesale_discount_pct.value = "0";
    form.min_stock.value = "0";
    form.school_category.value = "";
    form.school_grade.value = "";
    form.school_brand.value = "";
    form.school_variant.value = "";
    supplierSelect.value = "";
    departmentSelect.value = "";
    syncProductInventoryFields();
    productDialog.showModal();
    return;
  }

  const product = state.products.find((item) => item.id === productId);
  if (!product) return;

  const editPrefix = profileCopy.labels.editProductDialogPrefix || "Editar producto";
  title.textContent = `${editPrefix} #${product.id}`;
  form.sku.value = product.sku;
  form.barcode.value = product.barcode || "";
  form.name.value = product.name;
  form.description.value = product.description || "";
  form.price.value = product.price;
  form.cost.value = product.cost;
  form.stock.value = product.stock;
  form.min_stock.value = product.min_stock || 0;
  form.tracks_inventory.checked = product.tracks_inventory !== 0;
  form.tax_rate.value = Number(product.tax_rate * 100).toFixed(2);
  form.wholesale_enabled.checked = product.wholesale_enabled === 1;
  form.wholesale_min_qty.value = product.wholesale_min_qty || 0;
  form.wholesale_discount_pct.value = product.wholesale_discount_pct || 0;
  form.school_category.value = product.school_category || "";
  form.school_grade.value = product.school_grade || "";
  form.school_brand.value = product.school_brand || "";
  form.school_variant.value = product.school_variant || "";
  supplierSelect.value = product.supplier_id ? String(product.supplier_id) : "";
  departmentSelect.value = product.department_id ? String(product.department_id) : "";
  syncProductInventoryFields();
  productDialog.showModal();
}

function openStockEntryDialog(productId, productName) {
  state.stockEntryProductId = productId;
  const dialog = document.getElementById("stock-entry-dialog");
  const title = document.getElementById("stock-entry-title");
  const form = document.getElementById("stock-entry-form");
  title.textContent = `Ingreso de inventario · ${productName}`;
  form.reset();
  dialog.showModal();
}

async function generateProductBarcode(productId, { notify = true } = {}) {
  try {
    const updated = await api(`/api/products/${productId}/generate-barcode`, { method: "POST" });
    const index = state.products.findIndex((item) => Number(item.id) === Number(productId));
    if (index >= 0) {
      state.products[index] = updated;
    }
    renderProducts();
    renderProductsTable();
    if (notify) {
      const detail = productDescriptionHint(updated);
      alert(`Codigo listo: ${updated.barcode || updated.sku}\n${detail}`);
    }
    return updated;
  } catch (error) {
    alert(error.message);
    return null;
  }
}

async function generateMissingBarcodes() {
  const missingCount = state.products.filter((product) => !product.barcode).length;
  if (!missingCount) {
    alert("Todos los productos activos ya tienen codigo de barras.");
    return;
  }
  const confirmed = confirm(
    `Se generaran codigos para ${missingCount} producto(s) sin codigo de barras. Deseas continuar?`
  );
  if (!confirmed) return;
  try {
    const result = await api("/api/products/generate-missing-barcodes", { method: "POST" });
    await loadData();
    alert(result.message || `Se generaron ${result.generated_count} codigo(s).`);
  } catch (error) {
    alert(error.message);
  }
}

function openEleventaImportDialog() {
  const dialog = document.getElementById("eleventa-import-dialog");
  const form = document.getElementById("eleventa-import-form");
  const result = document.getElementById("eleventa-import-result");
  if (!dialog || !form) return;
  form.reset();
  document.getElementById("eleventa-import-update-existing").checked = true;
  document.getElementById("eleventa-import-update-stock").checked = true;
  document.getElementById("eleventa-import-default-supplier").value = "Importado inventario";
  if (result) {
    result.hidden = true;
    result.textContent = "";
  }
  dialog.showModal();
}

async function importEleventaCatalog(event) {
  event.preventDefault();
  const fileInput = document.getElementById("eleventa-import-file");
  const submitBtn = document.getElementById("eleventa-import-submit-btn");
  const resultBox = document.getElementById("eleventa-import-result");
  const file = fileInput?.files?.[0];
  if (!file) {
    alert("Selecciona el archivo de inventario para importar.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append(
    "update_existing",
    document.getElementById("eleventa-import-update-existing")?.checked ? "true" : "false"
  );
  formData.append(
    "update_stock",
    document.getElementById("eleventa-import-update-stock")?.checked ? "true" : "false"
  );
  formData.append(
    "default_supplier_name",
    document.getElementById("eleventa-import-default-supplier")?.value?.trim() || "Importado inventario"
  );

  if (submitBtn) submitBtn.disabled = true;
  try {
    const result = await api("/api/products/import/eleventa", {
      method: "POST",
      body: formData,
    });
    await loadData();
    const errorText = result.errors?.length
      ? `\n\nAvisos (${result.errors.length}):\n${result.errors.slice(0, 8).join("\n")}`
      : "";
    const summary =
      `${result.message}\n` +
      `Departamentos nuevos: ${result.departments_created}\n` +
      `Proveedores nuevos: ${result.suppliers_created}` +
      errorText;
    if (resultBox) {
      resultBox.hidden = false;
      resultBox.textContent = summary;
    }
    alert(summary);
    document.getElementById("eleventa-import-dialog")?.close();
  } catch (error) {
    alert(error.message);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

function syncProductBarcodeGenerateButton() {
  const button = document.getElementById("product-generate-barcode-btn");
  if (!button) return;
  const canGenerate = Boolean(state.editingProductId) && state.user?.role === "admin";
  button.disabled = !canGenerate;
  button.title = canGenerate
    ? "Genera codigo interno FEL para este producto"
    : "Guarda el producto primero para generar codigo automatico";
}

async function generateBarcodeFromProductForm() {
  if (!state.editingProductId) {
    alert("Guarda el producto primero para generar codigo automatico.");
    return;
  }
  const updated = await generateProductBarcode(state.editingProductId, { notify: false });
  if (!updated) return;
  const form = document.getElementById("product-form");
  if (form?.barcode) {
    form.barcode.value = updated.barcode || "";
  }
  alert(`Codigo generado: ${updated.barcode}\n${productDescriptionHint(updated)}`);
}

function productDescriptionHint(product) {
  if (!product) return "";
  const parts = [product.name];
  if (product.description) parts.push(product.description);
  if (product.sku) parts.push(`SKU ${product.sku}`);
  return parts.join(" · ");
}

async function saveProductDescription(productId, description) {
  const cleaned = (description || "").trim() || null;
  const updated = await api(`/api/products/${productId}`, {
    method: "PUT",
    body: JSON.stringify({ description: cleaned }),
  });
  const index = state.products.findIndex((item) => Number(item.id) === Number(productId));
  if (index >= 0) {
    state.products[index] = updated;
  }
  return updated;
}

async function openBarcodeLabelDialog(productId) {
  let product = state.products.find((item) => Number(item.id) === Number(productId));
  if (!product) return;

  let labelCode = getLabelPrintCode(product);
  if (!labelCode) {
    const confirmed = confirm(
      `El producto ${product.name} no tiene codigo de barras ni SKU. Deseas generar un codigo automaticamente ahora?`
    );
    if (!confirmed) return;
    const generated = await generateProductBarcode(product.id, { notify: false });
    if (!generated) return;
    product = generated;
    labelCode = getLabelPrintCode(product);
  }

  let printable = sanitizeCode39Value(labelCode);
  if (!printable) {
    if (!getStoredBarcodeValue(product)) {
      const confirmed = confirm(
        `El SKU "${labelCode}" no se puede imprimir como codigo de barras.\n` +
          `Deseas generar un codigo FEL imprimible?`
      );
      if (!confirmed) return;
      const generated = await generateProductBarcode(product.id, { notify: false });
      if (!generated) return;
      product = generated;
      printable = sanitizeCode39Value(getLabelPrintCode(product));
    }
    if (!printable) {
      alert(
        `El codigo "${labelCode}" tiene caracteres no validos para etiqueta.\n` +
          `Edita el producto y usa solo letras A-Z, numeros y - . espacio $ / + %`
      );
      return;
    }
  }

  if (!state.labelPrinterConfig) {
    try {
      state.labelPrinterConfig = await api("/api/config/label-printer");
    } catch (_error) {
      state.labelPrinterConfig = null;
    }
  }

  state.barcodeLabelProductId = product.id;
  const dialog = document.getElementById("barcode-label-dialog");
  const productNameEl = document.getElementById("barcode-label-product-name");
  const codeEl = document.getElementById("barcode-label-current-code");
  const descriptionEl = document.getElementById("barcode-label-description");
  const qtyInput = document.getElementById("barcode-label-quantity");
  const generateBtn = document.getElementById("barcode-label-generate-btn");
  const printerSelect = document.getElementById("barcode-label-printer");
  const printModeSelect = document.getElementById("barcode-label-print-mode");
  if (productNameEl) productNameEl.textContent = `Producto: ${product.name}`;
  if (codeEl) {
    const source = getStoredBarcodeValue(product) ? "codigo de barras" : "SKU";
    codeEl.textContent = `Codigo a imprimir (${source}): ${printable}`;
  }
  if (descriptionEl) descriptionEl.value = product.description || "";
  if (qtyInput) qtyInput.value = "1";
  if (generateBtn) generateBtn.hidden = Boolean(getStoredBarcodeValue(product));

  if (printerSelect) {
    const cfg = state.labelPrinterConfig || {};
    const printers = cfg.available_printers || [];
    const selected = cfg.printer_name || "";
    printerSelect.innerHTML = [
      `<option value="">Usar configurada (${escapeHtml(cfg.active_printer || "predeterminada")})</option>`,
      ...printers.map(
        (name) =>
          `<option value="${escapeHtml(name)}" ${name === selected ? "selected" : ""}>${escapeHtml(name)}</option>`
      ),
    ].join("");
  }
  if (printModeSelect) {
    printModeSelect.value = state.labelPrinterConfig?.printer_name || state.labelPrinterConfig?.active_printer
      ? "thermal"
      : "browser";
  }
  syncBarcodeLabelPrinterVisibility();
  dialog?.showModal();
}

function syncBarcodeLabelPrinterVisibility() {
  const printMode = document.getElementById("barcode-label-print-mode")?.value;
  const wrap = document.getElementById("barcode-label-printer-wrap");
  if (wrap) wrap.hidden = printMode !== "thermal";
}

function printBarcodeLabels(product, quantity, widthMm, heightMm, options = {}) {
  const rawCode = options.code || getLabelPrintCode(product);
  const barcodeValue = sanitizeCode39Value(rawCode);
  if (!barcodeValue) {
    alert(
      rawCode
        ? `El codigo "${rawCode}" no es valido para etiqueta.`
        : "Este producto no tiene codigo de barras ni SKU."
    );
    return;
  }
  const labelsQty = Math.max(1, Math.min(300, Math.round(Number(quantity || 1))));
  const labelWidth = Math.max(20, Math.min(120, Number(widthMm || 50)));
  const labelHeight = Math.max(15, Math.min(80, Number(heightMm || 30)));
  const includePrice = Boolean(options.includePrice);
  const includeDescription = options.includeDescription !== false;
  const descriptionText = (options.description || product.description || "").trim();
  const barcodeSvg = buildCode39Svg(barcodeValue, {
    narrow: 2,
    wide: 5,
    barHeight: Math.max(24, Math.round(labelHeight * 1.35)),
    fontSize: 11,
  });

  const printWindow = window.open("", "_blank", "width=900,height=760");
  if (!printWindow) {
    alert("No se pudo abrir la ventana de impresion.");
    return;
  }

  const labels = Array.from({ length: labelsQty }, () => {
    return `
      <article class="label">
        <div class="name">${escapeHtml(product.name)}</div>
        ${includeDescription && descriptionText ? `<div class="desc">${escapeHtml(descriptionText)}</div>` : ""}
        ${includePrice ? `<div class="price">${escapeHtml(money(product.price))}</div>` : ""}
        <div class="code">${escapeHtml(barcodeValue)}</div>
        <div class="barcode">${barcodeSvg}</div>
      </article>
    `;
  }).join("");

  printWindow.document.write(`
    <!doctype html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>Etiquetas ${escapeHtml(product.name)}</title>
      <style>
        @page { margin: 3mm; }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: Segoe UI, Arial, sans-serif; color: #111; }
        .sheet { display: flex; flex-wrap: wrap; gap: 2mm; padding: 2mm; }
        .label {
          width: ${labelWidth}mm;
          height: ${labelHeight}mm;
          border: 1px solid #333;
          padding: 1.4mm;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }
        .name { font-size: 10px; font-weight: 600; line-height: 1.05; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .desc { font-size: 8px; line-height: 1.1; max-height: 2.2em; overflow: hidden; }
        .price { font-size: 9px; font-weight: 600; line-height: 1.05; }
        .code { font-size: 9px; letter-spacing: 0.4px; line-height: 1.05; }
        .barcode { width: 100%; height: calc(100% - 22px); display: grid; align-items: end; }
        .barcode svg { width: 100%; height: 100%; }
      </style>
    </head>
    <body>
      <main class="sheet">${labels}</main>
    </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

function submitBarcodeLabelForm(event) {
  event.preventDefault();
  if (!state.barcodeLabelProductId) {
    alert("Selecciona un producto.");
    return;
  }
  const product = state.products.find((item) => Number(item.id) === Number(state.barcodeLabelProductId));
  if (!product) {
    alert("Producto no encontrado.");
    return;
  }
  const form = event.target;
  const quantity = Number(form.quantity.value || 1);
  const widthMm = Number(form.width_mm.value || 50);
  const heightMm = Number(form.height_mm.value || 30);
  const printMode = form.print_mode?.value === "browser" ? "browser" : "thermal";
  const includePrice = Boolean(form.include_price?.checked);
  const includeDescription = Boolean(form.include_description?.checked);
  const description = (form.description?.value || "").trim();
  const printerName = (form.printer_name?.value || "").trim() || null;
  const run = async () => {
    let workingProduct = product;
    let printCode = sanitizeCode39Value(getLabelPrintCode(workingProduct));
    if (!printCode) {
      const generated = await generateProductBarcode(workingProduct.id, { notify: false });
      if (!generated) return;
      workingProduct = generated;
      printCode = sanitizeCode39Value(getLabelPrintCode(workingProduct));
    }
    if (!printCode) {
      alert("No hay un codigo imprimible para este producto.");
      return;
    }
    if (description !== (product.description || "").trim()) {
      workingProduct = await saveProductDescription(workingProduct.id, description);
      renderProductsTable();
    }
    if (printMode === "thermal") {
      const result = await api(`/api/products/${workingProduct.id}/print-labels`, {
        method: "POST",
        body: JSON.stringify({
          quantity,
          include_price: includePrice,
          include_description: includeDescription,
          description: description || null,
          mode: "thermal",
          width_mm: widthMm,
          height_mm: heightMm,
          printer_name: printerName,
        }),
      });
      alert(result.message || "Etiquetas enviadas a impresora.");
      document.getElementById("barcode-label-dialog")?.close();
      state.barcodeLabelProductId = null;
      return;
    }
    printBarcodeLabels(workingProduct, quantity, widthMm, heightMm, {
      includePrice,
      includeDescription,
      description,
      code: printCode,
    });
    document.getElementById("barcode-label-dialog")?.close();
    state.barcodeLabelProductId = null;
  };
  run().catch((error) => {
    alert(error.message || error);
  });
}

async function refreshLowStockProducts() {
  try {
    state.lowStockProducts = await api("/api/products/low-stock");
    state.lowStockReport = await api("/api/products/low-stock/report");
  } catch (error) {
    state.lowStockProducts = [];
    state.lowStockReport = [];
    alert(error.message || "No se pudo cargar inventario bajo.");
  }
}

async function refreshStockCountData() {
  const requests = [
    api("/api/stock-count/sessions/current"),
    api("/api/stock-count/sessions"),
  ];
  if (state.user?.role === "admin") {
    requests.push(api("/api/config/scanner-bridge").catch(() => null));
  }
  const results = await Promise.all(requests);
  state.stockCountCurrent = results[0];
  state.stockCountSessions = results[1];
  if (state.user?.role === "admin") {
    state.scannerBridgeConfig = results[2];
  }
}

function stockCountStatusLabel(status) {
  if (status === "open") return "Abierta";
  if (status === "applied") return "Aplicada";
  return status || "-";
}

function stockCountActionLabel(actionType) {
  if (actionType === "scan_add") return "Escaneo +";
  if (actionType === "scan_replace") return "Escaneo reemplazo";
  if (actionType === "manual_set") return "Ajuste manual";
  if (actionType === "line_removed") return "Linea eliminada";
  if (actionType === "recount_reset") return "Reconteo";
  return actionType || "-";
}

function getStockCountDifferenceItems(order) {
  return [...(order?.items || [])]
    .filter((item) => Math.abs(Number(item.difference_quantity || 0)) >= 0.0001)
    .sort((a, b) => Math.abs(Number(b.difference_quantity || 0)) - Math.abs(Number(a.difference_quantity || 0)));
}

function getStockCountDepartmentOptions(selectedDepartmentId = null) {
  const selected = selectedDepartmentId ? String(selectedDepartmentId) : "";
  return state.departments
    .map(
      (department) =>
        `<option value="${department.id}" ${selected === String(department.id) ? "selected" : ""}>${
          department.name
        }</option>`
    )
    .join("");
}

function renderStockCountPanel() {
  const container = document.getElementById("stock-count-panel");
  if (!container) return;

  const current = state.stockCountCurrent;
  const hasOpenSession = current?.status === "open";
  const isAdmin = state.user?.role === "admin";
  const applyButton = document.getElementById("stock-count-apply-btn");
  const printOrderButton = document.getElementById("stock-count-print-order-btn");
  const printDiffButton = document.getElementById("stock-count-print-diff-btn");
  const recountButton = document.getElementById("stock-count-recount-btn");
  if (applyButton) {
    applyButton.disabled = !isAdmin || !hasOpenSession || !(current?.items || []).length;
  }
  if (printOrderButton) {
    printOrderButton.disabled = !current;
  }
  if (printDiffButton) {
    printDiffButton.disabled = !current;
  }
  if (recountButton) {
    recountButton.disabled = !isAdmin || !hasOpenSession;
  }

  const recentRows = (state.stockCountSessions || [])
    .map(
      (session) => `
      <tr>
        <td>#${session.id}</td>
        <td>${escapeHtml(session.order_code || "-")}</td>
        <td>${escapeHtml(session.department_name || "-")}</td>
        <td>${new Date(session.created_at).toLocaleString("es-GT")}</td>
        <td>${stockCountStatusLabel(session.status)}</td>
        <td>${session.totals.total_lines}</td>
        <td>${formatQuantity(session.totals.missing_units)}</td>
        <td>${formatQuantity(session.totals.extra_units)}</td>
        <td>${money(session.totals.estimated_loss)}</td>
      </tr>
    `
    )
    .join("");

  if (!current) {
    const hasDepartments = state.departments.length > 0;
    container.innerHTML = `
      <div class="stock-count-layout">
        ${renderStockCountScannerBridgeQuick()}
        <p class="hint">
          Debes crear una orden de conteo con codigo y departamento para habilitar escaneo.
        </p>
        <p class="hint">App celular: abre <strong>/mobile</strong> o usa la APK con lector de camara.</p>
        ${
          hasDepartments
            ? `
            <form id="stock-count-order-form" class="stock-count-scan-box">
              <label>
                Codigo de orden
                <input id="stock-count-order-code" name="order_code" placeholder="Ej. OC-LACT-001" autocomplete="off" required>
              </label>
              <label>
                Departamento
                <select id="stock-count-order-department" name="department_id" required>
                  <option value="">Selecciona departamento</option>
                  ${getStockCountDepartmentOptions()}
                </select>
              </label>
              <button id="stock-count-inline-start-btn" class="btn primary" type="submit">Crear orden de conteo</button>
              <span class="hint">Sin orden no se permite escanear.</span>
            </form>
          `
            : '<p class="hint">No hay departamentos activos. Primero crea un departamento para poder abrir orden de conteo.</p>'
        }
        <div class="table-wrap">
          <h3>Reporte reciente</h3>
          ${
            recentRows
              ? `
              <table>
                <thead>
                  <tr>
                    <th>Sesion</th>
                    <th>Codigo</th>
                    <th>Departamento</th>
                    <th>Fecha</th>
                    <th>Estado</th>
                    <th>Lineas</th>
                    <th>Faltante uds</th>
                    <th>Sobrante uds</th>
                    <th>Perdida estimada</th>
                  </tr>
                </thead>
                <tbody>${recentRows}</tbody>
              </table>
            `
              : '<div class="empty">No hay sesiones de conteo registradas.</div>'
          }
        </div>
      </div>
    `;
    document.getElementById("stock-count-order-form")?.addEventListener("submit", startStockCountSession);
    bindStockCountScannerBridgeActions(container);
    return;
  }

  const items = [...(current.items || [])].sort(
    (a, b) => Math.abs(Number(b.difference_quantity || 0)) - Math.abs(Number(a.difference_quantity || 0))
  );
  const differenceItems = getStockCountDifferenceItems(current);
  const logs = [...(current.logs || [])]
    .sort((a, b) => new Date(b.scanned_at) - new Date(a.scanned_at))
    .slice(0, 60);
  container.innerHTML = `
    <div class="stock-count-layout">
      ${renderStockCountScannerBridgeQuick()}
      <div class="row">
        <span>Sesion actual</span>
        <strong>#${current.id} · ${stockCountStatusLabel(current.status)}</strong>
      </div>
      <div class="row">
        <span>Codigo orden</span>
        <strong>${escapeHtml(current.order_code || "-")}</strong>
      </div>
      <div class="row">
        <span>Departamento</span>
        <strong>${escapeHtml(current.department_name || "-")}</strong>
      </div>
      <div class="row">
        <span>Creada</span>
        <strong>${new Date(current.created_at).toLocaleString("es-GT")}</strong>
      </div>
      ${
        current.notes
          ? `<div class="row"><span>Notas</span><strong>${escapeHtml(current.notes)}</strong></div>`
          : ""
      }
      ${
        hasOpenSession
          ? `
          <form id="stock-count-scan-form" class="stock-count-scan-box">
            <label>
              SKU / codigo de barras
              <input id="stock-count-scan-sku" name="sku" placeholder="Escanea o escribe SKU" autocomplete="off" required>
            </label>
            <label>
              Cantidad
              <input id="stock-count-scan-qty" name="counted_quantity" type="number" min="0.01" step="0.01" value="1" required>
            </label>
            <button class="btn primary" type="submit">Agregar conteo</button>
            <button class="btn ghost" id="stock-count-focus-sku-btn" type="button">Enfocar escaner</button>
          </form>
          <p class="hint">Cada producto escaneado se guarda automaticamente hasta cerrar conteo.</p>
          ${
            isAdmin
              ? '<p class="hint">Como admin puedes cerrar conteo y ajustar, o mandar reconteo.</p>'
              : '<p class="hint">Solo admin puede cerrar conteo con ajuste o mandar reconteo.</p>'
          }
          <p class="hint">Para telefono usa la APK o ${escapeHtml(state.scannerBridgeConfig?.mobile_url_hint || "http://IP-DE-TU-PC:8000/mobile")}</p>
        `
          : `<p class="hint">Esta sesion ya fue aplicada. Inicia una nueva para seguir contando.</p>`
      }
      <div class="stock-count-summary">
        <div class="inventory-kpi">
          <div class="label">Lineas</div>
          <div class="value">${current.totals.total_lines}</div>
        </div>
        <div class="inventory-kpi critical">
          <div class="label">Faltantes (uds)</div>
          <div class="value">${formatQuantity(current.totals.missing_units)}</div>
        </div>
        <div class="inventory-kpi warning">
          <div class="label">Sobrantes (uds)</div>
          <div class="value">${formatQuantity(current.totals.extra_units)}</div>
        </div>
        <div class="inventory-kpi">
          <div class="label">Perdida estimada</div>
          <div class="value loss">${money(current.totals.estimated_loss)}</div>
        </div>
      </div>
      <div class="table-wrap">
        <h3>Reporte de diferencias (tiempo real)</h3>
        <p class="hint">
          Este reporte se actualiza en cada escaneo y compara fisico vs stock del sistema.
        </p>
        ${
          differenceItems.length
            ? `
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Sistema</th>
                  <th>Fisico</th>
                  <th>Diferencia</th>
                  <th>Impacto costo</th>
                </tr>
              </thead>
              <tbody>
                ${differenceItems
                  .map((item) => {
                    const diff = Number(item.difference_quantity || 0);
                    const statusClass = diff < 0 ? "critical" : "warning";
                    return `
                      <tr>
                        <td>${escapeHtml(item.sku)}</td>
                        <td>${escapeHtml(item.name)}</td>
                        <td>${formatQuantity(item.system_quantity)}</td>
                        <td>${formatQuantity(item.counted_quantity)}</td>
                        <td><span class="status-pill ${statusClass}">${formatSignedQuantity(item.difference_quantity)}</span></td>
                        <td>${money(item.difference_cost)}</td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          `
            : '<div class="empty">Sin diferencias por ahora. El sistema seguira reportando en tiempo real si aparecen.</div>'
        }
      </div>
      <div class="table-wrap">
        <h3>Bitacora de escaneos</h3>
        ${
          logs.length
            ? `
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Usuario</th>
                  <th>Accion</th>
                  <th>Producto</th>
                  <th>Antes</th>
                  <th>Despues</th>
                </tr>
              </thead>
              <tbody>
                ${logs
                  .map(
                    (log) => `
                    <tr>
                      <td>${new Date(log.scanned_at).toLocaleString("es-GT")}</td>
                      <td>${escapeHtml(log.scanned_by_full_name || log.scanned_by_username || "-")}</td>
                      <td>${escapeHtml(stockCountActionLabel(log.action_type))}</td>
                      <td>${escapeHtml(log.sku ? `${log.sku} - ${log.product_name || ""}` : log.note || "-")}</td>
                      <td>${formatQuantity(log.before_counted)}</td>
                      <td>${formatQuantity(log.after_counted)}</td>
                    </tr>
                  `
                  )
                  .join("")}
              </tbody>
            </table>
          `
            : '<div class="empty">Sin eventos de escaneo en esta orden.</div>'
        }
      </div>
      <div class="table-wrap">
        ${
          items.length
            ? `
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Descripcion</th>
                  <th>P. venta</th>
                  <th>P. costo</th>
                  <th>Sistema</th>
                  <th>Fisico</th>
                  <th>Diferencia</th>
                  <th>Impacto costo</th>
                  ${hasOpenSession ? "<th>Acciones</th>" : ""}
                </tr>
              </thead>
              <tbody>
                ${items
                  .map((item) => {
                    const diff = Number(item.difference_quantity || 0);
                    const statusClass = diff < 0 ? "critical" : diff > 0 ? "warning" : "ok";
                    return `
                      <tr>
                        <td>${escapeHtml(item.sku)}</td>
                        <td>${escapeHtml(item.name)}</td>
                        <td>${escapeHtml(item.description || "-")}</td>
                        <td>${money(item.unit_price)}</td>
                        <td>${money(item.unit_cost)}</td>
                        <td>${formatQuantity(item.system_quantity)}</td>
                        <td>
                          ${
                            hasOpenSession
                              ? `<input class="stock-count-item-qty" data-product-id="${item.product_id}" type="number" min="0" step="0.01" value="${item.counted_quantity}">`
                              : formatQuantity(item.counted_quantity)
                          }
                        </td>
                        <td><span class="status-pill ${statusClass}">${formatSignedQuantity(item.difference_quantity)}</span></td>
                        <td>${money(item.difference_cost)}</td>
                        ${
                          hasOpenSession
                            ? `<td><button class="btn ghost stock-count-remove-btn" type="button" data-product-id="${item.product_id}">Quitar</button></td>`
                            : ""
                        }
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>
          `
            : '<div class="empty">Aun no hay productos escaneados en esta sesion.</div>'
        }
      </div>
      <div class="table-wrap">
        <h3>Reporte reciente</h3>
        ${
          recentRows
            ? `
            <table>
              <thead>
                <tr>
                  <th>Sesion</th>
                  <th>Codigo</th>
                  <th>Departamento</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Lineas</th>
                  <th>Faltante uds</th>
                  <th>Sobrante uds</th>
                  <th>Perdida estimada</th>
                </tr>
              </thead>
              <tbody>${recentRows}</tbody>
            </table>
          `
            : '<div class="empty">No hay sesiones de conteo registradas.</div>'
        }
      </div>
    </div>
  `;

  if (hasOpenSession) {
    document.getElementById("stock-count-scan-form")?.addEventListener("submit", scanStockCountItem);
    document.getElementById("stock-count-focus-sku-btn")?.addEventListener("click", () => {
      document.getElementById("stock-count-scan-sku")?.focus();
    });
    container.querySelectorAll(".stock-count-item-qty").forEach((input) => {
      input.addEventListener("change", async () => {
        const productId = Number(input.dataset.productId);
        const countedQuantity = Number(input.value || 0);
        await setStockCountItemQuantity(productId, countedQuantity);
      });
    });
    container.querySelectorAll(".stock-count-remove-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const productId = Number(button.dataset.productId);
        await deleteStockCountItem(productId);
      });
    });
    const skuInput = document.getElementById("stock-count-scan-sku");
    skuInput?.focus();
  }
  bindStockCountScannerBridgeActions(container);
}

function focusStockCountOrderCreation() {
  if (state.stockCountCurrent?.status === "open") {
    alert(
      `Ya existe una orden de conteo abierta (${state.stockCountCurrent.order_code || state.stockCountCurrent.id}).`
    );
    return;
  }
  if (!state.departments.length) {
    alert("No hay departamentos activos. Crea uno primero para abrir orden de conteo.");
    return;
  }
  document.getElementById("stock-count-order-code")?.focus();
}

async function startStockCountSession(event) {
  event.preventDefault();
  if (state.stockCountCurrent?.status === "open") {
    alert(
      `Ya existe una orden de conteo abierta (${state.stockCountCurrent.order_code || state.stockCountCurrent.id}).`
    );
    return;
  }
  const form = event.target;
  const orderCode = String(form.order_code.value || "").trim().toUpperCase();
  const departmentId = Number(form.department_id.value || 0);
  if (!orderCode) {
    alert("Debes ingresar codigo de orden de conteo.");
    return;
  }
  if (!departmentId) {
    alert("Debes seleccionar un departamento para la orden.");
    return;
  }

  try {
    await api("/api/stock-count/sessions", {
      method: "POST",
      body: JSON.stringify({
        order_code: orderCode,
        department_id: departmentId,
        notes: null,
      }),
    });
    await refreshStockCountData();
    renderStockCountPanel();
    alert("Orden de conteo creada. Ya puedes iniciar escaneo.");
  } catch (error) {
    alert(error.message);
  }
}

async function scanStockCountItem(event) {
  event.preventDefault();
  if (!state.stockCountCurrent || state.stockCountCurrent.status !== "open") {
    alert("No hay una sesion de conteo abierta.");
    return;
  }
  const form = event.target;
  const sku = form.sku.value.trim();
  const countedQuantity = Number(form.counted_quantity.value || 0);
  if (!sku) {
    alert("Ingresa o escanea un SKU.");
    return;
  }
  if (!Number.isFinite(countedQuantity) || countedQuantity <= 0) {
    alert("La cantidad debe ser mayor a 0.");
    return;
  }

  try {
    state.stockCountCurrent = await api(`/api/stock-count/sessions/${state.stockCountCurrent.id}/scan`, {
      method: "POST",
      body: JSON.stringify({
        sku,
        counted_quantity: countedQuantity,
        replace_quantity: false,
      }),
    });
    state.stockCountSessions = await api("/api/stock-count/sessions");
    renderStockCountPanel();
    form.sku.value = "";
    form.counted_quantity.value = "1";
    form.sku.focus();
  } catch (error) {
    alert(error.message);
  }
}

async function setStockCountItemQuantity(productId, countedQuantity) {
  if (!state.stockCountCurrent || state.stockCountCurrent.status !== "open") return;
  if (!Number.isFinite(countedQuantity) || countedQuantity < 0) {
    alert("La cantidad fisica no puede ser negativa.");
    return;
  }
  try {
    state.stockCountCurrent = await api(
      `/api/stock-count/sessions/${state.stockCountCurrent.id}/items/${productId}`,
      {
        method: "PUT",
        body: JSON.stringify({ counted_quantity: countedQuantity }),
      }
    );
    state.stockCountSessions = await api("/api/stock-count/sessions");
    renderStockCountPanel();
  } catch (error) {
    alert(error.message);
  }
}

async function deleteStockCountItem(productId) {
  if (!state.stockCountCurrent || state.stockCountCurrent.status !== "open") return;
  try {
    await api(`/api/stock-count/sessions/${state.stockCountCurrent.id}/items/${productId}`, {
      method: "DELETE",
    });
    await refreshStockCountData();
    renderStockCountPanel();
  } catch (error) {
    alert(error.message);
  }
}

async function applyStockCountSession() {
  if (!state.stockCountCurrent || state.stockCountCurrent.status !== "open") {
    alert("No hay una sesion abierta para aplicar.");
    return;
  }
  if (state.user?.role !== "admin") {
    alert("Solo admin puede cerrar conteo y aplicar ajuste.");
    return;
  }
  if (!state.stockCountCurrent.items?.length) {
    alert("Escanea productos antes de aplicar ajustes.");
    return;
  }
  const confirmed = window.confirm(
    "Se ajustara el stock del sistema segun el conteo fisico de esta sesion. Deseas continuar?"
  );
  if (!confirmed) return;

  try {
    await api(`/api/stock-count/sessions/${state.stockCountCurrent.id}/apply`, { method: "POST" });
    await loadData();
    alert("Conteo aplicado correctamente. El inventario fue actualizado.");
  } catch (error) {
    alert(error.message);
  }
}

async function requestStockCountRecount() {
  if (!state.stockCountCurrent || state.stockCountCurrent.status !== "open") {
    alert("No hay una sesion abierta para reconteo.");
    return;
  }
  if (state.user?.role !== "admin") {
    alert("Solo admin puede mandar reconteo.");
    return;
  }

  const reason = window.prompt("Motivo del reconteo (opcional):", "") || "";
  const confirmed = window.confirm(
    `Se limpiaran los productos escaneados de la orden ${state.stockCountCurrent.order_code || state.stockCountCurrent.id}. Deseas continuar?`
  );
  if (!confirmed) return;

  try {
    state.stockCountCurrent = await api(
      `/api/stock-count/sessions/${state.stockCountCurrent.id}/recount`,
      {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() || null }),
      }
    );
    state.stockCountSessions = await api("/api/stock-count/sessions");
    renderStockCountPanel();
    alert("Reconteo enviado. Puedes volver a escanear desde cero.");
  } catch (error) {
    alert(error.message);
  }
}

function printStockCountOrder() {
  const order = state.stockCountCurrent;
  if (!order) {
    alert("No hay orden de conteo abierta para imprimir.");
    return;
  }
  const selectedPaperSize = document.getElementById("stock-count-paper-size")?.value || "carta";
  const paperSizeMap = {
    carta: { css: "letter", label: "Carta (8.5 x 11 in)" },
    oficio: { css: "8.5in 13in", label: "Oficio (8.5 x 13 in)" },
    legal: { css: "legal", label: "Legal (8.5 x 14 in)" },
  };
  const paper = paperSizeMap[selectedPaperSize] || paperSizeMap.carta;

  const printWindow = window.open("", "_blank", "width=980,height=760");
  if (!printWindow) {
    alert("Tu navegador bloqueo la ventana de impresion. Habilita popups para continuar.");
    return;
  }

  const departmentProducts = state.products
    .filter((product) => Number(product.department_id || 0) === Number(order.department_id || 0))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  const lines = order.items?.length
    ? order.items.map((item) => ({
        sku: item.sku,
        name: item.name,
        system_quantity: item.system_quantity,
        counted_quantity: item.counted_quantity,
        difference_quantity: item.difference_quantity,
      }))
    : departmentProducts.map((product) => ({
        sku: product.sku,
        name: product.name,
        system_quantity: Number(product.stock || 0),
        counted_quantity: null,
        difference_quantity: null,
      }));

  const rowsHtml = lines.length
    ? lines
        .map(
          (line, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(line.sku)}</td>
              <td>${escapeHtml(line.name)}</td>
              <td style="text-align:right;">${formatQuantity(line.system_quantity)}</td>
              <td style="text-align:right;">${
                line.counted_quantity == null ? "__________" : formatQuantity(line.counted_quantity)
              }</td>
              <td style="text-align:right;">${
                line.difference_quantity == null ? "__________" : formatSignedQuantity(line.difference_quantity)
              }</td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="6" style="text-align:center;">No hay productos del departamento para imprimir.</td>
      </tr>
    `;

  printWindow.document.write(`
    <html>
      <head>
        <title>Orden de conteo ${escapeHtml(order.order_code || String(order.id))}</title>
        <style>
          @page { size: ${paper.css}; margin: 12mm; }
          body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
          h1, h2 { margin: 0 0 8px; }
          .meta { margin: 0 0 14px; line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
          th { background: #f5f5f5; text-align: left; }
          .signatures { margin-top: 26px; display: flex; gap: 24px; }
          .signature-box { flex: 1; }
          .signature-line { margin-top: 42px; border-top: 1px solid #333; }
          .signature-label { margin-top: 6px; font-size: 12px; color: #222; }
          .hint { margin-top: 12px; font-size: 12px; color: #444; }
        </style>
      </head>
      <body>
        <h1>Orden de conteo ${escapeHtml(order.order_code || String(order.id))}</h1>
        <div class="meta">
          <div><strong>Departamento:</strong> ${escapeHtml(order.department_name || "-")}</div>
          <div><strong>Fecha:</strong> ${new Date(order.created_at).toLocaleString("es-GT")}</div>
          <div><strong>Estado:</strong> ${escapeHtml(stockCountStatusLabel(order.status))}</div>
          <div><strong>Tamano hoja:</strong> ${paper.label}</div>
          <div><strong>Notas:</strong> ${escapeHtml(order.notes || "Sin notas")}</div>
        </div>

        <h2>Detalle para conteo</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>SKU</th>
              <th>Producto</th>
              <th>Cantidad sistema</th>
              <th>Cantidad fisica</th>
              <th>Diferencia</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="signatures">
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-label"><strong>Firma quien conto</strong></div>
            <div class="signature-label">Nombre: _____________________</div>
            <div class="signature-label">Fecha/Hora: _________________</div>
          </div>
          <div class="signature-box">
            <div class="signature-line"></div>
            <div class="signature-label"><strong>Firma quien reviso</strong></div>
            <div class="signature-label">Nombre: _____________________</div>
            <div class="signature-label">Fecha/Hora: _________________</div>
          </div>
        </div>
        <p class="hint">Impreso para conteo fisico por departamento.</p>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

function printStockCountDifferenceReport() {
  const order = state.stockCountCurrent;
  if (!order) {
    alert("No hay orden de conteo activa para imprimir reporte.");
    return;
  }

  const selectedPaperSize = document.getElementById("stock-count-paper-size")?.value || "carta";
  const paperSizeMap = {
    carta: { css: "letter", label: "Carta (8.5 x 11 in)" },
    oficio: { css: "8.5in 13in", label: "Oficio (8.5 x 13 in)" },
    legal: { css: "legal", label: "Legal (8.5 x 14 in)" },
  };
  const paper = paperSizeMap[selectedPaperSize] || paperSizeMap.carta;
  const differenceItems = getStockCountDifferenceItems(order);

  const printWindow = window.open("", "_blank", "width=980,height=760");
  if (!printWindow) {
    alert("Tu navegador bloqueo la ventana de impresion. Habilita popups para continuar.");
    return;
  }

  const rowsHtml = differenceItems.length
    ? differenceItems
        .map(
          (item, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(item.sku)}</td>
              <td>${escapeHtml(item.name)}</td>
              <td style="text-align:right;">${formatQuantity(item.system_quantity)}</td>
              <td style="text-align:right;">${formatQuantity(item.counted_quantity)}</td>
              <td style="text-align:right;">${formatSignedQuantity(item.difference_quantity)}</td>
              <td style="text-align:right;">${money(item.difference_cost)}</td>
            </tr>
          `
        )
        .join("")
    : `
      <tr>
        <td colspan="7" style="text-align:center;">No hay diferencias de inventario en esta orden al momento de imprimir.</td>
      </tr>
    `;

  printWindow.document.write(`
    <html>
      <head>
        <title>Reporte diferencias ${escapeHtml(order.order_code || String(order.id))}</title>
        <style>
          @page { size: ${paper.css}; margin: 12mm; }
          body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
          h1, h2 { margin: 0 0 8px; }
          .meta { margin: 0 0 14px; line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
          th { background: #f5f5f5; text-align: left; }
          .summary { margin-top: 10px; display: grid; gap: 4px; }
          .hint { margin-top: 12px; font-size: 12px; color: #444; }
        </style>
      </head>
      <body>
        <h1>Reporte de diferencias · Orden ${escapeHtml(order.order_code || String(order.id))}</h1>
        <div class="meta">
          <div><strong>Departamento:</strong> ${escapeHtml(order.department_name || "-")}</div>
          <div><strong>Fecha sesion:</strong> ${new Date(order.created_at).toLocaleString("es-GT")}</div>
          <div><strong>Estado:</strong> ${escapeHtml(stockCountStatusLabel(order.status))}</div>
          <div><strong>Tamano hoja:</strong> ${paper.label}</div>
        </div>

        <div class="summary">
          <div><strong>Lineas con diferencia:</strong> ${differenceItems.length}</div>
          <div><strong>Faltantes (uds):</strong> ${formatQuantity(order.totals?.missing_units || 0)}</div>
          <div><strong>Sobrantes (uds):</strong> ${formatQuantity(order.totals?.extra_units || 0)}</div>
          <div><strong>Perdida estimada:</strong> ${money(order.totals?.estimated_loss || 0)}</div>
          <div><strong>Valor sobrante estimado:</strong> ${money(order.totals?.estimated_overage_value || 0)}</div>
        </div>

        <h2>Detalle de diferencias</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>SKU</th>
              <th>Producto</th>
              <th>Sistema</th>
              <th>Fisico</th>
              <th>Diferencia</th>
              <th>Impacto costo</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <p class="hint">Reporte generado en tiempo real con base en el conteo fisico activo.</p>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

function classifyStockLevel(product) {
  const stock = Number(product.stock || 0);
  const minStock = Number(product.min_stock || 0);
  if (minStock <= 0) return "ok";
  if (stock <= 0 || stock <= minStock * 0.5) return "critical";
  if (stock <= minStock) return "warning";
  return "ok";
}

function getAutoPurchaseCandidates(includeWarning) {
  const reportByProductId = new Map(state.lowStockReport.map((row) => [row.product_id, row]));
  const severityWeight = { critical: 2, warning: 1 };
  return state.products
    .filter((product) => {
      if (Number(product.min_stock || 0) <= 0) return false;
      const level = classifyStockLevel(product);
      if (level === "critical") return true;
      return includeWarning && level === "warning";
    })
    .map((product) => {
      const level = classifyStockLevel(product);
      const report = reportByProductId.get(product.id);
      let suggestedQty = Number(
        report?.deficit ?? Math.max(Number(product.min_stock || 0) - Number(product.stock || 0), 0)
      );
      if (suggestedQty <= 0) {
        suggestedQty = 1;
      }
      suggestedQty = Math.round(suggestedQty * 100) / 100;
      return {
        product_id: product.id,
        sku: product.sku,
        product_name: product.name,
        supplier_id: product.supplier_id || null,
        supplier_name: product.supplier_name || getSupplierNameById(product.supplier_id),
        level,
        stock: Number(product.stock || 0),
        min_stock: Number(product.min_stock || 0),
        suggested_quantity: suggestedQty,
        quantity: suggestedQty,
      };
    })
    .sort((a, b) => {
      const byLevel = severityWeight[b.level] - severityWeight[a.level];
      if (byLevel !== 0) return byLevel;
      const bySuggested = b.suggested_quantity - a.suggested_quantity;
      if (bySuggested !== 0) return bySuggested;
      return a.product_name.localeCompare(b.product_name);
    });
}

function rebuildAutoPurchaseLines(includeWarning) {
  const previousQuantityByProductId = new Map(
    state.autoPurchaseLines.map((line) => [line.product_id, Number(line.quantity || 0)])
  );
  state.autoPurchaseIncludeWarning = includeWarning;
  state.autoPurchaseLines = getAutoPurchaseCandidates(includeWarning).map((line) => {
    const previousQty = previousQuantityByProductId.get(line.product_id);
    const quantity =
      Number.isFinite(previousQty) && previousQty >= 0 ? previousQty : line.suggested_quantity;
    return { ...line, quantity: Math.round(quantity * 100) / 100 };
  });
}

function renderAutoPurchaseLines() {
  const container = document.getElementById("auto-purchase-lines");
  if (!container) return;

  if (!state.autoPurchaseLines.length) {
    container.innerHTML = '<div class="empty">No hay productos para ordenar con este filtro.</div>';
    return;
  }

  const criticalCount = state.autoPurchaseLines.filter((line) => line.level === "critical").length;
  const warningCount = state.autoPurchaseLines.length - criticalCount;
  const missingSupplierCount = state.autoPurchaseLines.filter((line) => !line.supplier_id).length;

  container.innerHTML = `
    <p class="hint">
      Seleccionados: ${state.autoPurchaseLines.length} (${criticalCount} criticos, ${warningCount} en alerta).
    </p>
    ${
      missingSupplierCount
        ? `<p class="hint">Hay ${missingSupplierCount} producto(s) sin proveedor. Debes asignar proveedor para poder crear.</p>`
        : ""
    }
    <table>
      <thead>
        <tr>
          <th>Estado</th>
          <th>SKU</th>
          <th>Producto</th>
          <th>Proveedor</th>
          <th>Stock</th>
          <th>Min</th>
          <th>Sugerida</th>
          <th>Ordenar</th>
        </tr>
      </thead>
      <tbody>
        ${state.autoPurchaseLines
          .map(
            (line) => `
          <tr>
            <td><span class="status-pill ${line.level}">${line.level === "critical" ? "CRITICO" : "ALERTA"}</span></td>
            <td>${line.sku}</td>
            <td>${line.product_name}</td>
            <td>${line.supplier_id ? line.supplier_name : "<span class='status-pill critical'>SIN PROVEEDOR</span>"}</td>
            <td>${line.stock}</td>
            <td>${line.min_stock}</td>
            <td>${line.suggested_quantity.toFixed(2)}</td>
            <td><input class="auto-purchase-qty" data-product-id="${line.product_id}" type="number" min="0" step="0.01" value="${line.quantity}"></td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  container.querySelectorAll(".auto-purchase-qty").forEach((input) => {
    input.addEventListener("input", () => {
      const productId = Number(input.dataset.productId);
      const line = state.autoPurchaseLines.find((item) => item.product_id === productId);
      if (!line) return;
      line.quantity = Number(input.value || 0);
    });
  });
}

async function generateCriticalPurchaseOrders() {
  if (state.user?.role !== "admin") {
    alert("Solo admin puede generar ordenes de compra.");
    return;
  }
  try {
    await refreshLowStockProducts();
  } catch {}

  const autoPurchaseDialog = document.getElementById("auto-purchase-dialog");
  const includeWarningInput = document.getElementById("auto-purchase-include-warning");
  const notesInput = document.getElementById("auto-purchase-notes");
  if (!autoPurchaseDialog || !includeWarningInput) return;

  includeWarningInput.checked = state.autoPurchaseIncludeWarning;
  rebuildAutoPurchaseLines(includeWarningInput.checked);
  if (!state.autoPurchaseLines.length) {
    alert(
      includeWarningInput.checked
        ? "No hay productos criticos o en alerta para generar compras."
        : "No hay productos criticos para generar compras."
    );
    return;
  }

  if (notesInput && !notesInput.value.trim()) {
    notesInput.value = "Generada automaticamente desde dashboard de inventario.";
  }
  renderAutoPurchaseLines();
  autoPurchaseDialog.showModal();
}

async function submitAutoPurchaseOrders(event) {
  event.preventDefault();
  if (state.user?.role !== "admin") {
    alert("Solo admin puede generar ordenes de compra.");
    return;
  }

  const linesToOrder = state.autoPurchaseLines
    .map((line) => ({ ...line, quantity: Number(line.quantity || 0) }))
    .filter((line) => line.quantity > 0);
  if (!linesToOrder.length) {
    alert("Ingresa al menos una cantidad mayor a 0 para crear la orden.");
    return;
  }

  const missingSupplier = linesToOrder.filter((line) => !line.supplier_id);
  if (missingSupplier.length) {
    alert(
      `Asigna proveedor antes de crear. Productos sin proveedor: ${missingSupplier
        .map((line) => line.product_name)
        .join(", ")}`
    );
    return;
  }

  const channelsSelect = document.getElementById("auto-purchase-channels");
  const notesInput = document.getElementById("auto-purchase-notes");
  const selectedChannels = channelsSelect
    ? Array.from(channelsSelect.selectedOptions).map((option) => option.value)
    : [];
  const channels = selectedChannels.length ? selectedChannels : ["gmail"];

  try {
    const created = await api("/api/purchase-orders", {
      method: "POST",
      body: JSON.stringify({
        notes: notesInput?.value.trim() || "Generada automaticamente desde dashboard de inventario.",
        channels,
        items: linesToOrder.map((line) => ({
          product_id: Number(line.product_id),
          quantity: Math.round(Number(line.quantity || 0) * 100) / 100,
        })),
      }),
    });
    document.getElementById("auto-purchase-dialog")?.close();
    state.autoPurchaseLines = [];
    await loadData();
    document.querySelector('.tab[data-tab="purchases"]')?.click();
    alert(`Orden(es) generada(s): ${created.length}. Revisa estado de envio por proveedor.`);
  } catch (error) {
    alert(error.message);
  }
}

function renderProductsTable() {
  const container = document.getElementById("products-table");
  const newBtn = document.getElementById("new-product-btn");
  const bulkBarcodeBtn = document.getElementById("generate-missing-barcodes-btn");
  const importEleventaBtn = document.getElementById("import-eleventa-btn");
  if (newBtn) {
    newBtn.style.display = state.user?.role === "admin" ? "inline-block" : "none";
  }
  if (bulkBarcodeBtn) {
    bulkBarcodeBtn.style.display = state.user?.role === "admin" ? "inline-block" : "none";
  }
  if (importEleventaBtn) {
    importEleventaBtn.style.display = state.user?.role === "admin" ? "inline-block" : "none";
  }
  const canEdit = state.user?.role === "admin";
  const canStockEntry = state.user?.role === "admin" || state.user?.role === "user";
  const showExtraColumns = hasProductExtraFields();
  const extraColumnLabel = getProductExtraFieldsCopy().detailColumn || "Detalle";
  const productById = new Map(state.products.map((product) => [Number(product.id), product]));

  if (state.showLowStockOnly) {
    if (!state.lowStockReport.length) {
      container.innerHTML = '<div class="empty">No hay productos con inventario bajo.</div>';
      return;
    }
    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Cod. barras</th>
            <th>Producto</th>
            <th>Descripcion</th>
            <th>Departamento</th>
            <th>Proveedor</th>
            <th>Stock</th>
            <th>Min</th>
            <th>Faltante</th>
            <th>Bajo desde</th>
            <th>Horas bajo</th>
            ${canEdit || canStockEntry ? "<th>Acciones</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${state.lowStockReport
            .map(
              (row) => `
            <tr>
              <td>${row.sku}</td>
              <td>${(() => {
                const p = productById.get(Number(row.product_id));
                return p?.barcode ? escapeHtml(normalizeBarcodeValue(p.barcode)) : "-";
              })()}</td>
              <td>${row.name}</td>
              <td>${escapeHtml(productById.get(Number(row.product_id))?.description || "-")}</td>
              <td>${row.department_name || "Sin departamento"}</td>
              <td>${row.supplier_name || getSupplierNameById(row.supplier_id)}</td>
              <td>${row.stock}</td>
              <td>${row.min_stock}</td>
              <td>${row.deficit}</td>
              <td>${row.low_since_at ? new Date(row.low_since_at).toLocaleString("es-GT") : "-"}</td>
              <td>${row.low_for_hours != null ? `${row.low_for_hours}h` : "-"}</td>
              ${
                canEdit || canStockEntry
                  ? `<td>
                      ${canEdit ? `<button class="btn ghost edit-product-btn" data-product-id="${row.product_id}">Editar</button>` : ""}
                      ${
                        (canEdit || canStockEntry) && !productById.get(Number(row.product_id))?.barcode
                          ? `<button class="btn ghost generate-barcode-btn" data-product-id="${row.product_id}">Generar CB</button>`
                          : ""
                      }
                      ${
                        canEdit || canStockEntry
                          ? `<button class="btn ghost print-labels-btn" data-product-id="${row.product_id}">Etiquetas</button>`
                          : ""
                      }
                      ${canStockEntry ? `<button class="btn ghost stock-entry-btn" data-product-id="${row.product_id}" data-product-name="${row.name}">Ingreso</button>` : ""}
                    </td>`
                  : ""
              }
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  } else if (!state.products.length) {
    container.innerHTML = state.showLowStockOnly
      ? '<div class="empty">No hay productos con inventario bajo.</div>'
      : '<div class="empty">Sin productos registrados.</div>';
    return;
  } else {
    const rows = state.products;
    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Cod. barras</th>
            <th>Producto</th>
            <th>Descripcion</th>
            <th>Departamento</th>
            <th>Proveedor</th>
            ${showExtraColumns ? `<th>${escapeHtml(extraColumnLabel)}</th>` : ""}
            <th>Precio</th>
            <th>Mayoreo</th>
            <th>Inventario</th>
            <th>Stock</th>
            <th>Min</th>
            <th>IVA</th>
            ${canEdit || canStockEntry ? "<th>Acciones</th>" : ""}
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (product) => `
            <tr>
              <td>${product.sku}</td>
              <td>${product.barcode ? escapeHtml(normalizeBarcodeValue(product.barcode)) : "-"}</td>
              <td>${product.name}</td>
              <td>${escapeHtml(product.description || "-")}</td>
              <td>${product.department_name || getDepartmentNameById(product.department_id)}</td>
              <td>${product.supplier_name || "Sin proveedor"}</td>
              ${
                showExtraColumns
                  ? `<td>${formatProductExtraDetail(product).replace(/ · /g, " / ") || "-"}</td>`
                  : ""
              }
              <td>${money(product.price)}</td>
              <td>${
                product.wholesale_enabled && product.wholesale_min_qty > 0 && product.wholesale_discount_pct > 0
                  ? `${product.wholesale_min_qty}+ uds / -${product.wholesale_discount_pct}%`
                  : "-"
              }</td>
              <td>${product.tracks_inventory === 0 ? "No" : "Si"}</td>
              <td>${product.tracks_inventory === 0 ? "-" : product.stock}</td>
              <td>${product.tracks_inventory === 0 ? "-" : product.min_stock || 0}</td>
              <td>${(product.tax_rate * 100).toFixed(0)}%</td>
              ${
                canEdit || canStockEntry
                  ? `<td>
                      ${canEdit ? `<button class="btn ghost edit-product-btn" data-product-id="${product.id}">Editar</button>` : ""}
                      ${
                        (canEdit || canStockEntry) && !product.barcode
                          ? `<button class="btn ghost generate-barcode-btn" data-product-id="${product.id}">Generar CB</button>`
                          : ""
                      }
                      ${
                        canEdit || canStockEntry
                          ? `<button class="btn ghost print-labels-btn" data-product-id="${product.id}">Etiquetas</button>`
                          : ""
                      }
                      ${
                        canStockEntry && product.tracks_inventory !== 0
                          ? `<button class="btn ghost stock-entry-btn" data-product-id="${product.id}" data-product-name="${product.name}">Ingreso</button>`
                          : ""
                      }
                    </td>`
                  : ""
              }
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  if (canEdit) {
    container.querySelectorAll(".edit-product-btn").forEach((button) => {
      button.addEventListener("click", () => openProductEditor(Number(button.dataset.productId)));
    });
  }
  if (canStockEntry) {
    container.querySelectorAll(".stock-entry-btn").forEach((button) => {
      button.addEventListener("click", () =>
        openStockEntryDialog(Number(button.dataset.productId), button.dataset.productName)
      );
    });
  }
  if (canEdit || canStockEntry) {
    container.querySelectorAll(".generate-barcode-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        await generateProductBarcode(Number(button.dataset.productId));
      });
    });
    container.querySelectorAll(".print-labels-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        await openBarcodeLabelDialog(Number(button.dataset.productId));
      });
    });
  }
}

function openSupplierEditor(supplierId = null) {
  const dialog = document.getElementById("supplier-dialog");
  const title = document.getElementById("supplier-dialog-title");
  const form = document.getElementById("supplier-form");
  state.editingSupplierId = supplierId;

  if (!supplierId) {
    title.textContent = "Nuevo proveedor";
    form.reset();
    dialog.showModal();
    return;
  }

  const supplier = state.suppliers.find((item) => item.id === supplierId);
  if (!supplier) return;
  title.textContent = `Editar proveedor #${supplier.id}`;
  form.name.value = supplier.name || "";
  form.email.value = supplier.email || "";
  form.phone.value = supplier.phone || "";
  form.contact_name.value = supplier.contact_name || "";
  form.notes.value = supplier.notes || "";
  dialog.showModal();
}

function renderSuppliersTable() {
  const container = document.getElementById("suppliers-table");
  if (!container) return;
  const isAdmin = state.user?.role === "admin";
  const newSupplierBtn = document.getElementById("new-supplier-btn");
  if (newSupplierBtn) {
    newSupplierBtn.style.display = isAdmin ? "inline-block" : "none";
  }

  if (!state.suppliers.length) {
    container.innerHTML = '<div class="empty">Sin proveedores.</div>';
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Proveedor</th>
          <th>Email</th>
          <th>WhatsApp</th>
          <th>Contacto</th>
          ${isAdmin ? "<th></th>" : ""}
        </tr>
      </thead>
      <tbody>
        ${state.suppliers
          .map(
            (supplier) => `
          <tr>
            <td>${supplier.name}</td>
            <td>${supplier.email || "-"}</td>
            <td>${supplier.phone || "-"}</td>
            <td>${supplier.contact_name || "-"}</td>
            ${isAdmin ? `<td><button class="btn ghost edit-supplier-btn" data-supplier-id="${supplier.id}">Editar</button></td>` : ""}
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  if (isAdmin) {
    container.querySelectorAll(".edit-supplier-btn").forEach((button) => {
      button.addEventListener("click", () => openSupplierEditor(Number(button.dataset.supplierId)));
    });
  }
}

function openDepartmentEditor(departmentId = null) {
  const dialog = document.getElementById("department-dialog");
  const title = document.getElementById("department-dialog-title");
  const form = document.getElementById("department-form");
  state.editingDepartmentId = departmentId;

  if (!departmentId) {
    title.textContent = "Nuevo departamento";
    form.reset();
    dialog.showModal();
    return;
  }

  const department = state.departments.find((item) => item.id === departmentId);
  if (!department) return;
  title.textContent = `Editar departamento #${department.id}`;
  form.name.value = department.name || "";
  form.description.value = department.description || "";
  dialog.showModal();
}

function renderDepartmentsTable() {
  const container = document.getElementById("departments-table");
  if (!container) return;
  const isAdmin = state.user?.role === "admin";
  const newDepartmentBtn = document.getElementById("new-department-btn");
  if (newDepartmentBtn) {
    newDepartmentBtn.style.display = isAdmin ? "inline-block" : "none";
  }

  if (!state.departments.length) {
    container.innerHTML = '<div class="empty">Aun no hay departamentos.</div>';
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Departamento</th>
          <th>Descripcion</th>
          <th>Productos asignados</th>
          ${isAdmin ? "<th></th>" : ""}
        </tr>
      </thead>
      <tbody>
        ${state.departments
          .map((department) => {
            const totalProducts = state.products.filter((product) => product.department_id === department.id).length;
            return `
              <tr>
                <td>${department.name}</td>
                <td>${department.description || "-"}</td>
                <td>${totalProducts}</td>
                ${
                  isAdmin
                    ? `<td><button class="btn ghost edit-department-btn" data-department-id="${department.id}">Editar</button></td>`
                    : ""
                }
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;

  if (isAdmin) {
    container.querySelectorAll(".edit-department-btn").forEach((button) => {
      button.addEventListener("click", () => openDepartmentEditor(Number(button.dataset.departmentId)));
    });
  }
}

function createEmptyPurchaseLine() {
  const firstProduct = state.products.find((product) => product.supplier_id);
  return {
    product_id: firstProduct ? firstProduct.id : null,
    quantity: 1,
  };
}

function renderPurchaseOrderLines() {
  const container = document.getElementById("purchase-order-lines");
  if (!container) return;

  const productOptions = state.products
    .filter((product) => product.supplier_id)
    .map(
      (product) =>
        `<option value="${product.id}">${product.name} (${product.supplier_name || "Sin proveedor"})</option>`
    )
    .join("");

  if (!state.purchaseOrderLines.length) {
    state.purchaseOrderLines = [createEmptyPurchaseLine()];
  }

  container.innerHTML = state.purchaseOrderLines
    .map(
      (line, index) => `
      <div class="purchase-line" data-line-index="${index}">
        <label>
          Producto
          <select class="purchase-line-product">
            ${productOptions}
          </select>
        </label>
        <label>
          Cantidad
          <input class="purchase-line-qty" type="number" min="0.01" step="0.01" value="${line.quantity}">
        </label>
        <button type="button" class="btn ghost remove-purchase-line-btn">Quitar</button>
      </div>
    `
    )
    .join("");

  container.querySelectorAll(".purchase-line").forEach((lineElement) => {
    const index = Number(lineElement.dataset.lineIndex);
    const productSelect = lineElement.querySelector(".purchase-line-product");
    const qtyInput = lineElement.querySelector(".purchase-line-qty");
    const removeButton = lineElement.querySelector(".remove-purchase-line-btn");

    if (state.purchaseOrderLines[index].product_id) {
      productSelect.value = String(state.purchaseOrderLines[index].product_id);
    }

    productSelect.addEventListener("change", () => {
      state.purchaseOrderLines[index].product_id = Number(productSelect.value);
    });
    qtyInput.addEventListener("input", () => {
      state.purchaseOrderLines[index].quantity = Number(qtyInput.value || 0);
    });
    removeButton.addEventListener("click", () => {
      state.purchaseOrderLines.splice(index, 1);
      renderPurchaseOrderLines();
    });
  });
}

function getSelectedPurchaseChannels() {
  const select = document.querySelector('#purchase-order-form select[name="channels"]');
  if (!select) return ["gmail"];
  const selected = Array.from(select.selectedOptions).map((option) => option.value);
  return selected.length ? selected : ["gmail"];
}

function getLatestPurchaseDispatch(order, channel) {
  const candidates = (order.dispatches || []).filter((dispatch) => dispatch.channel === channel);
  if (!candidates.length) return null;
  return candidates.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at))[0];
}

function renderPurchaseOrdersTable() {
  const container = document.getElementById("purchase-orders-table");
  if (!container) return;

  if (!state.purchaseOrders.length) {
    container.innerHTML = '<div class="empty">Aun no hay ordenes de compra.</div>';
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Fecha</th>
          <th>Proveedor</th>
          <th>Total</th>
          <th>Estado</th>
          <th>Productos</th>
          <th>Envios</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${state.purchaseOrders
          .map(
            (order) => {
              const latestWhatsapp = getLatestPurchaseDispatch(order, "whatsapp");
              const latestGmail = getLatestPurchaseDispatch(order, "gmail");
              const whatsappText = latestWhatsapp
                ? `${latestWhatsapp.status} (${new Date(latestWhatsapp.sent_at).toLocaleString("es-GT")})`
                : "-";
              const gmailText = latestGmail
                ? `${latestGmail.status} (${new Date(latestGmail.sent_at).toLocaleString("es-GT")})`
                : "-";
              return `
          <tr>
            <td>${order.id}</td>
            <td>${new Date(order.created_at).toLocaleString("es-GT")}</td>
            <td>${order.supplier_name}</td>
            <td>${money(order.total_estimate)}</td>
            <td>${order.status}</td>
            <td>
              <ul class="compact-list">
                ${order.items
                  .map(
                    (item) =>
                      `<li>${item.product_name} - cantidad solicitada: ${formatQuantity(item.quantity)}</li>`
                  )
                  .join("")}
              </ul>
            </td>
            <td>
              <div class="dispatch-lines">
                <div>WA: ${whatsappText}</div>
                <div>Gmail: ${gmailText}</div>
              </div>
            </td>
            <td>
              <div class="table-actions">
                <button class="btn ghost purchase-print-btn" data-order-id="${order.id}">Imprimir</button>
                <button class="btn ghost purchase-send-btn" data-order-id="${order.id}" data-channel="whatsapp">Reenviar WA</button>
                <button class="btn ghost purchase-send-btn" data-order-id="${order.id}" data-channel="gmail">Reenviar Gmail</button>
                ${
                  order.status !== "received"
                    ? `<button class="btn primary purchase-receive-btn" data-order-id="${order.id}">Recibir mercaderia</button>`
                    : ""
                }
              </div>
            </td>
          </tr>
        `;
            }
          )
          .join("")}
      </tbody>
    </table>
  `;

  container.querySelectorAll(".purchase-print-btn").forEach((button) => {
    button.addEventListener("click", () => printPurchaseOrder(Number(button.dataset.orderId)));
  });
  container.querySelectorAll(".purchase-send-btn").forEach((button) => {
    button.addEventListener("click", () =>
      resendPurchaseOrder(Number(button.dataset.orderId), button.dataset.channel)
    );
  });
  container.querySelectorAll(".purchase-receive-btn").forEach((button) => {
    button.addEventListener("click", () => receivePurchaseOrder(Number(button.dataset.orderId)));
  });
}

function renderInventoryDashboard() {
  const container = document.getElementById("inventory-dashboard");
  if (!container) return;

  if (!state.products.length) {
    container.innerHTML = '<div class="empty">No hay productos para analizar.</div>';
    return;
  }

  const canStockEntry = state.user?.role === "admin" || state.user?.role === "user";
  const tracked = state.products.filter((product) => Number(product.min_stock || 0) > 0);
  const totalTracked = tracked.length;
  const critical = tracked.filter((p) => classifyStockLevel(p) === "critical");
  const warning = tracked.filter((p) => classifyStockLevel(p) === "warning");
  const ok = tracked.filter((p) => classifyStockLevel(p) === "ok");

  const reportById = new Map(state.lowStockReport.map((item) => [item.product_id, item]));
  const severityWeight = { critical: 3, warning: 2, ok: 1 };

  const prioritized = tracked
    .filter((product) => classifyStockLevel(product) !== "ok")
    .map((product) => {
      const level = classifyStockLevel(product);
      const report = reportById.get(product.id);
      return {
        product,
        level,
        deficit: report?.deficit ?? Math.max(Number(product.min_stock || 0) - Number(product.stock || 0), 0),
        lowForHours: Number(report?.low_for_hours ?? 0),
      };
    })
    .sort((a, b) => {
      const byLevel = severityWeight[b.level] - severityWeight[a.level];
      if (byLevel !== 0) return byLevel;
      const byDeficit = b.deficit - a.deficit;
      if (byDeficit !== 0) return byDeficit;
      return b.lowForHours - a.lowForHours;
    });

  container.innerHTML = `
    <div class="inventory-kpis">
      <div class="inventory-kpi critical">
        <div class="label">Critico</div>
        <div class="value">${critical.length}</div>
      </div>
      <div class="inventory-kpi warning">
        <div class="label">Alerta</div>
        <div class="value">${warning.length}</div>
      </div>
      <div class="inventory-kpi ok">
        <div class="label">OK</div>
        <div class="value">${ok.length}</div>
      </div>
      <div class="inventory-kpi">
        <div class="label">Con minimo configurado</div>
        <div class="value">${totalTracked}</div>
      </div>
    </div>
    ${
      prioritized.length
        ? `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Estado</th>
              <th>SKU</th>
              <th>Producto</th>
              <th>Stock</th>
              <th>Min</th>
              <th>Faltante</th>
              <th>Horas bajo</th>
              ${canStockEntry ? "<th></th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${prioritized
              .map(
                (row, index) => `
              <tr>
                <td>${index + 1}</td>
                <td><span class="status-pill ${row.level}">${row.level === "critical" ? "CRITICO" : "ALERTA"}</span></td>
                <td>${row.product.sku}</td>
                <td>${row.product.name}</td>
                <td>${row.product.stock}</td>
                <td>${row.product.min_stock}</td>
                <td>${row.deficit.toFixed(2)}</td>
                <td>${row.lowForHours ? `${row.lowForHours}h` : "-"}</td>
                ${
                  canStockEntry
                    ? `<td><button class="btn ghost dashboard-stock-entry-btn" data-product-id="${row.product.id}" data-product-name="${row.product.name}">Ingreso</button></td>`
                    : ""
                }
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `
        : '<div class="empty">No hay productos para reponer en este momento.</div>'
    }
  `;

  if (canStockEntry) {
    container.querySelectorAll(".dashboard-stock-entry-btn").forEach((button) => {
      button.addEventListener("click", () =>
        openStockEntryDialog(Number(button.dataset.productId), button.dataset.productName)
      );
    });
  }
}

function renderSalesTable() {
  const container = document.getElementById("sales-table");
  if (!state.sales.length) {
    container.innerHTML = '<div class="empty">Aun no hay ventas.</div>';
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Fecha</th>
          <th>Cliente</th>
          <th>Total</th>
          <th>Devuelto</th>
          <th>Neto</th>
          <th>Ahorro mayoreo</th>
          <th>FEL</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${state.sales
          .map(
            (sale) => `
          <tr>
            <td>${sale.id}</td>
            <td>${new Date(sale.created_at).toLocaleString("es-GT")}</td>
            <td>${sale.customer_name || "CONSUMIDOR FINAL"}</td>
            <td>${money(sale.total)}</td>
            <td>${money(sale.returned_total || 0)}</td>
            <td>${money(sale.net_total ?? sale.total)}</td>
            <td>${money(sale.wholesale_savings || 0)}</td>
            <td>${sale.fel ? `${sale.fel.serie}-${sale.fel.numero}` : "-"}</td>
            <td><button class="btn ghost" data-sale-id="${sale.id}">Ver</button></td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  container.querySelectorAll("button[data-sale-id]").forEach((button) => {
    button.addEventListener("click", () => openSaleDetail(Number(button.dataset.saleId)));
  });
}

function renderOrdersTable() {
  const container = document.getElementById("orders-table");
  if (!state.orders.length) {
    container.innerHTML = '<div class="empty">No hay ordenes creadas.</div>';
    return;
  }
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Cliente</th>
          <th>Total</th>
          <th>Estado</th>
          <th>Enviar</th>
        </tr>
      </thead>
      <tbody>
        ${state.orders
          .map(
            (order) => `
          <tr>
            <td>${order.id}</td>
            <td>${order.customer_name}</td>
            <td>${money(order.total_estimate)}</td>
            <td>${order.status}</td>
            <td>
              <button class="btn ghost send-order-btn" data-order-id="${order.id}" data-channel="whatsapp">WhatsApp</button>
              <button class="btn ghost send-order-btn" data-order-id="${order.id}" data-channel="gmail">Gmail</button>
            </td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  container.querySelectorAll(".send-order-btn").forEach((button) => {
    button.addEventListener("click", () => sendOrder(Number(button.dataset.orderId), button.dataset.channel));
  });
}

function renderCashCard() {
  const card = document.getElementById("cash-card");
  const cash = state.currentCash;

  if (!cash) {
    const isAdmin = isAdminUser();
    card.innerHTML = `
      <h3>No hay caja abierta</h3>
      ${
        isAdmin
          ? '<p class="hint">Como admin, abrir caja es opcional. Puedes administrar sin fondo o abrir uno cuando vayas a vender.</p>'
          : ""
      }
      <form id="open-cash-form">
        <label>Monto inicial${isAdmin ? " (opcional)" : ""}<input name="opening_amount" type="number" min="0" step="0.01" value="0" ${
          isAdmin ? "" : "required"
        }></label>
        <button class="btn primary" type="submit">Abrir caja</button>
      </form>
    `;
    document.getElementById("open-cash-form").addEventListener("submit", openCashSession);
    return;
  }

  const ownerName =
    cash.opened_by_full_name || cash.opened_by_username || `usuario ID ${cash.opened_by_user_id}`;
  card.innerHTML = `
    <h3>Caja #${cash.id} abierta</h3>
    <div class="row"><span>Responsable</span><strong>${escapeHtml(ownerName)}</strong></div>
    <div class="row"><span>Monto inicial</span><strong>${money(cash.opening_amount)}</strong></div>
    <div class="row"><span>Esperado actual</span><strong>${money(cash.expected_amount)}</strong></div>
    <div class="row"><span>Apertura</span><strong>${new Date(cash.opened_at).toLocaleString("es-GT")}</strong></div>
    <button id="quick-close-cash-btn" class="btn primary" type="button">Cuadrar caja</button>
  `;
  document.getElementById("quick-close-cash-btn").addEventListener("click", quickCloseCashSession);
}

function getReturnedQtyBySaleItem(sale) {
  const map = new Map();
  (sale?.returns || []).forEach((saleReturn) => {
    if (saleReturn.status !== "completed") return;
    (saleReturn.items || []).forEach((line) => {
      const saleItemId = Number(line.sale_item_id || 0);
      if (!saleItemId) return;
      const previous = Number(map.get(saleItemId) || 0);
      map.set(saleItemId, Math.round((previous + Number(line.quantity || 0)) * 100) / 100);
    });
  });
  return map;
}

function getReturnableSaleLines(sale) {
  const returnedByLine = getReturnedQtyBySaleItem(sale);
  return (sale?.items || [])
    .map((item) => {
      const saleItemId = Number(item.sale_item_id || 0);
      const soldQty = Number(item.quantity || 0);
      const returnedQty = Number(returnedByLine.get(saleItemId) || 0);
      const availableToReturn = Math.round(Math.max(soldQty - returnedQty, 0) * 100) / 100;
      return {
        item,
        sale_item_id: saleItemId,
        sold_qty: soldQty,
        returned_qty: returnedQty,
        available_to_return: availableToReturn,
      };
    })
    .filter((line) => line.sale_item_id > 0 && line.available_to_return > 0);
}

function openSaleDetail(saleId) {
  const sale = state.sales.find((item) => item.id === saleId);
  if (!sale) return;
  state.selectedSaleId = saleId;
  state.selectedSale = sale;
  const detail = document.getElementById("sale-detail");
  const returnedByLine = getReturnedQtyBySaleItem(sale);
  const cashOwnerName =
    state.currentCash?.opened_by_full_name ||
    state.currentCash?.opened_by_username ||
    (state.currentCash ? `usuario ID ${state.currentCash.opened_by_user_id}` : "");
  const canUseCash = canUseCurrentCash();
  const cashGuardHint = state.currentCash
    ? canUseCash
      ? '<p class="hint">Caja activa asignada a tu usuario. Puedes registrar devoluciones.</p>'
      : `<p class="hint">Caja activa asignada a ${escapeHtml(cashOwnerName)}. No puedes registrar devoluciones con este usuario.</p>`
    : '<p class="hint">No hay caja activa. Debes abrir caja para registrar devoluciones.</p>';
  const linesHtml = sale.items
    .map((item) => {
      const returnedQty = Number(returnedByLine.get(Number(item.sale_item_id || 0)) || 0);
      const availableToReturn = Math.max(Number(item.quantity || 0) - returnedQty, 0);
      const discount = Number(item.discount_amount || 0);
      const discountText = discount > 0 ? ` (ahorro ${money(discount)})` : "";
      return `
        <li>
          ${item.product_name} x ${formatQuantity(item.quantity)} = ${money(item.total)}${discountText}
          <br><small>Devuelto: ${formatQuantity(returnedQty)} · Disponible para devolver: ${formatQuantity(availableToReturn)}</small>
        </li>
      `;
    })
    .join("");
  const returnsHtml = (sale.returns || []).length
    ? `
      <h4>Devoluciones registradas</h4>
      <ul>
        ${sale.returns
          .map(
            (saleReturn) => `
            <li>
              NC ${escapeHtml(saleReturn.fel_serie || "-")}-${escapeHtml(saleReturn.fel_numero || "-")}
              · ${new Date(saleReturn.created_at).toLocaleString("es-GT")}
              · ${money(saleReturn.total)}
              ${saleReturn.reason ? `<br><small>Motivo: ${escapeHtml(saleReturn.reason)}</small>` : ""}
            </li>
          `
          )
          .join("")}
      </ul>
    `
    : "<p><strong>Devoluciones:</strong> Sin devoluciones.</p>";
  detail.innerHTML = `
    <h3>Venta #${sale.id}</h3>
    <p><strong>Estado:</strong> ${escapeHtml(sale.status || "completed")}</p>
    <p><strong>Cliente:</strong> ${sale.customer_name || "CONSUMIDOR FINAL"} (${sale.customer_nit || "CF"})</p>
    <p><strong>Total:</strong> ${money(sale.total)}</p>
    <p><strong>Total devuelto:</strong> ${money(sale.returned_total || 0)}</p>
    <p><strong>Total neto:</strong> ${money(sale.net_total ?? sale.total)}</p>
    <p><strong>Pago:</strong> ${formatSalePayments(sale)}</p>
    <p><strong>Ahorro mayoreo:</strong> ${money(sale.wholesale_savings || 0)}</p>
    <p><strong>FEL UUID:</strong> ${sale.fel?.uuid || "-"}</p>
    <p><strong>Serie/Numero:</strong> ${sale.fel ? `${sale.fel.serie}-${sale.fel.numero}` : "-"}</p>
    ${cashGuardHint}
    <ul>${linesHtml}</ul>
    ${returnsHtml}
  `;
  const returnBtn = document.getElementById("register-return-btn");
  if (returnBtn) {
    returnBtn.disabled = !getReturnableSaleLines(sale).length || !canUseCurrentCash();
  }
  document.getElementById("sale-dialog").showModal();
}

function registerSaleReturn() {
  const sale = state.sales.find((item) => item.id === state.selectedSaleId);
  if (!sale) return;
  if (!ensureCashOwnership("registrar devoluciones")) return;

  const returnableLines = getReturnableSaleLines(sale);
  if (!returnableLines.length) {
    alert("Esta venta ya no tiene cantidades disponibles para devolver.");
    return;
  }

  const linesContainer = document.getElementById("sale-return-lines");
  const label = document.getElementById("sale-return-sale-label");
  const reasonInput = document.getElementById("sale-return-reason");
  const dialog = document.getElementById("sale-return-dialog");
  if (!linesContainer || !label || !reasonInput || !dialog) return;

  label.textContent = `Venta #${sale.id} · Cliente ${sale.customer_name || "CONSUMIDOR FINAL"} · Total ${money(sale.total)}`;
  reasonInput.value = "";
  linesContainer.innerHTML = returnableLines
    .map(
      (line) => `
      <div class="sale-return-line">
        <div>
          <strong>${escapeHtml(line.item.product_name)}</strong>
          <br>
          <small>Vendido: ${formatQuantity(line.sold_qty)} · Devuelto: ${formatQuantity(
        line.returned_qty
      )} · Disponible: ${formatQuantity(line.available_to_return)}</small>
        </div>
        <div>
          <small>Precio</small>
          <div>${money(line.item.unit_price)}</div>
        </div>
        <label>
          Cantidad a devolver
          <input
            class="sale-return-qty-input"
            data-sale-item-id="${line.sale_item_id}"
            data-product-name="${escapeHtml(line.item.product_name)}"
            data-available="${line.available_to_return}"
            type="number"
            min="0"
            max="${line.available_to_return}"
            step="0.01"
            value="0"
          >
        </label>
      </div>
    `
    )
    .join("");
  document.getElementById("sale-dialog")?.close();
  dialog.showModal();
}

async function submitSaleReturnForm(event) {
  event.preventDefault();
  const sale = state.sales.find((item) => item.id === state.selectedSaleId);
  if (!sale) return;
  if (!ensureCashOwnership("registrar devoluciones")) return;

  const lines = [];
  let validationError = "";
  document.querySelectorAll(".sale-return-qty-input").forEach((input) => {
    if (validationError) return;
    const saleItemId = Number(input.dataset.saleItemId || 0);
    const availableToReturn = Number(input.dataset.available || 0);
    const productName = input.dataset.productName || "producto";
    const qtyToReturn = Number(String(input.value || "0").replace(",", "."));
    if (!saleItemId) return;
    if (!Number.isFinite(qtyToReturn) || qtyToReturn < 0) {
      validationError = `Cantidad invalida para ${productName}.`;
      return;
    }
    if (qtyToReturn === 0) return;
    if (qtyToReturn > availableToReturn) {
      validationError = 
        `No puedes devolver ${formatQuantity(qtyToReturn)} de ${productName}. Disponible: ${formatQuantity(
          availableToReturn
        )}.`;
      return;
    }
    lines.push({
      sale_item_id: saleItemId,
      quantity: Math.round(qtyToReturn * 100) / 100,
      product_name: productName,
    });
  });

  if (validationError) {
    alert(validationError);
    return;
  }

  if (!lines.length) {
    alert("Debes ingresar al menos una cantidad mayor a 0 para devolver.");
    return;
  }

  const reason = document.getElementById("sale-return-reason")?.value?.trim() || "";
  const summary = lines.map((line) => `- ${line.product_name}: ${formatQuantity(line.quantity)}`).join("\n");
  const returnIntro = isFelEnabledInConfig()
    ? `Se registrara una nota de credito FEL para la venta #${sale.id}.`
    : `Se registrara una devolucion de ticket para la venta #${sale.id}.`;
  const confirmed = window.confirm(
    `${returnIntro}\n\nDetalle:\n${summary}\n\nDeseas continuar?`
  );
  if (!confirmed) return;

  try {
    const result = await api(`/api/sales/${sale.id}/returns`, {
      method: "POST",
      body: JSON.stringify({
        reason: reason.trim() || null,
        items: lines.map((line) => ({
          sale_item_id: line.sale_item_id,
          quantity: line.quantity,
        })),
      }),
    });
    document.getElementById("sale-return-dialog")?.close();
    await loadData();
    openSaleDetail(sale.id);
    alert(
      `Devolucion registrada correctamente.\nNC ${result.fel_serie || "-"}-${result.fel_numero || "-"}\nTotal: ${money(
        result.total || 0
      )}`
    );
  } catch (error) {
    alert(error.message);
  }
}

async function toggleSystemUserActive(userId, currentActive) {
  const nextActive = currentActive ? 0 : 1;
  const actionLabel = nextActive ? "activar" : "desactivar";
  const confirmed = window.confirm(`Deseas ${actionLabel} este usuario?`);
  if (!confirmed) return;
  try {
    await api(`/api/auth/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ active: nextActive }),
    });
    await loadData();
  } catch (error) {
    alert(error.message);
  }
}

async function resetSystemUserPassword(userId, username) {
  const newPassword = window.prompt(`Nueva clave para ${username}:`, "");
  if (!newPassword) return;
  if (newPassword.length < 4) {
    alert("La clave debe tener al menos 4 caracteres.");
    return;
  }
  try {
    await api(`/api/auth/users/${userId}`, {
      method: "PUT",
      body: JSON.stringify({ password: newPassword }),
    });
    alert(`Clave actualizada para ${username}.`);
  } catch (error) {
    alert(error.message);
  }
}

function printAdminCashAuditReceipt({
  sessionId,
  cashierName,
  openingAmount,
  expectedAmount,
  countedAmount,
  difference,
  status,
  adminName,
  createdAtIso,
}) {
  const printWindow = window.open("", "_blank", "width=420,height=760");
  if (!printWindow) {
    alert("Tu navegador bloqueo la ventana de impresion. Habilita popups para continuar.");
    return false;
  }

  const businessName = escapeHtml(state.config?.nombre_comercial || "FEL POS");
  const cashierLabel = escapeHtml(cashierName);
  const adminLabel = escapeHtml(adminName);
  const differenceLabel = `${difference >= 0 ? "+" : "-"}${money(Math.abs(difference))}`;
  const createdAt = new Date(createdAtIso || new Date().toISOString()).toLocaleString("es-GT");
  printWindow.document.write(`
    <html>
      <head>
        <title>Arqueo caja #${sessionId}</title>
        <style>
          @page {
            size: 80mm auto;
            margin: 0;
          }
          body {
            font-family: "Courier New", monospace;
            margin: 0;
            color: #111;
            width: 80mm;
          }
          .ticket {
            box-sizing: border-box;
            width: 80mm;
            padding: 6mm 4mm;
          }
          .center { text-align: center; }
          .title { font-size: 14px; font-weight: bold; margin: 0 0 4px; }
          .subtitle { font-size: 12px; margin: 0 0 8px; }
          .line {
            border-top: 1px dashed #333;
            margin: 6px 0;
          }
          .meta {
            font-size: 11px;
            line-height: 1.35;
            margin: 0;
          }
          .row {
            display: flex;
            justify-content: space-between;
            gap: 8px;
            font-size: 11px;
            margin: 3px 0;
          }
          .row strong { font-size: 11px; text-align: right; }
          .total {
            font-size: 13px;
            font-weight: bold;
            margin-top: 6px;
          }
          .status {
            margin-top: 6px;
            font-size: 12px;
            font-weight: bold;
          }
          .footer {
            margin-top: 8px;
            font-size: 10px;
            text-align: center;
          }
        </style>
      </head>
      <body>
        <div class="ticket">
          <p class="title center">${businessName}</p>
          <p class="subtitle center">ARQUEO DE EFECTIVO</p>
          <div class="line"></div>
          <p class="meta">Caja: #${sessionId}</p>
          <p class="meta">Cajero: ${cashierLabel}</p>
          <p class="meta">Admin: ${adminLabel}</p>
          <p class="meta">Fecha: ${createdAt}</p>
          <div class="line"></div>
          <div class="row"><span>Monto apertura</span><strong>${money(openingAmount)}</strong></div>
          <div class="row"><span>Efectivo esperado</span><strong>${money(expectedAmount)}</strong></div>
          <div class="row"><span>Efectivo contado</span><strong>${money(countedAmount)}</strong></div>
          <div class="row total"><span>Total lleva admin</span><strong>${money(countedAmount)}</strong></div>
          <div class="row"><span>Diferencia</span><strong>${differenceLabel}</strong></div>
          <div class="status center">Estado: ${status}</div>
          <div class="line"></div>
          <p class="footer">Arqueo administrativo (no cierra caja)</p>
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
  return true;
}

async function runAdminCashAudit(entry = null) {
  const selected =
    entry ||
    (state.adminCashMonitor?.sessions || [])[0] ||
    null;
  const session = selected?.session;
  const metrics = selected?.metrics;
  if (!session || !metrics) {
    alert("No hay caja activa para arqueo.");
    return;
  }

  const suggested = Number(metrics.expectedAmount || 0).toFixed(2);
  const countedRaw = prompt(
    `Arqueo de efectivo (sin cerrar caja)\n\n` +
      `Cajero activo: ${session.opened_by_full_name || session.opened_by_username || session.opened_by_user_id}\n` +
      `Caja: #${session.id}\n` +
      `Efectivo esperado: ${money(metrics.expectedAmount)}\n\n` +
      `Ingresa efectivo contado:`,
    suggested
  );
  if (countedRaw === null) return;

  const countedAmount = Number(countedRaw);
  if (!Number.isFinite(countedAmount) || countedAmount < 0) {
    alert("Ingresa un monto valido para arqueo.");
    return;
  }
  const difference = Math.round((countedAmount - Number(metrics.expectedAmount || 0)) * 100) / 100;
  const status = Math.abs(difference) < 0.0001 ? "CUADRA" : difference < 0 ? "FALTANTE" : "SOBRANTE";
  printAdminCashAuditReceipt({
    sessionId: session.id,
    cashierName: session.opened_by_full_name || session.opened_by_username || `ID ${session.opened_by_user_id}`,
    openingAmount: Number(metrics.openingAmount || 0),
    expectedAmount: Number(metrics.expectedAmount || 0),
    countedAmount,
    difference,
    status,
    adminName: state.user?.full_name || state.user?.username || "Admin",
    createdAtIso: new Date().toISOString(),
  });
  alert(
    `Arqueo realizado caja #${session.id}\n\n` +
      `Contado: ${money(countedAmount)}\n` +
      `Esperado: ${money(metrics.expectedAmount)}\n` +
      `Diferencia: ${money(difference)}\n` +
      `Estado: ${status}\n\n` +
      `Se envio recibo a impresion.`
  );
}

function renderAdminCashMonitorCard() {
  const container = document.getElementById("admin-cash-monitor-card");
  if (!container) return;
  const monitor = state.adminCashMonitor || {};
  if (monitor.error) {
    container.innerHTML = `<p class="hint">${escapeHtml(monitor.error)}</p>`;
    return;
  }

  const entries = monitor.sessions || [];
  if (!entries.length) {
    container.innerHTML = `
      <div class="row"><span>Estado caja</span><strong>Sin cajeros con fondo abierto</strong></div>
      <p class="hint">Cada cajero abre su propio fondo de forma independiente.</p>
      <div class="panel-actions">
        <button id="admin-cash-monitor-refresh-btn" class="btn ghost" type="button">Actualizar estado</button>
      </div>
    `;
    document.getElementById("admin-cash-monitor-refresh-btn")?.addEventListener("click", async () => {
      await refreshAdminCashMonitorData();
      renderAdminCashMonitorCard();
    });
    return;
  }

  const updatedAt = monitor.updatedAt ? new Date(monitor.updatedAt).toLocaleTimeString("es-GT") : "-";
  const cards = entries
    .map((entry, index) => {
      const session = entry.session;
      const metrics = entry.metrics;
      const lastSaleAt = metrics.lastSaleAt ? new Date(metrics.lastSaleAt).toLocaleString("es-GT") : "Sin ventas";
      const cashierName =
        session.opened_by_full_name || session.opened_by_username || `ID ${session.opened_by_user_id}`;
      return `
      <div class="config-card" style="margin-bottom: 0.75rem; padding: 0.55rem 0.65rem; border: 1px solid var(--border); border-radius: 10px;">
        <div class="row"><span>Cajero</span><strong>${escapeHtml(cashierName)}</strong></div>
        <div class="row"><span>Caja</span><strong>#${session.id}</strong></div>
        <div class="row"><span>Apertura</span><strong>${new Date(session.opened_at).toLocaleString("es-GT")}</strong></div>
        <div class="row"><span>Monto apertura</span><strong>${money(metrics.openingAmount)}</strong></div>
        <div class="row"><span>Ventas en efectivo</span><strong>${money(metrics.salesCashTotal)}</strong></div>
        <div class="row"><span>Devoluciones efectivo</span><strong>${money(metrics.returnsCashTotal)}</strong></div>
        <div class="row"><span>Total ventas (neto)</span><strong>${money(metrics.netSalesCash)}</strong></div>
        <div class="row"><span>Cantidad ventas</span><strong>${metrics.salesCount}</strong></div>
        <div class="row"><span>Ingresos manuales</span><strong>${money(metrics.manualIncomeTotal)}</strong></div>
        <div class="row"><span>Egresos manuales</span><strong>${money(metrics.manualExpenseTotal)}</strong></div>
        <div class="row"><span>Efectivo esperado</span><strong>${money(metrics.expectedAmount)}</strong></div>
        <div class="row"><span>Ultima venta</span><strong>${lastSaleAt}</strong></div>
        <div class="panel-actions">
          <button class="btn ghost admin-cash-transfer-btn" type="button" data-session-id="${session.id}">Transferir turno</button>
          <button class="btn ghost admin-cash-force-close-btn" type="button" data-session-id="${session.id}" data-expected="${Number(session.expected_amount || 0)}">Cerrar fondo</button>
          <button class="btn primary admin-cash-audit-btn" type="button" data-index="${index}">Hacer arqueo</button>
        </div>
      </div>`;
    })
    .join("");

  container.innerHTML = `
    <div class="row"><span>Fondos abiertos</span><strong>${entries.length}</strong></div>
    <p class="hint">Actualizado: ${updatedAt}</p>
    ${cards}
    <div class="panel-actions">
      <button id="admin-cash-monitor-refresh-btn" class="btn ghost" type="button">Actualizar estado</button>
    </div>
  `;

  document.getElementById("admin-cash-monitor-refresh-btn")?.addEventListener("click", async () => {
    await refreshAdminCashMonitorData();
    renderAdminCashMonitorCard();
  });
  container.querySelectorAll(".admin-cash-audit-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const index = Number(btn.getAttribute("data-index"));
      runAdminCashAudit(entries[index]);
    });
  });
  container.querySelectorAll(".admin-cash-transfer-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const sessionId = Number(btn.getAttribute("data-session-id"));
      transferCashSessionToUser(sessionId);
    });
  });
  container.querySelectorAll(".admin-cash-force-close-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const sessionId = Number(btn.getAttribute("data-session-id"));
      const expected = Number(btn.getAttribute("data-expected") || 0);
      const countedRaw = prompt(
        `Conteo fisico para cerrar fondo #${sessionId}:`,
        expected.toFixed(2)
      );
      if (countedRaw === null) return;
      const countedAmount = Number(countedRaw);
      if (!Number.isFinite(countedAmount) || countedAmount < 0) {
        alert("Ingresa un monto valido.");
        return;
      }
      const reason =
        prompt("Motivo (opcional) del cierre administrativo:", "Cierre por admin") || "";
      try {
        await api(`/api/cash/sessions/${sessionId}/close`, {
          method: "POST",
          body: JSON.stringify({
            counted_amount: countedAmount,
            notes: `CIERRE ADMINISTRATIVO.${reason.trim() ? ` Motivo: ${reason.trim()}` : ""}`,
          }),
        });
        await loadData();
        await refreshAdminCashMonitorData();
        renderAdminCashMonitorCard();
        alert(`Fondo #${sessionId} cerrado.`);
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function ensureAdminCashMonitorAutoRefresh() {
  clearAdminCashMonitorTimer();
  if (state.user?.role !== "admin") return;
  state.adminCashMonitorTimerId = setInterval(async () => {
    await refreshAdminCashMonitorData();
    renderAdminCashMonitorCard();
  }, ADMIN_MONITOR_REFRESH_MS);
}

function renderVersionLabel() {
  const label = document.getElementById("app-version-label");
  if (!label) return;
  const info = state.appVersion;
  if (!info?.version) {
    label.hidden = true;
    label.textContent = "";
    return;
  }
  label.hidden = false;
  label.textContent = `v${info.version}`;
  label.title = [
    info.app_name,
    info.creator ? `Creado por ${info.creator}` : null,
    info.build_date ? `Compilada: ${info.build_date}` : null,
    info.updated_at ? `Actualizada: ${info.updated_at}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function renderVersionHistorySection() {
  const info = state.appVersion;
  if (!info) {
    return '<p class="hint">No se pudo cargar la informacion de version.</p>';
  }
  const historyRows = (info.history || [])
    .slice()
    .reverse()
    .slice(0, 4)
    .map(
      (entry) => `
        <tr>
          <td>v${escapeHtml(entry.version)}${
            entry.version === info.version ? ' <span class="badge success">actual</span>' : ""
          }</td>
          <td>${entry.installed_at ? new Date(entry.installed_at).toLocaleString("es-GT") : "-"}</td>
        </tr>
      `
    )
    .join("");
  return `
    <h3 style="margin: 0.2rem 0 0;">Version del sistema</h3>
    <p class="hint">Se muestra la version actual y hasta 3 anteriores.</p>
    <div class="row"><span>Creador</span><strong>${escapeHtml(info.creator || "D3xFr3N")}</strong></div>
    <div class="row"><span>Version actual</span><strong>v${escapeHtml(info.version)}</strong></div>
    ${
      info.previous_version
        ? `<div class="row"><span>Version anterior</span><strong>v${escapeHtml(info.previous_version)}</strong></div>`
        : ""
    }
    <div class="row"><span>Compilada</span><strong>${escapeHtml(info.build_date || "No registrada")}</strong></div>
    <div class="row"><span>Instalada</span><strong>${
      info.installed_at ? new Date(info.installed_at).toLocaleString("es-GT") : "-"
    }</strong></div>
    <div class="row"><span>Ultima actualizacion</span><strong>${
      info.updated_at ? new Date(info.updated_at).toLocaleString("es-GT") : "-"
    }</strong></div>
    ${
      historyRows
        ? `<div class="table-wrap" style="margin-top: 0.6rem;">
            <table>
              <thead><tr><th>Version</th><th>Fecha</th></tr></thead>
              <tbody>${historyRows}</tbody>
            </table>
          </div>`
        : ""
    }
    <hr style="border-color: var(--border); width: 100%;">
  `;
}

function renderAutoUpdateSection() {
  const info = state.updateInfo;
  if (!info) {
    return `
      <h3 style="margin: 0.2rem 0 0;">Actualizaciones automaticas</h3>
      <p class="hint">Consultando servidor de actualizaciones...</p>
      <button id="check-system-update-btn" class="btn ghost" type="button">Buscar actualizaciones</button>
      <hr style="border-color: var(--border); width: 100%;">
    `;
  }
  const latest = info.latest_version ? `v${escapeHtml(info.latest_version)}` : "-";
  const notes = info.release_notes ? `<p class="hint">${escapeHtml(info.release_notes)}</p>` : "";
  const statusClass = info.update_available ? "badge success" : info.enabled ? "badge" : "badge muted";
  const statusText = info.update_available
    ? "Actualizacion disponible"
    : info.enabled
      ? "Al dia"
      : "No configurado";
  const license = state.licenseConfig || {};
  const licenseClass = license.valid ? "badge success" : license.required ? "badge danger" : "badge muted";
  const licenseText = license.valid
    ? license.store_id || license.store_label
      ? `Licencia activa (${[license.store_id, license.store_label].filter(Boolean).join(" - ")})`
      : "Licencia activa"
    : license.required
      ? `Licencia ${license.status || "invalida"}`
      : "Sin control de licencia";
  const licenseHint = license.message
    ? `<p class="hint">${escapeHtml(license.message)}</p>`
    : "";
  const licenseBlocked = license.required && !license.valid;
  return `
    <h3 style="margin: 0.2rem 0 0;">Actualizaciones automaticas</h3>
    <p class="hint">
      Cuando publiques una mejora, las tiendas autorizadas pueden actualizar solas sin reinstalar el instalador completo.
    </p>
    <div class="row"><span>Licencia tienda</span><span class="${licenseClass}">${escapeHtml(licenseText)}</span></div>
    ${license.fingerprint ? `<div class="row"><span>ID equipo</span><strong>${escapeHtml(license.fingerprint)}</strong></div>` : ""}
    ${licenseHint}
    <div class="row"><span>Estado</span><span class="${statusClass}">${statusText}</span></div>
    <div class="row"><span>Version publicada</span><strong>${latest}</strong></div>
    <div class="row"><span>Detalle</span><strong>${escapeHtml(info.message || "-")}</strong></div>
    ${notes}
    <div class="panel-actions">
      <button id="check-system-update-btn" class="btn ghost" type="button">Buscar actualizaciones</button>
      ${
        info.update_available && !licenseBlocked
          ? '<button id="apply-system-update-btn" class="btn primary" type="button">Actualizar ahora</button>'
          : ""
      }
    </div>
    <hr style="border-color: var(--border); width: 100%;">
  `;
}

async function checkSystemUpdates({ silent = false } = {}) {
  if (!isAdminUser()) return null;
  try {
    state.updateInfo = await api("/api/system/update/check");
    renderSystemAlertsBar();
    if (isAdminUser() && document.getElementById("config-card")?.innerHTML) {
      renderConfig();
    }
    if (!silent && state.updateInfo?.message) {
      alert(state.updateInfo.message);
    }
    return state.updateInfo;
  } catch (error) {
    if (!silent) alert(error.message);
    return null;
  }
}

async function restartAfterSystemUpdate() {
  if (window.pywebview?.api?.restart_after_update) {
    await window.pywebview.api.restart_after_update();
    return true;
  }
  await api("/api/system/update/restart", { method: "POST" });
  return true;
}

async function applySystemUpdate() {
  if (
    !window.confirm(
      "Se creara un respaldo automatico y el sistema se reiniciara para aplicar la actualizacion. Tus datos en data\\ y .env se conservan. ¿Continuar?"
    )
  ) {
    return;
  }
  try {
    const result = await api("/api/system/update/apply", { method: "POST" });
    alert(
      (result.message || "Actualizacion descargada.") +
        " El programa se cerrara ahora para completar la instalacion."
    );
    try {
      await restartAfterSystemUpdate();
    } catch (restartError) {
      alert(
        "La actualizacion ya se descargo. Cierra FEL POS completamente y vuelve a abrirlo para terminar la instalacion."
      );
      throw restartError;
    }
    setTimeout(() => {
      alert(
        "Si FEL POS sigue abierto, cierralo manualmente y vuelve a abrirlo. La actualizacion se aplicara al iniciar."
      );
    }, 2500);
  } catch (error) {
    if (error?.message) alert(error.message);
  }
}

function isFelEnabledInConfig(config = state.config) {
  return Boolean(config?.fel_enabled) && String(config?.fel_mode || "") !== "disabled";
}

function buildSaleSuccessMessage(sale, suffix = "") {
  const reference =
    isFelEnabledInConfig() && sale.fel
      ? `FEL ${sale.fel.serie}-${sale.fel.numero}`
      : `Ticket #${sale.id}`;
  return `Venta registrada. ${reference}.${suffix ? ` ${suffix}` : ""}`;
}

function renderScannerBridgeSection() {
  const cfg = state.scannerBridgeConfig || {
    enabled: false,
    running: false,
    port: 18765,
    username: "admin",
    password_configured: false,
    com_port: "",
    listen_address: "",
    mobile_url_hint: "",
  };
  const statusClass = cfg.running ? "status-pill ok" : cfg.enabled ? "status-pill warning" : "status-pill";
  const statusLabel = cfg.running ? "Activo" : cfg.enabled ? "Activado (sin escuchar)" : "Inactivo";
  const toggleLabel = cfg.enabled ? "Desactivar puente" : "Activar puente";
  const toggleClass = cfg.enabled ? "btn ghost" : "btn primary";
  return `
    <h3 style="margin: 0.2rem 0 0;">App movil — Puente scanner</h3>
    <p class="hint">
      Permite que la APK Android envie escaneos por Bluetooth/TCP al PC durante conteo de inventario.
      El modo WiFi de la app sigue funcionando sin activar esto.
    </p>
    <div class="row">
      <span>Estado del puente</span>
      <span class="${statusClass}">${statusLabel}</span>
    </div>
    <div class="row"><span>Escucha en</span><strong>${escapeHtml(cfg.listen_address || `0.0.0.0:${cfg.port || 18765}`)}</strong></div>
    <div class="row"><span>URL app movil</span><strong>${escapeHtml(cfg.mobile_url_hint || "-")}</strong></div>
    <div class="panel-actions">
      <button id="scanner-bridge-toggle-btn" class="${toggleClass}" type="button">${toggleLabel}</button>
      <button id="scanner-bridge-refresh-btn" class="btn ghost" type="button">Actualizar estado</button>
    </div>
    <form id="scanner-bridge-config-form">
      <label>
        <input id="scanner-bridge-enabled" name="enabled" type="checkbox" ${cfg.enabled ? "checked" : ""}>
        Puente scanner habilitado al guardar
      </label>
      <label>
        Puerto TCP del puente
        <input name="port" type="number" min="1024" max="65535" value="${Number(cfg.port || 18765)}" required>
      </label>
      <label>
        Usuario del puente (login interno)
        <input name="username" value="${escapeHtml(cfg.username || "admin")}" required>
      </label>
      <label>
        Clave del puente
        <input name="password" type="password" placeholder="${cfg.password_configured ? "Configurada (dejar vacio para conservar)" : "Clave del usuario"}">
      </label>
      <label>
        Puerto COM Bluetooth (opcional, Windows)
        <input name="com_port" value="${escapeHtml(cfg.com_port || "")}" placeholder="Ej. COM5">
      </label>
      <button class="btn primary" type="submit">Guardar puente scanner</button>
    </form>
    <p class="hint">
      Empareja el celular con la PC por Bluetooth y usa modo <strong>Bluetooth</strong> en la APK.
      Si Bluetooth falla, la app intenta el mismo puente por TCP en la red local.
    </p>
  `;
}

function renderStockCountScannerBridgeQuick() {
  if (state.user?.role !== "admin") {
    return "";
  }
  const cfg = state.scannerBridgeConfig || {
    enabled: false,
    running: false,
    port: 18765,
    listen_address: "",
    mobile_url_hint: "",
  };
  const statusClass = cfg.running ? "status-pill ok" : cfg.enabled ? "status-pill warning" : "status-pill";
  const statusLabel = cfg.running ? "Puente activo" : cfg.enabled ? "Activado (sin escuchar)" : "Puente inactivo";
  const toggleLabel = cfg.enabled ? "Desactivar puente movil" : "Activar puente movil";
  const toggleClass = cfg.enabled ? "btn ghost" : "btn primary";
  return `
    <div class="stock-count-scanner-bridge">
      <div class="row">
        <strong>App movil / puente scanner</strong>
        <span class="${statusClass}">${statusLabel}</span>
      </div>
      <p class="hint">
        Escucha: <strong>${escapeHtml(cfg.listen_address || `0.0.0.0:${cfg.port || 18765}`)}</strong>
        · App: <strong>${escapeHtml(cfg.mobile_url_hint || "/mobile")}</strong>
      </p>
      <div class="panel-actions">
        <button id="stock-count-scanner-bridge-toggle-btn" class="${toggleClass}" type="button">${toggleLabel}</button>
        <button id="stock-count-scanner-bridge-refresh-btn" class="btn ghost" type="button">Actualizar puente</button>
      </div>
      <p class="hint">Usa la APK en modo WiFi o Bluetooth. Configuracion completa en Configuracion.</p>
    </div>
  `;
}

function bindStockCountScannerBridgeActions(container) {
  if (state.user?.role !== "admin" || !container) return;

  container.querySelector("#stock-count-scanner-bridge-toggle-btn")?.addEventListener("click", async () => {
    try {
      state.scannerBridgeConfig = await api("/api/config/scanner-bridge/toggle", { method: "POST" });
      renderStockCountPanel();
      alert(state.scannerBridgeConfig?.running ? "Puente scanner activo para la app movil." : "Puente scanner detenido.");
    } catch (error) {
      alert(error.message);
    }
  });

  container.querySelector("#stock-count-scanner-bridge-refresh-btn")?.addEventListener("click", async () => {
    try {
      state.scannerBridgeConfig = await api("/api/config/scanner-bridge");
      renderStockCountPanel();
    } catch (error) {
      alert(error.message);
    }
  });
}

async function refreshScannerBridgeConfig() {
  if (state.user?.role !== "admin") return;
  try {
    state.scannerBridgeConfig = await api("/api/config/scanner-bridge");
  } catch {
    state.scannerBridgeConfig = null;
  }
}

function renderReceiptPrinterSection() {
  const cfg = state.receiptPrinterConfig || DEFAULT_RECEIPT_PRINTER_CONFIG;
  const configWarning = state.receiptPrinterConfig
    ? ""
    : `<p class="hint" style="color: var(--warning, #b45309);">No se pudo cargar la configuracion guardada. Puedes personalizar el ticket y guardar de nuevo.</p>`;
  const defaultPrinter = cfg.default_printer || "ninguna detectada";
  const activePrinter = cfg.active_printer || defaultPrinter;
  const printerOptions = (cfg.available_printers || [])
    .map((name) => {
      const selected = cfg.printer_name === name ? "selected" : "";
      return `<option value="${escapeHtml(name)}" ${selected}>${escapeHtml(name)}</option>`;
    })
    .join("");
  const platformHint = cfg.platform_supported
    ? "Si dejas predeterminada, usa la impresora por defecto de Windows."
    : "La impresion directa de tickets solo esta disponible en Windows.";
  return `
    <h3 style="margin: 0.2rem 0 0;">Impresion de recibos</h3>
    <p class="hint">
      Configura la impresora termica para tickets de venta. ${platformHint}
    </p>
    ${configWarning}
    <div class="row"><span>Impresora activa</span><strong>${escapeHtml(activePrinter)}</strong></div>
    <div class="row"><span>Predeterminada Windows</span><strong>${escapeHtml(defaultPrinter)}</strong></div>
    <form id="receipt-printer-form">
      <label>
        Impresora de tickets
        <select name="printer_name" ${cfg.platform_supported ? "" : "disabled"}>
          <option value="" ${!cfg.printer_name ? "selected" : ""}>
            Predeterminada de Windows (${escapeHtml(defaultPrinter)})
          </option>
          ${printerOptions}
        </select>
      </label>
      <label class="inline-option">
        <input type="checkbox" name="print_on_checkout" ${cfg.print_on_checkout ? "checked" : ""}>
        Imprimir ticket automaticamente al cobrar
      </label>
      <label class="inline-option">
        <input type="checkbox" name="open_drawer_on_checkout" ${cfg.open_drawer_on_checkout ? "checked" : ""}>
        Abrir cajon de dinero al cobrar (efectivo / mixto)
      </label>
      <p class="hint">El cajon se abre aunque cobres con F2 (sin imprimir). Debe estar conectado al puerto de la impresora termica.</p>
      <label>
        Ancho del ticket (caracteres)
        <input
          name="chars_per_line"
          type="number"
          min="32"
          max="64"
          step="1"
          value="${Number(cfg.chars_per_line || 48)}"
          required
        >
      </label>
      <label>
        Espacio antes del corte (lineas)
        <input
          name="bottom_feed_lines"
          type="number"
          min="2"
          max="20"
          step="1"
          value="${Number(cfg.bottom_feed_lines || 8)}"
          required
        >
      </label>
      <p class="hint">Si el texto queda muy pegado al corte, sube este valor a 10 o 12.</p>
      <h4 style="margin: 1rem 0 0.4rem;">Personalizar diseño del ticket</h4>
      <p class="hint">Deja en blanco las lineas de encabezado para usar los datos de tu empresa. Usa {id} en el titulo para el numero de venta.</p>
      <label>
        Linea 1 encabezado
        <input name="header_line_1" maxlength="120" value="${escapeHtml(cfg.header_line_1 || "")}" placeholder="Nombre comercial (automatico si vacio)">
      </label>
      <label>
        Linea 2 encabezado
        <input name="header_line_2" maxlength="120" value="${escapeHtml(cfg.header_line_2 || "")}" placeholder="NIT u otra linea (automatico si vacio)">
      </label>
      <label>
        Linea 3 encabezado
        <input name="header_line_3" maxlength="120" value="${escapeHtml(cfg.header_line_3 || "")}" placeholder="Direccion u otra linea">
      </label>
      <label>
        Titulo del ticket
        <input name="ticket_label" maxlength="40" value="${escapeHtml(cfg.ticket_label || "TICKET #{id}")}" placeholder="TICKET #{id}">
      </label>
      <label>
        Separador de secciones
        <select name="separator_char">
          <option value="-" ${cfg.separator_char === "-" ? "selected" : ""}>Guion (-)</option>
          <option value="=" ${cfg.separator_char === "=" ? "selected" : ""}>Igual (=)</option>
          <option value="*" ${cfg.separator_char === "*" ? "selected" : ""}>Asterisco (*)</option>
          <option value="." ${cfg.separator_char === "." ? "selected" : ""}>Punto (.)</option>
          <option value="_" ${cfg.separator_char === "_" ? "selected" : ""}>Guion bajo (_)</option>
        </select>
      </label>
      <label>
        Mensaje final del ticket
        <input name="footer_message" maxlength="200" value="${escapeHtml(cfg.footer_message || "Gracias por su compra")}">
      </label>
      <label>
        Linea extra al final (opcional)
        <input name="footer_extra" maxlength="200" value="${escapeHtml(cfg.footer_extra || "")}" placeholder="Ej: Siguenos en redes / promo del mes">
      </label>
      <div class="inline-options-grid">
        <label class="inline-option"><input type="checkbox" name="show_company_nit" ${cfg.show_company_nit !== false ? "checked" : ""}> Mostrar NIT empresa</label>
        <label class="inline-option"><input type="checkbox" name="show_address" ${cfg.show_address ? "checked" : ""}> Mostrar direccion</label>
        <label class="inline-option"><input type="checkbox" name="center_header" ${cfg.center_header ? "checked" : ""}> Centrar encabezado</label>
        <label class="inline-option"><input type="checkbox" name="show_date" ${cfg.show_date !== false ? "checked" : ""}> Mostrar fecha</label>
        <label class="inline-option"><input type="checkbox" name="show_customer" ${cfg.show_customer !== false ? "checked" : ""}> Mostrar cliente</label>
        <label class="inline-option"><input type="checkbox" name="show_item_detail" ${cfg.show_item_detail !== false ? "checked" : ""}> Detalle precio x cantidad</label>
        <label class="inline-option"><input type="checkbox" name="show_subtotal" ${cfg.show_subtotal !== false ? "checked" : ""}> Mostrar subtotal</label>
        <label class="inline-option"><input type="checkbox" name="show_tax" ${cfg.show_tax !== false ? "checked" : ""}> Mostrar IVA</label>
        <label class="inline-option"><input type="checkbox" name="show_payments" ${cfg.show_payments !== false ? "checked" : ""}> Mostrar forma de pago</label>
        <label class="inline-option"><input type="checkbox" name="show_wholesale_savings" ${cfg.show_wholesale_savings !== false ? "checked" : ""}> Mostrar ahorro mayoreo</label>
        <label class="inline-option"><input type="checkbox" name="show_fel" ${cfg.show_fel !== false ? "checked" : ""}> Mostrar datos FEL</label>
      </div>
      <label>
        Vista previa del ticket
        <textarea id="receipt-preview-text" rows="14" readonly style="font-family: Consolas, monospace; white-space: pre;">${escapeHtml(cfg.preview_text || "")}</textarea>
      </label>
      <label>
        Codificacion de caracteres
        <select name="encoding">
          <option value="cp850" ${cfg.encoding === "cp850" ? "selected" : ""}>cp850 (recomendado termica)</option>
          <option value="cp437" ${cfg.encoding === "cp437" ? "selected" : ""}>cp437</option>
          <option value="utf-8" ${cfg.encoding === "utf-8" ? "selected" : ""}>utf-8</option>
        </select>
      </label>
      <div class="panel-actions">
        <button class="btn primary" type="submit">Guardar impresora y ticket</button>
        <button id="test-receipt-printer-btn" class="btn ghost" type="button">Imprimir prueba</button>
        <button id="test-cash-drawer-btn" class="btn ghost" type="button">Probar cajon</button>
      </div>
    </form>
    <hr style="border-color: var(--border); width: 100%;">
  `;
}

function renderLabelPrinterSection() {
  const cfg = state.labelPrinterConfig || {
    printer_name: "",
    default_printer: "",
    available_printers: [],
    active_printer: "",
    platform_supported: true,
  };
  const defaultPrinter = cfg.default_printer || "ninguna detectada";
  const activePrinter = cfg.active_printer || defaultPrinter;
  const printerOptions = (cfg.available_printers || [])
    .map((name) => {
      const selected = cfg.printer_name === name ? "selected" : "";
      return `<option value="${escapeHtml(name)}" ${selected}>${escapeHtml(name)}</option>`;
    })
    .join("");
  return `
    <h3 style="margin: 0.2rem 0 0;">Impresora de etiquetas</h3>
    <p class="hint">
      Elige la impresora para codigos de barras. En Productos usa <strong>Generar CB</strong> y <strong>Etiquetas</strong>.
    </p>
    <div class="row"><span>Impresora activa</span><strong>${escapeHtml(activePrinter)}</strong></div>
    <form id="label-printer-form">
      <label>
        Impresora de etiquetas
        <select name="printer_name" ${cfg.platform_supported ? "" : "disabled"}>
          <option value="" ${!cfg.printer_name ? "selected" : ""}>
            Predeterminada / tickets (${escapeHtml(defaultPrinter)})
          </option>
          ${printerOptions}
        </select>
      </label>
      <div class="panel-actions">
        <button class="btn primary" type="submit">Guardar impresora de etiquetas</button>
        <button id="test-label-printer-btn" class="btn ghost" type="button">Imprimir etiqueta prueba</button>
      </div>
    </form>
    <hr style="border-color: var(--border); width: 100%;">
  `;
}

function renderConfig() {
  const card = document.getElementById("config-card");
  if (!state.config) return;
  const profile = getBusinessProfileCopy();
  const profileLabel = profile.brandTitle.replace("FEL POS", "").trim() || "Abarrotes";
  const cfg = state.config;
  const felModeBadgeClass =
    cfg.fel_mode === "production" ? "badge success" : cfg.fel_mode === "disabled" ? "badge muted" : "badge";
  const felModeLabel = cfg.fel_mode_label || cfg.fel_mode.toUpperCase();
  const showFelCertifierFields = cfg.fel_mode !== "disabled";
  const llaveHint = cfg.certificador_llave_configured
    ? "Llave guardada. Deja vacio para conservarla."
    : "Ingresa la llave o token que te dio tu certificador.";

  card.innerHTML = `
    ${renderVersionHistorySection()}
    <h3 style="margin: 0.2rem 0 0;">Licencia de tienda</h3>
    <p class="hint">Las licencias firmadas se validan localmente. No se publica ningun registro de tiendas en GitHub.</p>
    <form id="license-config-form">
      <label>
        Clave de licencia
        <input name="store_license_key" value="${escapeHtml(state.licenseConfig?.store_license_key || "")}" placeholder="FELPOS-v1..." required>
      </label>
      <label>
        <input type="checkbox" name="license_required_for_updates" ${state.licenseConfig?.license_required_for_updates !== false ? "checked" : ""}>
        Exigir licencia valida para actualizar
      </label>
      <button class="btn primary" type="submit">Guardar licencia</button>
    </form>
    <p class="hint">
      Estado: ${escapeHtml(state.licenseConfig?.message || "Sin validar")}
      ${state.licenseConfig?.fingerprint ? ` · ID equipo: ${escapeHtml(state.licenseConfig.fingerprint)}` : ""}
    </p>
    <hr style="border-color: var(--border); width: 100%;">
    ${renderAutoUpdateSection()}
    <h3 style="margin: 0.2rem 0 0;">Configuracion de tienda</h3>
    <p class="hint">
      Configura tu negocio, NIT y si deseas factura contable (FEL) o solo ticket de venta.
    </p>
    <form id="store-config-form">
      <label>
        NIT emisor
        <input name="nit" required value="${escapeHtml(cfg.nit)}" placeholder="1234567-8">
      </label>
      <label>
        Razon social
        <input name="nombre" required value="${escapeHtml(cfg.nombre)}" placeholder="Mi Empresa S.A.">
      </label>
      <label>
        Nombre comercial
        <input name="nombre_comercial" required value="${escapeHtml(cfg.nombre_comercial)}" placeholder="Mi Tienda">
      </label>
      <label>
        Direccion fiscal
        <input name="direccion" required value="${escapeHtml(cfg.direccion)}" placeholder="Ciudad de Guatemala">
      </label>
      <label>
        Codigo postal
        <input name="codigo_postal" value="${escapeHtml(cfg.codigo_postal || "01001")}" placeholder="01001">
      </label>
      <label>
        Municipio
        <input name="municipio" required value="${escapeHtml(cfg.municipio)}" placeholder="Guatemala">
      </label>
      <label>
        Departamento
        <input name="departamento" required value="${escapeHtml(cfg.departamento)}" placeholder="Guatemala">
      </label>
      <label>
        Afiliacion IVA
        <select name="afiliacion_iva">
          <option value="GEN" ${cfg.afiliacion_iva === "GEN" ? "selected" : ""}>GEN - General</option>
          <option value="PEQ" ${cfg.afiliacion_iva === "PEQ" ? "selected" : ""}>PEQ - Pequeno contribuyente</option>
          <option value="EXE" ${cfg.afiliacion_iva === "EXE" ? "selected" : ""}>EXE - Exento</option>
        </select>
      </label>
      <label>
        Establecimiento SAT
        <input name="establecimiento" required value="${escapeHtml(cfg.establecimiento)}" placeholder="1">
      </label>
      <label>
        Tipo de tienda
        <select name="business_profile">
          <option value="abarrotes" ${cfg.business_profile === "abarrotes" ? "selected" : ""}>Abarrotes</option>
          <option value="farmacia" ${cfg.business_profile === "farmacia" ? "selected" : ""}>Farmacia</option>
          <option value="libreria" ${cfg.business_profile === "libreria" ? "selected" : ""}>Libreria escolar</option>
          <option value="ferreteria" ${cfg.business_profile === "ferreteria" ? "selected" : ""}>Ferreteria</option>
          <option value="restaurante" ${cfg.business_profile === "restaurante" ? "selected" : ""}>Restaurante</option>
          <option value="boutique" ${cfg.business_profile === "boutique" ? "selected" : ""}>Boutique</option>
        </select>
      </label>
      <label>
        Facturacion contable (FEL)
        <select name="fel_mode" id="store-fel-mode">
          <option value="disabled" ${cfg.fel_mode === "disabled" ? "selected" : ""}>Sin factura contable (solo ticket POS)</option>
          <option value="demo" ${cfg.fel_mode === "demo" ? "selected" : ""}>Con FEL demo (pruebas sin SAT)</option>
          <option value="production" ${cfg.fel_mode === "production" ? "selected" : ""}>Con FEL produccion (factura real SAT)</option>
        </select>
      </label>
      <div id="fel-certifier-fields" ${showFelCertifierFields ? "" : 'style="display:none;"'}>
      <label>
        Certificador
        <select name="certificador" id="store-certificador">
          <option value="infile" ${cfg.certificador === "infile" ? "selected" : ""}>Infile</option>
          <option value="digifact" ${cfg.certificador === "digifact" ? "selected" : ""}>Digifact</option>
        </select>
      </label>
      <label>
        Usuario certificador
        <input name="certificador_usuario" value="${escapeHtml(cfg.certificador_usuario || "")}" placeholder="Usuario API del certificador">
      </label>
      <label>
        Llave / token certificador
        <input name="certificador_llave" type="password" autocomplete="new-password" placeholder="${escapeHtml(llaveHint)}">
      </label>
      <label>
        URL API certificador
        <input name="certificador_url" value="${escapeHtml(cfg.certificador_url || "")}" placeholder="Se completa segun certificador">
      </label>
      </div>
      <div class="row">
        <span>Estado actual</span>
        <span class="${felModeBadgeClass}">${escapeHtml(felModeLabel)}</span>
      </div>
      <button class="btn primary" type="submit">Guardar configuracion de tienda</button>
    </form>
    <p style="color: var(--muted); margin-top: 0.35rem;">
      Si no necesitas factura electronica SAT, elige <strong>Sin factura contable</strong> y el POS funcionara con ticket de venta normal.
    </p>
    <hr style="border-color: var(--border); width: 100%;">
    ${renderReceiptPrinterSection()}
    ${renderLabelPrinterSection()}
    <div class="row"><span>Empresa activa</span><strong>${escapeHtml(cfg.nombre_comercial)}</strong></div>
    <div class="row"><span>NIT activo</span><strong>${escapeHtml(cfg.nit)}</strong></div>
    <div class="row"><span>Tipo de tienda</span><strong>${profileLabel}</strong></div>
    <div class="row"><span>Facturacion</span><strong>${escapeHtml(felModeLabel)}</strong></div>
    ${showFelCertifierFields ? `<div class="row"><span>Certificador</span><strong>${escapeHtml(cfg.certificador)}</strong></div>` : ""}
    <hr style="border-color: var(--border); width: 100%;">
    ${renderScannerBridgeSection()}
    <hr style="border-color: var(--border); width: 100%;">
    <h3 style="margin: 0.2rem 0 0;">Panel administracion de fondos abiertos</h3>
    <p class="hint">Cada cajero tiene su propio fondo. Aqui puedes ver todos los fondos abiertos, transferir turnos y hacer arqueos.</p>
    <div id="admin-cash-monitor-card" class="config-card" style="padding: 0.2rem 0;"></div>
    <hr style="border-color: var(--border); width: 100%;">
    <h3 style="margin: 0.2rem 0 0;">Notificaciones de ordenes</h3>
    <p class="hint">Configura envio real por Gmail (SMTP) y WhatsApp Cloud API. Sin credenciales, el sistema queda en modo simulado.</p>
    <form id="notification-config-form">
      <label>Gmail remitente<input name="gmail_sender" value="${escapeHtml(state.notificationConfig?.gmail_sender || "")}" placeholder="tienda@gmail.com"></label>
      <label>Clave de aplicacion Gmail<input name="gmail_app_password" type="password" placeholder="${state.notificationConfig?.gmail_app_password_configured ? "Configurada (dejar vacio para conservar)" : "Clave de app de 16 caracteres"}"></label>
      <label>SMTP host<input name="gmail_smtp_host" value="${escapeHtml(state.notificationConfig?.gmail_smtp_host || "smtp.gmail.com")}"></label>
      <label>SMTP puerto<input name="gmail_smtp_port" type="number" min="1" max="65535" value="${Number(state.notificationConfig?.gmail_smtp_port || 587)}"></label>
      <label>WhatsApp Phone ID<input name="whatsapp_phone_id" value="${escapeHtml(state.notificationConfig?.whatsapp_phone_id || "")}" placeholder="ID del numero en Meta"></label>
      <label>WhatsApp token<input name="whatsapp_token" type="password" placeholder="${state.notificationConfig?.whatsapp_token_configured ? "Configurado (dejar vacio para conservar)" : "Token permanente Meta"}"></label>
      <label>WhatsApp API URL<input name="whatsapp_api_url" value="${escapeHtml(state.notificationConfig?.whatsapp_api_url || "https://graph.facebook.com/v20.0")}"></label>
      <div class="panel-actions">
        <button class="btn primary" type="submit">Guardar notificaciones</button>
        <button id="test-gmail-config-btn" class="btn ghost" type="button">Probar Gmail</button>
        <button id="test-whatsapp-config-btn" class="btn ghost" type="button">Probar WhatsApp</button>
      </div>
      <p class="hint">Gmail: ${state.notificationConfig?.gmail_ready ? "listo para envio real" : "modo simulado"} · WhatsApp: ${state.notificationConfig?.whatsapp_ready ? "listo para envio real" : "modo simulado"}</p>
    </form>
    <hr style="border-color: var(--border); width: 100%;">
    <h3 style="margin: 0.2rem 0 0;">Usuarios del sistema</h3>
    <p class="hint">Cada cajero debe tener su propio usuario para ingresar a app principal y app movil.</p>
    <form id="system-user-form">
      <label>
        Nombre completo
        <input name="full_name" required placeholder="Nombre del cajero">
      </label>
      <label>
        Usuario
        <input name="username" required placeholder="Ej. cajero2">
      </label>
      <label>
        Clave temporal
        <input name="password" type="password" minlength="4" required placeholder="Minimo 4 caracteres">
      </label>
      <label>
        Rol
        <select name="role">
          <option value="user" selected>Cajero</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <button class="btn primary" type="submit">Crear usuario</button>
    </form>
    <div class="panel-actions">
      <input id="system-user-search" type="search" placeholder="Buscar por nombre o usuario">
      <select id="system-user-role-filter">
        <option value="all" selected>Todos los roles</option>
        <option value="user">Solo cajeros</option>
        <option value="admin">Solo admin</option>
      </select>
      <select id="system-user-status-filter">
        <option value="active_user" selected>Cajeros activos</option>
        <option value="active">Activos</option>
        <option value="inactive">Inactivos</option>
        <option value="all">Todos</option>
      </select>
    </div>
    <div class="table-wrap">
      <div id="system-users-table"></div>
    </div>
    <hr style="border-color: var(--border); width: 100%;">
    <h3 style="margin: 0.2rem 0 0;">Seguridad de venta cajero</h3>
    <p class="hint">La clave por cada venta esta desactivada. El cajero puede vender al abrir caja sin pedir contrasena otra vez.</p>
    <form id="sale-security-form" hidden>
      <label>
        Bloqueo por inactividad (segundos)
        <input
          id="sale-inactivity-seconds"
          name="seconds"
          type="number"
          min="${SALE_INACTIVITY_SECONDS_MIN}"
          max="${SALE_INACTIVITY_SECONDS_MAX}"
          step="1"
          value="${getSaleInactivitySeconds()}"
          required
        >
      </label>
      <div class="sale-inactivity-presets">
        <button class="btn ghost sale-inactivity-preset-btn" type="button" data-seconds="30">30s</button>
        <button class="btn ghost sale-inactivity-preset-btn" type="button" data-seconds="60">60s</button>
        <button class="btn ghost sale-inactivity-preset-btn" type="button" data-seconds="120">120s</button>
        <button class="btn ghost sale-inactivity-preset-btn" type="button" data-seconds="180">180s</button>
      </div>
      <button class="btn primary" type="submit">Guardar tiempo de bloqueo</button>
    </form>
    <hr style="border-color: var(--border); width: 100%;">
    ${
      showFelCertifierFields
        ? `<h3 style="margin: 0.2rem 0 0;">FEL pendientes (modo offline)</h3>
    <p class="hint">Ventas guardadas localmente cuando el certificador no esta disponible. Reintenta o descarta las que ya no aplican.</p>
    <div class="panel-actions">
      <button id="pending-fel-retry-all-btn" class="btn primary" type="button">Reintentar todas</button>
    </div>
    <div id="pending-fel-table" class="table-wrap"></div>
    <hr style="border-color: var(--border); width: 100%;">`
        : ""
    }
    <h3 style="margin: 0.2rem 0 0;">Bitacora de auditoria</h3>
    <div id="audit-logs-table" class="table-wrap"></div>
    <hr style="border-color: var(--border); width: 100%;">
    <h3 style="margin: 0.2rem 0 0;">Sucursales</h3>
    <div id="branches-table" class="table-wrap"></div>
    <hr style="border-color: var(--border); width: 100%;">
    <h3 style="margin: 0.2rem 0 0;">Respaldo del sistema</h3>
    <p class="hint">Crea respaldos de la base de datos y restaura en un clic cuando sea necesario.</p>
    <p class="hint">Solo se muestran los 3 respaldos mas recientes. El sistema tambien crea auto-respaldos y puede recuperar la base al iniciar si detecta dano.</p>
    <div class="panel-actions">
      <button id="system-backup-create-btn" class="btn primary" type="button">Crear respaldo ahora</button>
      <button id="system-backup-refresh-btn" class="btn ghost" type="button">Actualizar lista</button>
    </div>
    <div class="table-wrap">
      <div id="system-backups-table"></div>
    </div>
  `;
  document.getElementById("company-name").textContent =
    `${state.config.nombre_comercial} · NIT ${state.config.nit} · ${profileLabel}`;

  const certificadorDefaultUrls = {
    infile: "https://certificador.infile.com/api",
    digifact: "https://felgtaws.digifact.com.gt/gt.com.apinuc",
  };
  document.getElementById("check-system-update-btn")?.addEventListener("click", () => {
    checkSystemUpdates();
  });
  document.getElementById("apply-system-update-btn")?.addEventListener("click", () => {
    applySystemUpdate();
  });

  const felModeSelect = document.getElementById("store-fel-mode");
  const felCertifierFields = document.getElementById("fel-certifier-fields");
  const refreshFelCertifierFields = () => {
    const enabled = String(felModeSelect?.value || "") !== "disabled";
    if (felCertifierFields) {
      felCertifierFields.style.display = enabled ? "" : "none";
    }
  };
  felModeSelect?.addEventListener("change", refreshFelCertifierFields);
  refreshFelCertifierFields();

  const certificadorSelect = document.getElementById("store-certificador");
  const certificadorUrlInput = document.querySelector('#store-config-form input[name="certificador_url"]');
  certificadorSelect?.addEventListener("change", () => {
    if (!certificadorUrlInput) return;
    const selected = String(certificadorSelect.value || "").toLowerCase();
    const current = String(certificadorUrlInput.value || "").trim();
    const knownUrls = Object.values(certificadorDefaultUrls);
    if (!current || knownUrls.includes(current)) {
      certificadorUrlInput.value = certificadorDefaultUrls[selected] || "";
    }
  });

  document.getElementById("store-config-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      nit: form.nit.value.trim(),
      nombre: form.nombre.value.trim(),
      nombre_comercial: form.nombre_comercial.value.trim(),
      direccion: form.direccion.value.trim(),
      codigo_postal: form.codigo_postal.value.trim() || "01001",
      municipio: form.municipio.value.trim(),
      departamento: form.departamento.value.trim(),
      afiliacion_iva: form.afiliacion_iva.value,
      establecimiento: form.establecimiento.value.trim() || "1",
      business_profile: form.business_profile.value,
      fel_mode: form.fel_mode.value,
      certificador: form.certificador.value,
      certificador_usuario: form.certificador_usuario.value.trim(),
      certificador_llave: form.certificador_llave.value,
      certificador_url: form.certificador_url.value.trim(),
    };
    if (!payload.nit || !payload.nombre || !payload.nombre_comercial || !payload.direccion) {
      alert("Completa NIT, razon social, nombre comercial y direccion.");
      return;
    }
    if (payload.fel_mode !== "disabled" && payload.fel_mode === "production" && !payload.certificador_usuario) {
      alert("En modo produccion debes indicar el usuario del certificador.");
      return;
    }
    if (
      payload.fel_mode === "production" &&
      !payload.certificador_llave &&
      !state.config.certificador_llave_configured
    ) {
      alert("En modo produccion debes indicar la llave o token del certificador.");
      return;
    }
    try {
      state.config = await api("/api/config", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      state.businessProfile = state.config.business_profile;
      applyBusinessProfileUi();
      renderConfig();
      alert("Configuracion de tienda guardada correctamente.");
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("receipt-printer-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      printer_name: form.printer_name.value,
      print_on_checkout: Boolean(form.print_on_checkout?.checked),
      open_drawer_on_checkout: Boolean(form.open_drawer_on_checkout?.checked),
      chars_per_line: Number(form.chars_per_line.value || 48),
      bottom_feed_lines: Number(form.bottom_feed_lines.value || 8),
      encoding: form.encoding.value,
      header_line_1: form.header_line_1?.value || "",
      header_line_2: form.header_line_2?.value || "",
      header_line_3: form.header_line_3?.value || "",
      show_company_nit: Boolean(form.show_company_nit?.checked),
      show_address: Boolean(form.show_address?.checked),
      center_header: Boolean(form.center_header?.checked),
      footer_message: form.footer_message?.value || "Gracias por su compra",
      footer_extra: form.footer_extra?.value || "",
      ticket_label: form.ticket_label?.value || "TICKET #{id}",
      separator_char: form.separator_char?.value || "-",
      show_customer: Boolean(form.show_customer?.checked),
      show_date: Boolean(form.show_date?.checked),
      show_subtotal: Boolean(form.show_subtotal?.checked),
      show_tax: Boolean(form.show_tax?.checked),
      show_payments: Boolean(form.show_payments?.checked),
      show_fel: Boolean(form.show_fel?.checked),
      show_wholesale_savings: Boolean(form.show_wholesale_savings?.checked),
      show_item_detail: Boolean(form.show_item_detail?.checked),
    };
    try {
      state.receiptPrinterConfig = await api("/api/config/receipt-printer", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      renderConfig();
      alert("Configuracion de impresora y ticket guardada correctamente.");
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("test-receipt-printer-btn")?.addEventListener("click", async () => {
    try {
      const result = await api("/api/config/receipt-printer/test", { method: "POST" });
      alert(result?.message || "Ticket de prueba enviado.");
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("test-cash-drawer-btn")?.addEventListener("click", async () => {
    try {
      const result = await openCashDrawer(false);
      alert(result?.message || "Se envio el pulso al cajon.");
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("label-printer-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      state.labelPrinterConfig = await api("/api/config/label-printer", {
        method: "PUT",
        body: JSON.stringify({ printer_name: form.printer_name.value || "" }),
      });
      renderConfig();
      alert("Impresora de etiquetas guardada.");
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("test-label-printer-btn")?.addEventListener("click", async () => {
    try {
      const result = await api("/api/config/label-printer/test", { method: "POST" });
      alert(result?.message || "Etiqueta de prueba enviada.");
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("notification-config-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      state.notificationConfig = await api("/api/config/notifications", {
        method: "PUT",
        body: JSON.stringify({
          gmail_sender: form.gmail_sender.value.trim(),
          gmail_app_password: form.gmail_app_password.value,
          gmail_smtp_host: form.gmail_smtp_host.value.trim(),
          gmail_smtp_port: Number(form.gmail_smtp_port.value || 587),
          whatsapp_phone_id: form.whatsapp_phone_id.value.trim(),
          whatsapp_token: form.whatsapp_token.value,
          whatsapp_api_url: form.whatsapp_api_url.value.trim(),
        }),
      });
      renderConfig();
      alert("Configuracion de notificaciones guardada.");
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("scanner-bridge-config-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      state.scannerBridgeConfig = await api("/api/config/scanner-bridge", {
        method: "PUT",
        body: JSON.stringify({
          enabled: Boolean(form.enabled?.checked),
          port: Number(form.port.value || 18765),
          username: form.username.value.trim(),
          password: form.password.value,
          com_port: form.com_port.value.trim(),
        }),
      });
      renderConfig();
      alert("Configuracion del puente scanner guardada.");
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("scanner-bridge-toggle-btn")?.addEventListener("click", async () => {
    try {
      state.scannerBridgeConfig = await api("/api/config/scanner-bridge/toggle", { method: "POST" });
      renderConfig();
      const label = state.scannerBridgeConfig?.running ? "Puente scanner activo." : "Puente scanner detenido.";
      alert(label);
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("scanner-bridge-refresh-btn")?.addEventListener("click", async () => {
    try {
      state.scannerBridgeConfig = await api("/api/config/scanner-bridge");
      renderConfig();
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("test-gmail-config-btn")?.addEventListener("click", async () => {
    const recipient = prompt("Correo de prueba:");
    if (!recipient) return;
    try {
      const result = await api("/api/config/notifications/test/gmail", {
        method: "POST",
        body: JSON.stringify({ recipient }),
      });
      alert(`Gmail: ${result.status}`);
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("test-whatsapp-config-btn")?.addEventListener("click", async () => {
    const recipient = prompt("Numero WhatsApp de prueba (ej. 50255550101):");
    if (!recipient) return;
    try {
      const result = await api("/api/config/notifications/test/whatsapp", {
        method: "POST",
        body: JSON.stringify({ recipient }),
      });
      alert(`WhatsApp: ${result.status}`);
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("pending-fel-retry-all-btn")?.addEventListener("click", retryAllPendingFel);

  document.getElementById("license-config-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      state.licenseConfig = await api("/api/config/license", {
        method: "PUT",
        body: JSON.stringify({
          store_license_key: form.store_license_key.value.trim(),
          license_required_for_updates: Boolean(form.license_required_for_updates?.checked),
        }),
      });
      await checkSystemUpdates({ silent: true });
      renderConfig();
      alert("Licencia guardada y validada.");
    } catch (error) {
      alert(error.message);
    }
  });

  renderAdminCashMonitorCard();
  if (isFelEnabledInConfig()) {
    renderPendingFelTable();
  }
  renderAuditLogsTable();
  renderBranchesTable();

  document.getElementById("system-user-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      full_name: form.full_name.value.trim(),
      username: form.username.value.trim(),
      password: form.password.value,
      role: form.role.value === "admin" ? "admin" : "user",
      active: 1,
    };
    if (!payload.full_name || !payload.username || !payload.password) {
      alert("Completa nombre, usuario y clave.");
      return;
    }
    try {
      await api("/api/auth/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      form.reset();
      form.role.value = "user";
      await loadData();
      alert("Usuario creado correctamente.");
    } catch (error) {
      alert(error.message);
    }
  });

  const saleSecurityForm = document.getElementById("sale-security-form");
  const saleInactivityInput = document.getElementById("sale-inactivity-seconds");
  const salePresetButtons = Array.from(document.querySelectorAll(".sale-inactivity-preset-btn"));
  const refreshSalePresetButtons = (seconds) => {
    salePresetButtons.forEach((button) => {
      const presetSeconds = Number(button.dataset.seconds || 0);
      button.classList.toggle("active", presetSeconds === Number(seconds));
    });
  };
  const applySaleInactivitySeconds = (rawValue) => {
    const normalized = setSaleInactivitySeconds(rawValue);
    if (saleInactivityInput) saleInactivityInput.value = String(normalized);
    refreshSalePresetButtons(normalized);
    return normalized;
  };

  saleSecurityForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const rawValue = Number(saleInactivityInput?.value || 0);
    if (!Number.isFinite(rawValue) || rawValue <= 0) {
      alert("Ingresa segundos validos para bloqueo por inactividad.");
      return;
    }
    const normalized = applySaleInactivitySeconds(rawValue);
    alert(`Tiempo de bloqueo guardado: ${normalized} segundos.`);
  });

  salePresetButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const presetSeconds = Number(button.dataset.seconds || 0);
      if (!Number.isFinite(presetSeconds) || presetSeconds <= 0) return;
      const normalized = applySaleInactivitySeconds(presetSeconds);
      alert(`Tiempo de bloqueo guardado: ${normalized} segundos.`);
    });
  });
  refreshSalePresetButtons(getSaleInactivitySeconds());

  const searchInput = document.getElementById("system-user-search");
  const roleFilter = document.getElementById("system-user-role-filter");
  const statusFilter = document.getElementById("system-user-status-filter");
  const usersTableContainer = document.getElementById("system-users-table");

  const renderUsersTable = () => {
    if (!usersTableContainer) return;
    const searchTerm = String(searchInput?.value || "")
      .trim()
      .toLowerCase();
    const roleValue = String(roleFilter?.value || "all");
    const statusValue = String(statusFilter?.value || "active_user");

    const filteredUsers = state.users.filter((user) => {
      const matchesSearch =
        !searchTerm ||
        String(user.full_name || "")
          .toLowerCase()
          .includes(searchTerm) ||
        String(user.username || "")
          .toLowerCase()
          .includes(searchTerm);
      const matchesRole = roleValue === "all" || user.role === roleValue;
      let matchesStatus = true;
      if (statusValue === "active") matchesStatus = Number(user.active) === 1;
      if (statusValue === "inactive") matchesStatus = Number(user.active) === 0;
      if (statusValue === "active_user") matchesStatus = Number(user.active) === 1 && user.role === "user";
      return matchesSearch && matchesRole && matchesStatus;
    });

    if (!filteredUsers.length) {
      usersTableContainer.innerHTML = '<div class="empty">No hay usuarios con este filtro.</div>';
      return;
    }

    const usersRows = filteredUsers
      .map(
        (user) => `
        <tr>
          <td>${escapeHtml(user.full_name)}</td>
          <td>${escapeHtml(user.username)}</td>
          <td>${user.role === "admin" ? "Admin" : "Cajero"}</td>
          <td>${user.active ? "Activo" : "Inactivo"}</td>
          <td>
            <div class="table-actions">
              <button class="btn ghost user-toggle-btn" data-user-id="${user.id}" data-user-active="${user.active}">
                ${user.active ? "Desactivar" : "Activar"}
              </button>
              <button class="btn ghost user-reset-password-btn" data-user-id="${user.id}" data-user-username="${escapeHtml(
          user.username
        )}">
                Reset clave
              </button>
            </div>
          </td>
        </tr>
      `
      )
      .join("");

    usersTableContainer.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Estado</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${usersRows}</tbody>
      </table>
    `;

    usersTableContainer.querySelectorAll(".user-toggle-btn").forEach((button) => {
      button.addEventListener("click", () =>
        toggleSystemUserActive(Number(button.dataset.userId), Number(button.dataset.userActive || 0))
      );
    });
    usersTableContainer.querySelectorAll(".user-reset-password-btn").forEach((button) => {
      button.addEventListener("click", () =>
        resetSystemUserPassword(Number(button.dataset.userId), button.dataset.userUsername || "usuario")
      );
    });
  };

  searchInput?.addEventListener("input", renderUsersTable);
  roleFilter?.addEventListener("change", renderUsersTable);
  statusFilter?.addEventListener("change", renderUsersTable);
  renderUsersTable();

  const backupsTableContainer = document.getElementById("system-backups-table");
  const renderBackupsTable = () => {
    if (!backupsTableContainer) return;
    const backups = [...(state.backups || [])].slice(0, 3);
    if (!backups.length) {
      backupsTableContainer.innerHTML = '<div class="empty">Aun no hay respaldos creados.</div>';
      return;
    }
    const rows = backups
      .map(
        (backup) => `
        <tr>
          <td>${escapeHtml(backup.name)}</td>
          <td>${new Date(backup.created_at).toLocaleString("es-GT")}</td>
          <td>${Number(backup.size_mb || 0).toFixed(3)} MB</td>
          <td>
            <div class="table-actions">
              <button class="btn ghost backup-restore-btn" data-backup-name="${escapeHtml(backup.name)}">Restaurar</button>
            </div>
          </td>
        </tr>
      `
      )
      .join("");
    backupsTableContainer.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Archivo</th>
            <th>Fecha</th>
            <th>Tamano</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;

    backupsTableContainer.querySelectorAll(".backup-restore-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const backupName = button.dataset.backupName || "";
        const confirmed = window.confirm(
          `Se restaurara el respaldo ${backupName}. Se creara un respaldo de seguridad antes de restaurar. Deseas continuar?`
        );
        if (!confirmed) return;
        try {
          const result = await api(`/api/system/backups/${encodeURIComponent(backupName)}/restore`, {
            method: "POST",
          });
          await loadData();
          alert(
            `${result.message}\nRespaldo restaurado: ${result.restored_backup?.name || "-"}\n` +
              `Respaldo de seguridad: ${result.safety_backup?.name || "-"}`
          );
        } catch (error) {
          alert(error.message);
        }
      });
    });
  };

  document.getElementById("system-backup-create-btn")?.addEventListener("click", async () => {
    try {
      const result = await api("/api/system/backups", { method: "POST" });
      await loadData();
      alert(`${result.message}\nArchivo: ${result.backup?.name || "-"}`);
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("system-backup-refresh-btn")?.addEventListener("click", async () => {
    try {
      state.backups = await api("/api/system/backups");
      renderBackupsTable();
    } catch (error) {
      alert(error.message);
    }
  });

  renderBackupsTable();
}

async function autofillCustomerByNit() {
  const nitInput = document.getElementById("customer-nit");
  const nameInput = document.getElementById("customer-name");
  const normalizedNit = normalizeNit(nitInput.value);
  nitInput.value = normalizedNit;

  if (normalizedNit === "CF") {
    const current = nameInput.value.trim().toUpperCase();
    if (!nameInput.value.trim() || current === "CLIENTE") {
      nameInput.value = "CONSUMIDOR FINAL";
    }
    return;
  }

  try {
    const lookup = await api(`/api/customers/lookup/${encodeURIComponent(normalizedNit)}`);
    const currentName = nameInput.value.trim().toUpperCase();
    const canAutofill =
      !nameInput.value.trim() || currentName === "CONSUMIDOR FINAL" || currentName === "CLIENTE";

    if (lookup?.nit) {
      nitInput.value = lookup.nit;
    }
    if (canAutofill) {
      if (lookup?.found && lookup?.name) {
        nameInput.value = lookup.name;
      } else {
        nameInput.value = "CLIENTE";
      }
    }
  } catch (error) {
    // If lookup service is not configured or fails, continue with manual input.
    console.warn("No se pudo autocompletar NIT:", error?.message || error);
  }
}

function validateNitField(showAlert = false) {
  const nitInput = document.getElementById("customer-nit");
  const normalizedNit = normalizeNit(nitInput.value);
  nitInput.value = normalizedNit;
  if (!isValidNit(normalizedNit)) {
    const message = "NIT invalido. Ingresa un NIT valido o deja CF.";
    if (showAlert) alert(message);
    return false;
  }
  return true;
}

async function loadData() {
  const isAdmin = state.user?.role === "admin";
  const profilePromise = api("/api/config/profile");
  const configPromise = isAdmin ? api("/api/config") : Promise.resolve(null);
  const usersPromise = isAdmin ? api("/api/auth/users") : Promise.resolve([]);
  const backupsPromise = isAdmin ? api("/api/system/backups") : Promise.resolve([]);
  const suppliersPromise = isAdmin ? api("/api/suppliers") : Promise.resolve([]);
  const departmentsPromise = api("/api/departments");
  const purchaseOrdersPromise = isAdmin ? api("/api/purchase-orders") : Promise.resolve([]);
  const ordersPromise = isAdmin ? api("/api/orders") : Promise.resolve([]);
  const lowStockPromise = isAdmin ? api("/api/products/low-stock") : Promise.resolve([]);
  const lowStockReportPromise = isAdmin ? api("/api/products/low-stock/report") : Promise.resolve([]);
  const stockCountCurrentPromise = isAdmin ? api("/api/stock-count/sessions/current") : Promise.resolve(null);
  const stockCountSessionsPromise = isAdmin ? api("/api/stock-count/sessions") : Promise.resolve([]);
  const versionPromise = api("/api/system/version").catch(() => null);
  const customersPromise = isAdmin ? api("/api/customers") : Promise.resolve([]);
  const promotionsPromise = api("/api/promotions").catch(() => []);
  const schoolPackagesPromise = api("/api/school-packages").catch(() => []);
  const alertsPromise = api("/api/reports/alerts").catch(() => []);
  const reportsPromise = isAdmin ? api("/api/reports/dashboard").catch(() => null) : Promise.resolve(null);
  const auditPromise = isAdmin ? api("/api/audit-logs?limit=50").catch(() => []) : Promise.resolve([]);
  const pendingFelPromise = isAdmin ? api("/api/fel/pending").catch(() => []) : Promise.resolve([]);
  const branchesPromise = isAdmin ? api("/api/branches").catch(() => []) : Promise.resolve([]);
  const updateCheckPromise = isAdmin
    ? api("/api/system/update/check").catch(() => null)
    : Promise.resolve(null);
  const receiptPrinterPromise = isAdmin
    ? api("/api/config/receipt-printer").catch(() => null)
    : Promise.resolve(null);
  const labelPrinterPromise = api("/api/config/label-printer").catch(() => null);
  const systemConfigPromise = isAdmin ? api("/api/config/system").catch(() => null) : Promise.resolve(null);
  const notificationConfigPromise = isAdmin
    ? api("/api/config/notifications").catch(() => null)
    : Promise.resolve(null);
  const scannerBridgeConfigPromise = isAdmin
    ? api("/api/config/scanner-bridge").catch(() => null)
    : Promise.resolve(null);
  const licenseConfigPromise = isAdmin ? api("/api/config/license").catch(() => null) : Promise.resolve(null);
  const [
    products,
    sales,
    profileInfo,
    config,
    users,
    backups,
    orders,
    currentCash,
    lowStock,
    lowStockReport,
    suppliers,
    departments,
    purchaseOrders,
    stockCountCurrent,
    stockCountSessions,
    appVersion,
    customers,
    promotions,
    schoolPackages,
    systemAlerts,
    reports,
    auditLogs,
    pendingFelSales,
    branches,
    updateInfo,
    receiptPrinterConfig,
    labelPrinterConfig,
    systemConfig,
    notificationConfig,
    scannerBridgeConfig,
    licenseConfig,
  ] = await Promise.all([
    api("/api/products"),
    api("/api/sales"),
    profilePromise,
    configPromise,
    usersPromise,
    backupsPromise,
    ordersPromise,
    api("/api/cash/sessions/current"),
    lowStockPromise,
    lowStockReportPromise,
    suppliersPromise,
    departmentsPromise,
    purchaseOrdersPromise,
    stockCountCurrentPromise,
    stockCountSessionsPromise,
    versionPromise,
    customersPromise,
    promotionsPromise,
    schoolPackagesPromise,
    alertsPromise,
    reportsPromise,
    auditPromise,
    pendingFelPromise,
    branchesPromise,
    updateCheckPromise,
    receiptPrinterPromise,
    labelPrinterPromise,
    systemConfigPromise,
    notificationConfigPromise,
    scannerBridgeConfigPromise,
    licenseConfigPromise,
  ]);
  state.products = products;
  state.suppliers = suppliers;
  state.departments = departments;
  state.purchaseOrders = purchaseOrders;
  state.sales = sales;
  state.businessProfile = String(profileInfo?.business_profile || state.businessProfile || "abarrotes").toLowerCase();
  state.runtimeConfig = {
    nit_lookup_configured: Boolean(profileInfo?.nit_lookup_configured),
  };
  state.config = config;
  state.users = users;
  state.backups = backups;
  state.orders = orders;
  state.currentCash = currentCash;
  state.lowStockProducts = lowStock;
  state.lowStockReport = lowStockReport;
  state.stockCountCurrent = stockCountCurrent;
  state.stockCountSessions = stockCountSessions;
  state.appVersion = appVersion;
  state.customers = customers;
  state.promotions = promotions;
  state.schoolPackages = schoolPackages;
  state.systemAlerts = systemAlerts;
  state.reports = reports;
  state.auditLogs = auditLogs;
  state.pendingFelSales = pendingFelSales;
  state.branches = branches;
  state.updateInfo = updateInfo;
  state.receiptPrinterConfig = receiptPrinterConfig;
  state.labelPrinterConfig = labelPrinterConfig;
  state.systemConfig = systemConfig;
  state.notificationConfig = notificationConfig;
  state.scannerBridgeConfig = scannerBridgeConfig;
  state.licenseConfig = licenseConfig;
  renderVersionLabel();
  renderSystemAlertsBar();
  populateCustomerSelect();
  renderSchoolPackagesPos();
  applyBusinessProfileUi();
  renderCashOwnerIndicator();
  renderSaleSessionIndicator();

  populatePosDepartmentFilter();
  renderPosDepartmentChips();
  renderProducts();
  renderCart();
  renderProductsTable();
  renderDepartmentsTable();
  renderSuppliersTable();
  renderPurchaseOrdersTable();
  renderInventoryDashboard();
  renderStockCountPanel();
  renderSalesTable();
  renderReportsDashboard();
  renderCustomersTable();
  renderPromotionsTable();
  renderOrdersTable();
  renderCashCard();
  if (state.user?.role === "admin") {
    renderConfig();
    await refreshAdminCashMonitorData();
    renderAdminCashMonitorCard();
    ensureAdminCashMonitorAutoRefresh();
  } else {
    clearAdminCashMonitorTimer();
  }
}

function isCurrentCashOwnedByLoggedUser() {
  if (!state.currentCash || !state.user) return false;
  return Number(state.currentCash.opened_by_user_id) === Number(state.user.id);
}

function canUseCurrentCash() {
  if (!state.currentCash || !state.user) return false;
  if (state.user.role === "admin") return true;
  return isCurrentCashOwnedByLoggedUser();
}

function ensureCashOwnership(actionLabel = "operar caja") {
  if (!state.currentCash) {
    alert("Debes abrir tu fondo antes de continuar.");
    return false;
  }
  if (!canUseCurrentCash()) {
    alert(
      `No puedes ${actionLabel}. Debes usar el fondo que abriste con tu usuario.`
    );
    return false;
  }
  return true;
}

function renderCashOwnerIndicator() {
  const indicator = document.getElementById("cash-owner-indicator");
  const captureBtn = document.getElementById("open-cash-capture-btn");
  const closeShiftBtn = document.getElementById("close-cash-shift-btn");
  if (!indicator) return;

  indicator.classList.remove("owner", "blocked");
  if (!state.user) {
    indicator.textContent = "Sin sesion. Inicia sesion para usar la caja.";
    if (captureBtn) captureBtn.disabled = true;
    if (closeShiftBtn) closeShiftBtn.disabled = true;
    return;
  }

  if (!state.currentCash) {
    indicator.textContent = isAdminUser()
      ? "Sin tu fondo activo. Como admin, abrir fondo es opcional."
      : "Sin tu fondo activo. Debes agregar fondo para comenzar.";
    if (captureBtn) captureBtn.disabled = true;
    if (closeShiftBtn) closeShiftBtn.disabled = true;
    return;
  }

  const ownsCash = isCurrentCashOwnedByLoggedUser();
  const canUseCash = canUseCurrentCash();
  if (canUseCash) {
    indicator.classList.add("owner");
    if (ownsCash) {
      indicator.textContent = `Tu fondo #${state.currentCash.id} esta abierto. Puedes cobrar con esta caja.`;
    } else {
      indicator.textContent = `Fondo #${state.currentCash.id} (admin). Puedes cobrar con esta caja.`;
    }
    if (captureBtn) captureBtn.disabled = !canUseCash;
    if (closeShiftBtn) closeShiftBtn.disabled = !ownsCash && state.user?.role !== "admin";
    return;
  }

  indicator.classList.add("blocked");
  indicator.textContent = `No puedes cobrar: el fondo abierto no pertenece a tu usuario.`;
  if (captureBtn) captureBtn.disabled = true;
  if (closeShiftBtn) closeShiftBtn.disabled = true;
}

function renderSaleSessionIndicator() {
  const indicator = document.getElementById("sale-session-indicator");
  const unlockBtn = document.getElementById("open-sale-session-btn");
  const captureBtn = document.getElementById("open-cash-capture-btn");
  const clearBtn = document.getElementById("clear-cart");
  const closeDraftBtn = document.getElementById("close-current-sale-btn");
  const searchInput = document.getElementById("product-search");
  const deptFilter = document.getElementById("pos-department-filter");
  if (!indicator || !unlockBtn) return;

  const lockEnabled = isCashierSaleLockEnabled();
  if (!lockEnabled) {
    clearSaleSessionAutoLockTimer();
    indicator.hidden = true;
    unlockBtn.hidden = true;
    unlockBtn.disabled = true;
    if (clearBtn) clearBtn.disabled = false;
    if (closeDraftBtn) closeDraftBtn.disabled = false;
    if (searchInput) searchInput.disabled = false;
    if (deptFilter) deptFilter.disabled = false;
    return;
  }

  indicator.hidden = false;
  unlockBtn.hidden = true;
  indicator.classList.remove("owner", "blocked");
  indicator.style.cursor = "";
  indicator.title = "";
  indicator.onclick = null;

  if (!state.currentCash) {
    state.saleSessionUnlocked = false;
    clearSaleSessionAutoLockTimer();
    indicator.classList.add("blocked");
    indicator.textContent = "Venta bloqueada. Debes abrir fondo antes de vender.";
    unlockBtn.disabled = true;
    if (captureBtn) captureBtn.disabled = true;
    if (clearBtn) clearBtn.disabled = true;
    if (closeDraftBtn) closeDraftBtn.disabled = true;
    if (searchInput) searchInput.disabled = true;
    if (deptFilter) deptFilter.disabled = true;
    renderProducts();
    return;
  }

  if (!canUseCurrentCash()) {
    state.saleSessionUnlocked = false;
    clearSaleSessionAutoLockTimer();
    indicator.classList.add("blocked");
    indicator.textContent = "Venta bloqueada. Debes abrir tu propio fondo para vender.";
    unlockBtn.disabled = true;
    if (captureBtn) captureBtn.disabled = true;
    if (clearBtn) clearBtn.disabled = true;
    if (closeDraftBtn) closeDraftBtn.disabled = true;
    if (searchInput) searchInput.disabled = true;
    if (deptFilter) deptFilter.disabled = true;
    renderProducts();
    return;
  }

  if (state.saleSessionUnlocked) {
    closeSalePasswordDialog();
    resetSaleSessionAutoLockTimer();
    indicator.classList.add("owner");
    indicator.textContent = "Venta activa. Puedes agregar productos, cobrar o cerrar venta.";
    unlockBtn.disabled = true;
    if (clearBtn) clearBtn.disabled = false;
    if (closeDraftBtn) closeDraftBtn.disabled = false;
    if (searchInput) searchInput.disabled = false;
    if (deptFilter) deptFilter.disabled = false;
    renderProducts();
    return;
  }

  indicator.classList.add("blocked");
  clearSaleSessionAutoLockTimer();
  indicator.textContent = "Ingresa tu clave para iniciar una nueva venta.";
  unlockBtn.hidden = true;
  unlockBtn.disabled = true;
  if (captureBtn) captureBtn.disabled = true;
  if (clearBtn) clearBtn.disabled = true;
  if (closeDraftBtn) closeDraftBtn.disabled = true;
  if (searchInput) searchInput.disabled = true;
  if (deptFilter) deptFilter.disabled = true;
  renderProducts();
}

function refreshPostLoginDialogState() {
  if (!state.user) return;
  const hint = document.getElementById("post-login-cash-hint");
  const fundSection = document.getElementById("post-login-fund-section");
  const amountInput = document.getElementById("post-login-opening-amount");
  const openCashBtn = document.getElementById("post-login-open-cash-btn");
  const forceCloseBtn = document.getElementById("post-login-force-close-btn");
  const enterBtn = document.getElementById("post-login-enter-btn");
  const logoutBtn = document.getElementById("post-login-logout-btn");
  if (!hint || !amountInput || !openCashBtn || !forceCloseBtn || !enterBtn) return;

  const hasOwnCashOpen = Boolean(state.currentCash) && isCurrentCashOwnedByLoggedUser();
  const isAdmin = isAdminUser();

  forceCloseBtn.hidden = true;
  forceCloseBtn.disabled = true;
  if (logoutBtn) logoutBtn.hidden = true;
  enterBtn.hidden = true;
  openCashBtn.hidden = false;
  openCashBtn.textContent = "Agregar fondo";
  amountInput.value = "";
  state.postLoginFundAdded = false;
  if (fundSection) fundSection.hidden = false;

  if (isAdmin && !hasOwnCashOpen) {
    if (fundSection) fundSection.hidden = true;
    openCashBtn.hidden = true;
    amountInput.disabled = true;
    openCashBtn.disabled = true;
    state.postLoginFundAdded = true;
    hint.textContent = "Admin puede ingresar sin agregar fondo.";
    return;
  }

  openCashBtn.hidden = false;

  if (!hasOwnCashOpen) {
    amountInput.disabled = false;
    openCashBtn.disabled = false;
    hint.textContent = "Ingresa el monto inicial de tu fondo para comenzar a vender.";
    return;
  }

  amountInput.disabled = true;
  openCashBtn.disabled = true;
  openCashBtn.textContent = "Fondo ya abierto";
  state.postLoginFundAdded = true;
  hint.textContent = `Tu fondo #${state.currentCash.id} sigue abierto. Continuando...`;
}

function openPostLoginDialog() {
  if (!state.user) return;
  refreshPostLoginDialogState();
  if (state.postLoginFundAdded) {
    return;
  }
  const dialog = document.getElementById("post-login-dialog");
  if (!dialog) return;
  if (!dialog.open) {
    dialog.showModal();
  }
  const amountInput = document.getElementById("post-login-opening-amount");
  if (amountInput && !amountInput.disabled) {
    setTimeout(() => amountInput.focus(), 0);
  }
}

async function printSaleReceipt(saleId, notifyOnSuccess = false, force = false) {
  if (!saleId) return;
  try {
    const endpoint = force
      ? `/api/sales/${saleId}/print-receipt?force=true`
      : `/api/sales/${saleId}/print-receipt`;
    const result = await api(endpoint, { method: "POST" });
    if (notifyOnSuccess) {
      alert(result?.message || "Ticket impreso.");
    }
  } catch (error) {
    alert(`Venta registrada, pero no se pudo imprimir ticket: ${error.message}`);
  }
}

async function openCashDrawer(notifyOnError = true) {
  try {
    return await api("/api/sales/open-drawer", { method: "POST" });
  } catch (error) {
    if (notifyOnError) {
      alert(`No se pudo abrir el cajon: ${error.message}`);
      return null;
    }
    throw error;
  }
}

function shouldOpenDrawerForPayment(paymentMethod, payments = null) {
  if (state.receiptPrinterConfig && state.receiptPrinterConfig.open_drawer_on_checkout === false) {
    return false;
  }
  if (paymentMethod === "efectivo") return true;
  if (paymentMethod === "mixto") {
    if (!payments?.length) return true;
    return payments.some((line) => line.payment_method === "efectivo" && Number(line.amount || 0) > 0);
  }
  return false;
}

async function checkout(printTicket = true) {
  if (!ensureCashOwnership("registrar ventas")) return;
  const unlocked = await ensureSaleSessionUnlocked();
  if (!unlocked) return;
  if (!state.cart.length) {
    alert("Agrega productos antes de cobrar.");
    return;
  }
  const paymentMethod = document.getElementById("payment-method").value;
  if (paymentMethod === "efectivo" || paymentMethod === "mixto") {
    openCashCheckoutDialog();
    return;
  }
  await processCheckout(paymentMethod, null, printTicket);
}

function promptSalePassword(actionLabel = "autorizar venta", { autoVerify = false } = {}) {
  const dialog = document.getElementById("sale-password-dialog");
  const form = document.getElementById("sale-password-form");
  const input = document.getElementById("sale-password-input");
  const hint = document.getElementById("sale-password-hint");
  const submitBtn = document.getElementById("sale-password-submit-btn");

  if (!dialog || !form || !input) {
    const fallback = prompt(`Ingresa tu clave para ${actionLabel}:`);
    return Promise.resolve(fallback === null ? null : String(fallback));
  }

  const userLabel = state.user?.full_name || state.user?.username || "usuario actual";
  const defaultHint = autoVerify
    ? "Escribe tu clave para comenzar a vender."
    : `Usuario activo: ${userLabel}. Ingresa la clave para ${actionLabel}.`;

  if (hint) hint.textContent = defaultHint;
  document.querySelectorAll(".sale-password-extra-action").forEach((element) => {
    element.hidden = autoVerify;
  });
  if (submitBtn) submitBtn.hidden = autoVerify;
  input.value = "";

  return new Promise((resolve) => {
    let submittedPassword = null;
    let verifying = false;
    let debounceTimer = null;

    const cleanup = () => {
      form.removeEventListener("submit", onSubmit);
      dialog.removeEventListener("close", onClose);
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKeyDown);
      if (debounceTimer) clearTimeout(debounceTimer);
      document.querySelectorAll(".sale-password-extra-action").forEach((element) => {
        element.hidden = false;
      });
      if (submitBtn) submitBtn.hidden = false;
    };

    const tryVerify = async () => {
      const entered = input.value || "";
      if (!entered.trim() || entered.trim().length < 3 || verifying) return;
      verifying = true;
      try {
        await api("/api/auth/confirm-password", {
          method: "POST",
          body: JSON.stringify({ password: entered }),
        });
        submittedPassword = entered;
        dialog.close();
      } catch (error) {
        input.value = "";
        if (hint) {
          hint.textContent = `${error.message || "Clave incorrecta"}. Intenta de nuevo.`;
        }
        input.focus();
      } finally {
        verifying = false;
      }
    };

    const onInput = () => {
      if (!autoVerify) return;
      if (hint) hint.textContent = defaultHint;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void tryVerify();
      }, 700);
    };

    const onKeyDown = (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (debounceTimer) clearTimeout(debounceTimer);
      void tryVerify();
    };

    const onSubmit = (event) => {
      event.preventDefault();
      if (autoVerify) {
        void tryVerify();
        return;
      }
      const entered = input.value || "";
      if (!entered.trim()) {
        alert("Debes ingresar la clave para continuar.");
        input.focus();
        return;
      }
      submittedPassword = entered;
      dialog.close();
    };

    const onClose = () => {
      cleanup();
      resolve(submittedPassword);
    };

    form.addEventListener("submit", onSubmit);
    dialog.addEventListener("close", onClose);
    input.addEventListener("input", onInput);
    input.addEventListener("keydown", onKeyDown);
    if (!dialog.open) {
      dialog.showModal();
    }
    setTimeout(() => input.focus(), 0);
  });
}

async function confirmPasswordForAction(actionLabel = "autorizar venta", options = {}) {
  if (!state.salePasswordRequiredPerSale) return true;
  if (!state.user) {
    alert("Sesion no valida. Inicia sesion de nuevo.");
    return false;
  }

  const password = await promptSalePassword(actionLabel, options);
  if (password === null) return false;
  if (options.autoVerify) return true;

  try {
    await api("/api/auth/confirm-password", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    return true;
  } catch (error) {
    alert(error.message);
    return false;
  }
}

async function openSaleSessionWithPassword() {
  if (!isCashierSaleLockEnabled()) return true;
  if (!ensureCashOwnership("iniciar venta")) return false;
  const authorized = await confirmPasswordForAction("iniciar esta venta", { autoVerify: true });
  if (!authorized) {
    showSalePasswordGate();
    return false;
  }
  state.saleSessionUnlocked = true;
  state.salePasswordPromptDismissed = false;
  closeSalePasswordDialog();
  renderSaleSessionIndicator();
  focusProductSearch();
  return true;
}

async function ensureSaleSessionUnlocked() {
  if (!isCashierSaleLockEnabled()) return true;
  if (state.saleSessionUnlocked) return true;
  return openSaleSessionWithPassword();
}

async function processCheckout(paymentMethod, cashReceived = null, printTicket = true, payments = null) {
  if (!ensureCashOwnership("registrar ventas")) return false;
  const unlocked = await ensureSaleSessionUnlocked();
  if (!unlocked) return false;
  if (!validateNitField(true)) {
    return false;
  }
  await autofillCustomerByNit();

  for (const line of state.cart) {
    const product = state.products.find((item) => item.id === line.id);
    const availableStock = Number(product?.stock || 0);
    const requestedQty = Number(line.quantity || 0);
    if (!product || requestedQty > availableStock) {
      alert(
        `Stock insuficiente para ${line.name}. Disponible: ${formatQuantity(availableStock)}, solicitado: ${formatQuantity(
          requestedQty
        )}.`
      );
      await loadData();
      return false;
    }
  }

  const totals = calcTotals(state.cart);
  if (paymentMethod === "efectivo" && !payments) {
    const received = Number(cashReceived || 0);
    if (received < totals.total) {
      const missing = Math.round((totals.total - received) * 100) / 100;
      alert(`Efectivo insuficiente. Faltan ${money(missing)} para completar el cobro.`);
      return false;
    }
  }

  const payload = {
    customer_id: Number(document.getElementById("customer-select")?.value || 0) || null,
    customer_nit: document.getElementById("customer-nit").value.trim() || "CF",
    customer_name: document.getElementById("customer-name").value.trim() || "CONSUMIDOR FINAL",
    payment_method: payments ? "mixto" : paymentMethod === "credito" ? "credito" : paymentMethod,
    is_credit: paymentMethod === "credito",
    cart_discount_amount: calcTotals(state.cart).cartDiscount || 0,
    items: state.cart.map((line) => ({ product_id: line.id, quantity: line.quantity })),
  };
  if (payments) {
    payload.payments = payments;
  }

  if (paymentMethod === "credito") {
    const nit = payload.customer_nit;
    if (!nit || nit === "CF") {
      alert("Ventas a credito requieren un cliente con NIT registrado.");
      return false;
    }
  }

  try {
    const sale = await api("/api/sales", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.cart = [];
    resetSaleCustomerDefaults();
    document.getElementById("cash-checkout-dialog")?.close();
    document.getElementById("mixed-checkout-dialog")?.close();
    document.getElementById("sale-dialog")?.close();
    lockSaleSessionForNextSale();
    await loadData();
    if (!isCashierSaleLockEnabled()) {
      openSaleDetail(sale.id);
    }
    if (printTicket) {
      await printSaleReceipt(sale.id, false);
    } else if (shouldOpenDrawerForPayment(paymentMethod, payments)) {
      await openCashDrawer(false);
    }
    if (paymentMethod === "efectivo") {
      const received = Number(cashReceived || 0);
      const change = Math.round((received - totals.total) * 100) / 100;
      alert(buildSaleSuccessMessage(sale, `Cambio: ${money(change)}`));
    } else if (paymentMethod === "mixto" && payments) {
      const cashLine = payments.find((line) => line.payment_method === "efectivo");
      const received = Number(cashReceived || 0);
      const change = cashLine ? Math.round((received - cashLine.amount) * 100) / 100 : 0;
      alert(
        buildSaleSuccessMessage(
          sale,
          `Pago: ${formatSalePayments(sale)}.` + (change > 0 ? ` Cambio: ${money(change)}.` : "")
        )
      );
    } else {
      alert(buildSaleSuccessMessage(sale));
    }
    return true;
  } catch (error) {
    alert(error.message);
    return false;
  }
}

async function finalizeCashCheckout(printTicket = true) {
  const totals = calcTotals(state.cart);
  const cashReceived = Number(document.getElementById("cash-checkout-received").value || 0);
  if (cashReceived < totals.total) {
    const missing = Math.round((totals.total - cashReceived) * 100) / 100;
    alert(`Efectivo insuficiente. Faltan ${money(missing)} para completar el cobro.`);
    return false;
  }

  const success = await processCheckout("efectivo", cashReceived, printTicket);
  if (success) {
    document.getElementById("cash-checkout-dialog").close();
  }
  return success;
}

async function requestCashCapture() {
  const paymentMethod = document.getElementById("payment-method")?.value || "efectivo";
  if (paymentMethod !== "efectivo" && paymentMethod !== "mixto") {
    alert("F12 aplica para cobro en efectivo o pago mixto.");
    return false;
  }
  if (!ensureCashOwnership("capturar efectivo")) return false;
  const unlocked = await ensureSaleSessionUnlocked();
  if (!unlocked) return false;
  if (!state.cart.length) {
    alert("Agrega productos antes de cobrar.");
    return false;
  }
  openCashCheckoutDialog();
  return true;
}

function handleCheckoutShortcuts(event) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!state.user) return;
  if (document.getElementById("login-dialog")?.open) return;
  const paymentMethod = document.getElementById("payment-method")?.value || "efectivo";
  const cashDialogOpen = document.getElementById("cash-checkout-dialog")?.open;
  const mixedDialogOpen = document.getElementById("mixed-checkout-dialog")?.open;

  if (event.key === "F12") {
    event.preventDefault();
    requestCashCapture();
    return;
  }
  if (event.key === "F1") {
    event.preventDefault();
    if (paymentMethod === "efectivo") {
      if (!cashDialogOpen) {
        alert("Primero presiona F12 para capturar efectivo recibido.");
        return;
      }
      finalizeCashCheckout(true);
      return;
    }
    if (paymentMethod === "mixto") {
      if (!mixedDialogOpen) {
        alert("Primero presiona F12 para capturar el cobro mixto.");
        return;
      }
      finalizeMixedCheckout(true);
      return;
    }
    checkout(true);
    return;
  }
  if (event.key === "F2") {
    event.preventDefault();
    if (paymentMethod === "efectivo") {
      if (!cashDialogOpen) {
        alert("Primero presiona F12 para capturar efectivo recibido.");
        return;
      }
      finalizeCashCheckout(false);
      return;
    }
    if (paymentMethod === "mixto") {
      if (!mixedDialogOpen) {
        alert("Primero presiona F12 para capturar el cobro mixto.");
        return;
      }
      finalizeMixedCheckout(false);
      return;
    }
    checkout(false);
  }
}

async function openCashSession(event) {
  event.preventDefault();
  const form = event.target;
  const amount = Number(form.opening_amount.value || 0);
  if (!isAdminUser() && (!Number.isFinite(amount) || amount <= 0)) {
    alert("Debes ingresar un fondo inicial mayor a 0.");
    return;
  }
  if (!Number.isFinite(amount) || amount < 0) {
    alert("Ingresa un monto valido.");
    return;
  }
  try {
    await openCashSessionWithValues(amount, null);
    await loadData();
  } catch (error) {
    alert(error.message);
  }
}

async function openCashSessionWithValues(openingAmount, notes = null) {
  const session = await api("/api/cash/sessions/open", {
    method: "POST",
    body: JSON.stringify({
      opening_amount: Number(openingAmount || 0),
      notes: notes || null,
    }),
  });
  // Al abrir fondo, la venta queda lista sin volver a pedir clave.
  state.saleSessionUnlocked = true;
  state.salePasswordPromptDismissed = false;
  closeSalePasswordDialog();
  return session;
}

async function registerCashMovement(event) {
  event.preventDefault();
  const form = event.target;
  try {
    await api("/api/cash/movements", {
      method: "POST",
      body: JSON.stringify({
        movement_type: form.movement_type.value,
        amount: Number(form.amount.value || 0),
        description: form.description.value.trim() || null,
      }),
    });
    await loadData();
  } catch (error) {
    alert(error.message);
  }
}

async function closeCashSession(event) {
  event.preventDefault();
  if (!state.currentCash) return;
  const form = event.target;
  try {
    const result = await closeCashSessionWithValues(
      Number(form.counted_amount.value || 0),
      form.notes.value.trim() || null
    );
    await handleCashCloseSuccess(result);
  } catch (error) {
    alert(error.message);
  }
}

async function closeCashSessionWithValues(countedAmount, notes = null) {
  if (!state.currentCash) throw new Error("No hay caja abierta.");
  return api(`/api/cash/sessions/${state.currentCash.id}/close`, {
    method: "POST",
    body: JSON.stringify({
      counted_amount: Number(countedAmount || 0),
      notes: notes || null,
    }),
  });
}

async function getCashCloseSummary(sessionId) {
  const openingAmount = Number(state.currentCash?.opening_amount || 0);
  const expectedAmount = Number(state.currentCash?.expected_amount || 0);
  let totalSales = 0;
  let totalReturns = 0;

  try {
    const movements = await api(`/api/cash/sessions/${sessionId}/movements`);
    (movements || []).forEach((movement) => {
      const amount = Number(movement?.amount || 0);
      const hasSaleRef = Number(movement?.sale_id || 0) > 0;
      if (!hasSaleRef || amount <= 0) return;

      if (movement.movement_type === "income") {
        totalSales += amount;
      } else if (movement.movement_type === "expense") {
        totalReturns += amount;
      }
    });
  } catch (error) {
    console.warn("No se pudo calcular resumen de ventas para cierre de caja:", error?.message || error);
    totalSales = Math.max(expectedAmount - openingAmount, 0);
  }

  totalSales = Math.round(totalSales * 100) / 100;
  totalReturns = Math.round(totalReturns * 100) / 100;

  return {
    openingAmount,
    totalSales,
    totalReturns,
    expectedAmount,
  };
}

function updateCashCloseDifferencePreview() {
  const countedInput = document.getElementById("cash-close-counted");
  const diffEl = document.getElementById("cash-close-difference");
  if (!countedInput || !diffEl) return;

  const expectedAmount = Number(countedInput.dataset.expectedAmount || 0);
  const countedAmount = Number(countedInput.value || 0);
  const difference = Math.round((countedAmount - expectedAmount) * 100) / 100;
  diffEl.textContent = money(difference);
  diffEl.classList.remove("diff-ok", "diff-missing", "diff-over");
  if (Math.abs(difference) < 0.0001) {
    diffEl.classList.add("diff-ok");
    return;
  }
  if (difference < 0) {
    diffEl.classList.add("diff-missing");
    return;
  }
  diffEl.classList.add("diff-over");
}

function populateCashCloseSummaryDialog(summary) {
  const openingEl = document.getElementById("cash-close-opening");
  const salesEl = document.getElementById("cash-close-sales");
  const returnsRowEl = document.getElementById("cash-close-returns-row");
  const returnsEl = document.getElementById("cash-close-returns");
  const expectedEl = document.getElementById("cash-close-expected");
  const countedInput = document.getElementById("cash-close-counted");
  if (!openingEl || !salesEl || !returnsRowEl || !returnsEl || !expectedEl || !countedInput) return;

  openingEl.textContent = money(summary.openingAmount);
  salesEl.textContent = money(summary.totalSales);
  expectedEl.textContent = money(summary.expectedAmount);

  const showReturns = Number(summary.totalReturns || 0) > 0;
  returnsRowEl.hidden = !showReturns;
  returnsEl.textContent = `-${money(summary.totalReturns)}`;

  countedInput.value = Number(summary.expectedAmount || 0).toFixed(2);
  countedInput.dataset.expectedAmount = String(Number(summary.expectedAmount || 0));
  updateCashCloseDifferencePreview();
}

async function submitCashCloseSummaryForm(event) {
  event.preventDefault();
  if (!state.currentCash) return;

  const countedInput = document.getElementById("cash-close-counted");
  if (!countedInput) return;
  const countedAmount = Number(countedInput.value || 0);
  if (!Number.isFinite(countedAmount) || countedAmount < 0) {
    alert("Ingresa un monto valido para cuadrar caja.");
    countedInput.focus();
    return;
  }

  try {
    const result = await closeCashSessionWithValues(countedAmount, null);
    document.getElementById("cash-close-summary-dialog")?.close();
    await handleCashCloseSuccess(result);
  } catch (error) {
    alert(error.message);
  }
}

async function quickCloseCashSession() {
  if (!state.currentCash) return;
  const isAdmin = state.user?.role === "admin";
  if (!isAdmin && !isCurrentCashOwnedByLoggedUser()) {
    alert("Solo puedes cuadrar la caja que abriste.");
    return;
  }
  const summary = await getCashCloseSummary(state.currentCash.id);
  populateCashCloseSummaryDialog(summary);
  const closeDialog = document.getElementById("cash-close-summary-dialog");
  if (closeDialog && !closeDialog.open) {
    closeDialog.showModal();
    setTimeout(() => document.getElementById("cash-close-counted")?.focus(), 0);
  }
}

async function forceCloseOpenCashFromPostLogin() {
  if (state.user?.role !== "admin") {
    alert("Solo admin puede cerrar un fondo ajeno.");
    return;
  }
  try {
    const openSessions = await api("/api/cash/sessions/open");
    const foreign = (openSessions || []).filter(
      (session) => Number(session.opened_by_user_id) !== Number(state.user.id)
    );
    if (!foreign.length) {
      alert("No hay fondos de otros cajeros para cerrar.");
      refreshPostLoginDialogState();
      return;
    }

    const options = foreign
      .map((session, index) => {
        const name =
          session.opened_by_full_name ||
          session.opened_by_username ||
          `usuario ${session.opened_by_user_id}`;
        return `${index + 1}) #${session.id} - ${name} (esperado ${Number(session.expected_amount || 0).toFixed(2)})`;
      })
      .join("\n");
    const choiceRaw = prompt(
      `Fondos abiertos de otros cajeros:\n${options}\n\nEscribe el numero del fondo a cuadrar:`,
      "1"
    );
    if (choiceRaw === null) return;
    const choice = Number(choiceRaw);
    if (!Number.isInteger(choice) || choice < 1 || choice > foreign.length) {
      alert("Seleccion invalida.");
      return;
    }
    const target = foreign[choice - 1];
    const suggested = Number(target.expected_amount || 0).toFixed(2);
    const countedRaw = prompt(
      `Conteo fisico para cuadrar caja #${target.id} y liberar el turno:`,
      suggested
    );
    if (countedRaw === null) return;

    const countedAmount = Number(countedRaw);
    if (!Number.isFinite(countedAmount) || countedAmount < 0) {
      alert("Ingresa un monto valido para cuadrar caja.");
      return;
    }

    const reason =
      prompt(
        "Motivo (opcional) de desactivacion del fondo abierto:",
        "Cierre administrativo de fondo ajeno"
      ) || "";
    const note = `CIERRE ADMINISTRATIVO PARA LIBERAR TURNO.${reason.trim() ? ` Motivo: ${reason.trim()}` : ""}`;

    await api(`/api/cash/sessions/${target.id}/close`, {
      method: "POST",
      body: JSON.stringify({
        counted_amount: countedAmount,
        notes: note,
      }),
    });
    await loadData();
    await refreshAdminCashMonitorData();
    renderAdminCashMonitorCard();
    refreshPostLoginDialogState();
    alert(`Caja #${target.id} desactivada y cuadrada.`);
  } catch (error) {
    alert(error.message);
  }
}

async function handleCashCloseSuccess(result) {
  alert(`Caja cerrada. Diferencia: ${money(result.difference)}`);
  state.postLoginFundAdded = false;
  setSession("", null);
  const postCashDialog = document.getElementById("post-cash-close-dialog");
  if (postCashDialog && !postCashDialog.open) {
    postCashDialog.showModal();
  } else {
    openLogin();
  }
}

async function closeSystem() {
  if (window.pywebview?.api?.close_app) {
    try {
      await window.pywebview.api.close_app();
      return;
    } catch (error) {
      console.warn("No se pudo cerrar desde WebView API:", error);
    }
  }
  try {
    window.open("", "_self");
    window.close();
  } catch (error) {
    console.warn("No se pudo cerrar automaticamente:", error);
  }
}

function printPurchaseOrder(orderId) {
  const order = state.purchaseOrders.find((item) => item.id === orderId);
  if (!order) {
    alert("No se encontro la orden de compra.");
    return;
  }

  const printWindow = window.open("", "_blank", "width=980,height=760");
  if (!printWindow) {
    alert("Tu navegador bloqueo la ventana de impresion. Habilita popups para continuar.");
    return;
  }

  const rowsHtml = order.items
    .map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(item.product_name)}</td>
          <td style="text-align:right;">${formatQuantity(item.quantity)}</td>
          <td style="text-align:right;">Q ${Number(item.unit_cost || 0).toFixed(2)}</td>
          <td style="text-align:right;">Q ${Number(item.line_total || 0).toFixed(2)}</td>
        </tr>
      `
    )
    .join("");

  const dispatches = [...(order.dispatches || [])].sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));
  const dispatchesHtml = dispatches.length
    ? `<ul>${dispatches
        .map(
          (dispatch) =>
            `<li>${escapeHtml(dispatch.channel)} - ${escapeHtml(dispatch.status)} - ${new Date(
              dispatch.sent_at
            ).toLocaleString("es-GT")} - ${escapeHtml(dispatch.recipient || "-")}</li>`
        )
        .join("")}</ul>`
    : "<p>Sin envios registrados.</p>";

  printWindow.document.write(`
    <html>
      <head>
        <title>Orden de compra #${order.id}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; color: #111; }
          h1, h2 { margin: 0 0 8px; }
          .meta { margin: 0 0 14px; line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
          th { background: #f5f5f5; text-align: left; }
          .totals { margin-top: 12px; text-align: right; font-weight: bold; }
          .section { margin-top: 16px; }
        </style>
      </head>
      <body>
        <h1>Orden de compra #${order.id}</h1>
        <div class="meta">
          <div><strong>Proveedor:</strong> ${escapeHtml(order.supplier_name)}</div>
          <div><strong>Fecha:</strong> ${new Date(order.created_at).toLocaleString("es-GT")}</div>
          <div><strong>Estado:</strong> ${escapeHtml(order.status)}</div>
          <div><strong>Notas:</strong> ${escapeHtml(order.notes || "Sin notas")}</div>
        </div>

        <h2>Productos solicitados</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Producto</th>
              <th>Cantidad solicitada</th>
              <th>Costo unitario</th>
              <th>Subtotal</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="totals">Total estimado: Q ${Number(order.total_estimate || 0).toFixed(2)}</div>

        <div class="section">
          <h2>Historial de envios</h2>
          ${dispatchesHtml}
        </div>
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 250);
}

async function resendPurchaseOrder(orderId, channel) {
  const channelLabel = channel === "whatsapp" ? "WhatsApp" : "Gmail";
  try {
    const updatedOrder = await api(`/api/purchase-orders/${orderId}/send`, {
      method: "POST",
      body: JSON.stringify({ channels: [channel] }),
    });
    await loadData();
    const latestDispatch = getLatestPurchaseDispatch(updatedOrder, channel);
    alert(
      `Orden #${orderId} reenviada por ${channelLabel}. Estado: ${latestDispatch?.status || "procesada"}.`
    );
  } catch (error) {
    alert(error.message);
  }
}

async function sendOrder(orderId, channel) {
  const order = state.orders.find((item) => item.id === orderId);
  if (!order) return;

  const payload = { channels: [channel] };
  if (channel === "whatsapp" && order.customer_phone) payload.whatsapp_to = order.customer_phone;
  if (channel === "gmail" && order.customer_email) payload.gmail_to = order.customer_email;

  try {
    const updated = await api(`/api/orders/${orderId}/send`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    await loadData();
    const latest = (updated?.dispatches || []).find((item) => item.channel === channel);
    const statusLabel =
      latest?.status === "sent"
        ? "enviado correctamente"
        : latest?.status === "queued"
          ? "en cola (modo simulado — configura credenciales en Configuracion)"
          : `estado: ${latest?.status || "procesado"}`;
    alert(`Orden #${orderId} · ${channel}: ${statusLabel}.`);
  } catch (error) {
    alert(error.message);
  }
}

async function login(event) {
  event.preventDefault();
  const form = event.target;
  const adminMode = document.getElementById("login-admin-mode")?.checked === true;
  const username = String(form.username?.value || "").trim();
  const password = String(form.password?.value || "");

  if (!password) {
    alert("Ingresa tu clave para continuar.");
    return;
  }
  if (adminMode && !username) {
    alert("Ingresa el usuario admin para continuar.");
    return;
  }

  try {
    const endpoint = adminMode ? "/api/auth/login" : "/api/auth/login-cashier";
    const payload = adminMode ? { username, password } : { password };
    const result = await api(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setSession(result.access_token, result.user);
    closeLogin();
    if (mustChangePassword()) {
      openPasswordChangeDialog();
      return;
    }
    await continueAfterLogin();
  } catch (error) {
    const message = String(error?.message || "No se pudo iniciar sesion.");
    if (!adminMode) {
      alert(
        `${message}\n\nSi eres administrador, pulsa "Entrar como administrador", luego usa usuario (ej. admin) y tu clave.`
      );
      return;
    }
    alert(message);
  }
}

async function submitPasswordChange(event) {
  event.preventDefault();
  const form = event.target;
  const currentPassword = String(form.current_password?.value || "");
  const newPassword = String(form.new_password?.value || "");
  const confirmPassword = String(form.confirm_password?.value || "");
  if (!currentPassword || !newPassword) {
    alert("Completa todos los campos.");
    return;
  }
  if (newPassword.length < 8) {
    alert("La clave nueva debe tener al menos 8 caracteres.");
    return;
  }
  if (newPassword !== confirmPassword) {
    alert("La confirmacion no coincide con la clave nueva.");
    return;
  }
  try {
    const result = await api("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });
    setSession(state.token, result.user);
    closePasswordChangeDialog();
    await continueAfterLogin();
  } catch (error) {
    alert(error.message);
  }
}

async function loadCurrentUser() {
  if (!state.token) {
    openLogin();
    return;
  }
  try {
    const user = await api("/api/auth/me");
    setSession(state.token, user);
    if (mustChangePassword()) {
      openPasswordChangeDialog();
      return;
    }
    await loadData();
  } catch {
    openLogin();
  }
}

async function receivePurchaseOrder(orderId) {
  const invoiceRef = window.prompt("Referencia de factura del proveedor (opcional):", "");
  if (invoiceRef === null) return;
  try {
    await api(`/api/purchase-orders/${orderId}/receive`, {
      method: "POST",
      body: JSON.stringify({ invoice_ref: invoiceRef || null }),
    });
    await loadData();
    alert("Mercaderia recibida. Stock y costos actualizados.");
  } catch (error) {
    alert(error.message);
  }
}

function renderSystemAlertsBar() {
  const bar = document.getElementById("system-alerts-bar");
  if (!bar) return;
  const alerts = [...(state.systemAlerts || [])];
  if (state.updateInfo?.update_available) {
    alerts.unshift({
      level: "warning",
      message: `Nueva version v${state.updateInfo.latest_version} disponible`,
      isUpdate: true,
    });
  }
  if (!alerts.length) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }
  bar.hidden = false;
  bar.innerHTML = alerts
    .slice(0, 6)
    .map((alert) => {
      if (alert.isUpdate) {
        return `<span class="alert-chip ${alert.level || ""}">${alert.message} <button id="alert-apply-update-btn" class="btn ghost" type="button" style="margin-left:0.5rem;">Actualizar</button></span>`;
      }
      return `<span class="alert-chip ${alert.level || ""}">${alert.message}</span>`;
    })
    .join("");
  document.getElementById("alert-apply-update-btn")?.addEventListener("click", () => {
    applySystemUpdate();
  });
}

function populateCustomerSelect() {
  const select = document.getElementById("customer-select");
  if (!select) return;
  const current = select.value;
  select.innerHTML = `
    <option value="">Nuevo / por NIT</option>
    ${(state.customers || [])
      .filter((customer) => customer.active !== 0)
      .map(
        (customer) =>
          `<option value="${customer.id}">${customer.name} (${customer.nit})</option>`
      )
      .join("")}
  `;
  if (current) select.value = current;
}

function onCustomerSelectChange() {
  const select = document.getElementById("customer-select");
  const customerId = Number(select?.value || 0);
  if (!customerId) return;
  const customer = (state.customers || []).find((item) => item.id === customerId);
  if (!customer) return;
  document.getElementById("customer-nit").value = customer.nit;
  document.getElementById("customer-name").value = customer.name;
}

function renderSchoolPackagesPos() {
  const block = document.getElementById("school-packages-pos");
  const select = document.getElementById("school-package-select");
  if (!block || !select) return;
  const show = isSchoolSuppliesProfile() || (state.schoolPackages || []).length > 0;
  block.hidden = !show;
  if (!show) return;
  select.innerHTML = `
    <option value="">Seleccionar paquete...</option>
    ${(state.schoolPackages || [])
      .map((pkg) => `<option value="${pkg.id}">${pkg.name} (${money(pkg.package_price)})</option>`)
      .join("")}
  `;
}

function addSchoolPackageToCart() {
  const packageId = Number(document.getElementById("school-package-select")?.value || 0);
  if (!packageId) {
    alert("Selecciona un paquete escolar.");
    return;
  }
  const pkg = (state.schoolPackages || []).find((item) => item.id === packageId);
  if (!pkg) return;
  for (const line of pkg.items || []) {
    const product = state.products.find((item) => item.id === line.product_id);
    if (!product) continue;
    for (let i = 0; i < line.quantity; i += 1) {
      addToCart(product.id);
    }
  }
  renderCart();
}

async function loadReportsDashboard() {
  const dateFrom = document.getElementById("report-date-from")?.value || "";
  const dateTo = document.getElementById("report-date-to")?.value || "";
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const query = params.toString() ? `?${params.toString()}` : "";
  const querySuffix = params.toString() ? `${query}&` : "?";
  const [summary, topProducts, paymentMethods, cashCut, ranking] = await Promise.all([
    api(`/api/reports/sales-summary${query}`),
    api(`/api/reports/top-products${querySuffix}limit=10`),
    api(`/api/reports/payment-methods${query}`),
    api("/api/reports/cash-cut"),
    api(`/api/reports/cashier-ranking${query}`),
  ]);
  state.reports = { summary, topProducts, paymentMethods, cashCut, ranking };
  renderReportsDashboard();
}

function renderReportsDashboard() {
  const container = document.getElementById("reports-dashboard");
  if (!container || !isAdminUser()) return;
  const reports = state.reports;
  if (!reports) {
    container.innerHTML = '<div class="empty">Presiona Actualizar para cargar reportes.</div>';
    return;
  }
  const summary = reports.summary || {};
  const cashCut = reports.cashCut;
  container.innerHTML = `
    <div class="row"><span>Ventas</span><strong>${summary.sales_count || 0}</strong></div>
    <div class="row"><span>Total vendido</span><strong>${money(summary.total_amount || 0)}</strong></div>
    <div class="row"><span>IVA</span><strong>${money(summary.tax_total || 0)}</strong></div>
    <div class="row"><span>Ventas a credito</span><strong>${summary.credit_sales_count || 0} (${money(summary.credit_sales_amount || 0)})</strong></div>
    ${
      cashCut
        ? `<div class="row"><span>Corte caja</span><strong>${money(cashCut.sales_total || 0)} ventas · esperado ${money(cashCut.expected_amount || 0)}</strong></div>`
        : ""
    }
    <h4>Top productos</h4>
    ${
      (reports.topProducts || []).length
        ? `<ul class="compact-list">${reports.topProducts
            .map(
              (item) =>
                `<li>${item.name}: ${formatQuantity(item.quantity)} uds · ${money(item.total_amount)} · margen ${money(item.estimated_margin)}</li>`
            )
            .join("")}</ul>`
        : '<div class="empty">Sin ventas en el periodo.</div>'
    }
    <h4>Metodos de pago</h4>
    ${
      (reports.paymentMethods || []).length
        ? `<ul class="compact-list">${reports.paymentMethods
            .map((item) => `<li>${item.payment_method}: ${item.sales_count} · ${money(item.total_amount)}</li>`)
            .join("")}</ul>`
        : '<div class="empty">Sin datos.</div>'
    }
    <h4>Ranking cajeros</h4>
    ${
      (reports.ranking || []).length
        ? `<ul class="compact-list">${reports.ranking
            .map((item) => `<li>${item.full_name}: ${item.sales_count} ventas · ${money(item.total_amount)}</li>`)
            .join("")}</ul>`
        : '<div class="empty">Sin ventas por cajero.</div>'
    }
  `;
}

function renderCustomersTable() {
  const container = document.getElementById("customers-table");
  if (!container || !isAdminUser()) return;
  const rows = state.customers || [];
  if (!rows.length) {
    container.innerHTML = '<div class="empty">No hay clientes registrados.</div>';
    return;
  }
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>NIT</th><th>Nombre</th><th>Telefono</th><th>Limite</th><th>Saldo</th><th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (customer) => `
          <tr>
            <td>${customer.nit}</td>
            <td>${customer.name}</td>
            <td>${customer.phone || "-"}</td>
            <td>${money(customer.credit_limit || 0)}</td>
            <td>${money(customer.credit_balance || 0)}</td>
            <td>
              <button class="btn ghost customer-payment-btn" data-id="${customer.id}">Abono</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
  container.querySelectorAll(".customer-payment-btn").forEach((button) => {
    button.addEventListener("click", () => openCreditPaymentDialog(Number(button.dataset.id)));
  });
}

function openCustomerDialog() {
  state.editingCustomerId = null;
  const form = document.getElementById("customer-form");
  form?.reset();
  document.getElementById("customer-dialog-title").textContent = "Nuevo cliente";
  document.getElementById("customer-dialog")?.showModal();
}

function openCreditPaymentDialog(customerId) {
  const customer = (state.customers || []).find((item) => item.id === customerId);
  if (!customer) return;
  state.selectedCustomerId = customerId;
  const label = document.getElementById("credit-payment-customer");
  if (label) {
    label.textContent = `${customer.name} · saldo pendiente ${money(customer.credit_balance || 0)}`;
  }
  document.getElementById("credit-payment-form")?.reset();
  document.getElementById("credit-payment-dialog")?.showModal();
}

async function submitCustomerForm(event) {
  event.preventDefault();
  const form = event.target;
  const payload = {
    nit: form.nit.value.trim(),
    name: form.name.value.trim(),
    email: form.email.value.trim() || null,
    phone: form.phone.value.trim() || null,
    address: form.address.value.trim() || null,
    credit_limit: Number(form.credit_limit.value || 0),
    notes: form.notes.value.trim() || null,
  };
  try {
    await api("/api/customers", { method: "POST", body: JSON.stringify(payload) });
    document.getElementById("customer-dialog")?.close();
    await loadData();
    alert("Cliente guardado.");
  } catch (error) {
    alert(error.message);
  }
}

async function submitCreditPaymentForm(event) {
  event.preventDefault();
  const customerId = state.selectedCustomerId;
  if (!customerId) return;
  const form = event.target;
  const payload = {
    amount: Number(form.amount.value || 0),
    payment_method: form.payment_method.value,
    notes: form.notes.value.trim() || null,
  };
  try {
    await api(`/api/customers/${customerId}/credit-payments`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
    document.getElementById("credit-payment-dialog")?.close();
    await loadData();
    alert("Abono registrado.");
  } catch (error) {
    alert(error.message);
  }
}

function renderPromotionsTable() {
  const container = document.getElementById("promotions-table");
  if (!container || !isAdminUser()) return;
  const rows = state.promotions || [];
  if (!rows.length) {
    container.innerHTML = '<div class="empty">No hay promociones configuradas.</div>';
    return;
  }
  container.innerHTML = `
    <table>
      <thead>
        <tr><th>Nombre</th><th>Tipo</th><th>Valor</th><th>Min qty</th><th>Estado</th></tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (promo) => `
          <tr>
            <td>${promo.name}</td>
            <td>${promo.promo_type}</td>
            <td>${promo.promo_type === "percent" ? `${promo.value}%` : money(promo.value)}</td>
            <td>${formatQuantity(promo.min_qty || 0)}</td>
            <td>${promo.active ? "Activa" : "Inactiva"}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function openPromotionDialog() {
  const form = document.getElementById("promotion-form");
  form?.reset();
  populatePromotionSelects();
  document.getElementById("promotion-dialog")?.showModal();
}

function populatePromotionSelects() {
  const productSelect = document.getElementById("promotion-product-select");
  const departmentSelect = document.getElementById("promotion-department-select");
  if (productSelect) {
    productSelect.innerHTML = `
      <option value="">Todos</option>
      ${state.products.map((product) => `<option value="${product.id}">${product.name}</option>`).join("")}
    `;
  }
  if (departmentSelect) {
    departmentSelect.innerHTML = `
      <option value="">Todos</option>
      ${state.departments.map((dep) => `<option value="${dep.id}">${dep.name}</option>`).join("")}
    `;
  }
}

async function submitPromotionForm(event) {
  event.preventDefault();
  const form = event.target;
  const payload = {
    name: form.name.value.trim(),
    promo_type: form.promo_type.value,
    value: Number(form.value.value || 0),
    min_qty: Number(form.min_qty.value || 0),
    product_id: Number(form.product_id.value || 0) || null,
    department_id: Number(form.department_id.value || 0) || null,
    start_at: form.start_at.value ? new Date(form.start_at.value).toISOString() : null,
    end_at: form.end_at.value ? new Date(form.end_at.value).toISOString() : null,
    active: 1,
  };
  try {
    await api("/api/promotions", { method: "POST", body: JSON.stringify(payload) });
    document.getElementById("promotion-dialog")?.close();
    await loadData();
    alert("Promocion creada.");
  } catch (error) {
    alert(error.message);
  }
}

async function exportCatalogCsv() {
  try {
    const csv = await api("/api/products/export/csv");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "catalogo_felpos.csv";
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message);
  }
}

async function retryPendingFel(pendingId) {
  try {
    await api(`/api/fel/pending/${pendingId}/retry`, { method: "POST" });
    await loadData();
    alert("FEL certificado correctamente.");
  } catch (error) {
    alert(error.message);
  }
}

async function retryAllPendingFel() {
  const rows = state.pendingFelSales || [];
  if (!rows.length) {
    alert("No hay ventas FEL pendientes.");
    return;
  }
  if (!confirm(`Reintentar certificacion de ${rows.length} venta(s) pendiente(s)?`)) return;
  try {
    const result = await api("/api/fel/pending/retry-all", { method: "POST" });
    await loadData();
    alert(`Proceso terminado: ${result.certified} certificada(s), ${result.failed} con error.`);
  } catch (error) {
    alert(error.message);
  }
}

async function dismissPendingFel(pendingId) {
  if (!confirm("Descartar esta venta de la cola FEL pendiente? La venta en POS se conserva.")) return;
  try {
    await api(`/api/fel/pending/${pendingId}/dismiss`, { method: "POST" });
    await loadData();
    alert("Venta descartada de FEL pendientes.");
  } catch (error) {
    alert(error.message);
  }
}

async function transferCashSessionToUser(sessionId) {
  const activeUsers = (state.users || []).filter((user) => user.active);
  if (!activeUsers.length) {
    alert("No hay usuarios activos para transferir el turno.");
    return;
  }
  const options = activeUsers
    .map((user) => `${user.id}: ${user.full_name || user.username} (${user.username})`)
    .join("\n");
  const raw = prompt(`ID de usuario destino:\n${options}`);
  if (!raw) return;
  const targetUserId = Number(String(raw).trim().split(":")[0]);
  if (!Number.isFinite(targetUserId) || targetUserId <= 0) {
    alert("Usuario destino invalido.");
    return;
  }
  try {
    await api(`/api/cash/sessions/${sessionId}/transfer`, {
      method: "POST",
      body: JSON.stringify({ target_user_id: targetUserId }),
    });
    await loadData();
    alert("Turno de caja transferido correctamente.");
  } catch (error) {
    alert(error.message);
  }
}

function renderPendingFelTable() {
  const container = document.getElementById("pending-fel-table");
  if (!container) return;
  const rows = state.pendingFelSales || [];
  if (!rows.length) {
    container.innerHTML = '<div class="empty">No hay ventas FEL pendientes.</div>';
    return;
  }
  container.innerHTML = `
    <table>
      <thead><tr><th>Venta</th><th>Fecha</th><th>Total</th><th>Intentos</th><th>Error</th><th></th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            <td>#${row.sale_id}</td>
            <td>${new Date(row.created_at).toLocaleString("es-GT")}</td>
            <td>${money(row.sale_total || 0)}</td>
            <td>${row.retry_count || 0}</td>
            <td>${escapeHtml(row.last_error || "-")}</td>
            <td class="panel-actions">
              <button class="btn ghost pending-fel-retry-btn" data-id="${row.id}">Reintentar</button>
              <button class="btn ghost pending-fel-dismiss-btn" data-id="${row.id}">Descartar</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
  container.querySelectorAll(".pending-fel-retry-btn").forEach((button) => {
    button.addEventListener("click", () => retryPendingFel(Number(button.dataset.id)));
  });
  container.querySelectorAll(".pending-fel-dismiss-btn").forEach((button) => {
    button.addEventListener("click", () => dismissPendingFel(Number(button.dataset.id)));
  });
}

function renderAuditLogsTable() {
  const container = document.getElementById("audit-logs-table");
  if (!container) return;
  const rows = state.auditLogs || [];
  if (!rows.length) {
    container.innerHTML = '<div class="empty">Sin registros de auditoria.</div>';
    return;
  }
  container.innerHTML = `
    <table>
      <thead><tr><th>Fecha</th><th>Usuario</th><th>Accion</th><th>Detalle</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            <td>${new Date(row.created_at).toLocaleString("es-GT")}</td>
            <td>${row.username || "-"}</td>
            <td>${row.action}</td>
            <td>${row.details || row.entity_type || "-"}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderBranchesTable() {
  const container = document.getElementById("branches-table");
  if (!container) return;
  const rows = state.branches || [];
  if (!rows.length) {
    container.innerHTML = '<div class="empty">Sin sucursales configuradas.</div>';
    return;
  }
  container.innerHTML = `
    <table>
      <thead><tr><th>Codigo</th><th>Nombre</th><th>Direccion</th><th>Estado</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            <td>${row.code}</td>
            <td>${row.name}</td>
            <td>${row.address || "-"}</td>
            <td>${row.active ? "Activa" : "Inactiva"}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (state.user?.role !== "admin" && tab.dataset.tab !== "pos") {
        switchToPosTab();
        return;
      }
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
    });
  });
}

function setupEvents() {
  const productSearch = document.getElementById("product-search");
  productSearch.addEventListener("input", () => {
    renderProducts();
  });
  productSearch.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    void addProductFromSearchEnter();
  });
  productSearch.addEventListener("search", () => {
    if ((productSearch.value || "").trim()) {
      void addProductFromSearchEnter();
    } else {
      renderProducts();
    }
  });
  document.getElementById("pos-department-filter").addEventListener("change", () => {
    renderPosDepartmentChips();
    renderProducts();
  });
  document.getElementById("clear-cart").addEventListener("click", () => {
    state.cart = [];
    renderCart();
  });
  document.getElementById("open-sale-session-btn").addEventListener("click", openSaleSessionWithPassword);
  document.getElementById("open-cash-capture-btn").addEventListener("click", requestCashCapture);
  document.getElementById("close-cash-shift-btn").addEventListener("click", quickCloseCashSession);
  document.getElementById("cash-close-counted").addEventListener("input", updateCashCloseDifferencePreview);
  document.getElementById("close-cash-close-summary-dialog").addEventListener("click", () => {
    document.getElementById("cash-close-summary-dialog")?.close();
  });
  document.getElementById("cash-close-summary-form").addEventListener("submit", submitCashCloseSummaryForm);
  document.getElementById("customer-nit").addEventListener("blur", () => {
    if (!validateNitField(false)) return;
    autofillCustomerByNit().catch(() => {});
  });
  document.getElementById("logout-btn").addEventListener("click", () => {
    setSession("", null);
    state.postLoginFundAdded = false;
    openLogin();
  });
  document.getElementById("open-mobile-qr-btn").addEventListener("click", openMobileQrDialog);
  document.getElementById("close-mobile-qr-dialog").addEventListener("click", () => {
    document.getElementById("mobile-qr-dialog")?.close();
  });
  document.getElementById("mobile-qr-host").addEventListener("input", () => {
    const hostValue = document.getElementById("mobile-qr-host")?.value?.trim() || "";
    if (hostValue) {
      localStorage.setItem("felpos_mobile_host", hostValue);
    }
    setMobileQrStatus("");
    renderMobileQr();
  });
  document.getElementById("mobile-qr-detect-ip-btn").addEventListener("click", detectMobileQrHost);
  document.getElementById("mobile-qr-copy-btn").addEventListener("click", copyMobileQrUrl);
  const postCashCloseDialog = document.getElementById("post-cash-close-dialog");
  document.getElementById("post-cash-login-btn").addEventListener("click", () => {
    postCashCloseDialog.close();
    openLogin();
  });
  document.getElementById("post-cash-exit-btn").addEventListener("click", () => {
    postCashCloseDialog.close();
    closeSystem();
  });
  const postLoginDialog = document.getElementById("post-login-dialog");
  const postLoginHint = document.getElementById("post-login-cash-hint");
  const postLoginAmount = document.getElementById("post-login-opening-amount");
  const postLoginEnterBtn = document.getElementById("post-login-enter-btn");
  const postLoginOpenCashBtn = document.getElementById("post-login-open-cash-btn");
  const postLoginForceCloseBtn = document.getElementById("post-login-force-close-btn");
  const postLoginLogoutBtn = document.getElementById("post-login-logout-btn");
  postLoginEnterBtn.addEventListener("click", () => {
    if (isAdminUser()) {
      postLoginDialog.close();
      enterAppAfterLogin();
      return;
    }

    if (!state.postLoginFundAdded) {
      alert("Debes presionar Agregar fondo con una cantidad valida antes de ingresar.");
      return;
    }
    postLoginDialog.close();
    enterAppAfterLogin();
  });
  postLoginLogoutBtn.addEventListener("click", () => {
    postLoginDialog.close();
    setSession("", null);
    state.postLoginFundAdded = false;
    openLogin();
  });
  postLoginOpenCashBtn.addEventListener("click", async () => {
    if (state.currentCash && isCurrentCashOwnedByLoggedUser()) {
      state.postLoginFundAdded = true;
      postLoginHint.textContent = "Tu fondo sigue abierto. Presiona Ingresar al sistema de venta para continuar.";
      postLoginEnterBtn.disabled = false;
      postLoginEnterBtn.textContent = "Volver a entrar al fondo abierto";
      return;
    }
    const amount = Number(postLoginAmount.value || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Debes ingresar un fondo inicial mayor a 0.");
      return;
    }
    try {
      await openCashSessionWithValues(amount, null);
      await loadData();
      postLoginHint.textContent = "Fondo agregado. Ingresando al sistema de venta...";
      postLoginAmount.disabled = true;
      postLoginOpenCashBtn.disabled = true;
      state.postLoginFundAdded = true;
      postLoginDialog.close();
      enterAppAfterLogin();
    } catch (error) {
      state.postLoginFundAdded = false;
      alert(error.message);
    }
  });
  postLoginForceCloseBtn.addEventListener("click", forceCloseOpenCashFromPostLogin);
  document.getElementById("post-login-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    postLoginEnterBtn.click();
  });
  postLoginDialog.addEventListener("cancel", (event) => {
    if (isAdminUser()) {
      return;
    }
    if (!state.postLoginFundAdded) {
      event.preventDefault();
      alert("Debes agregar fondo para continuar.");
    }
  });

  document.getElementById("login-dialog-title")?.addEventListener("dblclick", () => {
    setLoginAdminMode(true);
  });
  document.getElementById("show-admin-login-btn")?.addEventListener("click", () => {
    setLoginAdminMode(true);
  });

  const productDialog = document.getElementById("product-dialog");
  const stockEntryDialog = document.getElementById("stock-entry-dialog");
  const barcodeLabelDialog = document.getElementById("barcode-label-dialog");
  const autoPurchaseDialog = document.getElementById("auto-purchase-dialog");
  const cashCheckoutDialog = document.getElementById("cash-checkout-dialog");
  const autoPurchaseIncludeWarning = document.getElementById("auto-purchase-include-warning");
  document.getElementById("close-cash-checkout-dialog").addEventListener("click", () => {
    cashCheckoutDialog.close();
  });
  document.getElementById("close-current-sale-btn").addEventListener("click", closeCurrentSaleDraft);
  document.getElementById("sale-password-dialog")?.addEventListener("cancel", (event) => {
    if (isCashierSaleLockEnabled() && !state.saleSessionUnlocked) {
      event.preventDefault();
    }
  });
  document.getElementById("close-sale-password-dialog").addEventListener("click", () => {
    if (isCashierSaleLockEnabled() && !state.saleSessionUnlocked) {
      showSalePasswordGate();
      return;
    }
    state.salePasswordPromptDismissed = true;
    document.getElementById("sale-password-dialog")?.close();
    renderSaleSessionIndicator();
  });
  document.getElementById("cash-checkout-received").addEventListener("input", updateCashCheckoutChange);
  document.getElementById("mixed-cash-amount")?.addEventListener("input", updateMixedCheckoutAmounts);
  document.getElementById("mixed-cash-received")?.addEventListener("input", updateMixedCheckoutAmounts);
  document.getElementById("mixed-other-method")?.addEventListener("change", updateMixedCheckoutAmounts);
  document.getElementById("close-mixed-checkout-dialog")?.addEventListener("click", () => {
    document.getElementById("mixed-checkout-dialog")?.close();
  });
  document.getElementById("mixed-final-print-btn")?.addEventListener("click", () => {
    finalizeMixedCheckout(true);
  });
  document.getElementById("mixed-final-no-print-btn")?.addEventListener("click", () => {
    finalizeMixedCheckout(false);
  });
  document.getElementById("cash-final-print-btn").addEventListener("click", () => finalizeCashCheckout(true));
  document.getElementById("cash-final-no-print-btn").addEventListener("click", () => finalizeCashCheckout(false));
  document.getElementById("new-product-btn").addEventListener("click", () => openProductEditor(null));
  document.getElementById("import-eleventa-btn")?.addEventListener("click", openEleventaImportDialog);
  document.getElementById("close-eleventa-import-dialog")?.addEventListener("click", () => {
    document.getElementById("eleventa-import-dialog")?.close();
  });
  document.getElementById("eleventa-import-form")?.addEventListener("submit", importEleventaCatalog);
  document.getElementById("generate-missing-barcodes-btn")?.addEventListener("click", generateMissingBarcodes);
  document.getElementById("product-generate-barcode-btn")?.addEventListener("click", generateBarcodeFromProductForm);
  document.getElementById("show-low-stock-btn").addEventListener("click", async () => {
    state.showLowStockOnly = true;
    await refreshLowStockProducts();
    renderProductsTable();
  });
  document.getElementById("show-all-products-btn").addEventListener("click", () => {
    state.showLowStockOnly = false;
    renderProductsTable();
  });
  document.getElementById("refresh-inventory-dashboard-btn").addEventListener("click", async () => {
    await refreshLowStockProducts();
    renderProductsTable();
    renderInventoryDashboard();
  });
  document.getElementById("stock-count-new-session-btn").addEventListener("click", focusStockCountOrderCreation);
  document.getElementById("stock-count-refresh-btn").addEventListener("click", async () => {
    await refreshStockCountData();
    renderStockCountPanel();
  });
  document.getElementById("stock-count-print-order-btn").addEventListener("click", printStockCountOrder);
  document.getElementById("stock-count-print-diff-btn").addEventListener("click", printStockCountDifferenceReport);
  document.getElementById("stock-count-recount-btn").addEventListener("click", requestStockCountRecount);
  document.getElementById("stock-count-apply-btn").addEventListener("click", applyStockCountSession);
  document.getElementById("generate-critical-purchase-btn").addEventListener("click", generateCriticalPurchaseOrders);
  document.getElementById("close-auto-purchase-dialog").addEventListener("click", () => {
    autoPurchaseDialog.close();
  });
  autoPurchaseIncludeWarning.addEventListener("change", () => {
    rebuildAutoPurchaseLines(autoPurchaseIncludeWarning.checked);
    renderAutoPurchaseLines();
  });
  document.getElementById("auto-purchase-form").addEventListener("submit", submitAutoPurchaseOrders);
  document.getElementById("close-product-dialog").addEventListener("click", () => {
    state.editingProductId = null;
    productDialog.close();
  });
  document.getElementById("close-stock-entry-dialog").addEventListener("click", () => {
    state.stockEntryProductId = null;
    stockEntryDialog.close();
  });
  document.getElementById("close-barcode-label-dialog")?.addEventListener("click", () => {
    state.barcodeLabelProductId = null;
    barcodeLabelDialog?.close();
  });
  document.getElementById("barcode-label-form")?.addEventListener("submit", submitBarcodeLabelForm);
  document.getElementById("barcode-label-print-mode")?.addEventListener("change", syncBarcodeLabelPrinterVisibility);
  document.getElementById("barcode-label-generate-btn")?.addEventListener("click", async () => {
    if (!state.barcodeLabelProductId) return;
    const updated = await generateProductBarcode(state.barcodeLabelProductId, { notify: true });
    if (!updated) return;
    const codeEl = document.getElementById("barcode-label-current-code");
    const generateBtn = document.getElementById("barcode-label-generate-btn");
    if (codeEl) codeEl.textContent = `Codigo: ${getProductBarcodeValue(updated)}`;
    if (generateBtn) generateBtn.hidden = true;
    renderProductsTable();
  });
  barcodeLabelDialog?.addEventListener("close", () => {
    state.barcodeLabelProductId = null;
  });
  document.querySelectorAll(".label-size-preset-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const widthInput = document.getElementById("barcode-label-width-mm");
      const heightInput = document.getElementById("barcode-label-height-mm");
      if (widthInput) widthInput.value = String(button.dataset.width || "50");
      if (heightInput) heightInput.value = String(button.dataset.height || "30");
      document.querySelectorAll(".label-size-preset-btn").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });
  document
    .querySelector('#product-form input[name="tracks_inventory"]')
    ?.addEventListener("change", syncProductInventoryFields);
  document.getElementById("product-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const useSchoolFields = hasProductExtraFields();
    const payload = {
      sku: form.sku.value.trim(),
      barcode: normalizeBarcodeValue(form.barcode.value) || null,
      name: form.name.value.trim(),
      description: form.description.value.trim() || null,
      supplier_id: form.supplier_id.value ? Number(form.supplier_id.value) : null,
      department_id: form.department_id.value ? Number(form.department_id.value) : null,
      price: Number(form.price.value),
      cost: Number(form.cost.value || 0),
      stock: Number(form.stock.value || 0),
      min_stock: Number(form.min_stock.value || 0),
      tracks_inventory: form.tracks_inventory.checked ? 1 : 0,
      tax_rate: Number(form.tax_rate.value || 12) / 100,
      wholesale_enabled: form.wholesale_enabled.checked ? 1 : 0,
      wholesale_min_qty: Number(form.wholesale_min_qty.value || 0),
      wholesale_discount_pct: Number(form.wholesale_discount_pct.value || 0),
    };
    if (useSchoolFields) {
      payload.school_category = form.school_category.value.trim() || null;
      payload.school_grade = form.school_grade.value.trim() || null;
      payload.school_brand = form.school_brand.value.trim() || null;
      payload.school_variant = form.school_variant.value.trim() || null;
    }
    try {
      if (state.editingProductId) {
        await api(`/api/products/${state.editingProductId}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
      }
      productDialog.close();
      state.editingProductId = null;
      form.reset();
      await loadData();
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById("stock-entry-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    if (!state.stockEntryProductId) return;
    try {
      await api(`/api/products/${state.stockEntryProductId}/stock-entry`, {
        method: "POST",
        body: JSON.stringify({
          quantity: Number(form.quantity.value || 0),
          notes: form.notes.value.trim() || null,
        }),
      });
      stockEntryDialog.close();
      state.stockEntryProductId = null;
      form.reset();
      await loadData();
    } catch (error) {
      alert(error.message);
    }
  });

  const supplierDialog = document.getElementById("supplier-dialog");
  document.getElementById("new-supplier-btn").addEventListener("click", () => openSupplierEditor(null));
  document.getElementById("close-supplier-dialog").addEventListener("click", () => {
    state.editingSupplierId = null;
    supplierDialog.close();
  });
  document.getElementById("supplier-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      name: form.name.value.trim(),
      email: form.email.value.trim() || null,
      phone: form.phone.value.trim() || null,
      contact_name: form.contact_name.value.trim() || null,
      notes: form.notes.value.trim() || null,
    };
    try {
      if (state.editingSupplierId) {
        await api(`/api/suppliers/${state.editingSupplierId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/suppliers", { method: "POST", body: JSON.stringify(payload) });
      }
      supplierDialog.close();
      state.editingSupplierId = null;
      form.reset();
      await loadData();
    } catch (error) {
      alert(error.message);
    }
  });

  const departmentDialog = document.getElementById("department-dialog");
  document.getElementById("new-department-btn").addEventListener("click", () => openDepartmentEditor(null));
  document.getElementById("close-department-dialog").addEventListener("click", () => {
    state.editingDepartmentId = null;
    departmentDialog.close();
  });
  document.getElementById("department-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      name: form.name.value.trim(),
      description: form.description.value.trim() || null,
    };
    try {
      if (state.editingDepartmentId) {
        await api(`/api/departments/${state.editingDepartmentId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/departments", { method: "POST", body: JSON.stringify(payload) });
      }
      departmentDialog.close();
      state.editingDepartmentId = null;
      form.reset();
      await loadData();
    } catch (error) {
      alert(error.message);
    }
  });

  const purchaseOrderDialog = document.getElementById("purchase-order-dialog");
  document.getElementById("new-purchase-order-btn").addEventListener("click", () => {
    state.purchaseOrderLines = [createEmptyPurchaseLine()];
    renderPurchaseOrderLines();
    purchaseOrderDialog.showModal();
  });
  document.getElementById("add-purchase-line-btn").addEventListener("click", () => {
    state.purchaseOrderLines.push(createEmptyPurchaseLine());
    renderPurchaseOrderLines();
  });
  document.getElementById("close-purchase-order-dialog").addEventListener("click", () => {
    purchaseOrderDialog.close();
  });
  document.getElementById("purchase-order-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const items = state.purchaseOrderLines
      .filter((line) => line.product_id && line.quantity > 0)
      .map((line) => ({
        product_id: Number(line.product_id),
        quantity: Number(line.quantity),
      }));
    if (!items.length) {
      alert("Agrega al menos un producto para la orden de compra.");
      return;
    }
    const payload = {
      notes: form.notes.value.trim() || null,
      channels: getSelectedPurchaseChannels(),
      items,
    };
    try {
      const created = await api("/api/purchase-orders", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      purchaseOrderDialog.close();
      state.purchaseOrderLines = [];
      await loadData();
      alert(`Orden(es) creada(s): ${created.length}. Enviadas segun proveedor.`);
    } catch (error) {
      alert(error.message);
    }
  });

  const orderDialog = document.getElementById("order-dialog");
  document.getElementById("new-order-btn").addEventListener("click", () => orderDialog.showModal());
  document.getElementById("close-order-dialog").addEventListener("click", () => orderDialog.close());
  document.getElementById("order-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_name: form.customer_name.value.trim(),
          customer_phone: form.customer_phone.value.trim() || null,
          customer_email: form.customer_email.value.trim() || null,
          total_estimate: Number(form.total_estimate.value || 0),
          notes: form.notes.value.trim() || null,
        }),
      });
      form.reset();
      orderDialog.close();
      await loadData();
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("close-sale-dialog").addEventListener("click", () => {
    document.getElementById("sale-dialog").close();
  });
  document.getElementById("register-return-btn").addEventListener("click", registerSaleReturn);
  document.getElementById("close-sale-return-dialog").addEventListener("click", () => {
    document.getElementById("sale-return-dialog").close();
    if (state.selectedSaleId) {
      openSaleDetail(state.selectedSaleId);
    }
  });
  document.getElementById("sale-return-dialog").addEventListener("cancel", (event) => {
    event.preventDefault();
    document.getElementById("sale-return-dialog").close();
    if (state.selectedSaleId) {
      openSaleDetail(state.selectedSaleId);
    }
  });
  document.getElementById("sale-return-form").addEventListener("submit", submitSaleReturnForm);
  document.getElementById("print-receipt-btn").addEventListener("click", async () => {
    if (!state.selectedSaleId) return;
    await printSaleReceipt(state.selectedSaleId, true, true);
  });
  document.getElementById("download-xml-btn").addEventListener("click", async () => {
    if (!state.selectedSaleId) return;
    const xml = await api(`/api/sales/${state.selectedSaleId}/fel-xml`);
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fel-${state.selectedSaleId}.xml`;
    link.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById("login-dialog").addEventListener("cancel", (event) => {
    event.preventDefault();
  });
  document.getElementById("password-change-dialog")?.addEventListener("cancel", (event) => {
    event.preventDefault();
  });
  document.getElementById("password-change-form")?.addEventListener("submit", submitPasswordChange);
  document.getElementById("login-admin-mode").addEventListener("change", (event) => {
    setLoginAdminMode(event.target.checked);
  });
  document.getElementById("login-form").addEventListener("submit", login);
  const posPanel = document.getElementById("tab-pos");
  const trackSaleActivity = () => {
    if (!isCashierSaleLockEnabled() || !state.saleSessionUnlocked) return;
    resetSaleSessionAutoLockTimer();
  };
  ["click", "input", "keydown", "touchstart"].forEach((eventName) => {
    posPanel?.addEventListener(eventName, trackSaleActivity);
  });
  document.addEventListener("keydown", handleCheckoutShortcuts);

  document.getElementById("customer-select")?.addEventListener("change", onCustomerSelectChange);
  document.getElementById("cart-discount-input")?.addEventListener("input", renderTotals);
  document.getElementById("discount-quick")?.addEventListener("click", (event) => {
    const chip = event.target.closest(".discount-chip[data-discount]");
    if (!chip) return;
    const input = document.getElementById("cart-discount-input");
    if (!input) return;
    input.value = String(Number(chip.dataset.discount || 0));
    renderTotals();
    input.focus();
  });
  document.getElementById("add-school-package-btn")?.addEventListener("click", addSchoolPackageToCart);
  document.getElementById("new-customer-btn")?.addEventListener("click", openCustomerDialog);
  document.getElementById("new-promotion-btn")?.addEventListener("click", openPromotionDialog);
  document.getElementById("close-customer-dialog")?.addEventListener("click", () => {
    document.getElementById("customer-dialog")?.close();
  });
  document.getElementById("close-credit-payment-dialog")?.addEventListener("click", () => {
    document.getElementById("credit-payment-dialog")?.close();
  });
  document.getElementById("close-promotion-dialog")?.addEventListener("click", () => {
    document.getElementById("promotion-dialog")?.close();
  });
  document.getElementById("customer-form")?.addEventListener("submit", submitCustomerForm);
  document.getElementById("credit-payment-form")?.addEventListener("submit", submitCreditPaymentForm);
  document.getElementById("promotion-form")?.addEventListener("submit", submitPromotionForm);
  document.getElementById("refresh-reports-btn")?.addEventListener("click", () => {
    loadReportsDashboard().catch((error) => alert(error.message));
  });
  document.getElementById("export-catalog-btn")?.addEventListener("click", () => {
    exportCatalogCsv().catch((error) => alert(error.message));
  });
}

setupTabs();
setupEvents();
setSession(state.token, null);
loadCurrentUser().catch((error) => alert(error.message));
