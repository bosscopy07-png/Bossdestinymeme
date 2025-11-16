/**
 * utils/dexscreener.js
 *
 * Fetch token data from Dexscreener API with in-memory caching.
 */

import axios from "axios";
import { logInfo, logError } from "./logs.js";

// Simple in-memory cache
const CACHE = new Map();
// Cache duration in milliseconds (1 second)
const CACHE_DURATION = 1000;

/**
 * Fetch token info from Dexscreener
 * @param {string} tokenAddress - ERC20/BEP20 token address
 * @param {string} network - optional, default "bsc"
 * @returns {object|null} token data or null on failure
 */
export async function fetchTokenInfo(tokenAddress, network = "bsc") {
  const now = Date.now();

  // Return cached data if valid
  if (CACHE.has(tokenAddress)) {
    const { time, data } = CACHE.get(tokenAddress);
    if (now - time < CACHE_DURATION) {
      logInfo(`Returning cached Dexscreener data for ${tokenAddress}`);
      return data;
    }
  }

  try {
    const url = `https://api.dexscreener.com/tokens/v1/${network}/${tokenAddress}`;
    const { data } = await axios.get(url, { timeout: 5000 });
    CACHE.set(tokenAddress, { data, time: now });
    logInfo(`Fetched Dexscreener data for ${tokenAddress}`);
    return data;
  } catch (err) {
    logError(`Dexscreener fetch failed for ${tokenAddress}:`, err.message);
    return null;
  }
}
