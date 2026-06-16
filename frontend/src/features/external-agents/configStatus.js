function findConfigValue(configs, key) {
  const items = Array.isArray(configs) ? configs : [];
  const raw = items.find((item) => item?.key === key)?.value;
  return String(raw || "").trim();
}

export function isHermesConfigured(configs) {
  return findConfigValue(configs, "api_base_url") !== "";
}

export function isOpenClawConfigured(configs) {
  return findConfigValue(configs, "gateway_url") !== "";
}

export function buildHermesConfigValues(configs) {
  return {
    apiBaseUrl: findConfigValue(configs, "api_base_url"),
    apiKey: findConfigValue(configs, "api_key"),
    dashboardUrl: findConfigValue(configs, "dashboard_url"),
  };
}
