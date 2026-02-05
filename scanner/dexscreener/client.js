import axios from "axios";
import NodeCache from "node-cache";
import Pino from "pino";
import config from "../../config/index.js";

const log = Pino({ level: config.LOG_LEVEL || "info" });

const TTL = config.DEXSCREENER_TTL_SEC || 30;
const cache = new NodeCache({ stdTTL: TTL, checkperiod: 10 });

const BASE_URL = "https://api.dexscreener.com/latest/dex/search?q=";

/**
 * Normalize ONE PAIR from Dexscreener
 */
function normalizePair(pair) {
  if (!pair?.baseToken?.address) return null;

  return {
    chain: pair.chainId,
    dex: pair.dexId,

    token: pair.baseToken.name || "",
    symbol: pair.baseToken.symbol || "",
    address: pair.baseToken.address.toLowerCase(),

    pairAddress: pair.pairAddress?.toLowerCase() || "",
    pairUrl: pair.url || "",

    priceUsd: Number(pair.priceUsd || 0),
    liquidity: {
      usd: Number(pair.liquidity?.usd || 0),
    },
    volume: {
      h24: Number(pair.volume?.h24 || 0),
    },
    fdv: Number(pair.fdv || 0),

    ageMs: pair.pairCreatedAt
      ? Date.now() - pair.pairCreatedAt
      : null,

    raw: pair,
  };
}

/**
 * Search Dexscreener
 */
export async function searchDexscreener(query) {
  const cacheKey = `search:${query}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const resp = await axios.get(
      `${BASE_URL}${encodeURIComponent(query)}`,
      {
        timeout: config.RPC_TIMEOUT_MS || 15_000,
        headers: { "User-Agent": "HyperBeastBot/1.0" },
      }
    );

    const pairs = resp.data?.pairs || [];
    const normalized = pairs
      .filter((p) => p.chainId === "bsc")
      .map(normalizePair)
      .filter(Boolean);

    cache.set(cacheKey, normalized);
    log.info({ query, count: normalized.length }, "Dexscreener search ok");

    return normalized;
  } catch (err) {
    log.warn({ query, err: err.message }, "Dexscreener search failed");
    return [];
  }
}
