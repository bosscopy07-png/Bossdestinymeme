/**
 * FILE: scanner/gecko/index.js
 *
 * Gecko trending scanner (ESM)
 * - Fetches trending token list
 * - Respects CoreState (scanner enable/disable)
 * - Safe caching + rate-limit friendly
 */

import axios from "axios";
import NodeCache from "node-cache";
import Pino from "pino";
import config from "../../config/index.js";
import state from "../../core/state.js";

const log = Pino({ level: config.LOG_LEVEL || "info" });
const cache = new NodeCache({ stdTTL: 60, checkperiod: 30 });

const COINGECKO_TRENDING =
  "https://api.coingecko.com/api/v3/search/trending";

// ⚠️ GeckoTerminal trending endpoint is NOT official → guard it
const GECKOTERMINAL =
  config.GECKOTERMINAL_TRENDING_URL ||
  "https://api.geckoterminal.com/api/v2/networks/bsc/trending";

/**
 * fetchTrending
 * - Returns []
 * - Never throws
 * - Respects scanner state
 */
export async function fetchTrending() {
  // 🛑 GLOBAL SCANNER GUARD
  if (!state.initialized || !state.scannerRunning) {
    log.debug("Gecko scanner skipped (scanner disabled)");
    return [];
  }

  const cached = cache.get("trending");
  if (cached) return cached;

  // 1️⃣ Try GeckoTerminal (best quality)
  try {
    const resp = await axios.get(GECKOTERMINAL, {
      timeout: config.HTTP_TIMEOUT_MS || 10_000,
    });

    const raw =
      resp?.data?.data ||
      resp?.data ||
      [];

    if (Array.isArray(raw) && raw.length) {
      const list = raw
        .map((it) => ({
          name: it.attributes?.name ?? it.name ?? "",
          symbol: it.attributes?.symbol ?? it.symbol ?? "",
          address:
            it.attributes?.address?.toLowerCase?.() ??
            it.address?.toLowerCase?.() ??
            null,
          url:
            it.links?.self ??
            it.url ??
            null,
        }))
        .filter((t) => t.name || t.symbol);

      cache.set("trending", list);
      log.info({ count: list.length }, "GeckoTerminal trending fetched");
      return list;
    }
  } catch (err) {
    log.debug(
      { err: err?.message },
      "GeckoTerminal fetch failed, falling back"
    );
  }

  // 2️⃣ Fallback to CoinGecko (safe & stable)
  try {
    const resp = await axios.get(COINGECKO_TRENDING, {
      timeout: config.HTTP_TIMEOUT_MS || 10_000,
    });

    const coins = resp?.data?.coins ?? [];
    const list = coins.map((c) => {
      const item = c.item || {};
      return {
        name: item.name ?? "",
        symbol: item.symbol ?? "",
        address: null, // CoinGecko does not expose chain address here
        url: item.id
          ? `https://www.coingecko.com/en/coins/${encodeURIComponent(item.id)}`
          : null,
      };
    });

    cache.set("trending", list);
    log.info({ count: list.length }, "CoinGecko trending fetched");
    return list;
  } catch (err) {
    log.warn({ err: err?.message }, "CoinGecko trending fetch failed");
    return [];
  }
}

export default { fetchTrending };
