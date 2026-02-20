// trader/router.js
// Multi-router resolver with priority fallback
// Safe, fail-fast router selection with enhanced logging

import config from "../config/index.js";
import { logInfo, logWarn, logError } from "../utils/logs.js";

// ------------------------------------------------------------
// ROUTER CONSTANTS (immutable)
const ROUTERS = Object.freeze({
  PCS_V2: config.contracts?.pancakeRouterV2 || null,
  PCS_V3: config.contracts?.pancakeRouterV3 || null,
  APESWAP: config.contracts?.apeRouter || null
});

// ------------------------------------------------------------
// UTILS
function isValidAddress(addr) {
  return typeof addr === "string" && addr.startsWith("0x") && addr.length === 42;
}

// ------------------------------------------------------------
// DYNAMIC ROUTER REGISTRY (optional future use)
const dynamicRouters = new Map();

/**
 * Register a new router dynamically
 */
export function registerRouter(name, address) {
  if (!isValidAddress(address)) {
    logWarn(`Cannot register invalid router address: ${address}`);
    return false;
  }
  dynamicRouters.set(name, address);
  logInfo(`Router registered dynamically: ${name} -> ${address}`);
  return true;
}

// ------------------------------------------------------------
// RETURN PRIORITY LIST OF VALID ROUTERS
export function getRouterPreference() {
  const staticRouters = [
    { name: "PCS_V2", address: ROUTERS.PCS_V2 },
    { name: "PCS_V3", address: ROUTERS.PCS_V3 },
    { name: "APESWAP", address: ROUTERS.APESWAP }
  ];

  const allRouters = [
    ...staticRouters,
    ...Array.from(dynamicRouters.entries()).map(([name, address]) => ({ name, address }))
  ];

  const validRouters = allRouters.filter(r => isValidAddress(r.address));

  if (validRouters.length === 0) {
    logWarn("No valid routers found in config or dynamic registry.");
  }

  return validRouters;
}

// ------------------------------------------------------------
// SELECT BEST ROUTER
export function getBestRouter() {
  const preference = getRouterPreference();

  if (preference.length === 0) {
    logError("Router selection failed: no valid router available.");
    throw new Error("No valid router available. Check config or dynamic registry.");
  }

  const best = preference[0];
  logInfo(`Selected router: ${best.name} -> ${best.address}`);
  return best.address;
}

// ------------------------------------------------------------
export default Object.freeze({
  ROUTERS,
  getRouterPreference,
  getBestRouter,
  registerRouter
});
