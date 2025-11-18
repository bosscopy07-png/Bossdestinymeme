// trader/router.js
// Multi-router resolver with priority fallback
// Safely selects the best router for swaps/sniping

import config from "../config/index.js";
import { logInfo, logWarn, logError } from "../utils/logs.js";

// Freeze router constants to prevent accidental mutation.
const ROUTERS = Object.freeze({
  PCS_V2: config.contracts?.pancakeRouterV2 || null,
  PCS_V3: config.contracts?.pancakeRouterV3 || null,
  APESWAP: config.contracts?.apeRouter || null
});

/**
 * Validate router address format to avoid returning corrupted config values.
 */
function isValidAddress(addr) {
  return typeof addr === "string" && addr.startsWith("0x") && addr.length === 42;
}

/**
 * Returns router preference list: PCS_V2 → PCS_V3 → APESWAP
 * Only includes valid addresses.
 */
export function getRouterPreference() {
  const preference = [
    ROUTERS.PCS_V2,
    ROUTERS.PCS_V3,
    ROUTERS.APESWAP
  ].filter(isValidAddress);

  if (preference.length === 0) {
    logWarn("No valid routers found in config.");
  }

  return preference;
}

/**
 * Selects the best router based on priority.
 * Safe: verifies valid address and logs selection.
 * Returns null if none available.
 */
export function getBestRouter() {
  const pref = getRouterPreference();

  if (pref.length === 0) {
    logError("Router selection failed: no valid router available.");
    return null;
  }

  const router = pref[0];
  logInfo(`Selected router: ${router}`);

  return router;
}

export default Object.freeze({
  getRouterPreference,
  getBestRouter,
  ROUTERS
});
