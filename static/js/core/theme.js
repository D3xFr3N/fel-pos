(function (FP) {
  const DEFAULT_UI_THEME = FP.DEFAULT_UI_THEME || {
    primary_color: "#00a884",
    primary_dark: "#008f70",
    primary_rgb: "0, 168, 132",
    background_theme: "oscuro",
  };

  FP.UI_BACKGROUND_PALETTES = {
    oscuro: {
      bg: "#0f1419",
      surface: "#171d24",
      surface2: "#1f2730",
      border: "#3a4654",
      text: "#f4f7fa",
      muted: "#b7c2cd",
      gradientStart: "#10161d",
      gradientEnd: "#0b1015",
      topbar: "rgba(15, 20, 25, 0.94)",
      shadow: "0 10px 30px rgba(0, 0, 0, 0.25)",
      isLight: false,
    },
    claro: {
      bg: "#e6ebf2",
      surface: "#ffffff",
      surface2: "#eef2f7",
      border: "#7f91a5",
      text: "#0b1220",
      muted: "#3b4a5c",
      gradientStart: "#f4f7fb",
      gradientEnd: "#d8e0ea",
      topbar: "rgba(255, 255, 255, 0.98)",
      shadow: "0 10px 28px rgba(35, 52, 68, 0.12)",
      isLight: true,
    },
    azul: {
      bg: "#101c2c",
      surface: "#16263a",
      surface2: "#1d3048",
      border: "#3d5a7a",
      text: "#f2f7fc",
      muted: "#b4c7db",
      gradientStart: "#14243a",
      gradientEnd: "#0b1522",
      topbar: "rgba(16, 28, 44, 0.94)",
      shadow: "0 10px 30px rgba(2, 8, 18, 0.32)",
      isLight: false,
    },
    gris: {
      bg: "#25282d",
      surface: "#30343a",
      surface2: "#3a3f46",
      border: "#5a616b",
      text: "#f5f6f8",
      muted: "#c4cad2",
      gradientStart: "#2b2f35",
      gradientEnd: "#202328",
      topbar: "rgba(37, 40, 45, 0.94)",
      shadow: "0 10px 30px rgba(0, 0, 0, 0.28)",
      isLight: false,
    },
    crema: {
      bg: "#e8dfce",
      surface: "#fffaf2",
      surface2: "#f1e7d6",
      border: "#9a866c",
      text: "#16110a",
      muted: "#45392c",
      gradientStart: "#f6efe4",
      gradientEnd: "#ddd0b8",
      topbar: "rgba(255, 250, 242, 0.98)",
      shadow: "0 10px 28px rgba(76, 62, 42, 0.14)",
      isLight: true,
    },
  };

  function normalizeHexColor(value, fallback = "#00a884") {
    let raw = String(value || "").trim();
    if (!raw) return fallback;
    if (!raw.startsWith("#")) raw = `#${raw}`;
    if (!/^#[0-9A-Fa-f]{6}$/.test(raw)) return fallback;
    return raw.toLowerCase();
  }

  function hexToRgb(hexColor) {
    const color = normalizeHexColor(hexColor);
    return [
      parseInt(color.slice(1, 3), 16),
      parseInt(color.slice(3, 5), 16),
      parseInt(color.slice(5, 7), 16),
    ];
  }

  function darkenHex(hexColor, factor = 0.82) {
    const [r, g, b] = hexToRgb(hexColor);
    const toHex = (n) =>
      Math.max(0, Math.min(255, Math.round(n * factor)))
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function lightenHex(hexColor, factor = 1.18) {
    const [r, g, b] = hexToRgb(hexColor);
    const toHex = (n) =>
      Math.max(0, Math.min(255, Math.round(n * factor)))
        .toString(16)
        .padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  function channelLuminance(channel) {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }

  function relativeLuminance(hexColor) {
    const [r, g, b] = hexToRgb(hexColor);
    return 0.2126 * channelLuminance(r) + 0.7152 * channelLuminance(g) + 0.0722 * channelLuminance(b);
  }

  function contrastRatio(foreground, background) {
    const l1 = relativeLuminance(foreground);
    const l2 = relativeLuminance(background);
    const hi = Math.max(l1, l2);
    const lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  function pickOnPrimary(primaryColor) {
    const lum = relativeLuminance(primaryColor);
    // Amarillos/limas/naranjas claros: forzar texto oscuro para que se lea.
    if (lum >= 0.55) return "#111827";
    // Primarios muy oscuros: texto blanco.
    if (lum <= 0.18) return "#ffffff";
    return contrastRatio("#ffffff", primaryColor) >= contrastRatio("#111827", primaryColor)
      ? "#ffffff"
      : "#111827";
  }

  function pickAccentText(primaryColor, surfaceColor, isLight) {
    const target = 4.5;
    let candidate = primaryColor;
    if (contrastRatio(candidate, surfaceColor) >= target) return candidate;
    if (isLight) {
      for (const factor of [0.82, 0.7, 0.58, 0.48, 0.38, 0.28]) {
        candidate = darkenHex(primaryColor, factor);
        if (contrastRatio(candidate, surfaceColor) >= target) return candidate;
      }
      return "#0f172a";
    }
    for (const factor of [1.15, 1.28, 1.42, 1.58, 1.75, 1.95]) {
      candidate = lightenHex(primaryColor, factor);
      if (contrastRatio(candidate, surfaceColor) >= target) return candidate;
    }
    return "#f8fafc";
  }

  function pickTintText(primaryColor, isLight) {
    // Texto sobre fondos tenues rgba(primary, ~0.2).
    const tintBg = isLight ? "#e8edf3" : "#1f2730";
    return pickAccentText(primaryColor, tintBg, isLight);
  }

  function normalizeBackgroundTheme(value) {
    const key = String(value || "").trim().toLowerCase();
    return FP.UI_BACKGROUND_PALETTES[key] ? key : "oscuro";
  }

  function applyUiTheme(themeOrColor, currentTheme) {
    let primary = DEFAULT_UI_THEME.primary_color;
    let dark = DEFAULT_UI_THEME.primary_dark;
    let rgb = DEFAULT_UI_THEME.primary_rgb;
    let backgroundTheme = normalizeBackgroundTheme(
      currentTheme?.background_theme || DEFAULT_UI_THEME.background_theme
    );

    if (typeof themeOrColor === "string") {
      primary = normalizeHexColor(themeOrColor);
      dark = darkenHex(primary);
      rgb = hexToRgb(primary).join(", ");
    } else if (themeOrColor && typeof themeOrColor === "object") {
      primary = normalizeHexColor(themeOrColor.primary_color || primary);
      dark = normalizeHexColor(themeOrColor.primary_dark || darkenHex(primary), darkenHex(primary));
      rgb = String(themeOrColor.primary_rgb || hexToRgb(primary).join(", "));
      backgroundTheme = normalizeBackgroundTheme(themeOrColor.background_theme || backgroundTheme);
    }

    const root = document.documentElement;
    const palette = FP.UI_BACKGROUND_PALETTES[backgroundTheme];
    const onPrimary = pickOnPrimary(primary);
    const accentText = pickAccentText(primary, palette.surface, Boolean(palette.isLight));
    const tintText = pickTintText(primary, Boolean(palette.isLight));
    const onPrimaryRgb = hexToRgb(onPrimary).join(", ");
    const dangerBase = "#e5534b";
    const warningBase = "#d4a017";
    const infoBase = "#64b5f6";
    const dangerText = pickAccentText(dangerBase, palette.surface, Boolean(palette.isLight));
    const warningText = pickAccentText(warningBase, palette.surface, Boolean(palette.isLight));
    const infoText = pickAccentText(infoBase, palette.surface, Boolean(palette.isLight));
    const successText = pickAccentText(primary, palette.surface, Boolean(palette.isLight));
    const onDanger = pickOnPrimary(dangerBase);

    root.style.setProperty("--primary", primary);
    root.style.setProperty("--primary-dark", dark);
    root.style.setProperty("--primary-rgb", rgb);
    root.style.setProperty("--on-primary", onPrimary);
    root.style.setProperty("--on-primary-rgb", onPrimaryRgb);
    root.style.setProperty("--accent-text", accentText);
    root.style.setProperty("--tint-text", tintText);
    root.style.setProperty("--bg", palette.bg);
    root.style.setProperty("--surface", palette.surface);
    root.style.setProperty("--surface-2", palette.surface2);
    root.style.setProperty("--border", palette.border);
    root.style.setProperty("--text", palette.text);
    root.style.setProperty("--muted", palette.muted);
    root.style.setProperty("--body-gradient-start", palette.gradientStart);
    root.style.setProperty("--body-gradient-end", palette.gradientEnd);
    root.style.setProperty("--topbar-bg", palette.topbar);
    root.style.setProperty("--shadow", palette.shadow);
    root.style.setProperty("--danger-text", dangerText);
    root.style.setProperty("--warning-text", warningText);
    root.style.setProperty("--info-text", infoText);
    root.style.setProperty("--success-text", successText);
    root.style.setProperty("--on-danger", onDanger);
    if (palette.isLight) {
      root.style.setProperty("--danger-bg", "rgba(180, 50, 40, 0.12)");
      root.style.setProperty("--warning-bg", "rgba(180, 120, 20, 0.14)");
      root.style.setProperty("--info-bg", "rgba(40, 120, 180, 0.12)");
      root.style.setProperty("--alert-bar-bg", "rgba(180, 120, 20, 0.1)");
      root.style.setProperty("--alert-bar-border", "rgba(160, 110, 20, 0.35)");
      root.style.setProperty("--inset-panel", "rgba(15, 23, 42, 0.06)");
    } else {
      root.style.setProperty("--danger-bg", "rgba(229, 83, 75, 0.18)");
      root.style.setProperty("--warning-bg", "rgba(255, 183, 77, 0.16)");
      root.style.setProperty("--info-bg", "rgba(100, 181, 246, 0.14)");
      root.style.setProperty("--alert-bar-bg", "rgba(240, 193, 75, 0.12)");
      root.style.setProperty("--alert-bar-border", "rgba(240, 193, 75, 0.35)");
      root.style.setProperty("--inset-panel", "rgba(15, 20, 25, 0.45)");
    }
    root.dataset.backgroundTheme = backgroundTheme;
    return {
      primary_color: primary,
      primary_dark: dark,
      primary_rgb: rgb,
      background_theme: backgroundTheme,
    };
  }

  FP.normalizeHexColor = normalizeHexColor;
  FP.hexToRgb = hexToRgb;
  FP.darkenHex = darkenHex;
  FP.normalizeBackgroundTheme = normalizeBackgroundTheme;
  FP.applyUiTheme = applyUiTheme;
})(window.FelPos = window.FelPos || {});
