const FP = window.FelPos || {};
const ADMIN_MONITOR_REFRESH_MS = FP.ADMIN_MONITOR_REFRESH_MS;
const HIGH_VALUE_TICKET_CONFIRM_THRESHOLD = FP.HIGH_VALUE_TICKET_CONFIRM_THRESHOLD;
const POS_CATALOG_PAGE_SIZE = FP.POS_CATALOG_PAGE_SIZE || 60;
const state = FP.state;
const DEFAULT_RECEIPT_PRINTER_CONFIG = FP.DEFAULT_RECEIPT_PRINTER_CONFIG;
const DEFAULT_UI_THEME = FP.DEFAULT_UI_THEME;
const SHORTCUTS = FP.SHORTCUTS || [];
const money = FP.money;
const formatQuantity = FP.formatQuantity;
const formatSignedQuantity = FP.formatSignedQuantity;
const escapeHtml = FP.escapeHtml;
const parseAppDate = FP.parseAppDate;
const formatAppDateTime = FP.formatAppDateTime;
const createClientRequestId = FP.createClientRequestId;
const api = FP.api;
const showAppAlert = FP.showAppAlert;
const showAppConfirm = FP.showAppConfirm;
const showAppPrompt = FP.showAppPrompt;
const showAppChoice = FP.showAppChoice;
const buildWhatsAppSaleMessage = FP.buildWhatsAppSaleMessage;
const openWhatsAppShare = FP.openWhatsAppShare;
const normalizeWhatsAppPhone = FP.normalizeWhatsAppPhone;

const normalizeHexColor = FP.normalizeHexColor;
const hexToRgb = FP.hexToRgb;
const darkenHex = FP.darkenHex;
const normalizeBackgroundTheme = FP.normalizeBackgroundTheme;

function applyUiTheme(themeOrColor) {
  return FP.applyUiTheme(themeOrColor, state.uiThemeConfig);
}

const wrapConfigSection =
  FP.wrapConfigSection ||
  function wrapConfigSectionFallback(id, title, contentHtml, { open = false } = {}) {
    return `
      <details class="config-section" data-section="${escapeHtml(id)}" ${open ? "open" : ""}>
        <summary class="config-section-summary">${escapeHtml(title)}</summary>
        <div class="config-section-body">${contentHtml || ""}</div>
      </details>
    `;
  };
const createTicketId = FP.createTicketId;
const cloneCartLines = FP.cloneCartLines;
const ticketHasContent = FP.ticketHasContent;
const isFelEnabledInConfig = (config = state.config) => FP.isFelEnabledInConfig(config);
const buildSaleSuccessMessage = (sale, suffix = "") => FP.buildSaleSuccessMessage(sale, suffix, state.config);
const buildCheckoutStatusSuffix = FP.buildCheckoutStatusSuffix;

function renderUiThemeSection() {
  const theme = state.uiThemeConfig || DEFAULT_UI_THEME;
  const current = normalizeHexColor(theme.primary_color || DEFAULT_UI_THEME.primary_color);
  const presets = Array.isArray(theme.presets) && theme.presets.length
    ? theme.presets
    : DEFAULT_UI_THEME.presets || [];
  const currentBackground = normalizeBackgroundTheme(
    theme.background_theme || DEFAULT_UI_THEME.background_theme
  );
  const backgroundPresets =
    Array.isArray(theme.background_presets) && theme.background_presets.length
      ? theme.background_presets
      : DEFAULT_UI_THEME.background_presets || [];
  return `
    <p class="hint">Cambia el fondo completo del sistema y el color principal de botones, pestanas y totales.</p>
    <form id="ui-theme-form" class="ui-theme-form">
      <div class="ui-theme-preview" id="ui-theme-preview">
        <span class="ui-theme-swatch" style="background:${current}"></span>
        <div>
          <strong>Color activo</strong>
          <small id="ui-theme-preview-hex">${current}</small>
        </div>
        <button type="button" class="btn primary ui-theme-sample-btn">Ejemplo</button>
      </div>
      <div>
        <strong>Fondo del sistema</strong>
        <p class="hint ui-theme-block-hint">Selecciona una apariencia para todas las ventanas y paneles.</p>
        <div class="ui-background-presets" id="ui-background-presets">
          ${backgroundPresets
            .map((preset) => {
              const id = normalizeBackgroundTheme(preset.id);
              const selected = id === currentBackground ? "is-selected" : "";
              return `
                <button type="button" class="ui-background-preset ${selected}" data-background="${id}" style="--background-swatch:${escapeHtml(preset.color || "#0f1419")}">
                  <span class="ui-background-preset-dot"></span>
                  <span>${escapeHtml(preset.label || id)}</span>
                </button>
              `;
            })
            .join("")}
        </div>
      </div>
      <div>
        <strong>Color de botones y acentos</strong>
      </div>
      <div class="ui-theme-presets" id="ui-theme-presets">
        ${presets
          .map((preset) => {
            const color = normalizeHexColor(preset.color);
            const selected = color === current ? "is-selected" : "";
            return `
              <button type="button" class="ui-theme-preset ${selected}" data-color="${color}" title="${escapeHtml(preset.label || color)}" style="--swatch:${color}">
                <span class="ui-theme-preset-dot"></span>
                <span>${escapeHtml(preset.label || color)}</span>
              </button>
            `;
          })
          .join("")}
      </div>
      <label class="ui-theme-custom">
        Color personalizado
        <span class="ui-theme-custom-row">
          <input type="color" name="primary_color_picker" value="${current}" aria-label="Selector de color">
          <input type="text" name="primary_color" value="${current}" maxlength="7" placeholder="#00a884" pattern="#[0-9A-Fa-f]{6}">
        </span>
      </label>
      <div class="panel-actions">
        <button class="btn primary" type="submit">Guardar apariencia</button>
        <button class="btn ghost" type="button" id="ui-theme-reset-btn">Restaurar tema original</button>
      </div>
    </form>
  `;
}
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
      inventory: "Inventario",
      stockCount: "Conteo",
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
    companySubtitleDefault: "Sistema de farmacia con ventas, lotes y vencimientos",
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
      expiryPanelTitle: "Vencimientos (FEFO)",
      prescriptionConfirm: "Confirma que el cliente presenta receta medica para los medicamentos controlados.",
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

const DEFAULT_PROFILE_CAPABILITIES = {
  sale_by_weight: false,
  lots: false,
  school_packages: false,
  dining: false,
  product_extra_fields: false,
  pharmacy: false,
  default_tracks_inventory: true,
  default_track_expiry: false,
  force_track_expiry: false,
  block_expired_lots: true,
  expiry_alert_days: 30,
  show_orders_tab: true,
  orders_as_apartados: false,
  qty_unit_label: "ud",
  weight_prompt: "Cantidad",
};

function getActiveBusinessProfile() {
  const candidate = String(state.businessProfile || state.config?.business_profile || "abarrotes").toLowerCase();
  if (candidate in BUSINESS_PROFILE_COPY) return candidate;
  return "abarrotes";
}

function getBusinessProfileCopy() {
  return BUSINESS_PROFILE_COPY[getActiveBusinessProfile()] || BUSINESS_PROFILE_COPY.abarrotes;
}

function getProfileCapabilities() {
  const caps = state.profileCapabilities;
  if (caps && typeof caps === "object" && Object.keys(caps).length) {
    return { ...DEFAULT_PROFILE_CAPABILITIES, ...caps };
  }
  const local = {
    abarrotes: {
      sale_by_weight: true,
      lots: true,
      school_packages: false,
      dining: false,
      product_extra_fields: false,
      default_tracks_inventory: true,
      default_track_expiry: false,
      show_orders_tab: true,
      orders_as_apartados: false,
      qty_unit_label: "kg",
      weight_prompt: "Cantidad en kg",
    },
    farmacia: {
      sale_by_weight: false,
      lots: true,
      school_packages: false,
      dining: false,
      product_extra_fields: false,
      pharmacy: true,
      default_tracks_inventory: true,
      default_track_expiry: true,
      force_track_expiry: true,
      block_expired_lots: true,
      expiry_alert_days: 60,
      show_orders_tab: true,
      orders_as_apartados: false,
      qty_unit_label: "ud",
      weight_prompt: "Cantidad",
    },
    libreria: {
      sale_by_weight: false,
      lots: false,
      school_packages: true,
      dining: false,
      product_extra_fields: true,
      default_tracks_inventory: true,
      default_track_expiry: false,
      show_orders_tab: true,
      orders_as_apartados: true,
      qty_unit_label: "ud",
      weight_prompt: "Cantidad",
    },
    ferreteria: {
      sale_by_weight: true,
      lots: false,
      school_packages: false,
      dining: false,
      product_extra_fields: false,
      default_tracks_inventory: true,
      default_track_expiry: false,
      show_orders_tab: true,
      orders_as_apartados: false,
      qty_unit_label: "kg/m",
      weight_prompt: "Cantidad (kg, m o unidad)",
    },
    restaurante: {
      sale_by_weight: false,
      lots: false,
      school_packages: false,
      dining: true,
      product_extra_fields: false,
      default_tracks_inventory: false,
      default_track_expiry: false,
      show_orders_tab: false,
      orders_as_apartados: false,
      qty_unit_label: "ud",
      weight_prompt: "Cantidad",
    },
    boutique: {
      sale_by_weight: false,
      lots: false,
      school_packages: false,
      dining: false,
      product_extra_fields: true,
      default_tracks_inventory: true,
      default_track_expiry: false,
      show_orders_tab: true,
      orders_as_apartados: true,
      qty_unit_label: "ud",
      weight_prompt: "Cantidad",
    },
  };
  return { ...DEFAULT_PROFILE_CAPABILITIES, ...(local[getActiveBusinessProfile()] || {}) };
}

function profileHas(capability) {
  return Boolean(getProfileCapabilities()[capability]);
}

function isSchoolSuppliesProfile() {
  return getActiveBusinessProfile() === "libreria";
}

function hasProductExtraFields() {
  return profileHas("product_extra_fields");
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

function productSellsByWeight(product) {
  return profileHas("sale_by_weight") && Number(product?.sale_by_weight || 0) === 1;
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

function syncProductProfileOptionFields() {
  const weightWrap = document.getElementById("product-sale-by-weight-wrap");
  const expiryWrap = document.getElementById("product-track-expiry-wrap");
  const expiryHint = document.getElementById("product-track-expiry-hint");
  const rxWrap = document.getElementById("product-requires-prescription-wrap");
  const form = document.getElementById("product-form");
  const caps = getProfileCapabilities();
  if (weightWrap) weightWrap.hidden = !profileHas("sale_by_weight");
  if (expiryWrap) expiryWrap.hidden = !profileHas("lots");
  if (expiryHint) {
    expiryHint.hidden = !profileHas("lots");
    if (caps.force_track_expiry) {
      expiryHint.textContent =
        "Farmacia: FEFO obligatorio. Las entradas deben registrar lote y fecha. Sin lotes vigentes no se podra vender.";
    }
  }
  if (rxWrap) rxWrap.hidden = !profileHas("pharmacy");
  const diningModsWrap = document.getElementById("product-dining-modifiers-wrap");
  if (diningModsWrap) diningModsWrap.hidden = !profileHas("dining");
  if (form?.track_expiry && caps.force_track_expiry && profileHas("lots")) {
    form.track_expiry.checked = true;
    form.track_expiry.disabled = true;
  } else if (form?.track_expiry) {
    form.track_expiry.disabled = false;
  }
}

function applyBusinessProfileUi() {
  const profile = getBusinessProfileCopy();
  const caps = getProfileCapabilities();
  document.title = profile.appTitle;
  const brandTitleEl = document.querySelector(".brand h1");
  if (brandTitleEl) {
    const version = document.getElementById("app-version-label");
    brandTitleEl.textContent = "";
    brandTitleEl.appendChild(document.createTextNode(`${profile.brandTitle} `));
    if (version) brandTitleEl.appendChild(version);
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
    if (el && label) el.textContent = label;
  });
  const productsPanelTitle = document.getElementById("products-panel-title");
  if (productsPanelTitle && profile.tabs?.products) {
    productsPanelTitle.textContent = profile.tabs.products;
  }
  const inventoryPanelTitle = document.querySelector("#tab-inventory .panel-header h2");
  if (inventoryPanelTitle && profile.tabs?.inventory) {
    inventoryPanelTitle.textContent =
      profile.tabs.inventory === "Inventario" ? "Dashboard inventario" : profile.tabs.inventory;
  }

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

  const diningTab = document.getElementById("tab-btn-dining");
  if (diningTab) diningTab.style.display = caps.dining ? "" : "none";

  const ordersTab = document.getElementById("tab-btn-orders");
  if (ordersTab) {
    ordersTab.style.display = caps.show_orders_tab ? "" : "none";
    if (!caps.show_orders_tab) ordersTab.classList.remove("active");
  }
  const ordersPanel = document.getElementById("tab-orders");
  if (ordersPanel && !caps.show_orders_tab) {
    ordersPanel.style.display = "none";
    ordersPanel.classList.remove("active");
  }

  const managePackagesBtn = document.getElementById("manage-school-packages-btn");
  if (managePackagesBtn) managePackagesBtn.hidden = !caps.school_packages;
  const packagesAdmin = document.getElementById("school-packages-admin");
  if (packagesAdmin && !caps.school_packages) packagesAdmin.hidden = true;

  syncProductSchoolFieldsUi();
  syncProductProfileOptionFields();
  applyRoleVisibility();
  populateBranchSelect();
  renderSchoolPackagesPos();
}

function setSession(token, user) {
  FP.setSession = setSession;
  clearAdminCashMonitorTimer();
  state.token = token || "";
  state.user = user || null;
  const salesFromInput = document.getElementById("sales-filter-from");
  if (salesFromInput) salesFromInput.dataset.initialized = "0";
  [
    "sales-filter-from",
    "sales-filter-to",
    "sales-filter-customer",
    "sales-filter-min-total",
    "sales-filter-max-total",
  ].forEach((id) => {
    const input = document.getElementById(id);
    if (input) input.value = "";
  });
  if (!state.user) {
    state.config = null;
  }
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
}

function applyRoleVisibility() {
  const tabButtons = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll("main .panel");
  const posTabButton = document.querySelector('.tab[data-tab="pos"]');
  const posPanel = document.getElementById("tab-pos");
  const mobileQrButton = document.getElementById("open-mobile-qr-btn");
  const generateCriticalPurchaseBtn = document.getElementById("generate-critical-purchase-btn");
  const isAdmin = isAdminUser();

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
      const allow = canAccessTab(tab.dataset.tab);
      tab.style.display = allow ? "inline-block" : "none";
      if (!allow) {
        tab.classList.remove("active");
      }
    });
    panels.forEach((panel) => {
      const tabId = String(panel.id || "").replace(/^tab-/, "");
      const allow = canAccessTab(tabId);
      panel.style.display = allow ? "" : "none";
      if (!allow) {
        panel.classList.remove("active");
      }
    });
    const activeVisible = document.querySelector(".tab.active");
    if (!activeVisible) {
      posTabButton?.classList.add("active");
      posPanel?.classList.add("active");
    }
    if (mobileQrButton) {
      mobileQrButton.style.display = "none";
    }
  }

  if (generateCriticalPurchaseBtn) {
    generateCriticalPurchaseBtn.style.display =
      isAdmin || hasPermission("purchases.manage") ? "inline-block" : "none";
  }

  // Mesas solo con perfil restaurante (tambien para admin).
  const diningTab = document.getElementById("tab-btn-dining");
  const diningPanel = document.getElementById("tab-dining");
  const isRestaurant = profileHas("dining");
  if (!isRestaurant) {
    if (diningTab) {
      diningTab.style.display = "none";
      diningTab.classList.remove("active");
    }
    if (diningPanel) {
      diningPanel.style.display = "none";
      diningPanel.classList.remove("active");
    }
  } else if (isAdmin && diningTab) {
    diningTab.style.display = "";
  }
  const newDiningBtn = document.getElementById("new-dining-table-btn");
  if (newDiningBtn) {
    newDiningBtn.style.display = isRestaurant && isAdmin ? "inline-block" : "none";
  }
  const ordersTab = document.getElementById("tab-btn-orders");
  const ordersPanel = document.getElementById("tab-orders");
  if (!profileHas("show_orders_tab")) {
    if (ordersTab) {
      ordersTab.style.display = "none";
      ordersTab.classList.remove("active");
    }
    if (ordersPanel) {
      ordersPanel.style.display = "none";
      ordersPanel.classList.remove("active");
    }
  }
}

function openLogin() {
  FP.openLogin = openLogin;
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

function hasPermission(key) {
  if (isAdminUser()) return true;
  const perms = state.user?.permissions;
  return Array.isArray(perms) && perms.includes(key);
}

function canAccessTab(tab) {
  if (isAdminUser()) return true;
  const base = new Set(["pos", "today", "sales", "cash"]);
  if (base.has(tab)) return true;
  if (tab === "products") {
    return hasPermission("products.view") || hasPermission("products.edit") || hasPermission("stock.entry");
  }
  if (tab === "departments") return hasPermission("departments.manage");
  if (tab === "suppliers") return hasPermission("suppliers.manage");
  if (tab === "purchases") return hasPermission("purchases.manage");
  if (tab === "inventory") return hasPermission("inventory.view") || hasPermission("stock.entry");
  if (tab === "stock-count") return hasPermission("stock.count");
  if (tab === "reports") return hasPermission("reports.view");
  if (tab === "customers") return hasPermission("customers.manage");
  if (tab === "promotions") return hasPermission("promotions.manage");
  if (tab === "orders") return profileHas("show_orders_tab") && hasPermission("orders.manage");
  if (tab === "dining") return profileHas("dining");
  return false;
}

function permissionCatalogHtml(selectedKeys = [], { namePrefix = "perm" } = {}) {
  const catalog = Array.isArray(state.permissionCatalog) ? state.permissionCatalog : [];
  const selected = new Set(selectedKeys || []);
  if (!catalog.length) {
    return '<p class="hint">Cargando permisos...</p>';
  }
  const groups = {};
  catalog.forEach((item) => {
    const group = item.group || "Otros";
    if (!groups[group]) groups[group] = [];
    groups[group].push(item);
  });
  return Object.entries(groups)
    .map(([group, items]) => {
      const checks = items
        .map(
          (item) => `
        <label class="perm-check">
          <input type="checkbox" name="${namePrefix}" value="${escapeHtml(item.key)}" ${
            selected.has(item.key) ? "checked" : ""
          }>
          <span>${escapeHtml(item.label)}</span>
        </label>`
        )
        .join("");
      return `<div class="perm-group"><strong>${escapeHtml(group)}</strong>${checks}</div>`;
    })
    .join("");
}

function readPermissionChecks(container) {
  if (!container) return [];
  return Array.from(container.querySelectorAll('input[name="perm"]:checked')).map((el) => el.value);
}

function enterAppAfterLogin() {
  switchToPosTab();
  // Tras login / fondo, entrar directo a vender.
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

function resetSaleCustomerDefaults() {
  const nitInput = document.getElementById("customer-nit");
  const nameInput = document.getElementById("customer-name");
  const select = document.getElementById("customer-select");
  if (nitInput) nitInput.value = "CF";
  if (nameInput) nameInput.value = "CONSUMIDOR FINAL";
  if (select) select.value = "";
}

function ensureActiveTicketId() {
  if (state.activeTicketId) return state.activeTicketId;
  state.activeTicketId = createTicketId();
  return state.activeTicketId;
}

function snapshotActiveTicket() {
  const id = ensureActiveTicketId();
  const existing = state.openTickets.find((ticket) => ticket.id === id);
  const paymentMethod = document.getElementById("payment-method")?.value || "efectivo";
  const now = Date.now();
  const snapshot = {
    id,
    heldAt: existing?.heldAt || now,
    cart: cloneCartLines(state.cart),
    customerNit: document.getElementById("customer-nit")?.value || "CF",
    customerName: document.getElementById("customer-name")?.value || "CONSUMIDOR FINAL",
    customerSelect: document.getElementById("customer-select")?.value || "",
    cartDiscount: Math.round(Number(document.getElementById("cart-discount-input")?.value || 0) * 100) / 100,
    paymentMethod,
    selectedCartProductId: state.selectedCartProductId,
    updatedAt: now,
  };
  const index = state.openTickets.findIndex((ticket) => ticket.id === id);
  if (index >= 0) {
    state.openTickets[index] = snapshot;
  } else if (snapshot.cart.length > 0 || snapshot.cartDiscount > 0 || snapshot.customerNit !== "CF") {
    state.openTickets.push(snapshot);
  }
  return snapshot;
}

function clearActiveTicketWorkspace({ keepPaymentMethod = false } = {}) {
  state.cart = [];
  state.selectedCartProductId = null;
  state.ticketCustomerTypeAsked = false;
  resetCartDiscount();
  resetSaleCustomerDefaults();
  const paid = document.getElementById("pos-paid-with");
  if (paid) paid.value = "0.00";
  if (!keepPaymentMethod) {
    const payment = document.getElementById("payment-method");
    if (payment) payment.value = "efectivo";
  }
  const cashDialog = document.getElementById("cash-checkout-dialog");
  if (cashDialog?.open) cashDialog.close();
}

function startBlankTicket() {
  state.activeTicketId = createTicketId();
  clearActiveTicketWorkspace();
  renderCart();
}

function restoreTicket(ticket) {
  if (!ticket) return;
  state.activeTicketId = ticket.id;
  state.cart = cloneCartLines(ticket.cart);
  state.ticketCustomerTypeAsked = true;
  const nitInput = document.getElementById("customer-nit");
  const nameInput = document.getElementById("customer-name");
  const select = document.getElementById("customer-select");
  const discountInput = document.getElementById("cart-discount-input");
  const payment = document.getElementById("payment-method");
  if (nitInput) nitInput.value = ticket.customerNit || "CF";
  if (nameInput) nameInput.value = ticket.customerName || "CONSUMIDOR FINAL";
  if (select) select.value = ticket.customerSelect || "";
  if (discountInput) discountInput.value = String(Number(ticket.cartDiscount || 0));
  if (payment) payment.value = ticket.paymentMethod || "efectivo";
  state.selectedCartProductId = ticket.selectedCartProductId || ticket.cart?.[ticket.cart.length - 1]?.id || null;
  renderCart();
}

function holdCurrentTicket() {
  if (!state.cart.length && Number(document.getElementById("cart-discount-input")?.value || 0) <= 0) {
    alert("El ticket actual esta vacio. Agrega productos antes de retenerlo.");
    return false;
  }
  if (state.openTickets.filter((t) => t.id !== state.activeTicketId).length >= 8) {
    alert("Ya hay demasiados tickets abiertos (maximo 8). Cobra o cierra alguno primero.");
    return false;
  }
  snapshotActiveTicket();
  startBlankTicket();
  return true;
}

function createNewTicket() {
  const hasItems =
    state.cart.length > 0 || Number(document.getElementById("cart-discount-input")?.value || 0) > 0;
  if (hasItems) {
    if (state.openTickets.filter((t) => t.id !== state.activeTicketId).length >= 8) {
      alert("Ya hay demasiados tickets abiertos (maximo 8). Cobra o cierra alguno primero.");
      return false;
    }
    snapshotActiveTicket();
  } else if (state.activeTicketId) {
    state.openTickets = state.openTickets.filter((ticket) => ticket.id !== state.activeTicketId);
  }
  startBlankTicket();
  return true;
}

function switchToOpenTicket(ticketId) {
  if (!ticketId || ticketId === state.activeTicketId) return;
  const target = state.openTickets.find((ticket) => ticket.id === ticketId);
  if (!target) return;
  snapshotActiveTicket();
  // Quita vacios retenidos al cambiar
  state.openTickets = state.openTickets.filter((ticket) => ticket.id === target.id || ticketHasContent(ticket));
  restoreTicket(target);
}

function discardOpenTicket(ticketId) {
  const ticket = state.openTickets.find((item) => item.id === ticketId);
  if (!ticket) return;
  const label = getTicketLabel(ticket);
  if (ticketHasContent(ticket)) {
    const total = getTicketTotal(ticket);
    if (!confirmTicketDiscard(label, total, (ticket.cart || []).length)) return;
  }
  state.openTickets = state.openTickets.filter((item) => item.id !== ticketId);
  if (state.activeTicketId === ticketId) {
    startBlankTicket();
  } else {
    renderOpenTicketsBar();
  }
}

function removeActiveTicketFromOpenList() {
  if (!state.activeTicketId) return;
  state.openTickets = state.openTickets.filter((ticket) => ticket.id !== state.activeTicketId);
}

function compareTicketsByHoldOrder(a, b) {
  const aTime = Number(a?.heldAt || a?.updatedAt || 0);
  const bTime = Number(b?.heldAt || b?.updatedAt || 0);
  if (aTime !== bTime) return aTime - bTime;
  return String(a?.id || "").localeCompare(String(b?.id || ""));
}

function getRetainedTicketNumber(ticketId) {
  const retained = state.openTickets
    .filter((ticket) => ticket.id !== state.activeTicketId)
    .sort(compareTicketsByHoldOrder);
  const index = retained.findIndex((ticket) => ticket.id === ticketId);
  return index >= 0 ? index + 1 : null;
}

function getTicketNumber(ticketId) {
  const ordered = [...(state.openTickets || [])].sort(compareTicketsByHoldOrder);
  const index = ordered.findIndex((ticket) => ticket.id === ticketId);
  return index >= 0 ? index + 1 : Math.max(1, ordered.length || 1);
}

function getTicketLabel(ticket) {
  if (!ticket) return "Ticket 1";
  return `Ticket ${getTicketNumber(ticket.id)}`;
}

function getTicketTabLabel(ticket) {
  const base = getTicketLabel(ticket);
  const name = (ticket?.customerName || "").trim();
  if (name && name !== "CONSUMIDOR FINAL") return `${base} · ${name}`;
  return base;
}

function getTicketTotal(ticket) {
  if (!ticket) return 0;
  let total = 0;
  (ticket.cart || []).forEach((line) => {
    const unit = getEffectiveUnitPrice(line);
    total += unit * Number(line.quantity || 0);
  });
  const discount = Math.min(Number(ticket.cartDiscount || 0), total);
  return Math.round((total - discount) * 100) / 100;
}

function confirmTicketDiscard(label, total, lineCount) {
  const amount = Math.round(Number(total || 0) * 100) / 100;
  const firstConfirmed = confirm(
    `Se descartara ${label} sin cobrar.\n` +
      `${lineCount} producto${lineCount === 1 ? "" : "s"} · Total ${money(amount)}\n\n` +
      "Esta accion no se puede deshacer. Deseas continuar?"
  );
  if (!firstConfirmed) return false;
  if (amount < HIGH_VALUE_TICKET_CONFIRM_THRESHOLD) return true;
  return confirm(
    `CONFIRMACION DE VENTA ALTA\n\nEstas por eliminar un ticket de ${money(amount)}.\n` +
      "Confirma nuevamente para descartarlo definitivamente."
  );
}

function renderOpenTicketsBar() {
  const bar = document.getElementById("open-tickets-bar");
  const title = document.getElementById("active-ticket-title");
  const subtitle = document.getElementById("active-ticket-subtitle");
  ensureActiveTicketId();

  const active =
    state.openTickets.find((ticket) => ticket.id === state.activeTicketId) ||
    snapshotActiveTicket();
  // snapshot may have pushed empty; keep bar clean
  state.openTickets = state.openTickets.filter(
    (ticket) => ticket.id === state.activeTicketId || ticketHasContent(ticket)
  );

  if (title) {
    title.textContent = getTicketLabel(active);
  }
  if (subtitle) {
    const heldCount = state.openTickets.filter((ticket) => ticket.id !== state.activeTicketId).length;
    subtitle.textContent =
      heldCount > 0
        ? `${heldCount} ticket${heldCount === 1 ? "" : "s"} en espera`
        : "Listo para cobrar";
  }

  if (!bar) return;
  const tickets = [...state.openTickets].sort((a, b) => {
    if (a.id === state.activeTicketId) return -1;
    if (b.id === state.activeTicketId) return 1;
    return compareTicketsByHoldOrder(a, b);
  });
  if (!tickets.length && active) {
    tickets.push(active);
  }
  if (!tickets.length) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }

  bar.hidden = false;
  bar.innerHTML = tickets
    .map((ticket) => {
      const isActive = ticket.id === state.activeTicketId;
      const total = getTicketTotal(ticket);
      const items = (ticket.cart || []).length;
      return `
        <div class="open-ticket-chip ${isActive ? "is-active" : ""}" data-ticket-id="${ticket.id}" title="${escapeHtml(getTicketTabLabel(ticket))}">
          <button type="button" class="ticket-chip-select" data-ticket-id="${ticket.id}">
            ${escapeHtml(getTicketTabLabel(ticket))}
            <span class="ticket-chip-total">${items} ud · ${money(total)}</span>
          </button>
          <button type="button" class="ticket-chip-close" data-discard-ticket="${ticket.id}" title="Cerrar ticket" aria-label="Cerrar ticket">×</button>
        </div>
      `;
    })
    .join("");

  bar.querySelectorAll(".ticket-chip-select").forEach((button) => {
    button.addEventListener("click", () => switchToOpenTicket(button.dataset.ticketId));
  });
  bar.querySelectorAll("[data-discard-ticket]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      discardOpenTicket(button.dataset.discardTicket);
    });
  });
}

function focusProductSearch() {
  const searchInput = document.getElementById("product-search");
  if (!searchInput || searchInput.disabled) return;
  const arm = () => {
    try {
      searchInput.focus({ preventScroll: true });
    } catch {
      searchInput.focus();
    }
    // Listo para el siguiente codigo/escaneo (campo vacio o seleccionado).
    if (searchInput.value) {
      searchInput.select();
    }
  };
  // Doble tick: sobrevive al re-render de la tabla y a dialogs que cierran.
  setTimeout(() => {
    arm();
    requestAnimationFrame(arm);
  }, 0);
}

function scrollSelectedCartLineIntoView() {
  const selectedId = state.selectedCartProductId;
  if (!selectedId) return;
  const row = document.querySelector(`#cart-items tr[data-cart-line-id="${selectedId}"]`);
  if (!row) return;
  try {
    row.scrollIntoView({ block: "nearest", inline: "nearest" });
  } catch {
    row.scrollIntoView(false);
  }
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
  if (!(isAdminUser() || hasPermission("cash.view_others"))) return;
  try {
    const rows = await api("/api/cash/sessions/open/monitor");
    const sessions = (rows || []).map((row) => ({
      session: row.session,
      movements: row.movements || [],
      metrics: summarizeCashMonitor(row.session, row.movements || []),
    }));
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

function calcTotals(cart) {
  // El precio de venta ya incluye IVA: el impuesto se desglosa del precio, no se suma encima.
  let total = 0;
  let taxTotal = 0;
  cart.forEach((line) => {
    const unitPrice = getEffectiveUnitPrice(line);
    const lineTotal = unitPrice * line.quantity;
    const lineTax = line.tax_rate > 0 ? lineTotal - lineTotal / (1 + line.tax_rate) : 0;
    total += lineTotal;
    taxTotal += lineTax;
  });
  const rawTotal = Math.round(total * 100) / 100;
  const rawTax = Math.round(taxTotal * 100) / 100;
  const maxDiscount = Math.round(rawTotal * 0.5 * 100) / 100;
  const cartDiscount = Math.min(
    Math.round(Number(document.getElementById("cart-discount-input")?.value || 0) * 100) / 100,
    rawTotal,
    maxDiscount
  );
  const discountInput = document.getElementById("cart-discount-input");
  if (discountInput && Number(discountInput.value || 0) > cartDiscount + 0.001) {
    discountInput.value = String(cartDiscount);
  }
  const adjustedTotal = Math.round((rawTotal - cartDiscount) * 100) / 100;
  const ratio = rawTotal > 0 ? adjustedTotal / rawTotal : 1;
  const adjustedTax = Math.round(rawTax * ratio * 100) / 100;
  const adjustedSubtotal = Math.round((adjustedTotal - adjustedTax) * 100) / 100;
  return {
    subtotal: adjustedSubtotal,
    taxTotal: adjustedTax,
    total: adjustedTotal,
    cartDiscount,
    rawSubtotal: rawTotal,
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
  // Departamentos ocultos en Vender: solo busqueda / escaneo.
}

function getSelectedPosDepartmentId() {
  return 0;
}

function renderPosDepartmentChips() {
  // Departamentos ocultos en Vender.
}

function isPosCatalogProductVisible(product, { allowOutOfStockSearch = false, term = "" } = {}) {
  if (!product) return false;
  const name = String(product.name || "").trim();
  const sku = String(product.sku || "").trim();
  if (!name && !sku) return false;
  const stockReady = !isMultiBranchEnabled() || Boolean(state.branchStockMapReady);
  const outOfStock =
    productTracksInventory(product) &&
    stockReady &&
    getPosAvailableStock(product) <= 0;
  if (outOfStock && !(allowOutOfStockSearch && term)) return false;
  return true;
}

function getPosSearchSuggestionMatches(rawTerm, { limit = 10 } = {}) {
  const term = String(rawTerm || "").trim().toLowerCase();
  if (!term) return [];
  const normalized = normalizeBarcodeValue(rawTerm);
  const scored = [];
  for (const product of state.products || []) {
    if (!isPosCatalogProductVisible(product, { allowOutOfStockSearch: true, term })) continue;
    const name = String(product.name || "").toLowerCase();
    const sku = String(product.sku || "").trim().toLowerCase();
    const barcode = getProductBarcodeValue(product).toLowerCase();
    const barcodeNorm = normalizeBarcodeValue(product.barcode || product.sku || "");
    let score = 0;
    if (sku === term || barcode === term || barcodeNorm === normalized) score = 100;
    else if (sku.startsWith(term) || barcode.startsWith(term)) score = 80;
    else if (name.startsWith(term)) score = 70;
    else if (sku.includes(term) || barcode.includes(term)) score = 50;
    else if (name.includes(term)) score = 40;
    else if ((product.department_name || "").toLowerCase().includes(term)) score = 20;
    else continue;
    const outOfStock =
      productTracksInventory(product) && getPosAvailableStock(product) <= 0;
    if (outOfStock) score -= 5;
    scored.push({ product, score, outOfStock });
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.product.name || "").localeCompare(String(b.product.name || ""), "es");
  });
  return scored.slice(0, limit);
}

function hideProductSearchSuggestions() {
  const box = document.getElementById("product-search-suggestions");
  if (!box) return;
  box.hidden = true;
  box.innerHTML = "";
  state.posSearchSuggestionIndex = -1;
}

function getActiveSuggestionProductId() {
  const box = document.getElementById("product-search-suggestions");
  if (!box || box.hidden) return null;
  const active = box.querySelector(".pos-suggestion-item.is-active");
  if (!active) return null;
  return Number(active.dataset.productId || 0) || null;
}

function setActiveSuggestionIndex(index) {
  const box = document.getElementById("product-search-suggestions");
  if (!box || box.hidden) return;
  const items = [...box.querySelectorAll(".pos-suggestion-item")];
  if (!items.length) {
    state.posSearchSuggestionIndex = -1;
    return;
  }
  const next = ((index % items.length) + items.length) % items.length;
  state.posSearchSuggestionIndex = next;
  items.forEach((item, i) => item.classList.toggle("is-active", i === next));
  items[next]?.scrollIntoView({ block: "nearest" });
}

function renderProductSearchSuggestions() {
  const searchInput = document.getElementById("product-search");
  const box = document.getElementById("product-search-suggestions");
  if (!searchInput || !box) return;
  const raw = (searchInput.value || "").trim();
  if (raw.length < 1) {
    hideProductSearchSuggestions();
    return;
  }
  const matches = getPosSearchSuggestionMatches(raw, { limit: 10 });
  if (!matches.length) {
    box.hidden = false;
    box.innerHTML = `<div class="pos-suggestion-empty">Sin coincidencias para "${escapeHtml(raw)}"</div>`;
    state.posSearchSuggestionIndex = -1;
    return;
  }
  box.hidden = false;
  box.innerHTML = matches
    .map(({ product, outOfStock }, index) => {
      const code = getProductBarcodeValue(product) || product.sku || "—";
      const name = String(product.name || product.sku || "Sin nombre").trim();
      return `
        <button
          type="button"
          class="pos-suggestion-item ${outOfStock ? "is-out" : ""} ${index === 0 ? "is-active" : ""}"
          role="option"
          data-product-id="${product.id}"
          data-index="${index}"
        >
          <span class="pos-suggestion-name">${escapeHtml(name)}${outOfStock ? " (sin stock)" : ""}</span>
          <span class="pos-suggestion-code">${escapeHtml(code)}</span>
          <span class="pos-suggestion-price">${money(product.price)}</span>
        </button>
      `;
    })
    .join("");
  state.posSearchSuggestionIndex = 0;
  box.querySelectorAll(".pos-suggestion-item").forEach((btn) => {
    btn.addEventListener("mousedown", (event) => {
      event.preventDefault();
      void selectProductSearchSuggestion(Number(btn.dataset.productId));
    });
  });
}

async function selectProductSearchSuggestion(productId) {
  const id = Number(productId || 0);
  if (!id) return;
  hideProductSearchSuggestions();
  const searchInput = document.getElementById("product-search");
  if (searchInput) searchInput.value = "";
  await addToCart(id);
  renderProducts();
  focusProductSearch();
}

function getFilteredPosProducts() {
  const searchInput = document.getElementById("product-search");
  const term = (searchInput?.value || "").trim().toLowerCase();
  const selectedDepartmentId = getSelectedPosDepartmentId();
  return state.products.filter((product) => {
    if (!isPosCatalogProductVisible(product, { allowOutOfStockSearch: false, term })) {
      return false;
    }
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
      String(product.name || "").toLowerCase().includes(term) ||
      String(product.sku || "").toLowerCase().includes(term) ||
      barcodeValue.includes(term) ||
      (product.department_name || "").toLowerCase().includes(term) ||
      schoolSearchBlob.includes(term);
    const matchesDepartment =
      !selectedDepartmentId || Number(product.department_id || 0) === selectedDepartmentId;
    return matchesText && matchesDepartment;
  });
}

function resetCatalogPage() {
  state.catalogPage = 0;
}

function renderCatalogPager(totalItems, page, pageCount) {
  const pager = document.getElementById("product-catalog-pager");
  if (!pager) return;
  if (totalItems <= POS_CATALOG_PAGE_SIZE) {
    pager.hidden = true;
    pager.innerHTML = "";
    return;
  }
  pager.hidden = false;
  const from = page * POS_CATALOG_PAGE_SIZE + 1;
  const to = Math.min(totalItems, (page + 1) * POS_CATALOG_PAGE_SIZE);
  pager.innerHTML = `
    <button type="button" class="btn ghost" id="catalog-prev-btn" ${page <= 0 ? "disabled" : ""}>Anterior</button>
    <span class="catalog-page-indicator">${from}-${to} de ${totalItems}</span>
    <button type="button" class="btn ghost" id="catalog-next-btn" ${page >= pageCount - 1 ? "disabled" : ""}>Siguiente</button>
  `;
  document.getElementById("catalog-prev-btn")?.addEventListener("click", () => {
    state.catalogPage = Math.max(0, page - 1);
    renderProducts();
  });
  document.getElementById("catalog-next-btn")?.addEventListener("click", () => {
    state.catalogPage = Math.min(pageCount - 1, page + 1);
    renderProducts();
  });
}

function renderProducts() {
  const grid = document.getElementById("product-grid");
  if (!grid) return;
  const items = getFilteredPosProducts();
  if (!items.length) {
    grid.innerHTML = '<div class="empty">No hay productos.</div>';
    renderCatalogPager(0, 0, 1);
    return;
  }

  const pageCount = Math.max(1, Math.ceil(items.length / POS_CATALOG_PAGE_SIZE));
  if (state.catalogPage >= pageCount) state.catalogPage = pageCount - 1;
  if (state.catalogPage < 0) state.catalogPage = 0;
  const page = state.catalogPage;
  const pageItems = items.slice(page * POS_CATALOG_PAGE_SIZE, (page + 1) * POS_CATALOG_PAGE_SIZE);

  grid.innerHTML = pageItems
    .map(
      (product) => {
        const displayName = String(product.name || product.sku || "Sin nombre").trim() || "Sin nombre";
        return `
    <article class="product-card ${
      productTracksInventory(product) && getPosAvailableStock(product) <= 0 ? "out-of-stock" : ""
    }" data-id="${product.id}">
      <h3>${escapeHtml(displayName)}</h3>
      <p>${escapeHtml(getProductBarcodeValue(product))} · ${escapeHtml(product.department_name || "Sin departamento")} · ${
        productTracksInventory(product) ? `Stock: ${getPosAvailableStock(product)}` : "Sin control de inventario"
      }</p>
      ${
        hasProductExtraFields()
          ? `<p>${escapeHtml(formatProductExtraDetail(product) || getProductExtraFieldsCopy().emptyDetail || "Sin detalle")}</p>`
          : ""
      }
      ${getWholesaleHint(product) ? `<p>${escapeHtml(getWholesaleHint(product))}</p>` : ""}
      <strong>${money(product.price)}</strong>
    </article>
  `;
      }
    )
    .join("");

  grid.querySelectorAll(".product-card").forEach((card) => {
    const product = state.products.find((item) => item.id === Number(card.dataset.id));
    if (!product || (productTracksInventory(product) && getPosAvailableStock(product) <= 0)) {
      return;
    }
    card.addEventListener("click", () => {
      void addToCart(Number(card.dataset.id));
    });
  });
  renderCatalogPager(items.length, page, pageCount);
}

function renderCart() {
  const container = document.getElementById("cart-items");
  if (!container) return;
  state.cart = state.cart
    .map((line) => {
      const product = state.products.find((item) => item.id === line.id);
      const tracksInventory = product
        ? productTracksInventory(product)
        : productTracksInventory(line);
      const availableStock = getPosAvailableStock(product || line);
      const normalizedQty = Number(line.quantity || 0);
      if (!Number.isFinite(normalizedQty) || normalizedQty <= 0) return null;
      if (tracksInventory && availableStock <= 0) return null;
      return {
        ...line,
        tracks_inventory: tracksInventory ? 1 : 0,
        quantity: tracksInventory ? Math.min(normalizedQty, availableStock) : normalizedQty,
      };
    })
    .filter(Boolean);

  if (!state.cart.some((line) => line.id === state.selectedCartProductId)) {
    state.selectedCartProductId = state.cart.length ? state.cart[state.cart.length - 1].id : null;
  }

  const countEl = document.getElementById("pos-lines-count");
  if (countEl) {
    const n = state.cart.length;
    countEl.textContent = `${n} Producto${n === 1 ? "" : "s"} en la venta actual.`;
  }

  if (!state.cart.length) {
    container.innerHTML =
      '<tr class="is-empty"><td colspan="6">Teclee o escanee el codigo del producto para agregarlo al ticket.</td></tr>';
  } else {
    const productById = new Map(state.products.map((product) => [product.id, product]));
    container.innerHTML = state.cart
      .map((line) => {
        const product = productById.get(line.id);
        const tracksInventory = productTracksInventory(product ?? line);
        const availableStock = getPosAvailableStock(product ?? line);
        const unit = getEffectiveUnitPrice(line);
        const importe = Math.round(unit * Number(line.quantity || 0) * 100) / 100;
        const code = getProductBarcodeValue(product || line) || product?.sku || line.sku || "—";
        const isSelected = line.id === state.selectedCartProductId;
        const stockLabel = tracksInventory ? formatQuantity(availableStock) : "Ilim";
        return `
      <tr class="${isSelected ? "is-selected" : ""}" data-cart-line-id="${line.id}">
        <td title="${escapeHtml(code)}">${escapeHtml(code)}</td>
        <td title="${escapeHtml(line.name || "")}">${escapeHtml(line.name || "")}</td>
        <td>${money(unit)}</td>
        <td>${formatQuantity(line.quantity)}</td>
        <td>${money(importe)}</td>
        <td>${escapeHtml(stockLabel)}</td>
      </tr>
    `;
      })
      .join("");

    container.querySelectorAll("tr[data-cart-line-id]").forEach((lineEl) => {
      lineEl.addEventListener("click", () => {
        state.selectedCartProductId = Number(lineEl.dataset.cartLineId);
        renderCart();
        scrollSelectedCartLineIntoView();
        focusProductSearch();
      });
      lineEl.addEventListener("dblclick", () => {
        state.selectedCartProductId = Number(lineEl.dataset.cartLineId);
        void changeSelectedCartLineQuantity();
      });
    });
    scrollSelectedCartLineIntoView();
  }
  renderTotals();
  renderOpenTicketsBar();
  updatePosCustomerStatusMessage();
}

function adjustCartLineQuantity(productId, delta) {
  const id = Number(productId);
  const line = state.cart.find((item) => item.id === id);
  if (!line) return false;
  state.selectedCartProductId = id;

  const product = state.products.find((item) => item.id === id);
  const tracksInventory = productTracksInventory(product ?? line);
  const availableStock = getPosAvailableStock(product ?? line);
  const currentQty = Number(line.quantity || 0);
  const step = Number(delta || 0);
  if (!step) return false;

  if (step > 0 && tracksInventory && currentQty >= availableStock) {
    alert(`No puedes vender mas de ${formatQuantity(availableStock)} unidades de ${line.name}.`);
    return false;
  }

  line.quantity = currentQty + step;
  state.cart = state.cart.filter((item) => item.quantity > 0);
  if (!state.cart.some((item) => item.id === id)) {
    state.selectedCartProductId = state.cart.length ? state.cart[state.cart.length - 1].id : null;
  } else {
    state.selectedCartProductId = id;
  }
  renderCart();
  scrollSelectedCartLineIntoView();
  focusProductSearch();
  return true;
}

function adjustSelectedCartLine(delta) {
  if (!state.cart.length) return false;
  const selectedId = state.selectedCartProductId || state.cart[state.cart.length - 1].id;
  return adjustCartLineQuantity(selectedId, delta);
}

function isTypingInField(target) {
  if (!target) return false;
  const tagName = String(target.tagName || "").toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    Boolean(target.isContentEditable)
  );
}

function getCartQuantityShortcutDelta(event) {
  if (event.key === "+" || event.key === "Add" || event.code === "NumpadAdd") return 1;
  if (event.key === "=" && event.shiftKey) return 1;
  if (event.key === "-" || event.key === "Subtract" || event.code === "NumpadSubtract") return -1;
  return 0;
}

function handleCartQuantityShortcuts(event) {
  if (event.ctrlKey || event.altKey || event.metaKey) return;
  if (document.querySelector("dialog[open]")) return;
  if (!document.getElementById("tab-pos")?.classList.contains("active")) return;
  if (!state.cart.length) return;

  const delta = getCartQuantityShortcutDelta(event);
  if (!delta) return;

  const target = event.target;
  const isProductSearch = target?.id === "product-search";
  // Como Eleventa: + / - funcionan aunque el foco este en el buscador.
  if (isTypingInField(target) && !isProductSearch) return;

  event.preventDefault();
  event.stopPropagation();
  adjustSelectedCartLine(delta);
}

function getCartDiscountInput() {
  return document.getElementById("cart-discount-input");
}

function getCartDiscountAmount() {
  return Math.round(Number(getCartDiscountInput()?.value || 0) * 100) / 100;
}

function setCartDiscountAmount(amount, { syncUi = true } = {}) {
  const value = Math.max(0, Math.round(Number(amount || 0) * 100) / 100);
  const master = getCartDiscountInput();
  if (master) master.value = String(value);
  if (syncUi) syncCheckoutDiscountInputsFromMaster();
  return value;
}

function syncCheckoutDiscountInputsFromMaster() {
  const value = String(getCartDiscountAmount());
  const input = document.getElementById("cash-checkout-discount");
  if (input && document.activeElement !== input) input.value = value;
  updateCheckoutDiscountBadges();
}

function updateCheckoutDiscountBadges() {
  const amount = getCartDiscountAmount();
  const label = amount > 0 ? `Ahorro ${money(amount)}` : "Sin descuento";
  const el = document.getElementById("discount-badge");
  if (el) el.textContent = label;
  document.getElementById("discount-panel")?.classList.toggle("is-active", true);
}

function applyDiscountChipValue(chipValue) {
  const master = getCartDiscountInput();
  const previous = master?.value ?? "0";
  if (master) master.value = "0";
  const rawSubtotal = Number(calcTotals(state.cart).rawSubtotal || 0);
  if (master) master.value = previous;
  const maxDiscount = Math.round(rawSubtotal * 0.5 * 100) / 100;
  const next = Math.min(Math.round(Number(chipValue || 0) * 100) / 100, maxDiscount);
  setCartDiscountAmount(next);
  renderTotals();
  refreshOpenCheckoutTotals();
}

function onCheckoutDiscountInput(rawValue) {
  setCartDiscountAmount(rawValue);
  renderTotals();
  refreshOpenCheckoutTotals();
}

function refreshOpenCheckoutTotals() {
  const totals = calcTotals(state.cart);
  const dialog = document.getElementById("cash-checkout-dialog");
  if (!dialog?.open) return;
  const cashTotal = document.getElementById("cash-checkout-total");
  if (cashTotal) cashTotal.textContent = money(totals.total);
  const method = document.getElementById("payment-method")?.value || "efectivo";
  if (method === "efectivo") {
    const received = document.getElementById("cash-checkout-received");
    if (received?.dataset.replaceOnType === "1") {
      received.value = totals.total.toFixed(2);
    }
    updateCashCheckoutChange();
  } else if (method === "mixto") {
    updateMixedCheckoutAmounts();
  }
}

function syncCheckoutPaymentChoices(method = null) {
  const value = method || document.getElementById("payment-method")?.value || "efectivo";
  const select = document.getElementById("payment-method");
  if (select && select.value !== value) select.value = value;
  document.querySelectorAll(".checkout-pay-choice[data-payment]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.payment === value);
  });
}

function setCheckoutPaymentMethod(method) {
  const value = String(method || "efectivo");
  const select = document.getElementById("payment-method");
  if (select) select.value = value;
  syncCheckoutPaymentChoices(value);
  if (value === "mixto") {
    const totals = calcTotals(state.cart);
    const cashAmountInput = document.getElementById("mixed-cash-amount");
    const cashReceivedInput = document.getElementById("mixed-cash-received");
    const suggestedCash = Math.round(totals.total * 0.5 * 100) / 100;
    if (cashAmountInput && (!cashAmountInput.value || Number(cashAmountInput.value) <= 0)) {
      cashAmountInput.value = suggestedCash.toFixed(2);
    }
    if (cashReceivedInput && (!cashReceivedInput.value || Number(cashReceivedInput.value) <= 0)) {
      cashReceivedInput.value = String(cashAmountInput?.value || suggestedCash.toFixed(2));
    }
    const otherMethod = document.getElementById("mixed-other-method");
    if (otherMethod && !otherMethod.value) otherMethod.value = "tarjeta";
  }
  updateCheckoutMethodSections();
  // Tras elegir metodo, deja listo el campo de efectivo para teclear encima.
  setTimeout(() => focusCheckoutTenderField(), 0);
}

function updateCheckoutMethodSections() {
  const method = document.getElementById("payment-method")?.value || "efectivo";
  syncCheckoutPaymentChoices(method);
  const cashSec = document.getElementById("checkout-section-efectivo");
  const mixedSec = document.getElementById("checkout-section-mixto");
  const otherSec = document.getElementById("checkout-section-other");
  const title = document.getElementById("checkout-dialog-title");
  const hint = document.getElementById("checkout-other-hint");
  const printMode = document.getElementById("cash-checkout-print-mode");
  if (cashSec) cashSec.hidden = method !== "efectivo";
  if (mixedSec) mixedSec.hidden = method !== "mixto";
  if (otherSec) otherSec.hidden = method === "efectivo" || method === "mixto";
  if (title) title.textContent = `Cobrar · ${formatPaymentMethodLabel(method)}`;
  if (hint) {
    hint.textContent = `Confirmas recibir pago con ${formatPaymentMethodLabel(method).toLowerCase()}.`;
  }
  if (printMode) {
    printMode.textContent = "¿Que metodo de pago estas recibiendo?";
  }
  syncCheckoutCreditOptions();
  refreshOpenCheckoutTotals();
}

function openCheckoutDialog() {
  state.checkoutClientRequestId = createClientRequestId();
  const dialog = document.getElementById("cash-checkout-dialog");
  const totalEl = document.getElementById("cash-checkout-total");
  const receivedInput = document.getElementById("cash-checkout-received");
  if (!dialog || !totalEl) return;
  if (!ensureCashOwnership("cobrar")) return;

  syncCheckoutDiscountInputsFromMaster();
  const totals = calcTotals(state.cart);
  totalEl.textContent = money(totals.total);

  const method = document.getElementById("payment-method")?.value || "efectivo";
  if (method === "mixto") {
    const cashAmountInput = document.getElementById("mixed-cash-amount");
    const cashReceivedInput = document.getElementById("mixed-cash-received");
    const suggestedCash = Math.round(totals.total * 0.5 * 100) / 100;
    if (cashAmountInput) cashAmountInput.value = suggestedCash.toFixed(2);
    if (cashReceivedInput) cashReceivedInput.value = suggestedCash.toFixed(2);
    const otherMethod = document.getElementById("mixed-other-method");
    if (otherMethod && !otherMethod.value) otherMethod.value = "tarjeta";
  }

  if (receivedInput) {
    const paidPreview = Number(String(document.getElementById("pos-paid-with")?.value || "").replace(",", "."));
    if (Number.isFinite(paidPreview) && paidPreview > 0) {
      receivedInput.value = paidPreview.toFixed(2);
      delete receivedInput.dataset.replaceOnType;
    } else {
      receivedInput.value = totals.total.toFixed(2);
      receivedInput.dataset.replaceOnType = "1";
    }
    updateCashCheckoutChange();
  }

  updateCheckoutMethodSections();
  wireCashCheckoutKeypad();
  if (!dialog.open) dialog.showModal();
  // Efectivo recibido queda seleccionado: teclear reemplaza el total sin mouse.
  setTimeout(() => focusCheckoutTenderField(), 0);
}

function focusCheckoutTenderField() {
  const dialog = document.getElementById("cash-checkout-dialog");
  if (!dialog?.open) return;
  const method = document.getElementById("payment-method")?.value || "efectivo";
  if (method === "efectivo") {
    const receivedInput = document.getElementById("cash-checkout-received");
    if (!receivedInput) return;
    receivedInput.dataset.replaceOnType = "1";
    focusCashReceivedInput(receivedInput);
    return;
  }
  if (method === "mixto") {
    const cashReceivedInput = document.getElementById("mixed-cash-received");
    if (!cashReceivedInput) return;
    cashReceivedInput.focus();
    try {
      cashReceivedInput.select();
    } catch {
      /* ignore */
    }
    return;
  }
  document.querySelector(".checkout-pay-choice.is-active")?.focus();
}

function openCashCheckoutDialog() {
  openCheckoutDialog();
}

function openMixedCheckoutDialog() {
  const payment = document.getElementById("payment-method");
  if (payment) payment.value = "mixto";
  openCheckoutDialog();
}

function openSimpleCheckoutDialog() {
  openCheckoutDialog();
}

function renderTotals() {
  const totals = calcTotals(state.cart);
  const discountAmount = Number(totals.cartDiscount || 0);
  // Subtotal del ticket = importe de productos (IVA incluido) antes del descuento.
  const subtotalEl = document.getElementById("subtotal");
  if (subtotalEl) subtotalEl.textContent = money(totals.rawSubtotal);
  const discountEl = document.getElementById("cart-discount-display");
  if (discountEl) discountEl.textContent = discountAmount > 0 ? `-${money(discountAmount)}` : money(0);
  const taxEl = document.getElementById("tax-total");
  if (taxEl) taxEl.textContent = money(totals.taxTotal);
  const grandEl = document.getElementById("grand-total");
  if (grandEl) grandEl.textContent = money(totals.total);
  const bigTotal = document.getElementById("pos-big-total");
  if (bigTotal) bigTotal.textContent = money(totals.total);

  const discountRow = document.getElementById("totals-discount-row");
  const hasDiscount = discountAmount > 0;
  discountRow?.classList.toggle("is-active", hasDiscount);
  discountRow?.classList.toggle("is-hidden", !hasDiscount);
  syncCheckoutDiscountInputsFromMaster();

  const currentValue = getCartDiscountAmount();
  document.querySelectorAll(".discount-chip[data-discount]").forEach((chip) => {
    const chipValue = Math.round(Number(chip.dataset.discount || 0) * 100) / 100;
    chip.classList.toggle("is-selected", hasDiscount && chipValue === currentValue && chipValue > 0);
  });

  updatePosPaidChangeDisplay(totals.total);
}

function updatePosPaidChangeDisplay(totalOverride = null) {
  const totals = totalOverride == null ? calcTotals(state.cart).total : Number(totalOverride || 0);
  const paidInput = document.getElementById("pos-paid-with");
  const changeEl = document.getElementById("pos-change-display");
  if (!changeEl) return;
  const paid = Number(String(paidInput?.value || "0").replace(",", "."));
  const change = Math.round(((Number.isFinite(paid) ? paid : 0) - totals) * 100) / 100;
  changeEl.textContent = money(change > 0 ? change : 0);
}

function updatePosCustomerStatusMessage() {
  const status = document.getElementById("pos-status-message");
  if (!status) return;
  const nit = normalizeNit(document.getElementById("customer-nit")?.value || "CF");
  const name = (document.getElementById("customer-name")?.value || "").trim() || "CONSUMIDOR FINAL";
  if (nit && nit !== "CF") {
    status.textContent = `Cliente: ${name} · NIT ${nit} · Escanee o teclee codigo de producto.`;
  } else {
    status.textContent = "Punto de Venta .. Teclee o escanee el Codigo del Producto.";
  }
}

function startPosStatusClock() {
  const clock = document.getElementById("pos-status-clock");
  if (!clock || clock.dataset.wired === "1") return;
  clock.dataset.wired = "1";
  const tick = () => {
    const now = new Date();
    const when = now.toLocaleString("es-GT", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
    const ver = state.appVersion?.version ? `Ver: ${state.appVersion.version}` : "";
    clock.textContent = [ver, when].filter(Boolean).join("   ");
  };
  tick();
  setInterval(tick, 30000);
}

async function changeSelectedCartLineQuantity() {
  if (!state.cart.length) {
    await showAppAlert("No hay productos en el ticket.");
    return false;
  }
  const selectedId = state.selectedCartProductId || state.cart[state.cart.length - 1].id;
  const line = state.cart.find((item) => item.id === selectedId);
  if (!line) return false;
  state.selectedCartProductId = selectedId;
  const product = state.products.find((item) => item.id === selectedId);
  const tracksInventory = productTracksInventory(product ?? line);
  const availableStock = getPosAvailableStock(product ?? line);
  const raw = await showAppPrompt(`Nueva cantidad para ${line.name}`, {
    title: "Cambiar cantidad",
    label: "Cantidad",
    defaultValue: String(line.quantity),
    inputMode: "decimal",
    placeholder: "Ej. 1",
  });
  if (raw === null) return false;
  const qty = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(qty) || qty <= 0) {
    await showAppAlert("Cantidad invalida.");
    return false;
  }
  if (tracksInventory && qty > availableStock) {
    await showAppAlert(`No puedes vender mas de ${formatQuantity(availableStock)} unidades.`);
    return false;
  }
  line.quantity = qty;
  renderCart();
  focusProductSearch();
  return true;
}

function removeSelectedCartLine() {
  if (!state.cart.length) {
    alert("No hay productos para eliminar.");
    return false;
  }
  const selectedId = state.selectedCartProductId || state.cart[state.cart.length - 1].id;
  state.cart = state.cart.filter((item) => item.id !== selectedId);
  state.selectedCartProductId = state.cart.length ? state.cart[state.cart.length - 1].id : null;
  renderCart();
  focusProductSearch();
  return true;
}

async function openAssignCustomerDialog() {
  const dialog = document.getElementById("pos-assign-customer-dialog");
  if (!dialog) {
    state.ticketCustomerTypeAsked = false;
    return ensureTicketCustomerTypePrompt();
  }
  const nitFields = document.getElementById("pos-assign-nit-fields");
  const nitInput = document.getElementById("pos-assign-nit-input");
  const nameInput = document.getElementById("pos-assign-name-input");
  const select = document.getElementById("pos-assign-customer-select");
  const status = document.getElementById("pos-assign-nit-status");
  if (nitFields) nitFields.hidden = true;
  if (nitInput) nitInput.value = normalizeNit(document.getElementById("customer-nit")?.value || "");
  if (nameInput) nameInput.value = document.getElementById("customer-name")?.value || "";
  if (status) status.textContent = "";
  if (select) {
    select.innerHTML = document.getElementById("customer-select")?.innerHTML || '<option value="">Nuevo / por NIT</option>';
    select.value = document.getElementById("customer-select")?.value || "";
  }
  if (!dialog.open) dialog.showModal();
  return true;
}

async function applyAssignCustomerCfFromDialog() {
  await applyTicketCustomerCf();
  document.getElementById("pos-assign-customer-dialog")?.close();
  updatePosCustomerStatusMessage();
  focusProductSearch();
}

async function showAssignNitFields() {
  const nitFields = document.getElementById("pos-assign-nit-fields");
  if (nitFields) nitFields.hidden = false;
  setTimeout(() => document.getElementById("pos-assign-nit-input")?.focus(), 0);
}

async function saveAssignCustomerFromDialog() {
  const nitRaw = document.getElementById("pos-assign-nit-input")?.value || "";
  const nameRaw = document.getElementById("pos-assign-name-input")?.value || "";
  const selectVal = document.getElementById("pos-assign-customer-select")?.value || "";
  const normalized = normalizeNit(nitRaw);
  if (!normalized || normalized === "CF") {
    await showAppAlert("Ingresa un NIT valido, o elige CF.");
    return;
  }
  if (!isValidNit(normalized)) {
    await showAppAlert("NIT invalido.");
    return;
  }
  const nitInput = document.getElementById("customer-nit");
  const nameInput = document.getElementById("customer-name");
  const select = document.getElementById("customer-select");
  if (nitInput) nitInput.value = normalized;
  if (nameInput) nameInput.value = (nameRaw || "").trim() || "CLIENTE";
  if (select) select.value = selectVal;
  await refreshNitFeedback({ lookup: true });
  if (nameRaw.trim()) {
    nameInput.value = nameRaw.trim();
  }
  state.ticketCustomerTypeAsked = true;
  document.getElementById("pos-assign-customer-dialog")?.close();
  updatePosCustomerStatusMessage();
  renderOpenTicketsBar();
  focusProductSearch();
}

async function reprintLastTicket() {
  const saleId = state.lastCheckoutSaleId || state.selectedSaleId;
  if (!saleId) {
    await showAppAlert("No hay un ticket reciente para reimprimir.");
    return;
  }
  try {
    await printSaleReceipt(saleId, true, true);
  } catch (error) {
    await showAppAlert(error.message || "No se pudo reimprimir.");
  }
}

function goToSalesTab() {
  document.querySelector('.tab[data-tab="sales"]')?.click();
}

function resetCartDiscount() {
  setCartDiscountAmount(0);
}

async function finalizeSimpleCheckout(printTicket = true) {
  return finalizeCheckoutFromDialog(printTicket);
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
    const totals = calcTotals(state.cart);
    if (!confirmTicketDiscard("el ticket actual", totals.total, state.cart.length)) return;
  }
  removeActiveTicketFromOpenList();
  clearActiveTicketWorkspace();
  startBlankTicket();
}

function updateCashCheckoutChange() {
  const changeEl = document.getElementById("cash-checkout-change");
  if (!changeEl) return;
  const totals = calcTotals(state.cart);
  const cashReceived = Number(document.getElementById("cash-checkout-received")?.value || 0);
  const change = Math.round((cashReceived - totals.total) * 100) / 100;
  changeEl.textContent = money(change > 0 ? change : 0);
}

function applyCashKeypadInput(key) {
  const input = document.getElementById("cash-checkout-received");
  if (!input) return;
  const totals = calcTotals(state.cart);
  let current = String(input.value || "");

  if (key === "exact") {
    input.value = Number(totals.total || 0).toFixed(2);
    updateCashCheckoutChange();
    focusCashReceivedInput(input);
    return;
  }
  if (key === "50" || key === "100" || key === "200") {
    input.value = Number(key).toFixed(2);
    updateCashCheckoutChange();
    focusCashReceivedInput(input);
    return;
  }
  if (key === "back") {
    input.value = current.slice(0, -1);
    updateCashCheckoutChange();
    return;
  }
  if (key === ".") {
    if (current.includes(".")) return;
    input.value = current ? `${current}.` : "0.";
    updateCashCheckoutChange();
    return;
  }
  if (/^\d$/.test(key)) {
    // Si el valor es exactamente el total (seleccion inicial), el primer digito lo reemplaza.
    const exactTotal = Number(totals.total || 0).toFixed(2);
    if (current === exactTotal || input.dataset.replaceOnType === "1") {
      current = "";
      delete input.dataset.replaceOnType;
    }
    if (current.includes(".")) {
      const decimals = current.split(".")[1] || "";
      if (decimals.length >= 2) return;
    }
    input.value = `${current}${key}`;
    updateCashCheckoutChange();
  }
}

function wireCashCheckoutKeypad() {
  // Teclado tactil de cobro eliminado; se usa teclado fisico / input.
}

async function confirmPrescriptionForCheckout(rxLines) {
  if (!rxLines?.length) return null;
  const dialog = document.getElementById("prescription-confirm-dialog");
  const list = document.getElementById("prescription-confirm-list");
  const intro = document.getElementById("prescription-confirm-intro");
  const check = document.getElementById("prescription-confirm-check");
  const okBtn = document.getElementById("prescription-confirm-ok");
  const cancelBtn = document.getElementById("prescription-confirm-cancel");
  const form = document.getElementById("prescription-confirm-form");
  const doctorInput = document.getElementById("prescription-doctor-name");
  const licenseInput = document.getElementById("prescription-license-no");
  const patientInput = document.getElementById("prescription-patient-name");
  const notesInput = document.getElementById("prescription-notes");
  if (!dialog || !list || !form) {
    const copy = getBusinessProfileCopy();
    const names = rxLines
      .slice(0, 4)
      .map((line) => line.name)
      .join(", ");
    const ok = await showAppConfirm(
      `${copy.labels?.prescriptionConfirm || "Confirma que el cliente presenta receta medica."}\n\n${names}`,
      { title: "Receta medica", confirmLabel: "Si, tiene receta" }
    );
    if (!ok) return false;
    return {
      doctor_name: "",
      license_no: "",
      patient_name: "",
      notes: null,
      product_ids: rxLines.map((line) => line.id),
    };
  }

  const copy = getBusinessProfileCopy();
  if (intro) {
    intro.textContent =
      copy.labels?.prescriptionConfirm ||
      "Confirma que el cliente presenta receta medica para los medicamentos controlados.";
  }
  list.innerHTML = rxLines
    .map((line) => `<li><strong>${escapeHtml(line.name)}</strong> · ${formatQuantity(line.quantity)}</li>`)
    .join("");
  if (check) check.checked = false;
  if (okBtn) okBtn.disabled = true;
  if (doctorInput) doctorInput.value = "";
  if (licenseInput) licenseInput.value = "";
  if (patientInput) patientInput.value = "";
  if (notesInput) notesInput.value = "";

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      dialog.close();
      resolve(value);
    };
    const onCheck = () => {
      if (okBtn) okBtn.disabled = !check?.checked;
    };
    check?.addEventListener("change", onCheck);
    cancelBtn.onclick = () => finish(false);
    form.onsubmit = (event) => {
      event.preventDefault();
      if (!check?.checked) return;
      finish({
        doctor_name: doctorInput?.value.trim() || "",
        license_no: licenseInput?.value.trim() || "",
        patient_name: patientInput?.value.trim() || "",
        notes: notesInput?.value.trim() || null,
        product_ids: rxLines.map((line) => line.id),
      });
    };
    dialog.oncancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    dialog.addEventListener(
      "close",
      () => {
        check?.removeEventListener("change", onCheck);
      },
      { once: true }
    );
    if (!dialog.open) dialog.showModal();
  });
}

function setNitStatus(message, level = "info") {
  const status = document.getElementById("customer-nit-status");
  const nitInput = document.getElementById("customer-nit");
  if (status) {
    status.textContent = message || "";
    status.className = `nit-status is-${level}`;
  }
  if (nitInput) {
    nitInput.classList.toggle("is-invalid", level === "error");
    nitInput.classList.toggle("is-valid", level === "ok");
  }
}

function scheduleNitFeedback() {
  if (state.nitLookupTimerId) {
    clearTimeout(state.nitLookupTimerId);
  }
  state.nitLookupTimerId = setTimeout(() => {
    refreshNitFeedback().catch(() => {});
  }, 350);
}

async function refreshNitFeedback({ lookup = true } = {}) {
  const nitInput = document.getElementById("customer-nit");
  const nameInput = document.getElementById("customer-name");
  if (!nitInput) return false;
  const normalizedNit = normalizeNit(nitInput.value);
  nitInput.value = normalizedNit;

  if (!normalizedNit || normalizedNit === "CF") {
    const current = (nameInput?.value || "").trim().toUpperCase();
    if (nameInput && (!nameInput.value.trim() || current === "CLIENTE")) {
      nameInput.value = "CONSUMIDOR FINAL";
    }
    setNitStatus("CF · Consumidor final", "ok");
    return true;
  }
  if (!isValidNit(normalizedNit)) {
    setNitStatus("NIT invalido · corrige o usa CF", "error");
    return false;
  }

  setNitStatus("NIT valido · verificando cliente…", "info");
  if (!lookup) {
    setNitStatus(
      state.nitLookupConfigured
        ? "NIT valido · puedes buscar el nombre"
        : "NIT valido · escribe el nombre del cliente",
      "ok"
    );
    return true;
  }

  try {
    const lookupResult = await api(`/api/customers/lookup/${encodeURIComponent(normalizedNit)}`);
    if (lookupResult?.nit) nitInput.value = lookupResult.nit;
    if (lookupResult?.found && lookupResult?.name) {
      const currentName = (nameInput?.value || "").trim().toUpperCase();
      const canAutofill =
        !nameInput?.value.trim() || currentName === "CONSUMIDOR FINAL" || currentName === "CLIENTE";
      if (canAutofill && nameInput) nameInput.value = lookupResult.name;
      const sourceHint =
        lookupResult.source === "remote"
          ? "consulta externa"
          : lookupResult.source === "local"
            ? "cliente guardado"
            : "encontrado";
      setNitStatus(`Cliente: ${lookupResult.name} · ${sourceHint}`, "ok");
      if (lookupResult.lookup_available != null) {
        state.nitLookupConfigured = Boolean(lookupResult.lookup_available);
      }
    } else {
      if (nameInput) {
        const currentName = nameInput.value.trim().toUpperCase();
        if (!nameInput.value.trim() || currentName === "CONSUMIDOR FINAL") {
          nameInput.value = "CLIENTE";
        }
      }
      if (lookupResult?.lookup_available != null) {
        state.nitLookupConfigured = Boolean(lookupResult.lookup_available);
      }
      setNitStatus(
        state.nitLookupConfigured
          ? "NIT valido · no encontrado, escribe el nombre"
          : "NIT valido · escribe el nombre del cliente",
        "warn"
      );
    }
    return true;
  } catch (error) {
    const detail = String(error?.message || "");
    if (detail.toLowerCase().includes("nit invalido")) {
      setNitStatus("NIT invalido · corrige o usa CF", "error");
      return false;
    }
    setNitStatus("NIT valido · no se pudo consultar (escribe el nombre)", "warn");
    return true;
  }
}

function openWhatsAppTicketDialog(sale) {
  if (!sale) return;
  const dialog = document.getElementById("whatsapp-ticket-dialog");
  const phoneInput = document.getElementById("whatsapp-ticket-phone");
  const messageInput = document.getElementById("whatsapp-ticket-message");
  if (!dialog || !phoneInput || !messageInput) {
    const msg = buildWhatsAppSaleMessage(sale, state.config?.company_name || "");
    openWhatsAppShare("", msg);
    return;
  }

  const customer = (state.customers || []).find(
    (item) =>
      Number(item.id) === Number(sale.customer_id) ||
      normalizeNit(item.nit || "") === normalizeNit(sale.customer_nit || "")
  );
  phoneInput.value = customer?.phone || "";
  messageInput.value = buildWhatsAppSaleMessage(
    sale,
    state.config?.company_name || document.getElementById("company-name")?.textContent || ""
  );
  dialog.showModal();
  setTimeout(() => phoneInput.focus(), 0);
}

function focusCashReceivedInput(input) {
  if (!input) return;
  input.focus();
  // Deja el valor seleccionado para escribir encima sin borrar manualmente.
  try {
    input.select();
  } catch {
    /* ignore */
  }
}

function openCashCheckoutDialog() {
  openCheckoutDialog();
}

function openMixedCheckoutDialog() {
  const payment = document.getElementById("payment-method");
  if (payment) payment.value = "mixto";
  openCheckoutDialog();
}

function openSimpleCheckoutDialog() {
  openCheckoutDialog();
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
    document.getElementById("cash-checkout-dialog")?.close();
  }
  return success;
}

function productTracksInventory(productOrLine) {
  if (!productOrLine) return true;
  const value = productOrLine.tracks_inventory;
  if (value === false || value === 0 || value === "0") return false;
  if (value === true || value === 1 || value === "1") return true;
  // Cualquier otro valor numerico: solo cuenta como inventario si es > 0
  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) return asNumber !== 0;
  return true;
}

function getEffectiveBranchId() {
  if (state.selectedBranchId) return Number(state.selectedBranchId);
  const main = (state.branches || []).find((b) => String(b.code || "").toUpperCase() === "MAIN");
  return main ? Number(main.id) : null;
}

function getPosAvailableStock(product) {
  if (!product) return 0;
  if (!productTracksInventory(product)) return 999999;
  if (!isMultiBranchEnabled()) {
    return Number(product.stock || 0);
  }
  const map = state.branchStockByProductId || {};
  const pid = Number(product.id);
  if (state.branchStockMapReady) {
    return Number(map[pid] || 0);
  }
  if (Object.prototype.hasOwnProperty.call(map, pid)) {
    return Number(map[pid] || 0);
  }
  // Mientras carga el mapa, no usar stock global (evita sobreventa visual multi-sucursal).
  return 0;
}

async function loadBranchStockMap(branchId = null) {
  const bid = branchId || getEffectiveBranchId();
  if (!bid) {
    state.branchStockByProductId = {};
    state.branchStockMapReady = false;
    return {};
  }
  try {
    const rows = await api(`/api/branches/${bid}/stock`);
    const map = {};
    (rows || []).forEach((row) => {
      map[Number(row.product_id)] = Number(row.stock || 0);
    });
    // Productos sin fila en BranchStock = 0 en esa sucursal.
    (state.products || []).forEach((product) => {
      const id = Number(product.id);
      if (!Object.prototype.hasOwnProperty.call(map, id) && productTracksInventory(product)) {
        map[id] = 0;
      }
    });
    state.branchStockByProductId = map;
    state.branchStockMapReady = true;
    return map;
  } catch (_error) {
    state.branchStockByProductId = {};
    state.branchStockMapReady = false;
    return {};
  }
}

async function refreshPosStockViews() {
  await loadBranchStockMap();
  renderProducts();
  renderCart();
}

async function applyTicketCustomerCf() {
  resetSaleCustomerDefaults();
  setNitStatus("CF · Consumidor final", "ok");
  state.ticketCustomerTypeAsked = true;
  updatePosCustomerStatusMessage();
  return true;
}

async function applyTicketCustomerNit() {
  while (true) {
    const raw = await showAppPrompt("Escribe el NIT del cliente para la factura.", {
      title: "NIT del cliente",
      label: "NIT",
      defaultValue: "",
      placeholder: "Ej. 1234567K",
    });
    if (raw === null) return false;
    const normalized = normalizeNit(raw);
    if (!normalized || normalized === "CF") {
      await showAppAlert("Ingresa un NIT valido. Si prefieres consumidor final, elige CF.");
      continue;
    }
    if (!isValidNit(normalized)) {
      await showAppAlert("NIT invalido. Revisa el numero e intenta de nuevo.");
      continue;
    }

    const nitInput = document.getElementById("customer-nit");
    if (nitInput) nitInput.value = normalized;
    await refreshNitFeedback({ lookup: true });

    const nameInput = document.getElementById("customer-name");
    const currentName = (nameInput?.value || "").trim().toUpperCase();
    if (!currentName || currentName === "CLIENTE" || currentName === "CONSUMIDOR FINAL") {
      const nameRaw = await showAppPrompt("Nombre del cliente como debe salir en la factura.", {
        title: "Nombre del cliente",
        label: "Nombre",
        defaultValue: currentName === "CLIENTE" ? "" : nameInput?.value || "",
        placeholder: "Nombre completo",
      });
      if (nameRaw === null) return false;
      if (nameInput) nameInput.value = (nameRaw || "").trim() || "CLIENTE";
    }

    state.ticketCustomerTypeAsked = true;
    return true;
  }
}

async function ensureTicketCustomerTypePrompt() {
  if (state.ticketCustomerTypeAsked) return true;

  const currentNit = normalizeNit(document.getElementById("customer-nit")?.value || "CF");
  if (currentNit && currentNit !== "CF") {
    state.ticketCustomerTypeAsked = true;
    return true;
  }
  if (state.cart.length > 0) {
    state.ticketCustomerTypeAsked = true;
    return true;
  }

  const choice = await showAppChoice(
    "Al empezar el ticket, elige como facturar al cliente.",
    {
      title: "Cliente del ticket",
      primaryLabel: "CF (Consumidor final)",
      secondaryLabel: "Con NIT",
      primaryValue: "cf",
      secondaryValue: "nit",
      allowDismiss: true,
    }
  );
  if (choice === null) return false;
  if (choice === "cf") return applyTicketCustomerCf();
  return applyTicketCustomerNit();
}

async function addToCart(productId) {
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  if (!(await ensureTicketCustomerTypePrompt())) return;

  const tracksInventory = productTracksInventory(product);
  const availableStock = getPosAvailableStock(product);
  if (tracksInventory && availableStock <= 0) {
    alert(
      `Producto sin existencia: ${product.name}.\n\n` +
        `Si este producto no debe controlar stock (servicio, paquete, etc.), editalo en Inventario y desmarca "Maneja inventario".`
    );
    return;
  }

  let qtyToAdd = 1;
  if (productSellsByWeight(product)) {
    const caps = getProfileCapabilities();
    const raw = await showAppPrompt(`${caps.weight_prompt || "Cantidad"} para ${product.name}`, {
      title: "Cantidad",
      label: caps.qty_unit_label || "Cantidad",
      defaultValue: "1",
      inputMode: "decimal",
      placeholder: "Ej. 1.25",
    });
    if (raw === null) return;
    qtyToAdd = Number(String(raw).replace(",", "."));
    if (!Number.isFinite(qtyToAdd) || qtyToAdd <= 0) {
      await showAppAlert("Cantidad invalida.");
      return;
    }
  }

  const existing = state.cart.find((item) => item.id === productId);
  if (existing) {
    const nextQty = Number(existing.quantity || 0) + qtyToAdd;
    if (tracksInventory && nextQty > availableStock) {
      alert(
        `No puedes vender mas de ${formatQuantity(availableStock)} ${
          productSellsByWeight(product) ? getProfileCapabilities().qty_unit_label || "ud" : "unidades"
        } de ${product.name}.`
      );
      return;
    }
    existing.quantity = nextQty;
    existing.sale_by_weight = productSellsByWeight(product) ? 1 : 0;
  } else {
    if (tracksInventory && qtyToAdd > availableStock) {
      alert(
        `Stock insuficiente. Disponible: ${formatQuantity(availableStock)}, solicitado: ${formatQuantity(qtyToAdd)}.`
      );
      return;
    }
    state.cart.push({
      id: product.id,
      name: product.name,
      base_price: product.price,
      tax_rate: product.tax_rate,
      tracks_inventory: tracksInventory ? 1 : 0,
      sale_by_weight: productSellsByWeight(product) ? 1 : 0,
      requires_prescription: Number(product.requires_prescription || 0) === 1 ? 1 : 0,
      wholesale_enabled: product.wholesale_enabled === 1,
      wholesale_min_qty: Number(product.wholesale_min_qty || 0),
      wholesale_discount_pct: Number(product.wholesale_discount_pct || 0),
      quantity: qtyToAdd,
    });
  }
  state.selectedCartProductId = product.id;
  renderCart();
  scrollSelectedCartLineIntoView();
  focusProductSearch();
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

  const activeSuggestionId = getActiveSuggestionProductId();
  if (activeSuggestionId) {
    await selectProductSearchSuggestion(activeSuggestionId);
    return;
  }

  let matches = findProductsByExactCode(raw);
  if (!matches.length) {
    matches = getPosSearchSuggestionMatches(raw, { limit: 20 }).map((row) => row.product);
  }

  if (!matches.length) {
    renderProductSearchSuggestions();
    alert(`No se encontro producto con codigo: ${raw}`);
    searchInput.select();
    return;
  }
  if (matches.length > 1) {
    renderProductSearchSuggestions();
    setActiveSuggestionIndex(0);
    return;
  }

  await selectProductSearchSuggestion(matches[0].id);
}

function isMultiBranchEnabled() {
  return Boolean(state.multiBranchEnabled);
}

function syncProductInventoryFields() {
  const form = document.getElementById("product-form");
  if (!form?.tracks_inventory) return;
  const enabled = form.tracks_inventory.checked;
  const editing = Boolean(state.editingProductId);
  const lockStock = editing && isMultiBranchEnabled();
  // Con multi-sucursal, el stock en edicion es solo lectura (suma).
  // En tienda unica se puede editar directo desde el producto.
  form.stock.disabled = !enabled || lockStock;
  form.min_stock.disabled = !enabled;
  document.getElementById("product-stock-label")?.classList.toggle("disabled", !enabled || lockStock);
  document.getElementById("product-min-stock-label")?.classList.toggle("disabled", !enabled);
  const stockHint = document.getElementById("product-stock-edit-hint");
  if (stockHint) {
    stockHint.hidden = !lockStock || !enabled;
  }
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
  syncProductProfileOptionFields();
  syncProductBarcodeGenerateButton();

  state.editingProductId = productId;
  const profileCopy = getBusinessProfileCopy();
  const caps = getProfileCapabilities();
  if (!productId) {
    title.textContent = profileCopy.labels.newProductDialog || "Nuevo producto";
    form.reset();
    form.barcode.value = "";
    form.description.value = "";
    form.tax_rate.value = "12";
    form.tracks_inventory.checked = caps.default_tracks_inventory !== false;
    if (form.track_expiry) form.track_expiry.checked = Boolean(caps.default_track_expiry) && profileHas("lots");
    if (form.requires_prescription) form.requires_prescription.checked = false;
    if (form.sale_by_weight) form.sale_by_weight.checked = false;
    form.wholesale_enabled.checked = false;
    form.wholesale_min_qty.value = "0";
    form.wholesale_discount_pct.value = "0";
    form.min_stock.value = "0";
    if (form.price_vip) form.price_vip.value = "";
    if (form.goods_or_services) form.goods_or_services.value = "B";
    if (form.dining_modifiers) form.dining_modifiers.value = "";
    form.school_category.value = "";
    form.school_grade.value = "";
    form.school_brand.value = "";
    form.school_variant.value = "";
    supplierSelect.value = "";
    departmentSelect.value = "";
    syncProductProfileOptionFields();
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
  if (form.price_vip) form.price_vip.value = product.price_vip ?? "";
  form.cost.value = product.cost;
  if (form.goods_or_services) form.goods_or_services.value = product.goods_or_services || "B";
  if (form.dining_modifiers) form.dining_modifiers.value = product.dining_modifiers || "";
  form.stock.value = product.stock;
  form.min_stock.value = product.min_stock || 0;
  form.tracks_inventory.checked = product.tracks_inventory !== 0;
  if (form.track_expiry) form.track_expiry.checked = Number(product.track_expiry || 0) === 1;
  if (form.requires_prescription) {
    form.requires_prescription.checked = Number(product.requires_prescription || 0) === 1;
  }
  if (form.sale_by_weight) form.sale_by_weight.checked = Number(product.sale_by_weight || 0) === 1;
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
  syncProductProfileOptionFields();
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
  const branchSelect = form.branch_id || document.getElementById("stock-entry-branch");
  if (branchSelect) {
    const multi = isMultiBranchEnabled();
    const branchLabel = branchSelect.closest("label");
    if (branchLabel) branchLabel.hidden = !multi;
    branchSelect.hidden = !multi;
    const branches = (state.branches || []).filter((b) => Number(b.active) === 1);
    const effective = getEffectiveBranchId();
    branchSelect.innerHTML = branches
      .map(
        (b) =>
          `<option value="${b.id}" ${Number(b.id) === Number(effective) ? "selected" : ""}>${escapeHtml(
            b.code
          )} · ${escapeHtml(b.name)}</option>`
      )
      .join("");
    if (!branches.length) {
      branchSelect.innerHTML = '<option value="">Principal</option>';
    }
  }
  const product = (state.products || []).find((p) => Number(p.id) === Number(productId));
  const lotFields = document.getElementById("stock-entry-lot-fields");
  if (lotFields) {
    const requiresLot = profileHas("lots") && Number(product?.track_expiry || 0) === 1;
    const showLots = profileHas("lots");
    lotFields.hidden = !showLots;
    lotFields.style.borderColor = requiresLot ? "var(--danger, #c0392b)" : "";
    if (form.lot_code) form.lot_code.required = requiresLot;
  }
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
  const canGenerate = Boolean(state.editingProductId) && hasPermission("products.edit");
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
    state.lowStockReport = await api("/api/products/low-stock/report");
  } catch (error) {
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
  const canApplyCount = hasPermission("stock.count");
  const applyButton = document.getElementById("stock-count-apply-btn");
  const printOrderButton = document.getElementById("stock-count-print-order-btn");
  const printDiffButton = document.getElementById("stock-count-print-diff-btn");
  const recountButton = document.getElementById("stock-count-recount-btn");
  if (applyButton) {
    applyButton.disabled = !canApplyCount || !hasOpenSession || !(current?.items || []).length;
  }
  if (printOrderButton) {
    printOrderButton.disabled = !current;
  }
  if (printDiffButton) {
    printDiffButton.disabled = !current;
  }
  if (recountButton) {
    recountButton.disabled = !canApplyCount || !hasOpenSession;
  }

  const recentRows = (state.stockCountSessions || [])
    .map(
      (session) => `
      <tr>
        <td>#${session.id}</td>
        <td>${escapeHtml(session.order_code || "-")}</td>
        <td>${escapeHtml(session.department_name || "-")}</td>
        <td>${formatAppDateTime(session.created_at)}</td>
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
              <label ${isMultiBranchEnabled() ? "" : "hidden"}>
                Sucursal
                <select id="stock-count-order-branch" name="branch_id">
                  ${(state.branches || [])
                    .filter((b) => Number(b.active) === 1)
                    .map((b) => {
                      const selected =
                        Number(b.id) === Number(getEffectiveBranchId() || 0) ? "selected" : "";
                      return `<option value="${b.id}" ${selected}>${escapeHtml(b.code)} · ${escapeHtml(b.name)}</option>`;
                    })
                    .join("") || '<option value="">Principal</option>'}
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
        <strong>${formatAppDateTime(current.created_at)}</strong>
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
            isAdminUser()
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
                      <td>${formatAppDateTime(log.scanned_at)}</td>
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
  const branchId = Number(form.branch_id?.value || getEffectiveBranchId() || 0) || null;
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
        branch_id: branchId,
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
          <div><strong>Fecha:</strong> ${formatAppDateTime(order.created_at)}</div>
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
          <div><strong>Fecha sesion:</strong> ${formatAppDateTime(order.created_at)}</div>
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

function syncProductsSearchStripActive(term = getProductsTableSearchTerm()) {
  document.querySelector(".products-search-strip")?.classList.toggle("is-active", Boolean(term));
}

function getProductsTableSearchTerm() {
  const input = document.getElementById("products-table-search");
  const fromInput = String(input?.value || "").trim().toLowerCase();
  if (input) state.productsTableSearch = fromInput;
  return String(state.productsTableSearch || "").trim().toLowerCase();
}

function productMatchesTableSearch(product, term = getProductsTableSearchTerm()) {
  if (!term) return true;
  if (!product) return false;
  const haystack = [
    product.sku,
    product.barcode,
    product.name,
    product.description,
    product.department_name,
    getDepartmentNameById(product.department_id),
    product.supplier_name,
    product.school_category,
    product.school_grade,
    product.school_brand,
    product.school_variant,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

function renderProductsTable() {
  const container = document.getElementById("products-table");
  const newBtn = document.getElementById("new-product-btn");
  const bulkBarcodeBtn = document.getElementById("generate-missing-barcodes-btn");
  const importEleventaBtn = document.getElementById("import-eleventa-btn");
  if (newBtn) {
    newBtn.style.display = hasPermission("products.edit") ? "inline-block" : "none";
  }
  if (bulkBarcodeBtn) {
    bulkBarcodeBtn.style.display = hasPermission("products.edit") ? "inline-block" : "none";
  }
  if (importEleventaBtn) {
    importEleventaBtn.style.display = hasPermission("products.edit") ? "inline-block" : "none";
  }
  const inactiveBtn = document.getElementById("show-inactive-products-btn");
  if (inactiveBtn) {
    inactiveBtn.style.display =
      hasPermission("products.edit") || hasPermission("products.view") ? "inline-block" : "none";
  }
  const searchInput = document.getElementById("products-table-search");
  if (searchInput && document.activeElement !== searchInput) {
    searchInput.value = state.productsTableSearch || "";
  }
  const searchTerm = getProductsTableSearchTerm();
  syncProductsSearchStripActive(searchTerm);
  const canEdit = hasPermission("products.edit");
  const canStockEntry = hasPermission("stock.entry");
  const showExtraColumns = hasProductExtraFields();
  const extraColumnLabel = getProductExtraFieldsCopy().detailColumn || "Detalle";
  const productById = new Map(state.products.map((product) => [Number(product.id), product]));

  if (state.showInactiveProducts) {
    const inactiveRows = (state.inactiveProducts || []).filter((product) =>
      productMatchesTableSearch(product, searchTerm)
    );
    if (!(state.inactiveProducts || []).length) {
      container.innerHTML = '<div class="empty">No hay productos inactivos.</div>';
      return;
    }
    if (!inactiveRows.length) {
      container.innerHTML = '<div class="empty">Ningun producto inactivo coincide con la busqueda.</div>';
      return;
    }
    container.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>SKU</th>
            <th>Cod. barras</th>
            <th>Producto</th>
            <th>Departamento</th>
            <th>Proveedor</th>
            <th>Precio</th>
            <th>Stock</th>
            <th>Acciones</th>
          </tr>
        </thead>
        <tbody>
          ${inactiveRows
            .map(
              (product) => `
            <tr class="inactive-product-row">
              <td>${escapeHtml(product.sku || "")}</td>
              <td>${product.barcode ? escapeHtml(normalizeBarcodeValue(product.barcode)) : "-"}</td>
              <td>${escapeHtml(product.name || "")}</td>
              <td>${escapeHtml(product.department_name || getDepartmentNameById(product.department_id) || "-")}</td>
              <td>${escapeHtml(product.supplier_name || "Sin proveedor")}</td>
              <td>${money(product.price)}</td>
              <td>${productTracksInventory(product) ? product.stock : "-"}</td>
              <td>
                <button class="btn primary reactivate-product-btn" data-product-id="${product.id}" data-product-name="${escapeHtml(product.name)}">Reactivar</button>
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;
    container.querySelectorAll(".reactivate-product-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const productId = Number(button.dataset.productId);
        const productName = button.dataset.productName || "este producto";
        if (!confirm(`Reactivar "${productName}" para que vuelva al catalogo y a la venta?`)) return;
        try {
          const restored = await api(`/api/products/${productId}/reactivate`, { method: "POST" });
          state.inactiveProducts = (state.inactiveProducts || []).filter((item) => item.id !== productId);
          if (restored && !state.products.some((item) => item.id === restored.id)) {
            state.products.push(restored);
            state.products.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
          }
          renderProductsTable();
          renderProducts();
          alert("Producto reactivado.");
        } catch (error) {
          alert(error.message);
        }
      });
    });
    return;
  }

  if (state.showLowStockOnly) {
    const lowStockRows = (state.lowStockReport || []).filter((row) =>
      productMatchesTableSearch(
        {
          sku: row.sku,
          barcode: row.barcode,
          name: row.name,
          description: row.description,
          department_name: row.department_name,
          supplier_name: row.supplier_name,
        },
        searchTerm
      )
    );
    if (!state.lowStockReport.length) {
      container.innerHTML = '<div class="empty">No hay productos con inventario bajo.</div>';
      return;
    }
    if (!lowStockRows.length) {
      container.innerHTML = '<div class="empty">Ningun producto con inventario bajo coincide con la busqueda.</div>';
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
          ${lowStockRows
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
              <td>${row.low_since_at ? formatAppDateTime(row.low_since_at) : "-"}</td>
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
    const rows = state.products.filter((product) => productMatchesTableSearch(product, searchTerm));
    if (!rows.length) {
      container.innerHTML = '<div class="empty">Ningun producto coincide con la busqueda.</div>';
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
              <td>${escapeHtml(product.sku || "")}</td>
              <td>${product.barcode ? escapeHtml(normalizeBarcodeValue(product.barcode)) : "-"}</td>
              <td>${escapeHtml(product.name || "")}${
                profileHas("pharmacy") && Number(product.requires_prescription || 0) === 1
                  ? ' <span class="status-pill warning">Rx</span>'
                  : ""
              }${
                profileHas("lots") && Number(product.track_expiry || 0) === 1
                  ? ' <span class="status-pill ok">FEFO</span>'
                  : ""
              }</td>
              <td><span class="product-desc-cell" title="${escapeHtml(product.description || "")}">${escapeHtml(product.description || "-")}</span></td>
              <td>${escapeHtml(product.department_name || getDepartmentNameById(product.department_id) || "-")}</td>
              <td>${escapeHtml(product.supplier_name || "Sin proveedor")}</td>
              ${
                showExtraColumns
                  ? `<td>${escapeHtml(formatProductExtraDetail(product).replace(/ · /g, " / ") || "-")}</td>`
                  : ""
              }
              <td>${money(product.price)}</td>
              <td>${
                product.wholesale_enabled && product.wholesale_min_qty > 0 && product.wholesale_discount_pct > 0
                  ? `${product.wholesale_min_qty}+ uds / -${product.wholesale_discount_pct}%`
                  : "-"
              }</td>
              <td>
                ${
                  canEdit
                    ? `<button type="button" class="btn ghost toggle-inventory-btn ${
                        productTracksInventory(product) ? "" : "inventory-off"
                      }" data-product-id="${product.id}" title="Clic para activar/desactivar control de stock">
                        ${productTracksInventory(product) ? "Si" : "No"}
                      </button>`
                    : productTracksInventory(product)
                      ? "Si"
                      : "No"
                }
              </td>
              <td>${productTracksInventory(product) ? product.stock : "-"}</td>
              <td>${productTracksInventory(product) ? product.min_stock || 0 : "-"}</td>
              <td>${(product.tax_rate * 100).toFixed(0)}%</td>
              ${
                canEdit || canStockEntry
                  ? `<td>
                      <div class="product-row-actions">
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
                        canStockEntry && productTracksInventory(product)
                          ? `<button class="btn ghost stock-entry-btn" data-product-id="${product.id}" data-product-name="${escapeHtml(product.name || "")}">Ingreso</button>`
                          : ""
                      }
                      ${canEdit ? `<button class="btn ghost danger delete-product-btn" data-product-id="${product.id}" data-product-name="${escapeHtml(product.name || "")}">Eliminar</button>` : ""}
                      </div>
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
    container.querySelectorAll(".delete-product-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const productId = Number(button.dataset.productId);
        const productName = button.dataset.productName || "este producto";
        if (
          !confirm(
            `Eliminar "${productName}"?\n\nSi nunca se ha vendido se borra definitivamente.\nSi tiene historial de ventas o inventario, solo se desactiva (deja de aparecer en el catalogo, pero los reportes antiguos se conservan).`
          )
        ) {
          return;
        }
        try {
          const result = await api(`/api/products/${productId}`, { method: "DELETE" });
          state.products = state.products.filter((item) => item.id !== productId);
          state.cart = state.cart.filter((line) => line.id !== productId);
          renderProductsTable();
          renderProducts();
          renderCart();
          alert(result?.detail || "Producto eliminado.");
        } catch (error) {
          alert(error.message);
        }
      });
    });
    container.querySelectorAll(".toggle-inventory-btn").forEach((button) => {
      button.addEventListener("click", async () => {
        const productId = Number(button.dataset.productId);
        const product = state.products.find((item) => item.id === productId);
        if (!product) return;
        const currentlyTracks = productTracksInventory(product);
        const nextValue = currentlyTracks ? 0 : 1;
        const label = currentlyTracks
          ? "Desactivar control de inventario para este producto?\nPodras venderlo aunque el stock sea 0."
          : "Activar control de inventario para este producto?";
        if (!confirm(label)) return;
        try {
          const updated = await api(`/api/products/${productId}`, {
            method: "PUT",
            body: JSON.stringify({ tracks_inventory: nextValue }),
          });
          const idx = state.products.findIndex((item) => item.id === productId);
          if (idx >= 0) {
            state.products[idx] = { ...state.products[idx], ...updated };
          }
          renderProductsTable();
          renderProducts();
        } catch (error) {
          alert(error.message);
        }
      });
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
  const canManage = hasPermission("suppliers.manage");
  const newSupplierBtn = document.getElementById("new-supplier-btn");
  if (newSupplierBtn) {
    newSupplierBtn.style.display = canManage ? "inline-block" : "none";
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
          ${canManage ? "<th></th>" : ""}
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
            ${canManage ? `<td><button class="btn ghost edit-supplier-btn" data-supplier-id="${supplier.id}">Editar</button></td>` : ""}
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;

  if (canManage) {
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
  const canManage = hasPermission("departments.manage");
  const newDepartmentBtn = document.getElementById("new-department-btn");
  if (newDepartmentBtn) {
    newDepartmentBtn.style.display = canManage ? "inline-block" : "none";
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
          ${canManage ? "<th></th>" : ""}
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
                  canManage
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

  if (canManage) {
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

function createEmptyOrderLine() {
  const firstProduct = (state.products || [])[0];
  return {
    product_id: firstProduct ? firstProduct.id : null,
    quantity: 1,
  };
}

function renderOrderLines() {
  const container = document.getElementById("order-lines");
  if (!container) return;
  const productOptions = (state.products || [])
    .map((product) => `<option value="${product.id}">${escapeHtml(product.name)} · ${money(product.price)}</option>`)
    .join("");
  if (!state.orderLines.length) {
    state.orderLines = [createEmptyOrderLine()];
  }
  container.innerHTML = state.orderLines
    .map(
      (line, index) => `
      <div class="purchase-line order-line" data-line-index="${index}">
        <label>
          Producto
          <select class="order-line-product">
            ${productOptions}
          </select>
        </label>
        <label>
          Cantidad
          <input class="order-line-qty" type="number" min="0.01" step="0.01" value="${line.quantity}">
        </label>
        <button type="button" class="btn ghost remove-order-line-btn">Quitar</button>
      </div>
    `
    )
    .join("");
  container.querySelectorAll(".order-line").forEach((lineElement) => {
    const index = Number(lineElement.dataset.lineIndex);
    const productSelect = lineElement.querySelector(".order-line-product");
    const qtyInput = lineElement.querySelector(".order-line-qty");
    const removeButton = lineElement.querySelector(".remove-order-line-btn");
    if (state.orderLines[index].product_id) {
      productSelect.value = String(state.orderLines[index].product_id);
    }
    productSelect.addEventListener("change", () => {
      state.orderLines[index].product_id = Number(productSelect.value);
    });
    qtyInput.addEventListener("input", () => {
      state.orderLines[index].quantity = Number(qtyInput.value || 0);
    });
    removeButton.addEventListener("click", () => {
      state.orderLines.splice(index, 1);
      renderOrderLines();
    });
  });
}

function formatOrderItemsSummary(order) {
  const items = order.items || [];
  if (!items.length) return "-";
  if (items.length === 1) {
    const item = items[0];
    return `${escapeHtml(item.product_name || `#${item.product_id}`)} x ${formatQuantity(item.quantity)}`;
  }
  const preview = items
    .slice(0, 2)
    .map((item) => escapeHtml(item.product_name || `#${item.product_id}`))
    .join(", ");
  return `${items.length} items · ${preview}${items.length > 2 ? "…" : ""}`;
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
                ? `${latestWhatsapp.status} (${formatAppDateTime(latestWhatsapp.sent_at)})`
                : "-";
              const gmailText = latestGmail
                ? `${latestGmail.status} (${formatAppDateTime(latestGmail.sent_at)})`
                : "-";
              return `
          <tr>
            <td>${order.id}</td>
            <td>${formatAppDateTime(order.created_at)}</td>
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

  const canStockEntry = hasPermission("stock.entry");
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
  renderPharmacyExpiryPanel();
  renderPharmacyRxPanel();
}

async function refreshPharmacyExpiryLots() {
  if (!profileHas("lots")) {
    state.pharmacyExpiringLots = null;
    return null;
  }
  if (!(isAdminUser() || hasPermission("inventory.view") || hasPermission("stock.entry") || hasPermission("products.view"))) {
    state.pharmacyExpiringLots = null;
    return null;
  }
  try {
    const days = Number(getProfileCapabilities().expiry_alert_days || 30);
    const branchId = getEffectiveBranchId();
    const qs = new URLSearchParams({ days: String(days) });
    if (branchId) qs.set("branch_id", String(branchId));
    state.pharmacyExpiringLots = await api(`/api/pharmacy/expiring-lots?${qs.toString()}`);
  } catch (_error) {
    state.pharmacyExpiringLots = null;
  }
  return state.pharmacyExpiringLots;
}

async function refreshPharmacyPrescriptions() {
  if (!profileHas("pharmacy")) {
    state.pharmacyPrescriptions = null;
    return null;
  }
  try {
    state.pharmacyPrescriptions = await api("/api/pharmacy/prescriptions?limit=50");
  } catch (_error) {
    state.pharmacyPrescriptions = null;
  }
  return state.pharmacyPrescriptions;
}

function renderPharmacyRxPanel() {
  const panel = document.getElementById("pharmacy-rx-panel");
  if (!panel) return;
  if (!profileHas("pharmacy")) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  const rows = Array.isArray(state.pharmacyPrescriptions) ? state.pharmacyPrescriptions : null;
  if (!rows) {
    panel.innerHTML = `
      <div class="panel-header" style="margin:0 0 0.6rem 0;">
        <h3 style="margin:0;">Bitacora de recetas</h3>
        <button type="button" class="btn ghost" id="refresh-pharmacy-rx-btn">Actualizar</button>
      </div>
      <div class="empty">Presiona Actualizar para cargar la bitacora.</div>
    `;
  } else {
    panel.innerHTML = `
      <div class="panel-header" style="margin:0 0 0.6rem 0;">
        <h3 style="margin:0;">Bitacora de recetas · ${rows.length}</h3>
        <button type="button" class="btn ghost" id="refresh-pharmacy-rx-btn">Actualizar</button>
      </div>
      ${
        rows.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>Fecha</th><th>Venta</th><th>Producto</th><th>Medico</th><th>Colegiado</th><th>Paciente</th><th>Por</th></tr></thead>
              <tbody>
                ${rows
                  .map(
                    (row) => `
                  <tr>
                    <td>${escapeHtml((row.created_at || "").slice(0, 16))}</td>
                    <td>#${row.sale_id || "-"}</td>
                    <td>${escapeHtml(row.product_name || "")}</td>
                    <td>${escapeHtml(row.doctor_name || "")}</td>
                    <td>${escapeHtml(row.license_no || "")}</td>
                    <td>${escapeHtml(row.patient_name || "-")}</td>
                    <td>${escapeHtml(row.confirmed_by || "-")}</td>
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table></div>`
          : '<div class="empty">Sin recetas registradas.</div>'
      }
    `;
  }
  document.getElementById("refresh-pharmacy-rx-btn")?.addEventListener("click", async () => {
    await refreshPharmacyPrescriptions();
    renderPharmacyRxPanel();
  });
}

function renderPharmacyExpiryPanel() {
  const panel = document.getElementById("pharmacy-expiry-panel");
  if (!panel) return;
  const show = profileHas("lots") && (profileHas("pharmacy") || Boolean(getProfileCapabilities().default_track_expiry));
  if (!show) {
    panel.hidden = true;
    panel.innerHTML = "";
    return;
  }
  panel.hidden = false;
  const copy = getBusinessProfileCopy();
  const title = copy.labels?.expiryPanelTitle || "Vencimientos (FEFO)";
  const data = state.pharmacyExpiringLots;
  if (!data) {
    panel.innerHTML = `
      <div class="panel-header" style="margin:0 0 0.6rem 0;">
        <h3 style="margin:0;">${escapeHtml(title)}</h3>
        <button type="button" class="btn ghost" id="refresh-pharmacy-expiry-btn">Actualizar</button>
      </div>
      <div class="empty">Presiona Actualizar para cargar vencimientos.</div>
    `;
  } else {
    const items = data.items || [];
    const statusLabel = { expired: "VENCIDO", critical: "7d", warning: "30d", info: "60d" };
    const canStockEntry = hasPermission("stock.entry");
    panel.innerHTML = `
      <div class="panel-header" style="margin:0 0 0.6rem 0;">
        <h3 style="margin:0;">${escapeHtml(title)} · ${data.count || 0}</h3>
        <button type="button" class="btn ghost" id="refresh-pharmacy-expiry-btn">Actualizar</button>
      </div>
      ${
        items.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>Estado</th><th>Producto</th><th>Lote</th><th>Cant.</th><th>Vence</th><th>Dias</th>${
                canStockEntry || canAccessTab("products") ? "<th></th>" : ""
              }</tr></thead>
              <tbody>
                ${items
                  .map(
                    (row) => `
                  <tr>
                    <td><span class="status-pill ${row.status === "expired" || row.status === "critical" ? "critical" : row.status === "warning" ? "warning" : "ok"}">${
                      statusLabel[row.status] || row.status
                    }</span></td>
                    <td>${escapeHtml(row.product_name || "")}</td>
                    <td>${escapeHtml(row.lot_code || "")}</td>
                    <td>${formatQuantity(row.quantity)}</td>
                    <td>${escapeHtml((row.expires_at || "").slice(0, 10))}</td>
                    <td>${row.days_left}</td>
                    ${
                      canStockEntry || canAccessTab("products")
                        ? `<td class="panel-actions">
                            ${
                              canStockEntry
                                ? `<button type="button" class="btn ghost pharmacy-expiry-entry-btn" data-product-id="${row.product_id}">Ingreso</button>`
                                : ""
                            }
                            ${
                              canAccessTab("products")
                                ? `<button type="button" class="btn ghost pharmacy-expiry-edit-btn" data-product-id="${row.product_id}">Editar</button>`
                                : ""
                            }
                          </td>`
                        : ""
                    }
                  </tr>`
                  )
                  .join("")}
              </tbody>
            </table></div>`
          : '<div class="empty">Sin lotes vencidos o por vencer en la ventana configurada.</div>'
      }
    `;
  }
  document.getElementById("refresh-pharmacy-expiry-btn")?.addEventListener("click", async () => {
    await refreshPharmacyExpiryLots();
    renderPharmacyExpiryPanel();
  });
  panel.querySelectorAll(".pharmacy-expiry-entry-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = Number(button.dataset.productId);
      const product = (state.products || []).find((item) => Number(item.id) === productId);
      openStockEntryDialog(productId, product?.name || "Producto");
    });
  });
  panel.querySelectorAll(".pharmacy-expiry-edit-btn").forEach((button) => {
    button.addEventListener("click", () => {
      navigateToTab("products");
      openProductEditor(Number(button.dataset.productId));
    });
  });
}

function getGuatemalaDateKey(value = new Date()) {
  const parsed = value instanceof Date ? value : parseAppDate(value);
  if (!parsed) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Guatemala",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(parsed);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function initializeSalesFilters() {
  const fromInput = document.getElementById("sales-filter-from");
  const toInput = document.getElementById("sales-filter-to");
  const cashierSelect = document.getElementById("sales-filter-cashier");
  if (!fromInput || fromInput.dataset.initialized === "1") return;

  if (cashierSelect) cashierSelect.disabled = !(isAdminUser() || hasPermission("sales.view_all"));
  if (!(isAdminUser() || hasPermission("sales.view_all"))) {
    const today = getGuatemalaDateKey();
    fromInput.value = today;
    toInput.value = today;
    if (cashierSelect) {
      cashierSelect.value = String(state.user?.id || "");
      cashierSelect.disabled = true;
    }
  }
  fromInput.dataset.initialized = "1";
}

function populateSalesCashierFilter() {
  const select = document.getElementById("sales-filter-cashier");
  if (!select) return;
  const current = select.value;
  const cashiers = new Map();
  (state.sales || []).forEach((sale) => {
    const id = Number(sale.created_by_user_id || 0);
    if (!id) return;
    cashiers.set(id, sale.created_by_full_name || sale.created_by_username || `Usuario #${id}`);
  });
  if (state.user?.id) {
    cashiers.set(
      Number(state.user.id),
      state.user.full_name || state.user.username || `Usuario #${state.user.id}`
    );
  }
  select.innerHTML = isAdminUser() || hasPermission("sales.view_all")
    ? `<option value="">Todos</option>${[...cashiers.entries()]
        .sort((a, b) => a[1].localeCompare(b[1], "es"))
        .map(([id, name]) => `<option value="${id}">${escapeHtml(name)}</option>`)
        .join("")}`
    : `<option value="${Number(state.user?.id || 0)}">${escapeHtml(
        state.user?.full_name || state.user?.username || "Mi usuario"
      )}</option>`;
  select.value = isAdminUser() ? current : String(state.user?.id || "");
}

function getFilteredSales() {
  const from = document.getElementById("sales-filter-from")?.value || "";
  const to = document.getElementById("sales-filter-to")?.value || "";
  const customerQuery = (document.getElementById("sales-filter-customer")?.value || "").trim().toLowerCase();
  const cashierId = Number(document.getElementById("sales-filter-cashier")?.value || 0);
  const minRaw = document.getElementById("sales-filter-min-total")?.value || "";
  const maxRaw = document.getElementById("sales-filter-max-total")?.value || "";
  const minTotal = minRaw === "" ? null : Number(minRaw);
  const maxTotal = maxRaw === "" ? null : Number(maxRaw);

  return (state.sales || []).filter((sale) => {
    const dateKey = getGuatemalaDateKey(sale.created_at);
    if (from && dateKey < from) return false;
    if (to && dateKey > to) return false;
    if (cashierId && Number(sale.created_by_user_id || 0) !== cashierId) return false;
    if (customerQuery) {
      const customerText = `${sale.customer_nit || "CF"} ${sale.customer_name || "CONSUMIDOR FINAL"}`.toLowerCase();
      if (!customerText.includes(customerQuery)) return false;
    }
    const total = Number(sale.total || 0);
    if (minTotal != null && Number.isFinite(minTotal) && total < minTotal) return false;
    if (maxTotal != null && Number.isFinite(maxTotal) && total > maxTotal) return false;
    return true;
  });
}

function renderSalesTable() {
  const container = document.getElementById("sales-table");
  const title = document.getElementById("sales-panel-title");
  const summary = document.getElementById("sales-filter-summary");
  if (!container) return;

  initializeSalesFilters();
  populateSalesCashierFilter();
  const rows = getFilteredSales();
  if (title) title.textContent = isAdminUser() || hasPermission("sales.view_all") ? "Historial de ventas" : "Mis ventas del día";
  const filteredTotal = rows.reduce((sum, sale) => sum + Number(sale.net_total ?? sale.total ?? 0), 0);
  if (summary) {
    summary.textContent = `${rows.length} venta${rows.length === 1 ? "" : "s"} · Neto ${money(filteredTotal)}`;
  }
  if (!rows.length) {
    container.innerHTML = '<div class="empty">No hay ventas que coincidan con los filtros.</div>';
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Fecha</th>
          <th>Cajero</th>
          <th>NIT / Cliente</th>
          <th>Total</th>
          <th>Descuento</th>
          <th>Devuelto</th>
          <th>Neto</th>
          <th>FEL</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (sale) => `
          <tr>
            <td>${sale.id}</td>
            <td>${formatAppDateTime(sale.created_at)}</td>
            <td>${escapeHtml(sale.created_by_full_name || sale.created_by_username || "-")}</td>
            <td>${escapeHtml(sale.customer_nit || "CF")} · ${escapeHtml(
              sale.customer_name || "CONSUMIDOR FINAL"
            )}</td>
            <td>${money(sale.total)}</td>
            <td>${Number(sale.cart_discount_amount || 0) > 0 ? money(sale.cart_discount_amount) : "-"}</td>
            <td>${money(sale.returned_total || 0)}</td>
            <td>${money(sale.net_total ?? sale.total)}</td>
            <td>${sale.fel ? `${escapeHtml(sale.fel.serie)}-${escapeHtml(sale.fel.numero)}` : "-"}</td>
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
    container.innerHTML = '<div class="empty">No hay apartados/ordenes creadas.</div>';
    return;
  }
  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Cliente</th>
          <th>Productos</th>
          <th>Total</th>
          <th>Anticipo</th>
          <th>Saldo</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${state.orders
          .map(
            (order) => `
          <tr>
            <td>${order.id}</td>
            <td>${escapeHtml(order.customer_name)}</td>
            <td><small>${formatOrderItemsSummary(order)}</small></td>
            <td>${money(order.total_estimate)}</td>
            <td>${money(order.deposit_paid || 0)}</td>
            <td>${money(FP.orderBalanceDue ? FP.orderBalanceDue(order) : order.balance_due || 0)}</td>
            <td>${escapeHtml(FP.orderStatusLabel ? FP.orderStatusLabel(order.status) : order.status)}</td>
            <td class="panel-actions">
              ${
                !["delivered", "cancelled"].includes(order.status)
                  ? `<button class="btn ghost order-deposit-btn" data-order-id="${order.id}">Abonar</button>
                     <button class="btn ghost order-add-item-btn" data-order-id="${order.id}">+ Item</button>
                     <button class="btn ghost order-ready-btn" data-order-id="${order.id}">Listo</button>
                     <button class="btn primary order-deliver-btn" data-order-id="${order.id}">Entregar</button>
                     <button class="btn ghost order-cancel-btn" data-order-id="${order.id}">Cancelar</button>`
                  : ""
              }
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
  container.querySelectorAll(".order-add-item-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const orderId = Number(button.dataset.orderId);
      const productIdRaw = await showAppPrompt("ID o nombre de producto", {
        title: "Agregar producto al apartado",
        label: "Producto",
      });
      if (productIdRaw === null) return;
      let product = (state.products || []).find((item) => String(item.id) === String(productIdRaw).trim());
      if (!product) {
        const needle = String(productIdRaw).trim().toLowerCase();
        product = (state.products || []).find((item) => item.name.toLowerCase().includes(needle));
      }
      if (!product) {
        await showAppAlert("Producto no encontrado.");
        return;
      }
      const qtyRaw = await showAppPrompt("Cantidad", {
        title: "Agregar producto",
        label: "Cantidad",
        defaultValue: "1",
        inputMode: "decimal",
      });
      if (qtyRaw === null) return;
      const quantity = Number(String(qtyRaw).replace(",", "."));
      if (!Number.isFinite(quantity) || quantity <= 0) {
        await showAppAlert("Cantidad invalida.");
        return;
      }
      try {
        await api(`/api/orders/${orderId}/items`, {
          method: "POST",
          body: JSON.stringify({ product_id: product.id, quantity }),
        });
        state.orders = await api("/api/orders");
        renderOrdersTable();
      } catch (error) {
        await showAppAlert(error.message);
      }
    });
  });
  container.querySelectorAll(".order-deposit-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const amountRaw = await showAppPrompt("Monto del abono", {
        title: "Abonar apartado",
        label: "Monto Q",
        defaultValue: "0",
        inputMode: "decimal",
      });
      if (amountRaw === null) return;
      const amount = Number(String(amountRaw).replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) {
        await showAppAlert("Monto invalido.");
        return;
      }
      try {
        await api(`/api/orders/${button.dataset.orderId}/deposit`, {
          method: "POST",
          body: JSON.stringify({ amount }),
        });
        state.orders = await api("/api/orders");
        renderOrdersTable();
      } catch (error) {
        await showAppAlert(error.message);
      }
    });
  });
  container.querySelectorAll(".order-ready-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await api(`/api/orders/${button.dataset.orderId}/mark-ready`, { method: "POST" });
        state.orders = await api("/api/orders");
        renderOrdersTable();
      } catch (error) {
        await showAppAlert(error.message);
      }
    });
  });
  container.querySelectorAll(".order-deliver-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const ok = await showAppConfirm("Entregar apartado? Si hay saldo, se cobrara en caja.", {
        title: "Entregar",
        confirmLabel: "Entregar",
      });
      if (!ok) return;
      try {
        await api(`/api/orders/${button.dataset.orderId}/deliver`, { method: "POST" });
        state.orders = await api("/api/orders");
        renderOrdersTable();
      } catch (error) {
        await showAppAlert(error.message);
      }
    });
  });
  container.querySelectorAll(".order-cancel-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const ok = await showAppConfirm("Cancelar este apartado?", {
        title: "Cancelar",
        confirmLabel: "Cancelar apartado",
        danger: true,
      });
      if (!ok) return;
      try {
        await api(`/api/orders/${button.dataset.orderId}/cancel`, { method: "POST" });
        state.orders = await api("/api/orders");
        renderOrdersTable();
      } catch (error) {
        await showAppAlert(error.message);
      }
    });
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
    <div class="row"><span>Apertura</span><strong>${formatAppDateTime(cash.opened_at)}</strong></div>
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
              · ${formatAppDateTime(saleReturn.created_at)}
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
    <p><strong>Subtotal:</strong> ${money(Number(sale.total || 0) + Number(sale.cart_discount_amount || 0))}</p>
    ${
      Number(sale.cart_discount_amount || 0) > 0
        ? `<p><strong>Descuento:</strong> -${money(sale.cart_discount_amount)}</p>`
        : ""
    }
    <p><strong>IVA (incluido):</strong> ${money(sale.tax_total || 0)}</p>
    ${
      Number(sale.tip_amount || 0) > 0
        ? `<p><strong>Propina:</strong> ${money(sale.tip_amount)}</p>`
        : ""
    }
    ${
      sale.document_type && sale.document_type !== "FACT"
        ? `<p><strong>Tipo documento:</strong> ${escapeHtml(sale.document_type)}</p>`
        : ""
    }
    <p><strong>Total:</strong> ${money(sale.total)}</p>
    ${
      Number(sale.cash_received || 0) > 0
        ? `<p><strong>Recibido:</strong> ${money(sale.cash_received)}</p>
           <p><strong>Cambio:</strong> ${money(sale.change_amount || 0)}</p>`
        : ""
    }
    <p><strong>Total devuelto:</strong> ${money(sale.returned_total || 0)}</p>
    <p><strong>Total neto:</strong> ${money(sale.net_total ?? sale.total)}</p>
    <p><strong>Pago:</strong> ${formatSalePayments(sale)}</p>
    ${
      Number(sale.wholesale_savings || 0) > 0
        ? `<p><strong>Ahorro mayoreo:</strong> ${money(sale.wholesale_savings || 0)}</p>`
        : ""
    }
    <p><strong>FEL UUID:</strong> ${sale.fel?.uuid || "-"}</p>
    <p><strong>Serie/Numero:</strong> ${sale.fel ? `${sale.fel.serie}-${sale.fel.numero}` : "-"}</p>
    ${cashGuardHint}
    <ul>${linesHtml}</ul>
    ${returnsHtml}
  `;
  const returnBtn = document.getElementById("register-return-btn");
  if (returnBtn) {
    const canReturn = hasPermission("sales.returns");
    returnBtn.style.display = canReturn ? "" : "none";
    returnBtn.disabled = !canReturn || !getReturnableSaleLines(sale).length || !canUseCurrentCash();
  }
  const felCertified = sale.fel && String(sale.fel.status || "").toLowerCase() === "certified";
  const pdfBtn = document.getElementById("download-fel-pdf-btn");
  const voidBtn = document.getElementById("void-fel-btn");
  if (pdfBtn) pdfBtn.hidden = !felCertified;
  if (voidBtn) {
    voidBtn.hidden = !(felCertified && isAdminUser());
  }
  document.getElementById("sale-dialog").showModal();
}

function registerSaleReturn() {
  const sale = state.sales.find((item) => item.id === state.selectedSaleId);
  if (!sale) return;
  if (!hasPermission("sales.returns")) {
    alert("Tu usuario no tiene permiso para hacer devoluciones.");
    return;
  }
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
  state.returnClientRequestId = null;
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

  if (!state.returnClientRequestId) {
    state.returnClientRequestId = createClientRequestId();
  }
  try {
    const result = await api(`/api/sales/${sale.id}/returns`, {
      method: "POST",
      body: JSON.stringify({
        reason: reason.trim() || null,
        client_request_id: state.returnClientRequestId,
        items: lines.map((line) => ({
          sale_item_id: line.sale_item_id,
          quantity: line.quantity,
        })),
      }),
    });
    state.returnClientRequestId = null;
    document.getElementById("sale-return-dialog")?.close();
    await refreshPosCore();
    openSaleDetail(sale.id);
    const cashRefund = Number(result.cash_refund_amount || 0);
    const cashLine =
      cashRefund > 0.001
        ? `\nDevolver en efectivo: ${money(cashRefund)}`
        : "\nSin reembolso en efectivo (tarjeta/transferencia/credito pendiente).";
    alert(
      `Devolucion registrada correctamente.\nNC ${result.fel_serie || "-"}-${result.fel_numero || "-"}\nTotal: ${money(
        result.total || 0
      )}${cashLine}`
    );
  } catch (error) {
    alert(error.message);
  }
}

async function editSystemUserPermissions(userId) {
  const user = (state.users || []).find((item) => Number(item.id) === Number(userId));
  if (!user || user.role !== "user") return;
  if (!state.permissionCatalog?.length) {
    try {
      const catalog = await api("/api/auth/permission-catalog");
      state.permissionCatalog = catalog.permissions || [];
      state.permissionDefaults = catalog.defaults || ["sales.returns"];
    } catch (error) {
      alert(error.message);
      return;
    }
  }
  const html = permissionCatalogHtml(user.permissions || [], { namePrefix: "perm" });
  let host = document.getElementById("user-permissions-dialog");
  if (!host) {
    host = document.createElement("dialog");
    host.id = "user-permissions-dialog";
    host.innerHTML = `
      <form method="dialog" id="user-permissions-form" class="dialog-form">
        <h3>Permisos del cajero</h3>
        <div id="user-permissions-body"></div>
        <div class="panel-actions">
          <button class="btn ghost" value="cancel" type="submit">Cancelar</button>
          <button class="btn primary" id="user-permissions-save-btn" type="button">Guardar permisos</button>
        </div>
      </form>
    `;
    document.body.appendChild(host);
  }
  const body = host.querySelector("#user-permissions-body");
  body.innerHTML = `
    <p><strong>${escapeHtml(user.full_name)}</strong> (@${escapeHtml(user.username)})</p>
    <p class="hint">Marca lo que este cajero puede hacer.</p>
    ${html}
  `;
  const saveBtn = host.querySelector("#user-permissions-save-btn");
  saveBtn.onclick = async () => {
    try {
      const permissions = readPermissionChecks(body);
      await api(`/api/auth/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({ permissions }),
      });
      host.close();
      await loadData();
      alert("Permisos actualizados.");
    } catch (error) {
      alert(error.message);
    }
  };
  if (!host.open) host.showModal();
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
  const createdAt = formatAppDateTime(createdAtIso || new Date().toISOString());
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
      const lastSaleAt = metrics.lastSaleAt ? formatAppDateTime(metrics.lastSaleAt) : "Sin ventas";
      const cashierName =
        session.opened_by_full_name || session.opened_by_username || `ID ${session.opened_by_user_id}`;
      return `
      <div class="cash-monitor-entry">
        <div class="row"><span>Cajero</span><strong>${escapeHtml(cashierName)}</strong></div>
        <div class="row"><span>Caja</span><strong>#${session.id}</strong></div>
        <div class="row"><span>Apertura</span><strong>${formatAppDateTime(session.opened_at)}</strong></div>
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
    if (document.hidden) return;
    await refreshAdminCashMonitorData();
    renderAdminCashMonitorCard();
  }, ADMIN_MONITOR_REFRESH_MS);
}

function renderVersionLabel() {
  const label = document.getElementById("app-version-label");
  if (!label) return;
  const info = state.appVersion;
  if (!info?.version) {
    label.textContent = "—";
    label.removeAttribute("title");
    return;
  }
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
          <td>${entry.installed_at ? formatAppDateTime(entry.installed_at) : "-"}</td>
        </tr>
      `
    )
    .join("");
  return `
    <h3 class="config-subhead">Version del sistema</h3>
    <p class="hint">Se muestra la version actual y hasta 3 anteriores.</p>
    <div class="version-meta config-meta-list">
      <div class="row"><span>Creador</span><strong>${escapeHtml(info.creator || "D3xFr3N")}</strong></div>
      <div class="row"><span>Version actual</span><strong>v${escapeHtml(info.version)}</strong></div>
      ${
        info.previous_version
          ? `<div class="row"><span>Version anterior</span><strong>v${escapeHtml(info.previous_version)}</strong></div>`
          : ""
      }
      <div class="row"><span>Compilada</span><strong>${escapeHtml(info.build_date || "No registrada")}</strong></div>
      <div class="row"><span>Instalada</span><strong>${
        info.installed_at ? formatAppDateTime(info.installed_at) : "-"
      }</strong></div>
      <div class="row"><span>Ultima actualizacion</span><strong>${
        info.updated_at ? formatAppDateTime(info.updated_at) : "-"
      }</strong></div>
    </div>
    ${
      historyRows
        ? `<div class="table-wrap version-history-wrap">
            <table class="version-history-table">
              <thead><tr><th>Version</th><th>Fecha</th></tr></thead>
              <tbody>${historyRows}</tbody>
            </table>
          </div>`
        : ""
    }
    <hr class="config-divider">
  `;
}

function deviceStatusBadge(status) {
  const value = String(status || "").toLowerCase();
  if (value === "approved") return '<span class="badge success">Autorizado</span>';
  if (value === "blocked") return '<span class="badge muted">Bloqueado</span>';
  return '<span class="badge">Pendiente</span>';
}

function renderAuthorizedDevicesSection() {
  const devices = Array.isArray(state.authorizedDevices) ? state.authorizedDevices : [];
  const rows = devices
    .map((device) => {
      const name = escapeHtml(device.label || device.hostname || "Equipo");
      const host = escapeHtml(device.hostname || "-");
      const ip = escapeHtml(device.last_ip || "-");
      const fp = escapeHtml(device.fingerprint || "-");
      const seen = device.last_seen_at
        ? escapeHtml(String(device.last_seen_at).replace("T", " ").slice(0, 19))
        : "-";
      const isServer = Number(device.is_server) === 1;
      const actions = isServer
        ? '<span class="hint">PC servidor</span>'
        : `
          <div class="panel-actions config-actions-tight">
            ${
              device.status !== "approved"
                ? `<button class="btn primary device-approve-btn" type="button" data-id="${device.id}">Autorizar</button>`
                : ""
            }
            ${
              device.status !== "blocked"
                ? `<button class="btn ghost device-block-btn" type="button" data-id="${device.id}">Bloquear</button>`
                : ""
            }
            <button class="btn danger device-remove-btn" type="button" data-id="${device.id}">Eliminar</button>
          </div>
        `;
      return `
        <tr>
          <td>
            <strong>${name}</strong>
            ${isServer ? ' <span class="badge">Servidor</span>' : ""}
            <div class="hint">${host} · ${ip}</div>
            <div class="hint">ID: ${fp}</div>
            <label class="hint" style="display:block;margin-top:0.35rem;" ${isMultiBranchEnabled() ? "" : "hidden"}>
              Sucursal por defecto
              <select class="device-branch-select" data-id="${device.id}">
                <option value="">Principal / sin fijar</option>
                ${(state.branches || [])
                  .filter((b) => Number(b.active) === 1)
                  .map(
                    (b) =>
                      `<option value="${b.id}" ${Number(device.branch_id) === Number(b.id) ? "selected" : ""}>${escapeHtml(
                        b.code
                      )} · ${escapeHtml(b.name)}</option>`
                  )
                  .join("")}
              </select>
            </label>
          </td>
          <td>${deviceStatusBadge(device.status)}</td>
          <td>${seen}</td>
          <td>${actions}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <h3 class="config-subhead">Equipos en red</h3>
    <p class="hint">
      Las cajas nuevas quedan pendientes hasta que las autorices.
      Si eliminas o bloqueas un equipo, deja de poder usar el POS de inmediato.
    </p>
    <div class="panel-actions">
      <button id="refresh-authorized-devices-btn" class="btn ghost" type="button">Actualizar lista</button>
    </div>
    ${
      devices.length
        ? `<div class="table-wrap"><table class="data-table">
            <thead><tr><th>Equipo</th><th>Estado</th><th>Ultimo acceso</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`
        : '<div class="empty">Aun no hay equipos registrados. Cuando una caja intente entrar, aparecera aqui.</div>'
    }
  `;
}

async function loadAuthorizedDevices() {
  if (state.user?.role !== "admin") {
    state.authorizedDevices = [];
    return;
  }
  state.authorizedDevices = await api("/api/devices").catch(() => []);
}

function bindAuthorizedDevicesEvents() {
  document.getElementById("refresh-authorized-devices-btn")?.addEventListener("click", async () => {
    try {
      await loadAuthorizedDevices();
      renderConfig();
    } catch (error) {
      alert(error.message);
    }
  });

  document.querySelectorAll(".device-approve-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-id"));
      try {
        await api(`/api/devices/${id}/approve`, { method: "POST" });
        await loadAuthorizedDevices();
        renderConfig();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll(".device-block-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-id"));
      if (!confirm("Bloquear este equipo? Dejara de poder iniciar sesion.")) return;
      try {
        await api(`/api/devices/${id}/block`, { method: "POST" });
        await loadAuthorizedDevices();
        renderConfig();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll(".device-remove-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const id = Number(button.getAttribute("data-id"));
      if (!confirm("Eliminar este equipo de la lista? Si vuelve a conectar, quedara pendiente de nuevo.")) return;
      try {
        await api(`/api/devices/${id}`, { method: "DELETE" });
        await loadAuthorizedDevices();
        renderConfig();
      } catch (error) {
        alert(error.message);
      }
    });
  });

  document.querySelectorAll(".device-branch-select").forEach((select) => {
    select.addEventListener("change", async () => {
      const id = Number(select.getAttribute("data-id"));
      const branchId = select.value ? Number(select.value) : null;
      try {
        await api(`/api/devices/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ branch_id: branchId }),
        });
        await loadAuthorizedDevices();
        renderConfig();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function renderAutoUpdateSection() {
  const info = state.updateInfo;
  if (!info) {
    return `
      <h3 class="config-subhead">Actualizaciones automaticas</h3>
      <p class="hint">Consultando servidor de actualizaciones...</p>
      <button id="check-system-update-btn" class="btn ghost" type="button">Buscar actualizaciones</button>
      <hr class="config-divider">
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
    <h3 class="config-subhead">Actualizaciones automaticas</h3>
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
    <hr class="config-divider">
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
    <h3 class="config-subhead">App movil — Puente scanner</h3>
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

function renderReceiptPrinterSection() {
  const cfg = state.receiptPrinterConfig || DEFAULT_RECEIPT_PRINTER_CONFIG;
  const configWarning = state.receiptPrinterConfig
    ? ""
    : `<p class="hint hint-warning">No se pudo cargar la configuracion guardada. Puedes personalizar el ticket y guardar de nuevo.</p>`;
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
    <h3 class="config-subhead">Impresion de recibos</h3>
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
      <h4 class="config-subhead">Personalizar diseño del ticket</h4>
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
        <textarea id="receipt-preview-text" class="receipt-preview" rows="14" readonly>${escapeHtml(cfg.preview_text || "")}</textarea>
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
    <hr class="config-divider">
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
    <h3 class="config-subhead">Impresora de etiquetas</h3>
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
    <hr class="config-divider">
  `;
}

function renderConfig() {
  const card = document.getElementById("config-card");
  if (!card) return;
  if (!isAdminUser()) {
    card.innerHTML = '<div class="empty">La configuracion solo esta disponible para administradores.</div>';
    return;
  }
  if (!state.config) {
    card.innerHTML =
      '<div class="empty">No se pudo cargar la configuracion de la tienda. Cierra sesion, vuelve a entrar o revisa la conexion al servidor.</div>';
    return;
  }

  try {
  const profile = getBusinessProfileCopy();
  const profileLabel = String(profile.brandTitle || "FEL POS").replace("FEL POS", "").trim() || "Abarrotes";
  const cfg = state.config;
  const felMode = String(cfg.fel_mode || "demo");
  const felModeBadgeClass =
    felMode === "production" ? "badge success" : felMode === "disabled" ? "badge muted" : "badge";
  const felModeLabel = cfg.fel_mode_label || felMode.toUpperCase();
  const showFelCertifierFields = felMode !== "disabled";
  const llaveHint = cfg.certificador_llave_configured
    ? "Llave guardada. Deja vacio para conservarla."
    : "Ingresa la llave o token que te dio tu certificador.";

  card.innerHTML = `
    ${wrapConfigSection(
      "sistema",
      "Sistema",
      `
    ${renderVersionHistorySection()}
    <h3 class="config-subhead">Licencia de tienda</h3>
    <p class="hint">Activa con el archivo <strong>.felpos-lic</strong> que te enviamos. No hace falta copiar la clave larga.</p>
    <form id="license-config-form">
      <label>
        Archivo de activacion (.felpos-lic)
        <input type="file" id="license-file-input" accept=".felpos-lic,application/json">
      </label>
      <input type="hidden" name="store_license_key" id="store-license-key-input" value="">
      <p class="hint" id="license-file-hint">${
        state.licenseConfig?.license_key_configured || state.licenseConfig?.configured
          ? "Licencia ya guardada. Elige otro archivo solo si te reemitieron la activacion."
          : "Selecciona el archivo .felpos-lic (no el .txt de instrucciones)."
      }</p>
      <details class="config-advanced">
        <summary>Avanzado: pegar clave FELPOS-v1</summary>
        <label>
          Clave firmada (opcional)
          <textarea name="store_license_key_paste" id="store-license-key-paste" rows="3" placeholder="Solo si no tienes el archivo .felpos-lic"></textarea>
        </label>
      </details>
      <label>
        <input type="checkbox" name="license_required_for_updates" ${state.licenseConfig?.license_required_for_updates !== false ? "checked" : ""}>
        Exigir licencia valida para actualizar
      </label>
      <button class="btn primary" type="submit">Guardar licencia</button>
    </form>
    <p class="hint">
      Estado: ${escapeHtml(state.licenseConfig?.message || "Sin validar")}
      ${state.licenseConfig?.store_label ? ` · Tienda: ${escapeHtml(state.licenseConfig.store_label)}` : ""}
      ${state.licenseConfig?.fingerprint ? ` · ID equipo: ${escapeHtml(state.licenseConfig.fingerprint)}` : ""}
    </p>
    ${renderAutoUpdateSection()}
      `,
      { open: true }
    )}
    ${wrapConfigSection(
      "equipos",
      "Equipos autorizados",
      renderAuthorizedDevicesSection(),
      { open: true }
    )}
    ${wrapConfigSection("apariencia", "Apariencia", renderUiThemeSection(), { open: true })}
    ${wrapConfigSection(
      "tienda",
      "Tienda y FEL",
      `
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
          <option value="production" ${cfg.fel_mode === "production" ? "selected" : ""}>Con FEL produccion (Infile/Digifact)</option>
        </select>
      </label>
      <p class="hint">${
        cfg.fel_mode === "production"
          ? "Produccion activa: requiere usuario/llave del certificador. Si falla la certificacion, la venta queda en cola FEL pendiente."
          : "Demo simula FEL local. Produccion envia el DTE a Infile o Digifact con tus credenciales."
      }</p>
      <div id="fel-certifier-fields" class="${showFelCertifierFields ? "" : "is-hidden"}">
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
    <p class="hint">
      Si no necesitas factura electronica SAT, elige <strong>Sin factura contable</strong> y el POS funcionara con ticket de venta normal.
    </p>
      `,
      { open: true }
    )}
    ${wrapConfigSection(
      "impresion",
      "Impresion",
      `
    ${renderReceiptPrinterSection()}
    ${renderLabelPrinterSection()}
    <div class="row"><span>Empresa activa</span><strong>${escapeHtml(cfg.nombre_comercial)}</strong></div>
    <div class="row"><span>NIT activo</span><strong>${escapeHtml(cfg.nit)}</strong></div>
    <div class="row"><span>Tipo de tienda</span><strong>${profileLabel}</strong></div>
    <div class="row"><span>Facturacion</span><strong>${escapeHtml(felModeLabel)}</strong></div>
    ${showFelCertifierFields ? `<div class="row"><span>Certificador</span><strong>${escapeHtml(cfg.certificador)}</strong></div>` : ""}
      `,
      { open: true }
    )}
    ${wrapConfigSection(
      "operacion",
      "Operacion",
      `
    ${renderScannerBridgeSection()}
    <h3 class="config-subhead">Panel administracion de fondos abiertos</h3>
    <p class="hint">Cada cajero tiene su propio fondo. Aqui puedes ver todos los fondos abiertos, transferir turnos y hacer arqueos.</p>
    <div id="admin-cash-monitor-card"></div>
    <h3 class="config-subhead">Notificaciones de ordenes</h3>
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
      `,
      { open: true }
    )}
    ${wrapConfigSection(
      "usuarios",
      "Usuarios",
      `
    <p class="hint">Cada cajero debe tener su propio usuario. Puedes marcar que puede hacer y que no.</p>
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
        <select name="role" id="system-user-role">
          <option value="user" selected>Cajero</option>
          <option value="admin">Admin</option>
        </select>
      </label>
      <div id="system-user-permissions" class="perm-box">
        <strong>Permisos del cajero</strong>
        <p class="hint">Solo aplica si el rol es Cajero. El admin tiene acceso total.</p>
        <div id="system-user-permissions-list">${permissionCatalogHtml(state.permissionDefaults || ["sales.returns"])}</div>
      </div>
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
      `,
      { open: true }
    )}
    ${wrapConfigSection(
      "avance",
      "FEL, auditoria y sucursales",
      `
    ${
      showFelCertifierFields
        ? `<h3 class="config-subhead">FEL pendientes (modo offline)</h3>
    <p class="hint">Ventas guardadas localmente cuando el certificador no esta disponible. Reintenta o descarta las que ya no aplican.</p>
    <div class="panel-actions">
      <button id="pending-fel-retry-all-btn" class="btn primary" type="button">Reintentar todas</button>
    </div>
    <div id="pending-fel-table" class="table-wrap"></div>`
        : ""
    }
    <h3 class="config-subhead">Bitacora de auditoria</h3>
    <p class="hint">Solo se muestran los movimientos de hoy.</p>
    <div id="audit-logs-table" class="table-wrap"></div>
    <h3 class="config-subhead">Sucursales</h3>
    <div id="branches-table" class="table-wrap"></div>
      `,
      { open: true }
    )}
    ${wrapConfigSection(
      "respaldo",
      "Respaldo",
      `
    <p class="hint">Crea respaldos de la base de datos y restaura en un clic cuando sea necesario.</p>
    <p class="hint">Solo se muestran los 3 respaldos mas recientes. El sistema tambien crea auto-respaldos y puede recuperar la base al iniciar si detecta dano.</p>
    <div class="panel-actions">
      <button id="system-backup-create-btn" class="btn primary" type="button">Crear respaldo ahora</button>
      <button id="system-backup-refresh-btn" class="btn ghost" type="button">Actualizar lista</button>
    </div>
    <div class="table-wrap">
      <div id="system-backups-table"></div>
    </div>
      `,
      { open: true }
    )}
  `;
  document.getElementById("company-name").textContent =
    `${state.config.nombre_comercial} · NIT ${state.config.nit} · ${profileLabel}`;

  const certificadorDefaultUrls = {
    infile: "https://certificador.feel.com.gt/fel/procesounificado/transaccion/v2/xml",
    digifact: "https://felgtaws.digifact.com.gt/gt.com.apinuc/api/v2/transform/nuc",
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
      felCertifierFields.classList.toggle("is-hidden", !enabled);
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

  const uiThemeForm = document.getElementById("ui-theme-form");
  if (uiThemeForm) {
    const colorInput = uiThemeForm.querySelector('input[name="primary_color"]');
    const pickerInput = uiThemeForm.querySelector('input[name="primary_color_picker"]');
    const previewHex = document.getElementById("ui-theme-preview-hex");
    const previewSwatch = document.querySelector("#ui-theme-preview .ui-theme-swatch");
    let selectedBackground = normalizeBackgroundTheme(
      state.uiThemeConfig?.background_theme || DEFAULT_UI_THEME.background_theme
    );

    const syncThemePreview = (rawColor, { applyLive = true } = {}) => {
      const color = normalizeHexColor(rawColor);
      if (colorInput) colorInput.value = color;
      if (pickerInput) pickerInput.value = color;
      if (previewHex) previewHex.textContent = color;
      if (previewSwatch) previewSwatch.style.background = color;
      uiThemeForm.querySelectorAll(".ui-theme-preset").forEach((btn) => {
        btn.classList.toggle("is-selected", normalizeHexColor(btn.dataset.color) === color);
      });
      if (applyLive) {
        applyUiTheme({ primary_color: color, background_theme: selectedBackground });
      }
      return color;
    };

    const syncBackgroundPreview = (rawBackground, { applyLive = true } = {}) => {
      selectedBackground = normalizeBackgroundTheme(rawBackground);
      uiThemeForm.querySelectorAll(".ui-background-preset").forEach((btn) => {
        btn.classList.toggle("is-selected", btn.dataset.background === selectedBackground);
      });
      if (applyLive) {
        applyUiTheme({
          primary_color: colorInput?.value || DEFAULT_UI_THEME.primary_color,
          background_theme: selectedBackground,
        });
      }
      return selectedBackground;
    };

    uiThemeForm.querySelectorAll(".ui-theme-preset").forEach((button) => {
      button.addEventListener("click", () => syncThemePreview(button.dataset.color));
    });
    uiThemeForm.querySelectorAll(".ui-background-preset").forEach((button) => {
      button.addEventListener("click", () => syncBackgroundPreview(button.dataset.background));
    });
    pickerInput?.addEventListener("input", () => syncThemePreview(pickerInput.value));
    colorInput?.addEventListener("change", () => syncThemePreview(colorInput.value));
    document.getElementById("ui-theme-reset-btn")?.addEventListener("click", () => {
      syncBackgroundPreview(DEFAULT_UI_THEME.background_theme, { applyLive: false });
      syncThemePreview(DEFAULT_UI_THEME.primary_color);
    });

    uiThemeForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const color = syncThemePreview(colorInput?.value || DEFAULT_UI_THEME.primary_color, { applyLive: true });
      try {
        state.uiThemeConfig = await api("/api/config/ui-theme", {
          method: "PUT",
          body: JSON.stringify({
            primary_color: color,
            background_theme: selectedBackground,
          }),
        });
        applyUiTheme(state.uiThemeConfig);
        renderConfig();
        alert("Apariencia del sistema guardada correctamente.");
      } catch (error) {
        alert(error.message);
      }
    });
  }

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
    if (payload.fel_mode === "production" && !payload.certificador_usuario) {
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
      // Tras cambiar perfil, recargar capacidades del servidor.
      try {
        const profileInfo = await api("/api/config/profile");
        state.profileCapabilities = profileInfo?.capabilities || {};
        state.businessProfile = String(profileInfo?.business_profile || state.businessProfile).toLowerCase();
        state.multiBranchEnabled = Boolean(profileInfo?.multi_branch_enabled);
      } catch (_err) {
        state.profileCapabilities = {};
      }
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

  const licenseFileInput = document.getElementById("license-file-input");
  const licenseKeyHidden = document.getElementById("store-license-key-input");
  const licenseKeyPaste = document.getElementById("store-license-key-paste");
  const licenseFileHint = document.getElementById("license-file-hint");

  licenseFileInput?.addEventListener("change", async () => {
    const file = licenseFileInput.files?.[0];
    if (!file) return;
    const name = String(file.name || "").toLowerCase();
    if (!name.endsWith(".felpos-lic")) {
      if (licenseKeyHidden) licenseKeyHidden.value = "";
      if (licenseFileHint) {
        licenseFileHint.textContent =
          "Ese no es el archivo de llave. Usa el .felpos-lic (el .txt solo son instrucciones).";
      }
      alert("El .txt no es la licencia. Elige el archivo .felpos-lic");
      licenseFileInput.value = "";
      return;
    }
    try {
      const text = await file.text();
      if (licenseKeyHidden) licenseKeyHidden.value = text.trim();
      if (licenseFileHint) {
        licenseFileHint.textContent = `Archivo listo: ${file.name}. Pulsa Guardar licencia.`;
      }
    } catch (error) {
      alert(error.message || "No se pudo leer el archivo de licencia.");
    }
  });

  document.getElementById("license-config-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const fromFile = String(licenseKeyHidden?.value || "").trim();
    const fromPaste = String(licenseKeyPaste?.value || "").trim();
    try {
      state.licenseConfig = await api("/api/config/license", {
        method: "PUT",
        body: JSON.stringify({
          store_license_key: fromFile || fromPaste,
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
  bindAuthorizedDevicesEvents();

  document.getElementById("system-user-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const payload = {
      full_name: form.full_name.value.trim(),
      username: form.username.value.trim(),
      password: form.password.value,
      role: form.role.value === "admin" ? "admin" : "user",
      active: 1,
      permissions:
        form.role.value === "admin"
          ? []
          : readPermissionChecks(document.getElementById("system-user-permissions-list")),
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
      const list = document.getElementById("system-user-permissions-list");
      if (list) {
        list.innerHTML = permissionCatalogHtml(state.permissionDefaults || ["sales.returns"]);
      }
      await loadData();
      alert("Usuario creado correctamente.");
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("system-user-role")?.addEventListener("change", (event) => {
    const box = document.getElementById("system-user-permissions");
    if (box) box.style.display = event.target.value === "admin" ? "none" : "";
  });

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
          <td>${
            user.role === "admin"
              ? "Todos"
              : `${(user.permissions || []).length} permiso(s)`
          }</td>
          <td>${user.active ? "Activo" : "Inactivo"}</td>
          <td>
            <div class="table-actions">
              ${
                user.role === "user"
                  ? `<button class="btn ghost user-permissions-btn" data-user-id="${user.id}">Permisos</button>`
                  : ""
              }
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
            <th>Permisos</th>
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
    usersTableContainer.querySelectorAll(".user-permissions-btn").forEach((button) => {
      button.addEventListener("click", () =>
        editSystemUserPermissions(Number(button.dataset.userId))
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
          <td>${formatAppDateTime(backup.created_at)}</td>
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
  } catch (error) {
    console.error("renderConfig failed", error);
    card.innerHTML = `<div class="empty">Error al mostrar configuracion: ${escapeHtml(
      error?.message || String(error)
    )}</div>`;
  }
}

async function autofillCustomerByNit() {
  return refreshNitFeedback({ lookup: true });
}

function validateNitField(showAlert = false) {
  const nitInput = document.getElementById("customer-nit");
  const normalizedNit = normalizeNit(nitInput.value);
  nitInput.value = normalizedNit;
  if (!isValidNit(normalizedNit)) {
    const message = "NIT invalido. Ingresa un NIT valido o deja CF.";
    setNitStatus("NIT invalido · corrige o usa CF", "error");
    if (showAlert) {
      showAppAlert(message, { title: "NIT invalido" });
    }
    return false;
  }
  if (normalizedNit === "CF") {
    setNitStatus("CF · Consumidor final", "ok");
  }
  return true;
}

async function refreshPosCore() {
  const canInventory = isAdminUser() || hasPermission("inventory.view") || hasPermission("stock.entry");
  const [
    products,
    sales,
    currentCash,
    systemAlerts,
    promotions,
    schoolPackages,
    lowStockReport,
    pendingFelSales,
  ] = await Promise.all([
    api("/api/products"),
    api("/api/sales"),
    api("/api/cash/sessions/current"),
    api("/api/reports/alerts").catch(() => []),
    api("/api/promotions").catch(() => []),
    api("/api/school-packages").catch(() => []),
    canInventory ? api("/api/products/low-stock/report").catch(() => []) : Promise.resolve(state.lowStockReport || []),
    api("/api/fel/pending").catch(() => []),
  ]);

  state.products = products;
  state.sales = sales;
  state.currentCash = currentCash;
  state.systemAlerts = systemAlerts;
  state.promotions = promotions;
  state.schoolPackages = schoolPackages;
  state.pendingFelSales = pendingFelSales || [];
  if (canInventory) state.lowStockReport = lowStockReport;

  await loadBranchStockMap();

  renderSystemAlertsBar();
  populateCustomerSelect();
  syncCheckoutCreditOptions();
  renderSchoolPackagesPos();
  renderCashOwnerIndicator();
  populatePosDepartmentFilter();
  renderPosDepartmentChips();
  renderProducts();
  renderCart();
  renderSalesTable();
  renderCashCard();
  renderPendingFelTable();
  if (canAccessTab("products")) {
    renderProductsTable();
  }
  if (canAccessTab("inventory")) {
    renderInventoryDashboard();
    refreshPharmacyExpiryLots().then(() => renderPharmacyExpiryPanel());
    refreshPharmacyPrescriptions().then(() => renderPharmacyRxPanel());
  }
}

async function loadData() {
  const isAdmin = isAdminUser();
  const can = (key) => isAdmin || hasPermission(key);
  const profilePromise = api("/api/config/profile");
  const configPromise = api("/api/config").catch((error) => {
    console.error("No se pudo cargar /api/config", error);
    return null;
  });
  const usersPromise = isAdmin ? api("/api/auth/users") : Promise.resolve([]);
  const permissionCatalogPromise = isAdmin
    ? api("/api/auth/permission-catalog").catch(() => null)
    : Promise.resolve(null);
  const backupsPromise = isAdmin ? api("/api/system/backups") : Promise.resolve([]);
  const suppliersPromise =
    can("suppliers.manage") || can("products.edit") ? api("/api/suppliers") : Promise.resolve([]);
  const departmentsPromise = api("/api/departments");
  const purchaseOrdersPromise = can("purchases.manage") ? api("/api/purchase-orders") : Promise.resolve([]);
  const ordersPromise = can("orders.manage") ? api("/api/orders") : Promise.resolve([]);
  const lowStockReportPromise =
    can("inventory.view") || can("stock.entry") ? api("/api/products/low-stock/report") : Promise.resolve([]);
  const stockCountCurrentPromise = can("stock.count")
    ? api("/api/stock-count/sessions/current")
    : Promise.resolve(null);
  const stockCountSessionsPromise = can("stock.count") ? api("/api/stock-count/sessions") : Promise.resolve([]);
  const versionPromise = api("/api/system/version").catch(() => null);
  const customersPromise = api("/api/customers").catch(() => []);
  const promotionsPromise = api("/api/promotions").catch(() => []);
  const schoolPackagesPromise = api("/api/school-packages").catch(() => []);
  const alertsPromise =
    !isAdmin && (can("inventory.view") || can("reports.view") || can("stock.entry"))
      ? api("/api/reports/alerts").catch(() => [])
      : Promise.resolve(null);
  const reportsPromise = can("reports.view") ? api("/api/reports/dashboard").catch(() => null) : Promise.resolve(null);
  const auditPromise = isAdmin ? api("/api/audit-logs?limit=50").catch(() => []) : Promise.resolve([]);
  const pendingFelPromise = api("/api/fel/pending").catch(() => []);
  const branchesPromise = api("/api/branches").catch(() => []);
  const updateCheckPromise = isAdmin
    ? api("/api/system/update/check").catch(() => null)
    : Promise.resolve(null);
  const receiptPrinterPromise = isAdmin
    ? api("/api/config/receipt-printer").catch(() => null)
    : Promise.resolve(null);
  const uiThemePromise = api("/api/config/ui-theme").catch(() => null);
  const labelPrinterPromise = api("/api/config/label-printer").catch(() => null);
  const notificationConfigPromise = isAdmin
    ? api("/api/config/notifications").catch(() => null)
    : Promise.resolve(null);
  const scannerBridgeConfigPromise = isAdmin
    ? api("/api/config/scanner-bridge").catch(() => null)
    : Promise.resolve(null);
  const licenseConfigPromise = isAdmin ? api("/api/config/license").catch(() => null) : Promise.resolve(null);
  const devicesPromise = isAdmin ? api("/api/devices").catch(() => []) : Promise.resolve([]);
  const [
    products,
    sales,
    profileInfo,
    config,
    users,
    permissionCatalogInfo,
    backups,
    orders,
    currentCash,
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
    uiThemeConfig,
    labelPrinterConfig,
    notificationConfig,
    scannerBridgeConfig,
    licenseConfig,
    authorizedDevices,
  ] = await Promise.all([
    api("/api/products"),
    api("/api/sales"),
    profilePromise,
    configPromise,
    usersPromise,
    permissionCatalogPromise,
    backupsPromise,
    ordersPromise,
    api("/api/cash/sessions/current"),
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
    uiThemePromise,
    labelPrinterPromise,
    notificationConfigPromise,
    scannerBridgeConfigPromise,
    licenseConfigPromise,
    devicesPromise,
  ]);
  if (permissionCatalogInfo) {
    state.permissionCatalog = permissionCatalogInfo.permissions || [];
    state.permissionDefaults = permissionCatalogInfo.defaults || ["sales.returns"];
  }
  state.products = products;
  state.suppliers = suppliers;
  state.departments = departments;
  state.purchaseOrders = purchaseOrders;
  state.sales = sales;
  state.businessProfile = String(profileInfo?.business_profile || state.businessProfile || "abarrotes").toLowerCase();
  state.profileCapabilities = profileInfo?.capabilities || {};
  state.multiBranchEnabled = Boolean(profileInfo?.multi_branch_enabled);
  state.nitLookupConfigured = Boolean(profileInfo?.nit_lookup_configured);
  state.uiThemeConfig = uiThemeConfig || {
    ...DEFAULT_UI_THEME,
    primary_color: profileInfo?.primary_color || DEFAULT_UI_THEME.primary_color,
    primary_dark: profileInfo?.primary_dark || DEFAULT_UI_THEME.primary_dark,
    primary_rgb: profileInfo?.primary_rgb || DEFAULT_UI_THEME.primary_rgb,
  };
  applyUiTheme(state.uiThemeConfig);
  state.config = config;
  state.users = users;
  state.backups = backups;
  state.orders = orders;
  state.currentCash = currentCash;
  state.lowStockReport = lowStockReport;
  state.stockCountCurrent = stockCountCurrent;
  state.stockCountSessions = stockCountSessions;
  state.appVersion = appVersion;
  state.customers = customers;
  state.promotions = promotions;
  state.schoolPackages = schoolPackages;
  state.systemAlerts = isAdmin ? reports?.alerts || [] : systemAlerts || [];
  state.reports = normalizeDashboardPayload(reports);
  state.auditLogs = auditLogs;
  state.pendingFelSales = pendingFelSales;
  state.branches = branches;
  populateBranchSelect();
  await loadBranchStockMap();
  state.updateInfo = updateInfo;
  state.receiptPrinterConfig = receiptPrinterConfig;
  state.labelPrinterConfig = labelPrinterConfig;
  state.notificationConfig = notificationConfig;
  state.scannerBridgeConfig = scannerBridgeConfig;
  state.licenseConfig = licenseConfig;
  state.authorizedDevices = authorizedDevices || [];
  renderVersionLabel();
  renderSystemAlertsBar();
  populateCustomerSelect();
  renderSchoolPackagesPos();
  applyBusinessProfileUi();
  renderCashOwnerIndicator();

  populatePosDepartmentFilter();
  renderPosDepartmentChips();
  renderProducts();
  renderCart();
  renderProductsTable();
  renderDepartmentsTable();
  renderSuppliersTable();
  renderPurchaseOrdersTable();
  renderInventoryDashboard();
  refreshPharmacyExpiryLots().then(() => renderPharmacyExpiryPanel());
  refreshPharmacyPrescriptions().then(() => renderPharmacyRxPanel());
  renderStockCountPanel();
  renderSalesTable();
  initializeReportDates();
  renderReportsDashboard();
  renderPendingFelTable();
  renderCustomersTable();
  renderPromotionsTable();
  renderOrdersTable();
  renderCashCard();
  loadTodayDashboard().catch(() => {});
  if (state.user?.role === "admin") {
    renderConfig();
    await refreshAdminCashMonitorData();
    renderAdminCashMonitorCard();
    ensureAdminCashMonitorAutoRefresh();
  } else if (hasPermission("cash.view_others")) {
    await refreshAdminCashMonitorData();
    clearAdminCashMonitorTimer();
  } else {
    clearAdminCashMonitorTimer();
  }
  maybeAutoRetryPendingFel();
  refreshNitFeedback({ lookup: false }).catch(() => {});
  wireCashCheckoutKeypad();
  applyDeviceBranchDefaults().then(() => populateBranchSelect());
  startServerHealthMonitor();
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

function renderPrintRecoveryBanner(result, saleId) {
  const bar = document.getElementById("print-recovery-bar");
  if (!bar) return;
  const printed = Boolean(result?.printed);
  const hasDrawerError = Boolean(result?.drawer_error) || result?.drawer_opened === false;
  if (printed && !hasDrawerError) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }
  state.lastCheckoutSaleId = saleId;
  state.lastPrintResult = result;
  bar.hidden = false;
  bar.innerHTML = `
    <span>${escapeHtml(result?.message || "Hubo un problema con impresion/cajon.")}</span>
    ${!printed ? `<button type="button" class="btn ghost" id="retry-print-btn">Reintentar ticket</button>` : ""}
    <button type="button" class="btn ghost" id="retry-drawer-btn">Reintentar cajon</button>
    <button type="button" class="btn ghost" id="dismiss-print-recovery-btn">Cerrar</button>
  `;
  document.getElementById("retry-print-btn")?.addEventListener("click", () => {
    printSaleReceipt(saleId, true, true).catch((error) => alert(error.message));
  });
  document.getElementById("retry-drawer-btn")?.addEventListener("click", () => {
    openCashDrawer(true).catch((error) => alert(error.message));
  });
  document.getElementById("dismiss-print-recovery-btn")?.addEventListener("click", () => {
    bar.hidden = true;
    bar.innerHTML = "";
  });
}

async function printSaleReceipt(saleId, notifyOnSuccess = false, force = false) {
  if (!saleId) return null;
  try {
    const endpoint = force
      ? `/api/sales/${saleId}/print-receipt?force=true`
      : `/api/sales/${saleId}/print-receipt`;
    const result = await api(endpoint, { method: "POST" });
    state.lastPrintResult = result;
    state.lastCheckoutSaleId = saleId;
    if (!result?.printed || result?.drawer_error) {
      renderPrintRecoveryBanner(result, saleId);
    } else {
      const bar = document.getElementById("print-recovery-bar");
      if (bar) {
        bar.hidden = true;
        bar.innerHTML = "";
      }
    }
    if (notifyOnSuccess) {
      alert(result?.message || "Ticket impreso.");
    }
    return result;
  } catch (error) {
    const fallback = {
      ok: false,
      printed: false,
      drawer_opened: false,
      message: error.message,
      print_error: error.message,
    };
    renderPrintRecoveryBanner(fallback, saleId);
    alert(`Venta registrada, pero no se pudo imprimir ticket: ${error.message}`);
    return fallback;
  }
}

async function openCashDrawer(notifyOnError = true) {
  try {
    const result = await api("/api/sales/open-drawer", { method: "POST" });
    if (result?.drawer_opened === false && notifyOnError) {
      alert(result?.message || "No se pudo abrir el cajon.");
    }
    return result;
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
  if (!state.cart.length) {
    await showAppAlert("Agrega productos antes de cobrar.");
    return;
  }
  const paymentMethod = document.getElementById("payment-method").value;
  if (paymentMethod === "efectivo" || paymentMethod === "mixto") {
    openCashCheckoutDialog();
    return;
  }
  await processCheckout(paymentMethod, null, printTicket);
}

async function processCheckout(paymentMethod, cashReceived = null, printTicket = true, payments = null) {
  if (!ensureCashOwnership("registrar ventas")) return false;
  if (!validateNitField(true)) {
    return false;
  }
  await autofillCustomerByNit();

  for (const line of state.cart) {
    const product = state.products.find((item) => item.id === line.id);
    const tracksInventory = product
      ? productTracksInventory(product)
      : productTracksInventory(line);
    if (!tracksInventory) {
      continue;
    }
    const availableStock = getPosAvailableStock(product);
    const requestedQty = Number(line.quantity || 0);
    if (!product || requestedQty > availableStock) {
      await showAppAlert(
        `Stock insuficiente para ${line.name}. Disponible en sucursal: ${formatQuantity(availableStock)}, solicitado: ${formatQuantity(
          requestedQty
        )}.`
      );
      await refreshPosCore();
      return false;
    }
  }

  const totals = calcTotals(state.cart);
  if (paymentMethod === "efectivo" && !payments) {
    const received = Number(cashReceived || 0);
    if (received < totals.total) {
      const missing = Math.round((totals.total - received) * 100) / 100;
      await showAppAlert(`Efectivo insuficiente. Faltan ${money(missing)} para completar el cobro.`);
      return false;
    }
  }

  if (!state.checkoutClientRequestId) {
    state.checkoutClientRequestId = createClientRequestId();
  }

  const rxLines = state.cart.filter((line) => {
    const product = state.products.find((item) => item.id === line.id);
    return Number(product?.requires_prescription || line.requires_prescription || 0) === 1;
  });
  let prescriptionData = null;
  if (rxLines.length) {
    prescriptionData = await confirmPrescriptionForCheckout(rxLines);
    if (!prescriptionData) {
      return false;
    }
  }

  const payload = {
    customer_id: Number(document.getElementById("customer-select")?.value || 0) || null,
    customer_nit: document.getElementById("customer-nit").value.trim() || "CF",
    customer_name: document.getElementById("customer-name").value.trim() || "CONSUMIDOR FINAL",
    payment_method: payments ? "mixto" : paymentMethod === "credito" ? "credito" : paymentMethod,
    is_credit: paymentMethod === "credito",
    use_fcam: paymentMethod === "credito" && Boolean(document.getElementById("checkout-use-fcam")?.checked),
    loyalty_points_redeem: Math.round(Number(document.getElementById("checkout-loyalty-redeem")?.value || 0) * 100) / 100,
    cart_discount_amount: calcTotals(state.cart).cartDiscount || 0,
    cash_received:
      paymentMethod === "efectivo" || paymentMethod === "mixto"
        ? Math.round(Number(cashReceived || 0) * 100) / 100
        : 0,
    items: state.cart.map((line) => ({ product_id: line.id, quantity: line.quantity })),
    client_request_id: state.checkoutClientRequestId,
    branch_id: state.selectedBranchId || null,
    prescription_confirmed: Boolean(prescriptionData),
    prescription: prescriptionData || null,
  };
  if (payments) {
    payload.payments = payments;
  }

  if (paymentMethod === "credito") {
    const nit = payload.customer_nit;
    if (!nit || nit === "CF") {
      await showAppAlert("Ventas a credito requieren un cliente con NIT registrado.");
      return false;
    }
  }

  try {
    const sale = await api("/api/sales", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.checkoutClientRequestId = null;
    removeActiveTicketFromOpenList();
    clearActiveTicketWorkspace();
    startBlankTicket();
    document.getElementById("cash-checkout-dialog")?.close();
    document.getElementById("sale-dialog")?.close();
    await refreshPosCore();
    openSaleDetail(sale.id);
    let printResult = null;
    let drawerResult = null;
    if (printTicket) {
      printResult = await printSaleReceipt(sale.id, false);
    } else if (shouldOpenDrawerForPayment(paymentMethod, payments)) {
      drawerResult = await openCashDrawer(false);
    }
    const waiting = state.openTickets.length;
    const waitingHint =
      waiting > 0
        ? ` Quedan ${waiting} ticket${waiting === 1 ? "" : "s"} en espera: pulsa el ticket arriba para continuar.`
        : "";
    const statusSuffix = buildCheckoutStatusSuffix({ printTicket, printResult, drawerResult });
    const paymentSuffix =
      paymentMethod === "mixto" && payments ? `Pago: ${formatSalePayments(sale)}.` : "";
    await showAppAlert(buildSaleSuccessMessage(sale, `${paymentSuffix}${statusSuffix}`) + waitingHint, {
      title: "Venta registrada",
    });
    return true;
  } catch (error) {
    await showAppAlert(error.message);
    return false;
  }
}

async function finalizeCashCheckout(printTicket = true) {
  const totals = calcTotals(state.cart);
  const receivedInput = document.getElementById("cash-checkout-received");
  const raw = String(receivedInput?.value || "").trim();
  if (!raw) {
    await showAppAlert("Ingresa el efectivo recibido o pulsa Exacto.");
    focusCashReceivedInput(receivedInput);
    return false;
  }
  const cashReceived = Number(raw || 0);
  if (!Number.isFinite(cashReceived) || cashReceived < totals.total) {
    const missing = Math.round((totals.total - (Number.isFinite(cashReceived) ? cashReceived : 0)) * 100) / 100;
    await showAppAlert(`Efectivo insuficiente. Faltan ${money(missing)} para completar el cobro.`);
    focusCashReceivedInput(receivedInput);
    return false;
  }

  const success = await processCheckout("efectivo", cashReceived, printTicket);
  if (success) {
    document.getElementById("cash-checkout-dialog").close();
  }
  return success;
}

async function requestPosCharge() {
  if (!state.cart.length) {
    await showAppAlert("Agrega productos antes de cobrar.");
    return false;
  }
  if (!ensureCashOwnership("cobrar")) return false;
  openCheckoutDialog();
  return true;
}

async function requestCashCapture() {
  return requestPosCharge();
}

async function finalizeCheckoutFromDialog(printTicket = true) {
  const method = document.getElementById("payment-method")?.value || "efectivo";
  if (method === "efectivo") return finalizeCashCheckout(printTicket);
  if (method === "mixto") return finalizeMixedCheckout(printTicket);
  const success = await checkout(printTicket);
  if (success) document.getElementById("cash-checkout-dialog")?.close();
  return success;
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = String(target.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
}

function openShortcutsHelpDialog() {
  const dialog = document.getElementById("shortcuts-help-dialog");
  const body = document.getElementById("shortcuts-help-body");
  if (!dialog || !body) return;
  body.innerHTML = `
    <table>
      <thead><tr><th>Atajo</th><th>Cuando</th><th>Accion</th></tr></thead>
      <tbody>
        ${SHORTCUTS.map(
          (item) => `
          <tr>
            <td><kbd>${escapeHtml(item.keys)}</kbd></td>
            <td>${escapeHtml(item.when)}</td>
            <td>${escapeHtml(item.action)}</td>
          </tr>`
        ).join("")}
      </tbody>
    </table>
  `;
  if (!dialog.open) dialog.showModal();
}

function handleShortcutsHelpHotkey(event) {
  if (event.defaultPrevented) return;
  const helpDialog = document.getElementById("shortcuts-help-dialog");
  const anyDialogOpen = Array.from(document.querySelectorAll("dialog")).some((dialog) => dialog.open);
  if (event.key === "F10") {
    event.preventDefault();
    if (anyDialogOpen && !(helpDialog && helpDialog.open)) return;
    if (helpDialog?.open) helpDialog.close();
    if (!document.getElementById("tab-pos")?.classList.contains("active")) {
      document.querySelector('.tab[data-tab="pos"]')?.click();
    }
    focusProductSearch();
    return;
  }
  if (event.key === "?" && !event.ctrlKey && !event.altKey && !event.metaKey) {
    if (isTypingTarget(event.target)) return;
    if (anyDialogOpen && !(helpDialog && helpDialog.open)) return;
    event.preventDefault();
    openShortcutsHelpDialog();
  }
}

function handleCheckoutShortcuts(event) {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (!state.user) return;
  if (document.getElementById("login-dialog")?.open) return;
  const cashDialogOpen = document.getElementById("cash-checkout-dialog")?.open;
  const anyDialogOpen = Array.from(document.querySelectorAll("dialog")).some((dialog) => dialog.open);

  if (event.key === "Escape") {
    if (anyDialogOpen) return;
    event.preventDefault();
    focusProductSearch();
    return;
  }

  if (event.key === "F3") {
    if (isTypingTarget(event.target) || anyDialogOpen) return;
    event.preventDefault();
    if (!state.cart.length) {
      alert("El ticket ya esta vacio.");
      return;
    }
    if (!confirm("Limpiar el ticket actual?")) return;
    state.cart = [];
    resetCartDiscount();
    renderCart();
    focusProductSearch();
    return;
  }

  if (event.key === "F4" || event.key === "F6") {
    if (isTypingTarget(event.target) || anyDialogOpen) return;
    event.preventDefault();
    holdCurrentTicket();
    return;
  }

  if (event.key === "F5") {
    if (isTypingTarget(event.target) || anyDialogOpen) return;
    event.preventDefault();
    void changeSelectedCartLineQuantity();
    return;
  }

  if (event.key === "Delete") {
    if (isTypingTarget(event.target) || anyDialogOpen) return;
    if (!document.getElementById("tab-pos")?.classList.contains("active")) return;
    event.preventDefault();
    removeSelectedCartLine();
    return;
  }

  if (event.key === "F12") {
    event.preventDefault();
    requestPosCharge();
    return;
  }
  if (event.key === "F1") {
    event.preventDefault();
    if (!cashDialogOpen) {
      alert("Primero presiona F12 para cobrar.");
      return;
    }
    void finalizeCheckoutFromDialog(true);
    return;
  }
  if (event.key === "F2") {
    event.preventDefault();
    if (!cashDialogOpen) {
      alert("Primero presiona F12 para cobrar.");
      return;
    }
    void finalizeCheckoutFromDialog(false);
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
    await refreshPosCore();
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
  // Abrir cajon para ingresar el fondo fisico.
  if (Number(openingAmount || 0) > 0) {
    try {
      await openCashDrawer(true);
    } catch (error) {
      alert(`Fondo abierto, pero no se pudo abrir el cajon: ${error.message}`);
    }
  }
  return session;
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
  let otherIncome = 0;
  let manualExpenses = 0;

  try {
    const movements = await api(`/api/cash/sessions/${sessionId}/movements`);
    (movements || []).forEach((movement) => {
      const amount = Number(movement?.amount || 0);
      if (!(amount > 0)) return;
      const hasSaleRef = Number(movement?.sale_id || 0) > 0;
      if (movement.movement_type === "sale") {
        totalSales += amount;
      } else if (movement.movement_type === "income") {
        if (hasSaleRef) totalSales += amount;
        else otherIncome += amount;
      } else if (movement.movement_type === "expense") {
        if (hasSaleRef) totalReturns += amount;
        else manualExpenses += amount;
      }
    });
  } catch (error) {
    console.warn("No se pudo calcular resumen de ventas para cierre de caja:", error?.message || error);
    totalSales = Math.max(expectedAmount - openingAmount, 0);
  }

  totalSales = Math.round(totalSales * 100) / 100;
  totalReturns = Math.round(totalReturns * 100) / 100;
  otherIncome = Math.round(otherIncome * 100) / 100;
  manualExpenses = Math.round(manualExpenses * 100) / 100;

  return {
    openingAmount,
    totalSales,
    totalReturns,
    otherIncome,
    manualExpenses,
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
  const incomeRowEl = document.getElementById("cash-close-income-row");
  const incomeEl = document.getElementById("cash-close-income");
  const expenseRowEl = document.getElementById("cash-close-expense-row");
  const expenseEl = document.getElementById("cash-close-expense");
  const expectedEl = document.getElementById("cash-close-expected");
  const countedInput = document.getElementById("cash-close-counted");
  if (!openingEl || !salesEl || !returnsRowEl || !returnsEl || !expectedEl || !countedInput) return;

  openingEl.textContent = money(summary.openingAmount);
  salesEl.textContent = money(summary.totalSales);
  expectedEl.textContent = money(summary.expectedAmount);

  const showReturns = Number(summary.totalReturns || 0) > 0;
  returnsRowEl.hidden = !showReturns;
  returnsEl.textContent = `-${money(summary.totalReturns)}`;

  const otherIncome = Number(summary.otherIncome || 0);
  if (incomeRowEl && incomeEl) {
    incomeRowEl.hidden = !(otherIncome > 0);
    incomeEl.textContent = money(otherIncome);
  }
  const manualExpenses = Number(summary.manualExpenses || 0);
  if (expenseRowEl && expenseEl) {
    expenseRowEl.hidden = !(manualExpenses > 0);
    expenseEl.textContent = `-${money(manualExpenses)}`;
  }

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
            `<li>${escapeHtml(dispatch.channel)} - ${escapeHtml(dispatch.status)} - ${formatAppDateTime(
              dispatch.sent_at
            )} - ${escapeHtml(dispatch.recipient || "-")}</li>`
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
          <div><strong>Fecha:</strong> ${formatAppDateTime(order.created_at)}</div>
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
      body: JSON.stringify({
        invoice_ref: invoiceRef || null,
        branch_id: getEffectiveBranchId() || null,
      }),
    });
    await loadData();
    alert("Mercaderia recibida. Stock y costos actualizados.");
  } catch (error) {
    alert(error.message);
  }
}

function navigateToTab(tabName) {
  document.querySelector(`.tab[data-tab="${tabName}"]`)?.click();
}

function handleAlertAction(alertItem) {
  if (!alertItem) return;
  if (alertItem.isUpdate) {
    applySystemUpdate();
    return;
  }
  const code = String(alertItem.code || "");
  const productId = Number(alertItem.product_id || 0);
  const product = productId ? state.products.find((item) => Number(item.id) === productId) : null;

  if (code === "low_stock") {
    if (isAdminUser() && productId) {
      openStockEntryDialog(productId, product?.name || `Producto #${productId}`);
      return;
    }
    navigateToTab(isAdminUser() ? "inventory" : "pos");
    return;
  }
  if (code === "expiring_lot" || code === "expired_lot" || code === "no_movement") {
    if (productId && (isAdminUser() || hasPermission("stock.entry"))) {
      openStockEntryDialog(productId, product?.name || `Producto #${productId}`);
      return;
    }
    if (productId && canAccessTab("inventory")) {
      navigateToTab("inventory");
      refreshPharmacyExpiryLots().then(() => renderPharmacyExpiryPanel());
      return;
    }
    navigateToTab(isAdminUser() ? "inventory" : "pos");
    return;
  }
  if (code === "pending_fel") {
    navigateToTab(isAdminUser() ? "config" : "today");
    return;
  }
  if (productId && isAdminUser()) {
    navigateToTab("products");
    openProductEditor(productId);
  }
}

function alertActionLabel(alertItem) {
  if (alertItem?.isUpdate) return "Actualizar";
  const code = String(alertItem?.code || "");
  if (code === "low_stock" || code === "low_stock_branch") return "Ingreso";
  if (code === "expiring_lot" || code === "expired_lot") return "Ingreso";
  if (code === "pending_fel") return "Ver";
  return "";
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
      code: "system_update",
    });
  }
  const pendingCount = (state.pendingFelSales || []).length;
  if (pendingCount > 0) {
    alerts.unshift({
      level: "warning",
      code: "pending_fel",
      message: `${pendingCount} venta(s) con FEL pendiente`,
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
    .map((alertItem, index) => {
      const label = alertActionLabel(alertItem);
      const actionHtml = label
        ? `<button class="btn ghost alert-action-btn" type="button" data-alert-index="${index}">${label}</button>`
        : "";
      return `<span class="alert-chip ${alertItem.level || ""}">${escapeHtml(alertItem.message || "")} ${actionHtml}</span>`;
    })
    .join("");
  bar.querySelectorAll(".alert-action-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.dataset.alertIndex || -1);
      handleAlertAction(alerts[index]);
    });
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
  if (!customerId) {
    syncCheckoutCreditOptions();
    updatePosCustomerStatusMessage();
    return;
  }
  const customer = (state.customers || []).find((item) => item.id === customerId);
  if (!customer) return;
  document.getElementById("customer-nit").value = customer.nit;
  document.getElementById("customer-name").value = customer.name;
  setNitStatus(`Cliente: ${customer.name} · cliente guardado`, "ok");
  syncCheckoutCreditOptions(customer);
  updatePosCustomerStatusMessage();
}

function syncCheckoutCreditOptions(customer = null) {
  const paymentMethod = document.getElementById("payment-method")?.value || "efectivo";
  const creditBlock = document.getElementById("checkout-credit-options");
  const fcamInput = document.getElementById("checkout-use-fcam");
  const loyaltyWrap = document.getElementById("checkout-loyalty-wrap");
  const loyaltyInput = document.getElementById("checkout-loyalty-redeem");
  const isCredit = paymentMethod === "credito";
  if (creditBlock) creditBlock.hidden = !isCredit;
  if (!isCredit && fcamInput) fcamInput.checked = false;
  if (!customer) {
    const customerId = Number(document.getElementById("customer-select")?.value || 0);
    customer = (state.customers || []).find((item) => item.id === customerId) || null;
  }
  const points = Number(customer?.loyalty_points || 0);
  if (loyaltyWrap) loyaltyWrap.hidden = !(points > 0);
  if (loyaltyInput) {
    loyaltyInput.max = String(points);
    if (!points) loyaltyInput.value = "0";
  }
}

function renderSchoolPackagesPos() {
  const block = document.getElementById("school-packages-pos");
  const select = document.getElementById("school-package-select");
  if (!block || !select) return;
  const show = profileHas("school_packages");
  block.hidden = !show;
  if (!show) return;
  select.innerHTML = `
    <option value="">Seleccionar paquete...</option>
    ${(state.schoolPackages || [])
      .map((pkg) => `<option value="${pkg.id}">${escapeHtml(pkg.name)} (${money(pkg.package_price)})</option>`)
      .join("")}
  `;
}

async function addSchoolPackageToCart() {
  const packageId = Number(document.getElementById("school-package-select")?.value || 0);
  if (!packageId) {
    alert("Selecciona un paquete escolar.");
    return;
  }
  if (!(await ensureTicketCustomerTypePrompt())) return;
  const pkg = (state.schoolPackages || []).find((item) => item.id === packageId);
  if (!pkg) return;
  for (const line of pkg.items || []) {
    const product = state.products.find((item) => item.id === line.product_id);
    if (!product) continue;
    const qty = Number(line.quantity || 0);
    if (qty <= 0) continue;
    const tracksInventory = productTracksInventory(product);
    const availableStock = getPosAvailableStock(product);
    if (tracksInventory && availableStock < qty) {
      alert(`Stock insuficiente para ${product.name} en el paquete.`);
      continue;
    }
    const existing = state.cart.find((item) => item.id === product.id);
    if (existing) {
      existing.quantity = Number(existing.quantity || 0) + qty;
    } else {
      state.cart.push({
        id: product.id,
        name: product.name,
        base_price: product.price,
        tax_rate: product.tax_rate,
        tracks_inventory: tracksInventory ? 1 : 0,
        sale_by_weight: 0,
        wholesale_enabled: product.wholesale_enabled === 1,
        wholesale_min_qty: Number(product.wholesale_min_qty || 0),
        wholesale_discount_pct: Number(product.wholesale_discount_pct || 0),
        quantity: qty,
      });
    }
  }
  state.selectedCartProductId = state.cart.length ? state.cart[state.cart.length - 1].id : null;
  renderCart();
}

function renderSchoolPackagesAdmin() {
  const container = document.getElementById("school-packages-admin");
  const btn = document.getElementById("manage-school-packages-btn");
  if (!container) return;
  if (!profileHas("school_packages")) {
    container.hidden = true;
    if (btn) btn.hidden = true;
    return;
  }
  if (btn) btn.hidden = false;
  if (container.hidden) return;
  const canEdit = hasPermission("products.edit") || hasPermission("promotions.manage");
  const rows = state.schoolPackages || [];
  container.innerHTML = `
    <div class="panel-actions">
      <strong>Paquetes escolares</strong>
      ${canEdit ? '<button type="button" class="btn primary" id="new-school-package-btn">Nuevo paquete</button>' : ""}
      <button type="button" class="btn ghost" id="close-school-packages-admin-btn">Cerrar</button>
    </div>
    ${
      rows.length
        ? `<table><thead><tr><th>Nombre</th><th>Grado</th><th>Items</th><th>Precio</th>${
            canEdit ? "<th></th>" : ""
          }</tr></thead><tbody>
        ${rows
          .map(
            (pkg) => `
          <tr>
            <td>${escapeHtml(pkg.name)}</td>
            <td>${escapeHtml(pkg.school_grade || "-")}</td>
            <td>${(pkg.items || []).length}</td>
            <td>${money(pkg.package_price)}</td>
            ${
              canEdit
                ? `<td>
              <button type="button" class="btn ghost edit-school-package-btn" data-id="${pkg.id}">Editar</button>
              <button type="button" class="btn ghost deactivate-school-package-btn" data-id="${pkg.id}">Quitar</button>
            </td>`
                : ""
            }
          </tr>`
          )
          .join("")}
      </tbody></table>`
        : '<div class="empty">Sin paquetes. Crea el primero para vender utiles por listado.</div>'
    }
  `;
  document.getElementById("close-school-packages-admin-btn")?.addEventListener("click", () => {
    container.hidden = true;
  });
  document.getElementById("new-school-package-btn")?.addEventListener("click", () => openSchoolPackageEditor(null));
  container.querySelectorAll(".edit-school-package-btn").forEach((button) => {
    button.addEventListener("click", () => openSchoolPackageEditor(Number(button.dataset.id)));
  });
  container.querySelectorAll(".deactivate-school-package-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm("Desactivar este paquete?")) return;
      try {
        await api(`/api/school-packages/${button.dataset.id}`, { method: "DELETE" });
        await loadData();
        container.hidden = false;
        renderSchoolPackagesAdmin();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function openSchoolPackageEditor(packageId = null) {
  const dialog = document.getElementById("school-package-dialog");
  const form = document.getElementById("school-package-form");
  const title = document.getElementById("school-package-dialog-title");
  if (!dialog || !form) return;
  state.editingSchoolPackageId = packageId;
  state.schoolPackageLines = [];
  const pkg = packageId ? (state.schoolPackages || []).find((p) => Number(p.id) === Number(packageId)) : null;
  title.textContent = pkg ? `Editar paquete #${pkg.id}` : "Nuevo paquete escolar";
  form.name.value = pkg?.name || "";
  form.school_grade.value = pkg?.school_grade || "";
  form.notes.value = pkg?.notes || "";
  state.schoolPackageLines = (pkg?.items || []).map((item) => ({
    product_id: item.product_id,
    quantity: Number(item.quantity || 1),
  }));
  if (!state.schoolPackageLines.length) {
    const first = (state.products || [])[0];
    state.schoolPackageLines = [{ product_id: first?.id || null, quantity: 1 }];
  }
  renderSchoolPackageLines();
  dialog.showModal();
}

function renderSchoolPackageLines() {
  const container = document.getElementById("school-package-lines");
  if (!container) return;
  const options = (state.products || [])
    .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
    .join("");
  container.innerHTML = `
    <table>
      <thead><tr><th>Producto</th><th>Cant</th><th></th></tr></thead>
      <tbody>
        ${(state.schoolPackageLines || [])
          .map(
            (line, index) => `
          <tr>
            <td><select data-line="${index}" class="school-pkg-product">${options}</select></td>
            <td><input data-line="${index}" class="school-pkg-qty" type="number" min="0.01" step="0.01" value="${
              line.quantity
            }"></td>
            <td><button type="button" class="btn ghost school-pkg-remove" data-line="${index}">Quitar</button></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
  container.querySelectorAll(".school-pkg-product").forEach((select) => {
    const idx = Number(select.dataset.line);
    select.value = String(state.schoolPackageLines[idx]?.product_id || "");
    select.addEventListener("change", () => {
      state.schoolPackageLines[idx].product_id = Number(select.value) || null;
    });
  });
  container.querySelectorAll(".school-pkg-qty").forEach((input) => {
    const idx = Number(input.dataset.line);
    input.addEventListener("change", () => {
      state.schoolPackageLines[idx].quantity = Number(input.value || 1);
    });
  });
  container.querySelectorAll(".school-pkg-remove").forEach((button) => {
    button.addEventListener("click", () => {
      const idx = Number(button.dataset.line);
      state.schoolPackageLines.splice(idx, 1);
      if (!state.schoolPackageLines.length) {
        state.schoolPackageLines = [{ product_id: state.products?.[0]?.id || null, quantity: 1 }];
      }
      renderSchoolPackageLines();
    });
  });
}

function normalizeDashboardPayload(raw) {
  if (!raw) return null;
  if (raw.summary || raw.topProducts || raw.paymentMethods) {
    return {
      summary: raw.summary || raw.sales_summary || {},
      topProducts: raw.topProducts || raw.top_products || [],
      paymentMethods: raw.paymentMethods || raw.payment_methods || [],
      cashCut: raw.cashCut || raw.cash_cut || null,
      cashCuts: raw.cashCuts || raw.cash_cuts || [],
      ranking: raw.ranking || [],
      pendingFelCount: raw.pendingFelCount ?? raw.pending_fel_count ?? 0,
      alerts: raw.alerts || [],
      date: raw.date || null,
      role: raw.role || null,
    };
  }
  return {
    summary: raw.sales_summary || {},
    topProducts: raw.top_products || [],
    paymentMethods: raw.payment_methods || [],
    cashCut: raw.cash_cut || null,
    cashCuts: raw.cash_cuts || [],
    ranking: raw.ranking || [],
    pendingFelCount: raw.pending_fel_count || 0,
    alerts: raw.alerts || [],
    date: raw.date || null,
    role: raw.role || null,
  };
}

function formatCashCutRows(reports) {
  const cuts = Array.isArray(reports?.cashCuts) && reports.cashCuts.length
    ? reports.cashCuts
    : reports?.cashCut
      ? [reports.cashCut]
      : [];
  if (!cuts.length) {
    return '<div class="row"><span>Corte caja</span><strong>Sin caja abierta</strong></div>';
  }
  if (cuts.length === 1) {
    const cashCut = cuts[0];
    const who = cashCut.opened_by ? ` · ${escapeHtml(cashCut.opened_by)}` : "";
    return `<div class="row"><span>Corte caja</span><strong>${money(cashCut.sales_total || 0)} ventas · esperado ${money(cashCut.expected_amount || 0)}${who}</strong></div>`;
  }
  const total = reports.cashCut || {};
  const lines = cuts
    .map(
      (cut) =>
        `<li>${escapeHtml(cut.opened_by || `Caja #${cut.session_id}`)}: ventas ${money(cut.sales_total || 0)} · esperado ${money(cut.expected_amount || 0)}</li>`
    )
    .join("");
  return `
    <div class="row"><span>Corte caja</span><strong>${cuts.length} abiertas · esperado ${money(total.expected_amount || 0)}</strong></div>
    <ul class="compact-list">${lines}</ul>
  `;
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
  state.reports = normalizeDashboardPayload({
    summary,
    topProducts,
    paymentMethods,
    cashCut,
    ranking,
  });
  renderReportsDashboard();
}

async function loadTodayDashboard() {
  const data = await api("/api/reports/my-day");
  state.todayDashboard = normalizeDashboardPayload(data);
  renderTodayDashboard();
}

function renderTodayDashboard() {
  const container = document.getElementById("today-dashboard");
  if (!container) return;
  const reports = state.todayDashboard;
  if (!reports) {
    container.innerHTML = '<div class="empty">Presiona Actualizar para cargar el resumen de hoy.</div>';
    return;
  }
  const summary = reports.summary || {};
  const cashCut = reports.cashCut;
  container.innerHTML = `
    <div class="row"><span>Fecha</span><strong>${escapeHtml(reports.date || getGuatemalaDateKey())}</strong></div>
    <div class="row"><span>Ventas</span><strong>${summary.sales_count || 0}</strong></div>
    <div class="row"><span>Total vendido</span><strong>${money(summary.total_amount || 0)}</strong></div>
    <div class="row"><span>IVA</span><strong>${money(summary.tax_total || 0)}</strong></div>
    <div class="row"><span>Ventas a credito</span><strong>${summary.credit_sales_count || 0} (${money(summary.credit_sales_amount || 0)})</strong></div>
    <div class="row"><span>FEL pendiente</span><strong>${reports.pendingFelCount || 0}</strong></div>
    ${formatCashCutRows(reports)}
    <h4>Top productos</h4>
    ${
      (reports.topProducts || []).length
        ? `<ul class="compact-list">${reports.topProducts
            .map(
              (item) =>
                `<li>${escapeHtml(item.name)}: ${formatQuantity(item.quantity)} uds · ${money(item.total_amount)}</li>`
            )
            .join("")}</ul>`
        : '<div class="empty">Sin ventas hoy.</div>'
    }
    <h4>Metodos de pago</h4>
    ${
      (reports.paymentMethods || []).length
        ? `<ul class="compact-list">${reports.paymentMethods
            .map((item) => `<li>${escapeHtml(item.payment_method)}: ${item.sales_count || "-"} · ${money(item.total_amount)}</li>`)
            .join("")}</ul>`
        : '<div class="empty">Sin datos.</div>'
    }
    <div class="panel-actions" style="margin-top:0.8rem;">
      <button type="button" class="btn ghost" id="today-retry-fel-btn">Reintentar FEL pendientes</button>
      <button type="button" class="btn ghost" id="today-go-cash-btn">Ir a caja</button>
    </div>
  `;
  document.getElementById("today-retry-fel-btn")?.addEventListener("click", () => {
    retryAllPendingFel().catch((error) => alert(error.message));
  });
  document.getElementById("today-go-cash-btn")?.addEventListener("click", () => navigateToTab("cash"));
}

function renderReportsDashboard() {
  const container = document.getElementById("reports-dashboard");
  if (!container || !isAdminUser()) return;
  const reports = normalizeDashboardPayload(state.reports);
  if (!reports) {
    container.innerHTML = '<div class="empty">Presiona Actualizar para cargar reportes.</div>';
    return;
  }
  const summary = reports.summary || {};
  container.innerHTML = `
    <div class="row"><span>Ventas</span><strong>${summary.sales_count || 0}</strong></div>
    <div class="row"><span>Total vendido</span><strong>${money(summary.total_amount || 0)}</strong></div>
    <div class="row"><span>IVA</span><strong>${money(summary.tax_total || 0)}</strong></div>
    <div class="row"><span>Ventas a credito</span><strong>${summary.credit_sales_count || 0} (${money(summary.credit_sales_amount || 0)})</strong></div>
    ${formatCashCutRows(reports)}
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
    <div class="panel-actions" style="margin-top:0.8rem;">
      <button type="button" class="btn ghost" id="export-sales-book-btn">Libro ventas CSV</button>
      <button type="button" class="btn ghost" id="export-purchases-book-btn">Libro compras CSV</button>
    </div>
  `;
  document.getElementById("export-sales-book-btn")?.addEventListener("click", () => {
    downloadAccountingCsv("sales").catch((error) => alert(error.message));
  });
  document.getElementById("export-purchases-book-btn")?.addEventListener("click", () => {
    downloadAccountingCsv("purchases").catch((error) => alert(error.message));
  });
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
            <td>${escapeHtml(customer.nit || "")}</td>
            <td>${escapeHtml(customer.name || "")}</td>
            <td>${escapeHtml(customer.phone || "-")}</td>
            <td>${money(customer.credit_limit || 0)}</td>
            <td>${money(customer.credit_balance || 0)}</td>
            <td>
              <button class="btn ghost edit-customer-btn" data-id="${customer.id}">Editar</button>
              <button class="btn ghost customer-payment-btn" data-id="${customer.id}">Abono</button>
            </td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
  container.querySelectorAll(".edit-customer-btn").forEach((button) => {
    button.addEventListener("click", () => openCustomerDialog(Number(button.dataset.id)));
  });
  container.querySelectorAll(".customer-payment-btn").forEach((button) => {
    button.addEventListener("click", () => openCreditPaymentDialog(Number(button.dataset.id)));
  });
}

function openCustomerDialog(customerId = null) {
  if (typeof customerId !== "number") {
    customerId = null;
  }
  const form = document.getElementById("customer-form");
  const title = document.getElementById("customer-dialog-title");
  const nitInput = form?.nit;
  if (!form || !title) return;

  state.editingCustomerId = customerId || null;
  form.reset();

  if (!customerId) {
    title.textContent = "Nuevo cliente";
    if (nitInput) nitInput.readOnly = false;
    const loyaltyWrap = document.getElementById("customer-loyalty-wrap");
    if (loyaltyWrap) loyaltyWrap.hidden = true;
    if (form.price_tier) form.price_tier.value = "retail";
    document.getElementById("customer-dialog")?.showModal();
    return;
  }

  const customer = (state.customers || []).find((item) => item.id === customerId);
  if (!customer) return;

  title.textContent = "Editar cliente";
  form.nit.value = customer.nit || "";
  form.name.value = customer.name || "";
  form.email.value = customer.email || "";
  form.phone.value = customer.phone || "";
  form.address.value = customer.address || "";
  form.credit_limit.value = Number(customer.credit_limit || 0);
  if (form.price_tier) form.price_tier.value = customer.price_tier || "retail";
  form.notes.value = customer.notes || "";
  const loyaltyWrap = document.getElementById("customer-loyalty-wrap");
  const loyaltyDisplay = form.loyalty_points_display;
  const points = Number(customer.loyalty_points || 0);
  if (loyaltyWrap) loyaltyWrap.hidden = !(points > 0);
  if (loyaltyDisplay) loyaltyDisplay.value = points > 0 ? formatQuantity(points) : "";
  if (nitInput) nitInput.readOnly = true;
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
  const editingId = state.editingCustomerId;
  const payload = {
    name: form.name.value.trim(),
    email: form.email.value.trim() || null,
    phone: form.phone.value.trim() || null,
    address: form.address.value.trim() || null,
    credit_limit: Number(form.credit_limit.value || 0),
    price_tier: form.price_tier?.value || "retail",
    notes: form.notes.value.trim() || null,
  };
  try {
    if (editingId) {
      await api(`/api/customers/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
    } else {
      await api("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          nit: form.nit.value.trim(),
        }),
      });
    }
    state.editingCustomerId = null;
    document.getElementById("customer-dialog")?.close();
    await loadData();
    alert(editingId ? "Cliente actualizado." : "Cliente guardado.");
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
  if (!container || !hasPermission("promotions.manage")) return;
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

function shiftDateKey(dateKey, days) {
  const parts = String(dateKey || "").split("-").map(Number);
  if (parts.length !== 3) return dateKey;
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function getReportDateRange() {
  const fromInput = document.getElementById("report-date-from");
  const toInput = document.getElementById("report-date-to");
  const today = getGuatemalaDateKey();
  const dateFrom = fromInput?.value || shiftDateKey(today, -30);
  const dateTo = toInput?.value || today;
  return { dateFrom, dateTo };
}

function initializeReportDates() {
  const fromInput = document.getElementById("report-date-from");
  const toInput = document.getElementById("report-date-to");
  if (!fromInput || !toInput || fromInput.dataset.initialized === "1") return;
  const today = getGuatemalaDateKey();
  fromInput.value = shiftDateKey(today, -30);
  toInput.value = today;
  fromInput.dataset.initialized = "1";
}

async function downloadAccountingCsv(kind) {
  const { dateFrom, dateTo } = getReportDateRange();
  const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
  const path =
    kind === "purchases"
      ? `/api/reports/accounting/purchases.csv?${params.toString()}`
      : `/api/reports/accounting/sales.csv?${params.toString()}`;
  try {
    const csv = await api(path);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = kind === "purchases" ? "libro_compras.csv" : "libro_ventas.csv";
    link.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    alert(error.message);
  }
}

async function downloadFelPdf(saleId) {
  if (!state.deviceId && typeof FP.ensureDeviceIdentity === "function") {
    await FP.ensureDeviceIdentity();
  }
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (state.deviceId) headers["X-FELPOS-Device-Id"] = state.deviceId;
  if (state.deviceHostname) headers["X-FELPOS-Hostname"] = state.deviceHostname;
  const response = await fetch(`/api/sales/${saleId}/fel-pdf`, { headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "Error al descargar PDF" }));
    throw new Error(error.detail || "Error al descargar PDF");
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `fel-${saleId}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
}

async function voidSaleFel(saleId) {
  const reasonRaw = await showAppPrompt("Motivo de anulacion FEL", {
    title: "Anular FEL",
    label: "Motivo",
    defaultValue: "Anulacion solicitada",
  });
  if (reasonRaw === null) return;
  const reason = String(reasonRaw).trim() || "Anulacion solicitada";
  try {
    const updated = await api(`/api/sales/${saleId}/fel-void?reason=${encodeURIComponent(reason)}`, {
      method: "POST",
    });
    const index = state.sales.findIndex((item) => item.id === saleId);
    if (index >= 0) state.sales[index] = updated;
    openSaleDetail(saleId);
    alert("FEL anulado correctamente.");
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

async function retryAllPendingFel({ silent = false } = {}) {
  const rows = state.pendingFelSales || [];
  if (!rows.length) {
    if (!silent) alert("No hay ventas FEL pendientes.");
    return;
  }
  if (!silent && !confirm(`Reintentar certificacion de ${rows.length} venta(s) pendiente(s)?`)) return;
  if (state.felRetryInFlight) return;
  state.felRetryInFlight = true;
  try {
    const result = await api("/api/fel/pending/retry-all", { method: "POST" });
    state.pendingFelSales = await api("/api/fel/pending").catch(() => []);
    renderSystemAlertsBar();
    renderPendingFelTable();
    loadTodayDashboard().catch(() => {});
    if (!silent) {
      alert(`Proceso terminado: ${result.certified} certificada(s), ${result.failed} con error.`);
    }
  } catch (error) {
    if (!silent) alert(error.message);
  } finally {
    state.felRetryInFlight = false;
  }
}

async function maybeAutoRetryPendingFel() {
  if (!state.token || !(state.pendingFelSales || []).length || state.felRetryInFlight) return;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  await retryAllPendingFel({ silent: true });
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
            <td>${formatAppDateTime(row.created_at)}</td>
            <td>${money(row.sale_total || 0)}</td>
            <td>${row.retry_count || 0}</td>
            <td>${escapeHtml(row.last_error || "-")}</td>
            <td class="panel-actions">
              <button class="btn ghost pending-fel-retry-btn" data-id="${row.id}">Reintentar</button>
              ${isAdminUser() ? `<button class="btn ghost pending-fel-dismiss-btn" data-id="${row.id}">Descartar</button>` : ""}
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
    container.innerHTML = '<div class="empty">Sin registros de auditoria para hoy.</div>';
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
            <td>${formatAppDateTime(row.created_at)}</td>
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

function populateBranchSelect() {
  const select = document.getElementById("pos-branch-filter");
  const wrap = document.getElementById("pos-branch-filter-wrap");
  if (!select) return;
  const multi = isMultiBranchEnabled();
  select.hidden = !multi;
  select.style.display = multi ? "" : "none";
  if (wrap) wrap.hidden = !multi;
  if (!multi) {
    state.selectedBranchId = null;
    localStorage.removeItem("felpos_branch_id");
    return;
  }
  const branches = (state.branches || []).filter((b) => Number(b.active) === 1);
  const current = state.selectedBranchId ? String(state.selectedBranchId) : "";
  select.innerHTML =
    `<option value="">Sucursal principal</option>` +
    branches
      .map((b) => `<option value="${b.id}">${escapeHtml(b.code)} · ${escapeHtml(b.name)}</option>`)
      .join("");
  if (current && branches.some((b) => String(b.id) === current)) {
    select.value = current;
  }
  select.disabled = Boolean(state.deviceBranchLocked) && !isAdminUser();
  select.title = select.disabled
    ? "Sucursal fijada para esta caja por el administrador"
    : "Sucursal activa del POS";
}

async function applyDeviceBranchDefaults() {
  try {
    const device = await api("/api/devices/me").catch(() => null);
    state.currentDevice = device;
    if (device?.branch_id) {
      state.selectedBranchId = Number(device.branch_id);
      state.deviceBranchLocked = true;
      localStorage.setItem("felpos_branch_id", String(device.branch_id));
    } else {
      state.deviceBranchLocked = false;
    }
  } catch (_error) {
    state.deviceBranchLocked = false;
  }
}

function updateServerHealthBanner(online) {
  let bar = document.getElementById("server-health-bar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "server-health-bar";
    bar.className = "system-alerts-bar";
    const alerts = document.getElementById("system-alerts-bar");
    if (alerts?.parentNode) {
      alerts.parentNode.insertBefore(bar, alerts);
    } else {
      document.body.prepend(bar);
    }
  }
  if (online) {
    bar.hidden = true;
    bar.innerHTML = "";
    return;
  }
  bar.hidden = false;
  bar.innerHTML = FP.serverOfflineBannerHtml
    ? FP.serverOfflineBannerHtml()
    : '<span class="alert-chip danger">Sin conexion al servidor FEL POS. Revisa la PC servidor / red. Los cobros no funcionaran hasta reconectar.</span>';
}

function startServerHealthMonitor() {
  if (state.serverHealthTimerId) return;
  const ping = async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      const response = await fetch("/api/system/version", {
        headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
        signal: controller.signal,
      });
      clearTimeout(timer);
      const reachable = FP.isServerReachableStatus
        ? FP.isServerReachableStatus(response.status)
        : response.ok || response.status === 401 || response.status === 403;
      updateServerHealthBanner(reachable);
    } catch (_error) {
      updateServerHealthBanner(false);
    }
  };
  ping();
  state.serverHealthTimerId = setInterval(ping, 12000);
}

function renderBranchesTable() {
  const container = document.getElementById("branches-table");
  if (!container) return;
  const rows = state.branches || [];
  const multi = isMultiBranchEnabled();
  container.innerHTML = `
    <label class="toggle-row">
      <input type="checkbox" id="multi-branch-enabled-toggle" ${multi ? "checked" : ""}>
      <span>Activar multi-sucursal (varias tiendas / locales)</span>
    </label>
    <p class="hint">
      ${
        multi
          ? "Multi-sucursal activo: el stock se maneja por sucursal (Ingreso, Conteo o Transferencia)."
          : "Desactivado: una sola tienda. Puedes editar el stock directo en Productos. Activa solo si tendras mas sucursales."
      }
    </p>
    ${
      multi
        ? `
    <form id="branch-create-form" class="compact-form-row">
      <input name="code" placeholder="Codigo" required>
      <input name="name" placeholder="Nombre sucursal" required>
      <input name="address" placeholder="Direccion">
      <button class="btn primary" type="submit">Crear sucursal</button>
    </form>
    <form id="branch-transfer-form" class="compact-form-row">
      <strong class="form-row-title">Transferir inventario</strong>
      <select name="product_id" required>
        <option value="">Producto</option>
        ${(state.products || [])
          .filter((p) => Number(p.tracks_inventory) === 1)
          .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
          .join("")}
      </select>
      <select name="from_branch_id" required>
        <option value="">Desde</option>
        ${rows.map((b) => `<option value="${b.id}">${escapeHtml(b.code)}</option>`).join("")}
      </select>
      <select name="to_branch_id" required>
        <option value="">Hacia</option>
        ${rows.map((b) => `<option value="${b.id}">${escapeHtml(b.code)}</option>`).join("")}
      </select>
      <input name="quantity" type="number" min="0.01" step="0.01" placeholder="Cantidad" required>
      <button class="btn ghost" type="submit">Transferir</button>
    </form>
    ${
      rows.length
        ? `<table>
      <thead><tr><th>Codigo</th><th>Nombre</th><th>Direccion</th><th>FEL est.</th><th>FEL nombre</th><th>Estado</th><th></th></tr></thead>
      <tbody>
        ${rows
          .map(
            (row) => `
          <tr>
            <td>${escapeHtml(row.code)}</td>
            <td>${escapeHtml(row.name)}</td>
            <td>${escapeHtml(row.address || "-")}</td>
            <td>${escapeHtml(row.fel_codigo_establecimiento || "-")}</td>
            <td>${escapeHtml(row.fel_nombre_comercial || "-")}</td>
            <td>${row.active ? "Activa" : "Inactiva"}</td>
            <td><button type="button" class="btn ghost branch-fel-edit-btn" data-id="${row.id}">Editar FEL</button></td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>`
        : '<div class="empty">Sin sucursales configuradas.</div>'
    }`
        : `<div class="empty">Multi-sucursal desactivado. Activa la opcion de arriba solo si manejas mas de un local.</div>`
    }
  `;
  document.getElementById("multi-branch-enabled-toggle")?.addEventListener("change", async (event) => {
    const enabled = Boolean(event.target.checked);
    try {
      const profileInfo = await api("/api/config/multi-branch", {
        method: "PUT",
        body: JSON.stringify({ enabled }),
      });
      state.multiBranchEnabled = Boolean(profileInfo?.multi_branch_enabled);
      populateBranchSelect();
      await loadData();
      alert(enabled ? "Multi-sucursal activado." : "Multi-sucursal desactivado.");
    } catch (error) {
      event.target.checked = !enabled;
      alert(error.message);
    }
  });
  document.getElementById("branch-create-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      await api("/api/branches", {
        method: "POST",
        body: JSON.stringify({
          code: form.code.value.trim().toUpperCase(),
          name: form.name.value.trim(),
          address: form.address.value.trim() || null,
          active: 1,
        }),
      });
      await loadData();
      alert("Sucursal creada.");
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById("branch-transfer-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    try {
      await api("/api/inventory/transfer", {
        method: "POST",
        body: JSON.stringify({
          product_id: Number(form.product_id.value),
          from_branch_id: Number(form.from_branch_id.value),
          to_branch_id: Number(form.to_branch_id.value),
          quantity: Number(form.quantity.value),
        }),
      });
      await loadData();
      alert("Transferencia realizada.");
    } catch (error) {
      alert(error.message);
    }
  });
  container.querySelectorAll(".branch-fel-edit-btn").forEach((button) => {
    button.addEventListener("click", async () => {
      const branchId = Number(button.dataset.id);
      const branch = (state.branches || []).find((row) => Number(row.id) === branchId);
      if (!branch) return;
      const codigo = await showAppPrompt("Codigo establecimiento FEL", {
        title: `FEL · ${branch.code}`,
        label: "Codigo establecimiento",
        defaultValue: branch.fel_codigo_establecimiento || "",
      });
      if (codigo === null) return;
      const nombre = await showAppPrompt("Nombre comercial FEL", {
        title: `FEL · ${branch.code}`,
        label: "Nombre comercial",
        defaultValue: branch.fel_nombre_comercial || "",
      });
      if (nombre === null) return;
      const direccion = await showAppPrompt("Direccion FEL de sucursal", {
        title: `FEL · ${branch.code}`,
        label: "Direccion establecimiento",
        defaultValue: branch.fel_direccion || branch.address || "",
      });
      if (direccion === null) return;
      try {
        await api(`/api/branches/${branchId}`, {
          method: "PATCH",
          body: JSON.stringify({
            fel_codigo_establecimiento: String(codigo).trim() || null,
            fel_nombre_comercial: String(nombre).trim() || null,
            fel_direccion: String(direccion).trim() || null,
          }),
        });
        await loadData();
        alert("Datos FEL de sucursal actualizados.");
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

async function loadDiningPanel() {
  if (!profileHas("dining")) return;
  state.diningTables = await api("/api/dining/tables").catch(() => []);
  state.diningChecks = await api("/api/dining/checks/open").catch(() => []);
  renderDiningTables();
  renderDiningCheckPanel();
}

function renderDiningTables() {
  const grid = document.getElementById("dining-tables-grid");
  if (!grid) return;
  const tables = state.diningTables || [];
  if (!tables.length) {
    grid.innerHTML = '<div class="empty">No hay mesas. Crea la primera con "Nueva mesa".</div>';
    return;
  }
  grid.innerHTML = tables
    .map((table) => {
      const busy = table.status === "occupied" || table.open_check_id;
      return `
      <button type="button" class="dining-table-card ${busy ? "occupied" : "free"}" data-table-id="${table.id}" data-check-id="${table.open_check_id || ""}">
        <strong>${escapeHtml(table.code)}</strong>
        <span>${escapeHtml(table.name)}</span>
        <small>${busy ? "Ocupada" : "Libre"} · ${table.seats} asientos</small>
      </button>`;
    })
    .join("");
  grid.querySelectorAll(".dining-table-card").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const tableId = Number(btn.dataset.tableId);
      let checkId = Number(btn.dataset.checkId || 0);
      try {
        if (!checkId) {
          const opened = await api("/api/dining/checks", {
            method: "POST",
            body: JSON.stringify({ table_id: tableId, branch_id: state.selectedBranchId || null }),
          });
          checkId = opened.id;
        }
        state.selectedDiningCheckId = checkId;
        await loadDiningPanel();
        state.selectedDiningCheckId = checkId;
        renderDiningCheckPanel();
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function renderDiningCheckPanel() {
  const panel = document.getElementById("dining-check-panel");
  if (!panel) return;
  const check =
    (state.diningChecks || []).find((c) => Number(c.id) === Number(state.selectedDiningCheckId)) || null;
  if (!check) {
    panel.innerHTML = '<p class="hint">Selecciona una mesa para ver o abrir su comanda.</p>';
    return;
  }
  const lines = (check.items || [])
    .map(
      (item) =>
        `<tr>
          <td><label class="inline-option"><input type="checkbox" class="dining-split-item" data-item-id="${item.id}"> ${escapeHtml(item.product_name || item.product_id)}${item.notes ? ` <small>(${escapeHtml(item.notes)})</small>` : ""}</label></td>
          <td>${item.quantity}</td>
          <td><span class="status-pill ${
            FP.diningItemStatusPillClass ? FP.diningItemStatusPillClass(item.status) : item.status === "done" ? "ok" : item.status === "sent" ? "warning" : "critical"
          }">${escapeHtml(FP.formatDiningItemStatus ? FP.formatDiningItemStatus(item.status) : item.status || "pending")}</span></td>
          <td>${money(item.line_total || item.quantity * item.unit_price)}</td>
          <td>
            ${
              item.status !== "done"
                ? `<button type="button" class="btn ghost dining-item-done" data-item-id="${item.id}">Listo</button>`
                : ""
            }
            <button type="button" class="btn ghost dining-remove-item" data-item-id="${item.id}">Quitar</button>
          </td>
        </tr>`
    )
    .join("");
  const pendingCount = FP.diningPendingCount ? FP.diningPendingCount(check) : (check.items || []).filter((item) => item.status === "pending").length;
  panel.innerHTML = `
    <h3>Comanda #${check.id} · ${escapeHtml(check.table_code || "")} ${escapeHtml(check.table_name || "")}</h3>
    <p class="hint">Estado: ${escapeHtml(check.status)} · Total ${money(check.total || 0)} · Pendientes cocina: ${pendingCount}</p>
    <div class="dining-toolbar">
      <select id="dining-add-product">
        ${(state.products || [])
          .map((p) => `<option value="${p.id}">${escapeHtml(p.name)} · ${money(p.price)}</option>`)
          .join("")}
      </select>
      <input id="dining-add-qty" type="number" min="0.01" step="0.01" value="1">
      <input id="dining-add-notes" placeholder="Notas (opcional)">
      <div id="dining-modifier-chips" class="discount-quick"></div>
      <button id="dining-add-item-btn" class="btn ghost" type="button">Agregar</button>
      <button id="dining-send-kitchen-btn" class="btn primary" type="button" ${pendingCount ? "" : "disabled"}>Enviar cocina</button>
      <button id="dining-split-btn" class="btn ghost" type="button">Dividir cuenta</button>
      <select id="dining-pay-method">
        <option value="efectivo">Efectivo</option>
        <option value="tarjeta">Tarjeta</option>
        <option value="transferencia">Transferencia</option>
        <option value="mixto">Mixto (efectivo + otro)</option>
      </select>
      <input id="dining-pay-cash" type="number" min="0" step="0.01" placeholder="Efectivo mixto" hidden>
      <label>Propina %
        <select id="dining-tip-pct">
          <option value="0" selected>0%</option>
          <option value="5">5%</option>
          <option value="10">10%</option>
          <option value="15">15%</option>
          <option value="custom">Otro</option>
        </select>
      </label>
      <label>Propina Q<input id="dining-pay-tip" type="number" min="0" step="0.01" value="0" placeholder="0"></label>
      <input id="dining-pay-nit" placeholder="NIT (CF)" value="CF">
      <button id="dining-pay-btn" class="btn primary" type="button">Cobrar</button>
      <button id="dining-cancel-btn" class="btn ghost" type="button">Cancelar</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>Producto</th><th>Cant</th><th>Cocina</th><th>Total</th><th></th></tr></thead><tbody>${
      lines || '<tr><td colspan="5">Sin productos</td></tr>'
    }</tbody></table></div>
  `;
  const renderDiningModifierChips = () => {
    const chips = document.getElementById("dining-modifier-chips");
    const notesInput = document.getElementById("dining-add-notes");
    const productSelect = document.getElementById("dining-add-product");
    if (!chips || !notesInput || !productSelect) return;
    const product = (state.products || []).find((p) => Number(p.id) === Number(productSelect.value));
    const raw = String(product?.dining_modifiers || "").trim();
    if (!raw) {
      chips.innerHTML = "";
      return;
    }
    const modifiers = raw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    chips.innerHTML = modifiers
      .map((mod) => `<button type="button" class="discount-chip dining-mod-chip" data-mod="${escapeHtml(mod)}">${escapeHtml(mod)}</button>`)
      .join("");
    chips.querySelectorAll(".dining-mod-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        const current = notesInput.value.trim();
        const mod = btn.dataset.mod || "";
        notesInput.value = current ? `${current}, ${mod}` : mod;
      });
    });
  };
  document.getElementById("dining-add-product")?.addEventListener("change", renderDiningModifierChips);
  renderDiningModifierChips();
  document.getElementById("dining-send-kitchen-btn")?.addEventListener("click", async () => {
    try {
      await api(`/api/dining/checks/${check.id}/send-kitchen`, { method: "POST" });
      await loadDiningPanel();
      state.selectedDiningCheckId = check.id;
      renderDiningCheckPanel();
    } catch (error) {
      alert(error.message);
    }
  });
  panel.querySelectorAll(".dining-item-done").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await api(`/api/dining/checks/${check.id}/items/${btn.dataset.itemId}/status?status=done`, {
          method: "PATCH",
        });
        await loadDiningPanel();
        state.selectedDiningCheckId = check.id;
        renderDiningCheckPanel();
      } catch (error) {
        alert(error.message);
      }
    });
  });
  document.getElementById("dining-add-item-btn")?.addEventListener("click", async () => {
    try {
      const notes = (document.getElementById("dining-add-notes")?.value || "").trim() || null;
      await api(`/api/dining/checks/${check.id}/items`, {
        method: "POST",
        body: JSON.stringify({
          product_id: Number(document.getElementById("dining-add-product").value),
          quantity: Number(document.getElementById("dining-add-qty").value || 1),
          notes,
        }),
      });
      await loadDiningPanel();
      state.selectedDiningCheckId = check.id;
      renderDiningCheckPanel();
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById("dining-split-btn")?.addEventListener("click", async () => {
    const itemIds = Array.from(panel.querySelectorAll(".dining-split-item:checked")).map((input) =>
      Number(input.dataset.itemId)
    );
    if (!itemIds.length) {
      alert("Marca al menos un producto para dividir.");
      return;
    }
    if (!confirm(`Dividir ${itemIds.length} producto(s) a una nueva comanda?`)) return;
    try {
      const split = await api(`/api/dining/checks/${check.id}/split`, {
        method: "POST",
        body: JSON.stringify({ item_ids: itemIds }),
      });
      state.selectedDiningCheckId = split.id;
      await loadDiningPanel();
      renderDiningCheckPanel();
    } catch (error) {
      alert(error.message);
    }
  });
  panel.querySelectorAll(".dining-remove-item").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Quitar este producto de la comanda?")) return;
      try {
        await api(`/api/dining/checks/${check.id}/items/${btn.dataset.itemId}`, { method: "DELETE" });
        await loadDiningPanel();
        state.selectedDiningCheckId = check.id;
        renderDiningCheckPanel();
      } catch (error) {
        alert(error.message);
      }
    });
  });
  const applyDiningTipPercent = () => {
    const tipInput = document.getElementById("dining-pay-tip");
    const pctSelect = document.getElementById("dining-tip-pct");
    if (!tipInput || !pctSelect) return;
    const pct = pctSelect.value;
    if (pct === "custom") return;
    const amount = Math.round((Number(check.total || 0) * Number(pct || 0)) / 100 * 100) / 100;
    tipInput.value = String(amount);
  };
  document.getElementById("dining-tip-pct")?.addEventListener("change", applyDiningTipPercent);
  applyDiningTipPercent();
  document.getElementById("dining-pay-tip")?.addEventListener("input", () => {
    const pctSelect = document.getElementById("dining-tip-pct");
    if (pctSelect) pctSelect.value = "custom";
  });
  document.getElementById("dining-pay-method")?.addEventListener("change", (event) => {
    const cashInput = document.getElementById("dining-pay-cash");
    if (!cashInput) return;
    const isMixto = event.target.value === "mixto";
    cashInput.hidden = !isMixto;
    if (isMixto) {
      const tipAmount = Math.round(Number(document.getElementById("dining-pay-tip")?.value || 0) * 100) / 100;
      const payTotal = Math.round((Number(check.total || 0) + tipAmount) * 100) / 100;
      cashInput.value = String(Math.max(0, payTotal / 2).toFixed(2));
      cashInput.focus();
    } else {
      cashInput.value = "";
    }
  });
  document.getElementById("dining-pay-btn")?.addEventListener("click", async () => {
    const tipAmount = Math.round(Number(document.getElementById("dining-pay-tip")?.value || 0) * 100) / 100;
    const payTotal = Math.round((Number(check.total || 0) + tipAmount) * 100) / 100;
    if (!confirm(`Cobrar comanda por ${money(payTotal)}${tipAmount ? ` (incl. propina ${money(tipAmount)})` : ""}?`)) return;
    const paymentMethod = document.getElementById("dining-pay-method")?.value || "efectivo";
    const nit = (document.getElementById("dining-pay-nit")?.value || "CF").trim() || "CF";
    const total = payTotal;
    let payload = {
      payment_method: paymentMethod,
      cash_received: paymentMethod === "efectivo" ? total : 0,
      customer_nit: nit,
      tip_amount: tipAmount,
    };
    if (paymentMethod === "mixto") {
      const cashAmount = Number(document.getElementById("dining-pay-cash")?.value || 0);
      if (cashAmount <= 0 || cashAmount >= total) {
        alert("En mixto, el efectivo debe ser mayor a 0 y menor al total.");
        return;
      }
      const otherAmount = Math.round((total - cashAmount) * 100) / 100;
      payload = {
        payment_method: "mixto",
        cash_received: cashAmount,
        customer_nit: nit,
        tip_amount: tipAmount,
        payments: [
          { payment_method: "efectivo", amount: cashAmount },
          { payment_method: "tarjeta", amount: otherAmount },
        ],
      };
    }
    try {
      await api(`/api/dining/checks/${check.id}/pay`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.selectedDiningCheckId = null;
      await loadDiningPanel();
      await refreshPosCore();
      alert("Comanda cobrada.");
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById("dining-cancel-btn")?.addEventListener("click", async () => {
    if (!confirm("Cancelar comanda?")) return;
    try {
      await api(`/api/dining/checks/${check.id}/cancel`, { method: "POST" });
      state.selectedDiningCheckId = null;
      await loadDiningPanel();
    } catch (error) {
      alert(error.message);
    }
  });
}

function setupTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      if (!canAccessTab(tab.dataset.tab)) {
        switchToPosTab();
        return;
      }
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      const panel = document.getElementById(`tab-${tab.dataset.tab}`);
      if (panel) {
        panel.style.display = "";
        panel.classList.add("active");
      }
      if (tab.dataset.tab === "sales") renderSalesTable();
      if (tab.dataset.tab === "cash") renderCashCard();
      if (tab.dataset.tab === "pos") focusProductSearch();
      if (tab.dataset.tab === "dining") loadDiningPanel().catch((error) => alert(error.message));
      if (tab.dataset.tab === "config") {
        if (!state.config) {
          api("/api/config")
            .then((config) => {
              state.config = config;
              renderConfig();
            })
            .catch((error) => {
              const card = document.getElementById("config-card");
              if (card) {
                card.innerHTML = `<div class="empty">No se pudo cargar configuracion: ${escapeHtml(
                  error?.message || String(error)
                )}</div>`;
              }
            });
        } else {
          renderConfig();
        }
      }
    });
  });
}

function setupEvents() {
  document.addEventListener("keydown", handleCartQuantityShortcuts, true);
  [
    "sales-filter-from",
    "sales-filter-to",
    "sales-filter-customer",
    "sales-filter-cashier",
    "sales-filter-min-total",
    "sales-filter-max-total",
  ].forEach((id) => {
    const input = document.getElementById(id);
    input?.addEventListener(id === "sales-filter-cashier" ? "change" : "input", renderSalesTable);
  });
  document.getElementById("sales-filter-clear")?.addEventListener("click", () => {
    const today = getGuatemalaDateKey();
    document.getElementById("sales-filter-from").value = isAdminUser() ? "" : today;
    document.getElementById("sales-filter-to").value = isAdminUser() ? "" : today;
    document.getElementById("sales-filter-customer").value = "";
    document.getElementById("sales-filter-cashier").value = isAdminUser() ? "" : String(state.user?.id || "");
    document.getElementById("sales-filter-min-total").value = "";
    document.getElementById("sales-filter-max-total").value = "";
    renderSalesTable();
  });
  document.getElementById("sales-go-cash-btn")?.addEventListener("click", () => {
    document.querySelector('.tab[data-tab="cash"]')?.click();
  });
  const productSearch = document.getElementById("product-search");
  productSearch.addEventListener("input", () => {
    resetCatalogPage();
    renderProducts();
    renderProductSearchSuggestions();
  });
  productSearch.addEventListener("keydown", (event) => {
    const qtyDelta = getCartQuantityShortcutDelta(event);
    if (qtyDelta && state.cart.length) {
      event.preventDefault();
      adjustSelectedCartLine(qtyDelta);
      return;
    }
    const box = document.getElementById("product-search-suggestions");
    const suggestionsOpen = Boolean(box && !box.hidden);
    if (event.key === "ArrowDown" && suggestionsOpen) {
      event.preventDefault();
      setActiveSuggestionIndex((state.posSearchSuggestionIndex ?? -1) + 1);
      return;
    }
    if (event.key === "ArrowUp" && suggestionsOpen) {
      event.preventDefault();
      setActiveSuggestionIndex((state.posSearchSuggestionIndex ?? 0) - 1);
      return;
    }
    if (event.key === "Escape" && suggestionsOpen) {
      event.preventDefault();
      hideProductSearchSuggestions();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    void addProductFromSearchEnter();
  });
  productSearch.addEventListener("search", () => {
    resetCatalogPage();
    if ((productSearch.value || "").trim()) {
      void addProductFromSearchEnter();
    } else {
      hideProductSearchSuggestions();
      renderProducts();
    }
  });
  productSearch.addEventListener("blur", () => {
    setTimeout(() => hideProductSearchSuggestions(), 150);
  });
  document.getElementById("pos-department-filter")?.addEventListener("change", () => {
    resetCatalogPage();
    renderPosDepartmentChips();
    renderProducts();
  });
  document.getElementById("pos-branch-filter")?.addEventListener("change", async (event) => {
    const value = Number(event.target.value || 0);
    state.selectedBranchId = value || null;
    if (state.selectedBranchId) {
      localStorage.setItem("felpos_branch_id", String(state.selectedBranchId));
    } else {
      localStorage.removeItem("felpos_branch_id");
    }
    try {
      await refreshPosStockViews();
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById("refresh-dining-btn")?.addEventListener("click", () => {
    loadDiningPanel().catch((error) => alert(error.message));
  });
  document.getElementById("new-dining-table-btn")?.addEventListener("click", async () => {
    if (!isAdminUser()) {
      alert("Solo el administrador puede crear mesas.");
      return;
    }
    const code = prompt("Codigo de mesa (ej. M1):", "");
    if (!code) return;
    const name = prompt("Nombre de mesa:", code) || code;
    const seats = Number(prompt("Asientos:", "4") || 4);
    try {
      await api("/api/dining/tables", {
        method: "POST",
        body: JSON.stringify({
          code,
          name,
          seats,
          branch_id: state.selectedBranchId || null,
        }),
      });
      await loadDiningPanel();
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById("open-shortcuts-help-btn")?.addEventListener("click", openShortcutsHelpDialog);
  document.getElementById("close-shortcuts-help-dialog")?.addEventListener("click", () => {
    document.getElementById("shortcuts-help-dialog")?.close();
  });
  document.getElementById("refresh-today-btn")?.addEventListener("click", () => {
    loadTodayDashboard().catch((error) => alert(error.message));
  });
  window.addEventListener("online", () => {
    maybeAutoRetryPendingFel().catch(() => {});
  });
  document.getElementById("clear-cart").addEventListener("click", () => {
    state.cart = [];
    resetCartDiscount();
    const paid = document.getElementById("pos-paid-with");
    if (paid) paid.value = "0.00";
    renderCart();
  });
  document.getElementById("hold-ticket-btn")?.addEventListener("click", () => {
    holdCurrentTicket();
  });
  document.getElementById("pos-change-qty-btn")?.addEventListener("click", () => {
    void changeSelectedCartLineQuantity();
  });
  document.getElementById("pos-remove-line-btn")?.addEventListener("click", () => {
    removeSelectedCartLine();
  });
  document.getElementById("pos-assign-customer-btn")?.addEventListener("click", () => {
    void openAssignCustomerDialog();
  });
  document.getElementById("pos-assign-cf-btn")?.addEventListener("click", () => {
    void applyAssignCustomerCfFromDialog();
  });
  document.getElementById("pos-assign-nit-btn")?.addEventListener("click", () => {
    void showAssignNitFields();
  });
  document.getElementById("pos-assign-save-btn")?.addEventListener("click", () => {
    void saveAssignCustomerFromDialog();
  });
  document.getElementById("pos-assign-cancel-btn")?.addEventListener("click", () => {
    document.getElementById("pos-assign-customer-dialog")?.close();
  });
  document.getElementById("pos-assign-customer-select")?.addEventListener("change", (event) => {
    const customerId = Number(event.target.value || 0);
    const customer = (state.customers || []).find((item) => item.id === customerId);
    if (!customer) return;
    const nitInput = document.getElementById("pos-assign-nit-input");
    const nameInput = document.getElementById("pos-assign-name-input");
    if (nitInput) nitInput.value = customer.nit || "";
    if (nameInput) nameInput.value = customer.name || "";
  });
  document.getElementById("pos-reprint-last-btn")?.addEventListener("click", () => {
    void reprintLastTicket();
  });
  document.getElementById("pos-go-sales-btn")?.addEventListener("click", goToSalesTab);
  document.getElementById("new-ticket-btn")?.addEventListener("click", () => {
    createNewTicket();
  });
  document.getElementById("open-cash-capture-btn").addEventListener("click", requestPosCharge);
  startPosStatusClock();
  document.getElementById("cash-close-counted").addEventListener("input", updateCashCloseDifferencePreview);
  document.getElementById("close-cash-close-summary-dialog").addEventListener("click", () => {
    document.getElementById("cash-close-summary-dialog")?.close();
  });
  document.getElementById("cash-close-summary-form").addEventListener("submit", submitCashCloseSummaryForm);
  document.getElementById("customer-nit").addEventListener("input", () => {
    scheduleNitFeedback();
  });
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
      await refreshPosCore();
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
  document.getElementById("cash-checkout-received").addEventListener("input", updateCashCheckoutChange);
  document.getElementById("cash-checkout-received")?.addEventListener("focus", (event) => {
    // Al entrar al campo, selecciona todo para reemplazar con lo recibido.
    try {
      event.target.select();
    } catch {
      /* ignore */
    }
  });
  document.getElementById("cash-checkout-dialog")?.addEventListener("keydown", (event) => {
    const dialog = document.getElementById("cash-checkout-dialog");
    if (!dialog?.open) return;
    const method = document.getElementById("payment-method")?.value || "efectivo";
    if (method !== "efectivo") return;
    const received = document.getElementById("cash-checkout-received");
    if (!received) return;
    if (event.target === received) return;
    // Si el foco esta en botones del dialogo, digitos van al efectivo recibido.
    const target = event.target;
    const onControls =
      target === dialog ||
      target?.closest?.(".checkout-pay-choice, .dialog-actions, #checkout-payment-choices");
    if (!onControls) return;
    if (/^\d$/.test(event.key) || event.key === "." || event.key === "Backspace") {
      event.preventDefault();
      focusCashReceivedInput(received);
      if (event.key === "Backspace") applyCashKeypadInput("back");
      else if (event.key === ".") applyCashKeypadInput(".");
      else applyCashKeypadInput(event.key);
    }
  });
  document.getElementById("mixed-cash-amount")?.addEventListener("input", updateMixedCheckoutAmounts);
  document.getElementById("mixed-cash-received")?.addEventListener("input", updateMixedCheckoutAmounts);
  document.getElementById("mixed-other-method")?.addEventListener("change", updateMixedCheckoutAmounts);
  document.getElementById("cash-final-print-btn").addEventListener("click", () => {
    void finalizeCheckoutFromDialog(true);
  });
  document.getElementById("cash-final-no-print-btn")?.addEventListener("click", () => {
    void finalizeCheckoutFromDialog(false);
  });
  document.getElementById("cash-checkout-discount")?.addEventListener("input", (event) => {
    onCheckoutDiscountInput(event.target.value);
  });
  document.getElementById("discount-quick")?.addEventListener("click", (event) => {
    const chip = event.target.closest(".discount-chip[data-discount]");
    if (!chip) return;
    applyDiscountChipValue(chip.dataset.discount);
  });
  document.getElementById("payment-method")?.addEventListener("change", () => {
    setCheckoutPaymentMethod(document.getElementById("payment-method")?.value || "efectivo");
  });
  document.getElementById("checkout-payment-choices")?.addEventListener("click", (event) => {
    const btn = event.target.closest(".checkout-pay-choice[data-payment]");
    if (!btn) return;
    setCheckoutPaymentMethod(btn.dataset.payment);
  });
  document.getElementById("new-product-btn").addEventListener("click", () => openProductEditor(null));
  document.getElementById("products-table-search")?.addEventListener("input", (event) => {
    state.productsTableSearch = String(event.target.value || "").trim().toLowerCase();
    syncProductsSearchStripActive(state.productsTableSearch);
    renderProductsTable();
  });
  document.getElementById("import-eleventa-btn")?.addEventListener("click", openEleventaImportDialog);
  document.getElementById("close-eleventa-import-dialog")?.addEventListener("click", () => {
    document.getElementById("eleventa-import-dialog")?.close();
  });
  document.getElementById("eleventa-import-form")?.addEventListener("submit", importEleventaCatalog);
  document.getElementById("generate-missing-barcodes-btn")?.addEventListener("click", generateMissingBarcodes);
  document.getElementById("product-generate-barcode-btn")?.addEventListener("click", generateBarcodeFromProductForm);
  document.getElementById("show-low-stock-btn").addEventListener("click", async () => {
    state.showLowStockOnly = true;
    state.showInactiveProducts = false;
    await refreshLowStockProducts();
    renderProductsTable();
  });
  document.getElementById("show-inactive-products-btn")?.addEventListener("click", async () => {
    state.showLowStockOnly = false;
    state.showInactiveProducts = true;
    try {
      state.inactiveProducts = await api("/api/products/inactive");
      renderProductsTable();
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById("show-all-products-btn").addEventListener("click", () => {
    state.showLowStockOnly = false;
    state.showInactiveProducts = false;
    renderProductsTable();
  });
  document.getElementById("refresh-inventory-dashboard-btn").addEventListener("click", async () => {
    await refreshLowStockProducts();
    await refreshPharmacyExpiryLots();
    await refreshPharmacyPrescriptions();
    renderProductsTable();
    renderInventoryDashboard();
    renderPharmacyRxPanel();
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
      min_stock: Number(form.min_stock.value || 0),
      tracks_inventory: form.tracks_inventory.checked ? 1 : 0,
      track_expiry: form.track_expiry?.checked && profileHas("lots") ? 1 : 0,
      requires_prescription: form.requires_prescription?.checked && profileHas("pharmacy") ? 1 : 0,
      sale_by_weight: form.sale_by_weight?.checked && profileHas("sale_by_weight") ? 1 : 0,
      tax_rate: Number(form.tax_rate.value || 12) / 100,
      wholesale_enabled: form.wholesale_enabled.checked ? 1 : 0,
      wholesale_min_qty: Number(form.wholesale_min_qty.value || 0),
      wholesale_discount_pct: Number(form.wholesale_discount_pct.value || 0),
      price_vip: form.price_vip?.value ? Number(form.price_vip.value) : null,
      goods_or_services: (form.goods_or_services?.value || "B").trim().toUpperCase().slice(0, 1) || "B",
      dining_modifiers: form.dining_modifiers?.value.trim() || null,
    };
    // Si no maneja inventario, no forzar stock minimo ni bloquear venta por existencias.
    if (!payload.tracks_inventory) {
      payload.min_stock = 0;
      payload.track_expiry = 0;
      payload.requires_prescription = 0;
    }
    if (!profileHas("lots")) payload.track_expiry = 0;
    if (profileHas("lots") && getProfileCapabilities().force_track_expiry && payload.tracks_inventory) {
      payload.track_expiry = 1;
    }
    if (!profileHas("pharmacy")) payload.requires_prescription = 0;
    if (!profileHas("sale_by_weight")) payload.sale_by_weight = 0;
    if (payload.track_expiry && payload.tracks_inventory) {
      const ok = confirm(
        "FEFO activado: las entradas de inventario deben registrar lote y vencimiento.\n" +
          "Sin lotes en la sucursal, no se podra vender este producto.\n\nContinuar?"
      );
      if (!ok) return;
    }
    if (useSchoolFields) {
      payload.school_category = form.school_category.value.trim() || null;
      payload.school_grade = form.school_grade.value.trim() || null;
      payload.school_brand = form.school_brand.value.trim() || null;
      payload.school_variant = form.school_variant.value.trim() || null;
    }
    try {
      let saved;
      if (state.editingProductId) {
        if (payload.tracks_inventory && !isMultiBranchEnabled()) {
          payload.stock = Number(form.stock.value || 0);
        }
        saved = await api(`/api/products/${state.editingProductId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        if (payload.tracks_inventory) {
          payload.stock = Number(form.stock.value || 0);
        } else {
          payload.stock = 0;
        }
        saved = await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
      }
      if (payload.tracks_inventory === 0 && productTracksInventory(saved)) {
        throw new Error(
          "No se pudo desactivar el control de inventario. Intenta de nuevo o usa el boton Si/No en la tabla de Inventario."
        );
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
    const product = (state.products || []).find((p) => Number(p.id) === Number(state.stockEntryProductId));
    const quantity = Number(form.quantity.value || 0);
    const notes = form.notes.value.trim() || null;
    const branchId = Number(form.branch_id?.value || getEffectiveBranchId() || 0) || null;
    const lotCode = String(form.lot_code?.value || "").trim();
    const expiresAt = form.expires_at?.value || "";
    const requiresLot = Number(product?.track_expiry || 0) === 1;
    if (requiresLot && !lotCode) {
      alert("Este producto controla lotes (FEFO). Ingresa un codigo de lote.");
      return;
    }
    try {
      if (lotCode) {
        await api(`/api/products/${state.stockEntryProductId}/lots`, {
          method: "POST",
          body: JSON.stringify({
            lot_code: lotCode,
            expires_at: expiresAt ? `${expiresAt}T00:00:00` : null,
            quantity,
            active: 1,
            branch_id: branchId,
          }),
        });
      } else {
        await api(`/api/products/${state.stockEntryProductId}/stock-entry`, {
          method: "POST",
          body: JSON.stringify({
            quantity,
            notes,
            branch_id: branchId,
          }),
        });
      }
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
  document.getElementById("new-order-btn").addEventListener("click", () => {
    state.orderLines = [createEmptyOrderLine()];
    renderOrderLines();
    orderDialog.showModal();
  });
  document.getElementById("order-add-line-btn")?.addEventListener("click", () => {
    state.orderLines.push(createEmptyOrderLine());
    renderOrderLines();
  });
  document.getElementById("close-order-dialog").addEventListener("click", () => orderDialog.close());
  document.getElementById("order-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const items = (state.orderLines || [])
      .filter((line) => line.product_id && line.quantity > 0)
      .map((line) => ({
        product_id: Number(line.product_id),
        quantity: Number(line.quantity),
      }));
    try {
      const pickupRaw = form.pickup_at?.value || "";
      await api("/api/orders", {
        method: "POST",
        body: JSON.stringify({
          customer_name: form.customer_name.value.trim(),
          customer_phone: form.customer_phone.value.trim() || null,
          customer_email: form.customer_email.value.trim() || null,
          total_estimate: Number(form.total_estimate.value || 0),
          deposit_paid: Number(form.deposit_paid?.value || 0),
          pickup_at: pickupRaw ? new Date(pickupRaw).toISOString() : null,
          notes: form.notes.value.trim() || null,
          items,
        }),
      });
      form.reset();
      state.orderLines = [];
      orderDialog.close();
      await loadData();
    } catch (error) {
      alert(error.message);
    }
  });

  document.getElementById("close-sale-dialog").addEventListener("click", () => {
    document.getElementById("sale-dialog").close();
  });
  document.getElementById("whatsapp-ticket-btn")?.addEventListener("click", () => {
    const sale = state.sales.find((item) => item.id === state.selectedSaleId);
    if (!sale) return;
    openWhatsAppTicketDialog(sale);
  });
  document.getElementById("close-whatsapp-ticket-dialog")?.addEventListener("click", () => {
    document.getElementById("whatsapp-ticket-dialog")?.close();
  });
  document.getElementById("whatsapp-ticket-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = document.getElementById("whatsapp-ticket-phone")?.value || "";
    const message = document.getElementById("whatsapp-ticket-message")?.value || "";
    if (!normalizeWhatsAppPhone(phone)) {
      const ok = await showAppConfirm("No hay telefono. Abrir WhatsApp sin destinatario?", {
        title: "WhatsApp",
        confirmLabel: "Abrir",
      });
      if (!ok) return;
    }
    openWhatsAppShare(phone, message);
    document.getElementById("whatsapp-ticket-dialog")?.close();
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
  document.getElementById("download-fel-pdf-btn")?.addEventListener("click", () => {
    if (!state.selectedSaleId) return;
    downloadFelPdf(state.selectedSaleId).catch((error) => alert(error.message));
  });
  document.getElementById("void-fel-btn")?.addEventListener("click", () => {
    if (!state.selectedSaleId) return;
    voidSaleFel(state.selectedSaleId);
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
  document.addEventListener("keydown", handleCheckoutShortcuts);
  document.addEventListener("keydown", handleShortcutsHelpHotkey);

  document.getElementById("customer-select")?.addEventListener("change", onCustomerSelectChange);
  document.getElementById("add-school-package-btn")?.addEventListener("click", addSchoolPackageToCart);
  document.getElementById("manage-school-packages-btn")?.addEventListener("click", () => {
    const panel = document.getElementById("school-packages-admin");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (!panel.hidden) renderSchoolPackagesAdmin();
  });
  document.getElementById("school-package-add-line-btn")?.addEventListener("click", () => {
    const first = (state.products || [])[0];
    state.schoolPackageLines = state.schoolPackageLines || [];
    state.schoolPackageLines.push({ product_id: first?.id || null, quantity: 1 });
    renderSchoolPackageLines();
  });
  document.getElementById("close-school-package-dialog")?.addEventListener("click", () => {
    document.getElementById("school-package-dialog")?.close();
    state.editingSchoolPackageId = null;
  });
  document.getElementById("school-package-form")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const items = (state.schoolPackageLines || [])
      .filter((line) => line.product_id && Number(line.quantity) > 0)
      .map((line) => ({ product_id: Number(line.product_id), quantity: Number(line.quantity) }));
    if (!items.length) {
      alert("Agrega al menos un producto al paquete.");
      return;
    }
    const payload = {
      name: form.name.value.trim(),
      school_grade: form.school_grade.value.trim() || null,
      notes: form.notes.value.trim() || null,
      items,
    };
    try {
      if (state.editingSchoolPackageId) {
        await api(`/api/school-packages/${state.editingSchoolPackageId}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/api/school-packages", { method: "POST", body: JSON.stringify(payload) });
      }
      document.getElementById("school-package-dialog")?.close();
      state.editingSchoolPackageId = null;
      await loadData();
      const admin = document.getElementById("school-packages-admin");
      if (admin) {
        admin.hidden = false;
        renderSchoolPackagesAdmin();
      }
    } catch (error) {
      alert(error.message);
    }
  });
  document.getElementById("new-customer-btn")?.addEventListener("click", () => openCustomerDialog());
  document.getElementById("new-promotion-btn")?.addEventListener("click", openPromotionDialog);
  document.getElementById("close-customer-dialog")?.addEventListener("click", () => {
    state.editingCustomerId = null;
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

FP.setSession = setSession;
FP.openLogin = openLogin;
FP.renderProducts = renderProducts;
FP.renderSystemAlertsBar = renderSystemAlertsBar;
setupTabs();
setupEvents();
setSession(state.token, null);
(async () => {
  if (typeof FP.ensureDeviceIdentity === "function") {
    await FP.ensureDeviceIdentity();
  }
  await loadCurrentUser().catch((error) => alert(error.message));
})();
