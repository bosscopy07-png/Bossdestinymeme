/**
 * FILE: scanner/dexscreener/index.js
 *
 * Dexscreener scanner (ESM):
 * - Fetches token/pair details from Dexscreener API.
 * - Normalizes into a clean structure.
 * - In-memory caching with TTL to respect rate limits.
 * - Fully ESM-native, safe for Node 18+.
 */

import axios from 'axios';
import NodeCache from 'node-cache';
import Pino from 'pino';
import config from '../../config/index.js';

const log = Pino({ level: config.LOG_LEVEL || 'info' });

const TTL = config.DEXSCREENER_TTL_SEC || 30; // seconds
const cache = new NodeCache({ stdTTL: TTL, checkperiod: 10 });
const BASE_URL = 'https://api.dexscreener.com/tokens/v1/bsc/';

/**
 * normalizeDexResponse
 * Convert Dexscreener response into structured, consistent object
 */
function normalizeDexResponse(raw = {}) {
  if (!raw) return null;

  const token = raw.token ?? {};
  const pairs = raw.pairs ?? [];
  const top = pairs[0] ?? {};

  return {
    tokenAddress: (token.address || token.tokenAddress || top.baseToken?.address || '').toLowerCase(),
    name: token.name ?? top.baseToken?.name ?? token.tokenName ?? '',
    symbol: token.symbol ?? top.baseToken?.symbol ?? token.tokenSymbol ?? '',
    priceUsd: Number(top.priceUsd ?? token.priceUsd ?? 0),
    liquidity: {
      usd: Number(top.liquidity?.usd ?? 0),
      native: Number(top.liquidity?.native ?? 0),
    },
    volume: {
      h24: Number(top.volume?.h24 ?? top.volume ?? 0),
    },
    holders: Number(token.holders ?? top.holders ?? top.holderCount ?? 0),
    fdv: Number(token.fdv ?? top.fdv ?? 0),
    pairAddress: (top.pairAddress || top.pair || '').toLowerCase(),
    pairUrl: top.url || top.pairUrl || '',
    topHolders: token.topHolders ?? [],
    raw: raw,
  };
}

/**
 * fetchToken
 * Fetch token details from Dexscreener API, normalize, and cache
 */
export async function fetchToken(tokenAddress) {
  if (!tokenAddress) return null;

  const key = tokenAddress.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const url = `${BASE_URL}${encodeURIComponent(key)}`;
    const resp = await axios.get(url, {
      timeout: config.RPC_TIMEOUT_MS || 20_000,
      headers: { 'User-Agent': 'HyperBeastBot/1.0' },
    });

    const normalized = normalizeDexResponse(resp.data || {});
    if (normalized) cache.set(key, normalized);

    log.info({ token: key, pair: normalized?.pairAddress }, 'Fetched Dexscreener token data');
    return normalized;
  } catch (err) {
    log.warn({ err: err?.message, token: key }, 'Dexscreener fetch failed');
    return null;
  }
}

/**
 * getCached
 * Retrieve cached token info if available
 */
export function getCached(tokenAddress) {
  if (!tokenAddress) return null;
  return cache.get(tokenAddress.toLowerCase()) || null;
}

export default {
  fetchToken,
  getCached,
};
