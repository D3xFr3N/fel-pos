import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.felpos.mobile",
  appName: "FEL POS Conteo",
  webDir: "www",
  server: {
    cleartext: true
  }
};

export default config;
